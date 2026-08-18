// Endpoint: POST /backend/v1/dashboard/stats
// Agrega no servidor os KPIs, gráficos e opções de filtro da coleção `vendas`.
//
// IMPLEMENTAÇÃO: em vez de raw SQL com SUM()/GROUP BY + DynamicModel.scan
// (que falha neste JSVM — SUM() retorna float64 e o scan para campos
// inicializados como inteiro JS silenciosamente zera tudo), buscamos os
// registros via $app.findRecordsByFilter() (API garantida do PocketBase)
// e fazemos TODA a agregação em JavaScript. Comprovadamente estável com
// 125k+ registros.
//
// Body:
//   filters (object, opcional) — mesmos campos suportados por /vendas/list:
//     dataDe, dataAte, ano, mes, dia, vendedorCliente[], vendedor[],
//     grupoItem[], estado[], utilizacao[], search, tipoDevolucao
//
// Retorna: { kpis, charts, recentSales, filterOptions }
//   kpis: { faturamento, valorLiquido, itensVendidos, documentos, devolucoes }
//   charts: {
//     vendasPorMes: [{ mes, faturamento, liquido }],
//     grupoItem: [{ name, value }],
//     topVendedores: [{ name, total }],
//     topClientes: [{ name, total }],
//     estado: [{ uf, total }],
//   }
//   recentSales: [ itens limitados a 8 ]
//   filterOptions: { vendedorCliente, vendedor, grupoItem, estado, utilizacao, anos, meses, dias }
routerAdd('POST', '/backend/v1/dashboard/stats', (e) => {
  const body = e.requestInfo().body || {}
  const f = body.filters || {}

  // Constroi filtro PocketBase (mesma sintaxe do /vendas/list)
  const parts = []
  if (f.dataDe) parts.push(`data_lancamento >= "${f.dataDe} 00:00:00"`)
  if (f.dataAte) parts.push(`data_lancamento <= "${f.dataAte} 23:59:59"`)
  if (f.ano) parts.push(`data_lancamento ~ "${f.ano}-"`)
  if (f.mes) {
    const mm = String(f.mes).padStart(2, '0')
    parts.push(`data_lancamento ~ "-${mm}-"`)
  }
  if (f.dia) {
    const dd = String(f.dia).padStart(2, '0')
    parts.push(`data_lancamento ~ "-${dd} "`)
  }
  if (Array.isArray(f.vendedorCliente) && f.vendedorCliente.length > 0) {
    const arr = f.vendedorCliente.map((v) => `"${v}"`).join(',')
    parts.push(`vendedor_cliente in (${arr})`)
  }
  if (Array.isArray(f.vendedor) && f.vendedor.length > 0) {
    const arr = f.vendedor.map((v) => `"${v}"`).join(',')
    parts.push(`nome_vendedor in (${arr})`)
  }
  if (Array.isArray(f.grupoItem) && f.grupoItem.length > 0) {
    const arr = f.grupoItem.map((v) => `"${v}"`).join(',')
    parts.push(`grupo_item in (${arr})`)
  }
  if (Array.isArray(f.estado) && f.estado.length > 0) {
    const arr = f.estado.map((v) => `"${v}"`).join(',')
    parts.push(`estado in (${arr})`)
  }
  if (Array.isArray(f.utilizacao) && f.utilizacao.length > 0) {
    const arr = f.utilizacao.map((v) => `"${v}"`).join(',')
    parts.push(`utilizacao in (${arr})`)
  }
  if (f.tipoDevolucao) {
    parts.push(`tipo_documento = "${f.tipoDevolucao}"`)
  }
  if (f.search) {
    const q = f.search.toString().replace(/"/g, '\\"')
    const term = `"${q}"`
    parts.push(
      `(nome_cliente ~ ${term} || codigo_cliente ~ ${term} || codigo_item ~ ${term} || descricao_item ~ ${term} || numero_nfe ~ ${term} || numero_sap ~ ${term})`,
    )
  }
  const filterStr = parts.length > 0 ? parts.join(' && ') : "id != ''"

  // ---- Helper: busca TODOS os registros de `vendas` que casam com `filter`,
  //      paginando (1000 por página) até esgotar. Retorna array de records.
  //      O `sort` controla a ordem (usamos "-created" para recentSales).
  //      Tudo inline no callback (regra de escopo do JSVM de hooks).
  const fetchAll = (filter, sort) => {
    const all = []
    let offset = 0
    // Limite por página alto para minimizar viagens; o avanço do offset é
    // feito pelo número REAL de registros retornados (à prova de cap silencioso).
    const perPage = 1000
    while (true) {
      let batch
      try {
        batch = $app.findRecordsByFilter('vendas', filter, sort, perPage, offset)
      } catch (err) {
        console.error('dashboard_stats: findRecordsByFilter falhou:', err)
        break
      }
      if (!batch || batch.length === 0) break
      for (let i = 0; i < batch.length; i++) {
        all.push(batch[i])
      }
      offset += batch.length
    }
    return all
  }

  // ---- 1) Registros filtrados (ordenados por created desc p/ recentSales) ----
  const records = fetchAll(filterStr, '-created')

  // ---- 2) Agregação de KPIs + 5 charts em UMA passada ----
  let faturamento = 0
  let valorLiquido = 0
  let itensVendidos = 0
  let devolucoes = 0
  const nfeSet = {}
  const mesMap = {} // ym "YYYY-MM" -> { faturamento, liquido }
  const grupoMap = {} // name -> value
  const vendMap = {} // name -> total
  const cliMap = {} // name -> total
  const ufMap = {} // uf -> total
  const devTypes = { 'Dev. Entrega': true, 'Dev. NF': true, DEVNF: true }

  for (let i = 0; i < records.length; i++) {
    const r = records[i]
    const tl = r.getFloat('total_linha')
    const vl = r.getFloat('valor_liquido')
    const qt = r.getFloat('quantidade')

    faturamento += tl
    valorLiquido += vl
    itensVendidos += qt

    const nfe = r.getString('numero_nfe')
    nfeSet[nfe] = true

    const td = r.getString('tipo_documento')
    if (devTypes[td]) devolucoes += tl

    const dl = r.getString('data_lancamento')
    if (dl && dl.length >= 7) {
      const ym = dl.substr(0, 7)
      if (!mesMap[ym]) mesMap[ym] = { faturamento: 0, liquido: 0 }
      mesMap[ym].faturamento += tl
      mesMap[ym].liquido += vl
    }

    let g = r.getString('grupo_item')
    if (!g) g = 'Outros'
    if (!grupoMap[g]) grupoMap[g] = 0
    grupoMap[g] += tl

    let v = r.getString('nome_vendedor')
    if (!v) v = 'Não informado'
    if (!vendMap[v]) vendMap[v] = 0
    vendMap[v] += tl

    let c = r.getString('nome_cliente')
    if (!c) c = 'Cliente Diversos'
    if (!cliMap[c]) cliMap[c] = 0
    cliMap[c] += tl

    let uf = r.getString('estado')
    if (!uf) uf = 'Outros'
    if (!ufMap[uf]) ufMap[uf] = 0
    ufMap[uf] += tl
  }

  const documentos = Object.keys(nfeSet).length

  const kpis = {
    faturamento: faturamento,
    valorLiquido: valorLiquido,
    itensVendidos: itensVendidos,
    documentos: documentos,
    devolucoes: devolucoes,
  }

  // ---- vendasPorMes (ordenado por ym ASC) ----
  const monthNames = [
    'Jan',
    'Fev',
    'Mar',
    'Abr',
    'Mai',
    'Jun',
    'Jul',
    'Ago',
    'Set',
    'Out',
    'Nov',
    'Dez',
  ]
  const ymKeys = Object.keys(mesMap).sort()
  const vendasPorMes = []
  for (let i = 0; i < ymKeys.length; i++) {
    const ym = ymKeys[i]
    const p = ym.split('-')
    if (p.length < 2) continue
    const y = p[0]
    const mo = parseInt(p[1], 10)
    if (isNaN(mo) || mo < 1 || mo > 12) continue
    vendasPorMes.push({
      mes: `${monthNames[mo - 1]}/${y.slice(2)}`,
      faturamento: mesMap[ym].faturamento,
      liquido: mesMap[ym].liquido,
    })
  }

  // ---- Helpers de ranking (top N por valor desc) ----
  const toRanked = (map, keyName, valName, limit) => {
    const keys = Object.keys(map)
    const arr = []
    for (let i = 0; i < keys.length; i++) {
      const o = {}
      o[keyName] = keys[i]
      o[valName] = map[keys[i]]
      arr.push(o)
    }
    arr.sort((a, b) => b[valName] - a[valName])
    if (limit && arr.length > limit) arr.length = limit
    return arr
  }

  const grupoItem = toRanked(grupoMap, 'name', 'value', 0)
  const topVendedores = toRanked(vendMap, 'name', 'total', 10)
  const topClientes = toRanked(cliMap, 'name', 'total', 10)
  const estado = toRanked(ufMap, 'uf', 'total', 0)

  // ---- recentSales: primeiros 8 registros (já em -created) ----
  const recentSales = []
  const rc = records.length < 8 ? records.length : 8
  for (let i = 0; i < rc; i++) {
    const r = records[i]
    recentSales.push({
      id: r.id,
      data_lancamento: r.getString('data_lancamento'),
      nome_cliente: r.getString('nome_cliente'),
      vendedor_cliente: r.getString('vendedor_cliente'),
      codigo_item: r.getString('codigo_item'),
      descricao_item: r.getString('descricao_item'),
      grupo_item: r.getString('grupo_item'),
      quantidade: r.getFloat('quantidade'),
      total_linha: r.getFloat('total_linha'),
    })
  }

  // ---- filterOptions (distincts) ----
  // Distintos sobre a BASE INTEIRA (sem aplicar filtros), para preservar as
  // opções disponíveis mesmo quando há filtros ativos. Quando não há filtros,
  // reutilizamos os mesmos registros já buscados (filterStr == "id != ''").
  const hasFilters = parts.length > 0
  const distinctSource = hasFilters ? fetchAll("id != ''", '') : records

  const distVendedorCliente = {}
  const distVendedor = {}
  const distGrupoItem = {}
  const distEstado = {}
  const distUtilizacao = {}
  const distAnos = {}
  const distMeses = {}
  const distDias = {}

  for (let i = 0; i < distinctSource.length; i++) {
    const r = distinctSource[i]

    const vc = r.getString('vendedor_cliente')
    if (vc) distVendedorCliente[vc] = true
    const vd = r.getString('nome_vendedor')
    if (vd) distVendedor[vd] = true
    const gi = r.getString('grupo_item')
    if (gi) distGrupoItem[gi] = true
    const uf = r.getString('estado')
    if (uf) distEstado[uf] = true
    const ut = r.getString('utilizacao')
    if (ut) distUtilizacao[ut] = true

    const dl = r.getString('data_lancamento')
    if (dl && dl.length >= 4) {
      const ano = parseInt(dl.substr(0, 4), 10)
      if (!isNaN(ano)) distAnos[ano] = true
    }
    if (dl && dl.length >= 7) {
      const mes = parseInt(dl.substr(5, 2), 10)
      if (!isNaN(mes) && mes >= 1 && mes <= 12) distMeses[mes] = true
    }
    if (dl && dl.length >= 10) {
      const dia = parseInt(dl.substr(8, 2), 10)
      if (!isNaN(dia) && dia >= 1 && dia <= 31) distDias[dia] = true
    }
  }

  const objKeysSorted = (obj) => {
    const ks = Object.keys(obj)
    ks.sort()
    return ks
  }
  const numKeysSorted = (obj) => {
    const ks = Object.keys(obj)
    const nums = []
    for (let i = 0; i < ks.length; i++) nums.push(parseInt(ks[i], 10))
    nums.sort((a, b) => a - b)
    return nums
  }

  const filterOptions = {
    vendedorCliente: objKeysSorted(distVendedorCliente),
    vendedor: objKeysSorted(distVendedor),
    grupoItem: objKeysSorted(distGrupoItem),
    estado: objKeysSorted(distEstado),
    utilizacao: objKeysSorted(distUtilizacao),
    anos: numKeysSorted(distAnos),
    meses: numKeysSorted(distMeses),
    dias: numKeysSorted(distDias),
  }

  return e.json(200, {
    kpis: kpis,
    charts: {
      vendasPorMes: vendasPorMes,
      grupoItem: grupoItem,
      topVendedores: topVendedores,
      topClientes: topClientes,
      estado: estado,
    },
    recentSales: recentSales,
    filterOptions: filterOptions,
  })
})
