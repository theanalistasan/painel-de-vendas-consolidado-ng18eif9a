// Endpoint: POST /backend/v1/dashboard/stats
// Agrega no servidor os KPIs, gráficos e opções de filtro da coleção `vendas`.
// Evita trazer dezenas de milhares de registros para o frontend.
//
// Body:
//   filters (object, opcional) — mesmos campos suportados por /vendas/list:
//     dataDe, dataAte, ano, mes, dia, vendedorCliente[], vendedor[],
//     grupoItem[], estado[], utilizacao[], search
//
// Retorna: { kpis, charts, recentSales, filterOptions }
//   kpis: { faturamento, valorLiquido, itensVendidos, documentos }
//   charts: {
//     vendasPorMes: [{ mes, faturamento, liquido }],
//     grupoItem: [{ name, value }],
//     topVendedores: [{ name, total }],
//     topClientes: [{ name, total }],
//     estado: [{ uf, total }],
//   }
//   recentSales: [ itens limitados a 8 ]
//   filterOptions: { vendedorCliente, vendedor, grupoItem, estado, utilizacao, anos, meses, dias }
routerAdd(
  'POST',
  '/backend/v1/dashboard/stats',
  (e) => {
    const body = e.requestInfo().body || {}
    const f = body.filters || {}

    // Constroi filtro PocketBase
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
    if (f.search) {
      const q = f.search.toString().replace(/"/g, '\\"')
      const term = `"${q}"`
      parts.push(
        `(nome_cliente ~ ${term} || codigo_cliente ~ ${term} || codigo_item ~ ${term} || descricao_item ~ ${term} || numero_nfe ~ ${term} || numero_sap ~ ${term})`,
      )
    }
    const filterStr = parts.length > 0 ? parts.join(' && ') : "id != ''"

    // ---- KPIs agregados por SQL (muito mais rápido que iterar no JS) ----
    const kpiModel = arrayOf(
      new DynamicModel({
        faturamento: 0,
        valorLiquido: 0,
        itensVendidos: 0,
        documentos: 0,
      }),
    )

    // count(distinct numero_nfe) não existe diretamente em SQLite sem subquery;
    // usamos COUNT(DISTINCT ...) que é suportado pelo SQLite.
    const kpiQuery =
      'SELECT ' +
      'COALESCE(SUM(total_linha),0) as faturamento, ' +
      'COALESCE(SUM(valor_liquido),0) as valorLiquido, ' +
      'COALESCE(SUM(quantidade),0) as itensVendidos, ' +
      'COUNT(DISTINCT numero_nfe) as documentos ' +
      'FROM vendas WHERE ' +
      filterStr

    try {
      $app.db().newQuery(kpiQuery).all(kpiModel)
    } catch (_) {}

    const kpis = {
      faturamento: kpiModel.length > 0 ? kpiModel[0].faturamento : 0,
      valorLiquido: kpiModel.length > 0 ? kpiModel[0].valorLiquido : 0,
      itensVendidos: kpiModel.length > 0 ? kpiModel[0].itensVendidos : 0,
      documentos: kpiModel.length > 0 ? kpiModel[0].documentos : 0,
    }

    // ---- Charts ----
    // Vendas por mês: substr(data_lancamento,1,7) => "YYYY-MM"
    const monthModel = arrayOf(new DynamicModel({ ym: '', faturamento: 0, liquido: 0 }))
    try {
      $app
        .db()
        .newQuery(
          'SELECT substr(data_lancamento,1,7) as ym, ' +
            'COALESCE(SUM(total_linha),0) as faturamento, ' +
            'COALESCE(SUM(valor_liquido),0) as liquido ' +
            'FROM vendas WHERE data_lancamento != "" AND (' +
            filterStr +
            ') GROUP BY ym ORDER BY ym ASC',
        )
        .all(monthModel)
    } catch (_) {}

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
    const vendasPorMes = []
    for (let i = 0; i < monthModel.length; i++) {
      const m = monthModel[i]
      if (!m.ym) continue
      const parts2 = m.ym.split('-')
      if (parts2.length < 2) continue
      const y = parts2[0]
      const mo = parseInt(parts2[1], 10)
      if (isNaN(mo) || mo < 1 || mo > 12) continue
      vendasPorMes.push({
        mes: `${monthNames[mo - 1]}/${y.slice(2)}`,
        faturamento: m.faturamento,
        liquido: m.liquido,
      })
    }

    // Grupo do item
    const grupoModel = arrayOf(new DynamicModel({ name: '', value: 0 }))
    try {
      $app
        .db()
        .newQuery(
          'SELECT COALESCE(grupo_item,"Outros") as name, COALESCE(SUM(total_linha),0) as value ' +
            'FROM vendas WHERE ' +
            filterStr +
            ' GROUP BY name ORDER BY value DESC',
        )
        .all(grupoModel)
    } catch (_) {}
    const grupoItem = []
    for (let i = 0; i < grupoModel.length; i++) {
      grupoItem.push({ name: grupoModel[i].name || 'Outros', value: grupoModel[i].value })
    }

    // Top vendedores
    const vendModel = arrayOf(new DynamicModel({ name: '', total: 0 }))
    try {
      $app
        .db()
        .newQuery(
          'SELECT COALESCE(nome_vendedor,"Não informado") as name, COALESCE(SUM(total_linha),0) as total ' +
            'FROM vendas WHERE ' +
            filterStr +
            ' GROUP BY name ORDER BY total DESC LIMIT 10',
        )
        .all(vendModel)
    } catch (_) {}
    const topVendedores = []
    for (let i = 0; i < vendModel.length; i++) {
      topVendedores.push({ name: vendModel[i].name || 'Não informado', total: vendModel[i].total })
    }

    // Top clientes
    const cliModel = arrayOf(new DynamicModel({ name: '', total: 0 }))
    try {
      $app
        .db()
        .newQuery(
          'SELECT COALESCE(nome_cliente,"Cliente Diversos") as name, COALESCE(SUM(total_linha),0) as total ' +
            'FROM vendas WHERE ' +
            filterStr +
            ' GROUP BY name ORDER BY total DESC LIMIT 10',
        )
        .all(cliModel)
    } catch (_) {}
    const topClientes = []
    for (let i = 0; i < cliModel.length; i++) {
      topClientes.push({ name: cliModel[i].name || 'Cliente Diversos', total: cliModel[i].total })
    }

    // Por estado
    const ufModel = arrayOf(new DynamicModel({ uf: '', total: 0 }))
    try {
      $app
        .db()
        .newQuery(
          'SELECT COALESCE(estado,"Outros") as uf, COALESCE(SUM(total_linha),0) as total ' +
            'FROM vendas WHERE ' +
            filterStr +
            ' GROUP BY uf ORDER BY total DESC',
        )
        .all(ufModel)
    } catch (_) {}
    const estado = []
    for (let i = 0; i < ufModel.length; i++) {
      estado.push({ uf: ufModel[i].uf || 'Outros', total: ufModel[i].total })
    }

    // ---- Vendas recentes (8 mais recentes pelo created) ----
    const recentRecords = $app.findRecordsByFilter('vendas', filterStr, '-created', 8, 0)
    const recentSales = []
    for (let i = 0; i < recentRecords.length; i++) {
      const r = recentRecords[i]
      recentSales.push({
        id: r.getId(),
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

    // ---- Opções de filtro (distincts) — sem aplicar os filtros para
    //      preservar as opções disponíveis na base inteira ----
    const distinct = (field) => {
      const arr = arrayOf(new DynamicModel({ v: '' }))
      try {
        $app
          .db()
          .newQuery(
            'SELECT DISTINCT ' +
              field +
              ' as v FROM vendas WHERE ' +
              field +
              ' != "" ORDER BY v ASC',
          )
          .all(arr)
      } catch (_) {}
      const out = []
      for (let i = 0; i < arr.length; i++) {
        if (arr[i].v) out.push(arr[i].v)
      }
      return out
    }

    const distinctNum = (expr) => {
      const arr = arrayOf(new DynamicModel({ v: 0 }))
      try {
        $app
          .db()
          .newQuery(
            'SELECT DISTINCT ' +
              expr +
              ' as v FROM vendas WHERE ' +
              expr +
              ' IS NOT NULL ORDER BY v ASC',
          )
          .all(arr)
      } catch (_) {}
      const out = []
      for (let i = 0; i < arr.length; i++) {
        if (!isNaN(arr[i].v)) out.push(arr[i].v)
      }
      return out
    }

    const filterOptions = {
      vendedorCliente: distinct('vendedor_cliente'),
      vendedor: distinct('nome_vendedor'),
      grupoItem: distinct('grupo_item'),
      estado: distinct('estado'),
      utilizacao: distinct('utilizacao'),
      anos: distinctNum('CAST(substr(data_lancamento,1,4) AS INTEGER)'),
      meses: distinctNum('CAST(substr(data_lancamento,6,2) AS INTEGER)'),
      dias: distinctNum('CAST(substr(data_lancamento,9,2) AS INTEGER)'),
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
  },
  $apis.requireAuth(),
)
