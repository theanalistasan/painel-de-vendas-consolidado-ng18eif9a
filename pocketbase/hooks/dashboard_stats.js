// Endpoint: POST /backend/v1/dashboard/stats
// Agrega no servidor os KPIs, gráficos e opções de filtro da coleção `vendas`.
//
// IMPLEMENTAÇÃO: TODAS as agregações (KPIs, charts, filterOptions) são feitas
// com SQL puro via $app.db().newQuery() — SUM/COUNT/GROUP BY/DISTINCT rodam
// inteiramente dentro do SQLite e retornam POUCAS linhas (dezenas), nunca os
// 125k+ registros paginados para a memória do JSVM (que estourava o timeout).
//
// BUG EVITADO: o JSVM devolve float64 para SUM()/COUNT() e o scan de
// DynamicModel inicializado como inteiro (`0`) falha silenciosamente zerando
// tudo. Aqui todo campo agregado é declarado como STRING (SQL converte
// qualquer tipo numérico para string sem erro) e parseado com parseFloat/
// parseInt no JS — à prova de mismatch de tipo.
//
// Body:
//   filters (object, opcional) — mesmos campos suportados por /vendas/list:
//     dataDe, dataAte, ano, mes, dia, vendedorCliente[], vendedor[],
//     grupoItem[], estado[], utilizacao[], search, tipoDevolucao
//
// Retorna: { kpis, charts, recentSales, filterOptions }
routerAdd('POST', '/backend/v1/dashboard/stats', (e) => {
  const body = e.requestInfo().body || {}
  const f = body.filters || {}

  // ---- Escape SQL (aspas simples duplicadas) ----
  const sqlEsc = (s) => String(s).replace(/'/g, "''")

  // ---- Constrói cláusula WHERE (SQL) e filtro PocketBase em paralelo ----
  // O filtro PB é usado apenas para recentSales (findRecordsByFilter).
  const sqlParts = []
  const pbParts = []

  if (f.dataDe) {
    sqlParts.push("data_lancamento >= '" + sqlEsc(f.dataDe) + " 00:00:00'")
    pbParts.push('data_lancamento >= "' + f.dataDe + ' 00:00:00"')
  }
  if (f.dataAte) {
    sqlParts.push("data_lancamento <= '" + sqlEsc(f.dataAte) + " 23:59:59'")
    pbParts.push('data_lancamento <= "' + f.dataAte + ' 23:59:59"')
  }
  if (f.ano) {
    const a = sqlEsc(f.ano)
    sqlParts.push("data_lancamento LIKE '" + a + "-%'")
    pbParts.push('data_lancamento ~ "' + f.ano + '-"')
  }
  if (f.mes) {
    const mm = String(f.mes).padStart(2, '0')
    sqlParts.push("data_lancamento LIKE '%-" + mm + "-%'")
    pbParts.push('data_lancamento ~ "-' + mm + '-"')
  }
  if (f.dia) {
    const dd = String(f.dia).padStart(2, '0')
    sqlParts.push("data_lancamento LIKE '%-" + dd + " %'")
    pbParts.push('data_lancamento ~ "-' + dd + ' "')
  }
  if (Array.isArray(f.vendedorCliente) && f.vendedorCliente.length > 0) {
    const sqlArr = f.vendedorCliente.map((v) => "'" + sqlEsc(v) + "'").join(',')
    const pbArr = f.vendedorCliente.map((v) => '"' + v + '"').join(',')
    sqlParts.push('vendedor_cliente IN (' + sqlArr + ')')
    pbParts.push('vendedor_cliente in (' + pbArr + ')')
  }
  if (Array.isArray(f.vendedor) && f.vendedor.length > 0) {
    const sqlArr = f.vendedor.map((v) => "'" + sqlEsc(v) + "'").join(',')
    const pbArr = f.vendedor.map((v) => '"' + v + '"').join(',')
    sqlParts.push('nome_vendedor IN (' + sqlArr + ')')
    pbParts.push('nome_vendedor in (' + pbArr + ')')
  }
  if (Array.isArray(f.grupoItem) && f.grupoItem.length > 0) {
    const sqlArr = f.grupoItem.map((v) => "'" + sqlEsc(v) + "'").join(',')
    const pbArr = f.grupoItem.map((v) => '"' + v + '"').join(',')
    sqlParts.push('grupo_item IN (' + sqlArr + ')')
    pbParts.push('grupo_item in (' + pbArr + ')')
  }
  if (Array.isArray(f.estado) && f.estado.length > 0) {
    const sqlArr = f.estado.map((v) => "'" + sqlEsc(v) + "'").join(',')
    const pbArr = f.estado.map((v) => '"' + v + '"').join(',')
    sqlParts.push('estado IN (' + sqlArr + ')')
    pbParts.push('estado in (' + pbArr + ')')
  }
  if (Array.isArray(f.utilizacao) && f.utilizacao.length > 0) {
    const sqlArr = f.utilizacao.map((v) => "'" + sqlEsc(v) + "'").join(',')
    const pbArr = f.utilizacao.map((v) => '"' + v + '"').join(',')
    sqlParts.push('utilizacao IN (' + sqlArr + ')')
    pbParts.push('utilizacao in (' + pbArr + ')')
  }
  if (f.tipoDevolucao) {
    const td = sqlEsc(f.tipoDevolucao)
    sqlParts.push("tipo_documento = '" + td + "'")
    pbParts.push('tipo_documento = "' + f.tipoDevolucao + '"')
  }
  if (f.search) {
    const q = sqlEsc(f.search)
    const like = " LIKE '%" + q + "%'"
    sqlParts.push(
      '(nome_cliente' +
        like +
        ' OR codigo_cliente' +
        like +
        ' OR codigo_item' +
        like +
        ' OR descricao_item' +
        like +
        ' OR numero_nfe' +
        like +
        ' OR numero_sap' +
        like +
        ')',
    )
    const pbq = f.search.toString().replace(/"/g, '\\"')
    const term = '"' + pbq + '"'
    pbParts.push(
      '(nome_cliente ~ ' +
        term +
        ' || codigo_cliente ~ ' +
        term +
        ' || codigo_item ~ ' +
        term +
        ' || descricao_item ~ ' +
        term +
        ' || numero_nfe ~ ' +
        term +
        ' || numero_sap ~ ' +
        term +
        ')',
    )
  }

  const sqlWhere = sqlParts.length > 0 ? sqlParts.join(' AND ') : '1=1'
  const pbFilter = pbParts.length > 0 ? pbParts.join(' && ') : "id != ''"

  // ---- Helper: roda SELECT e devolve array de DynamicModel (campos a..f) ----
  const runAgg = (sql) => {
    const rows = arrayOf(new DynamicModel({ a: '', b: '', c: '', d: '', e: '', f: '' }))
    try {
      $app.db().newQuery(sql).all(rows)
    } catch (err) {
      console.error('dashboard_stats: query falhou:', sql, err)
    }
    return rows
  }

  const toNum = (v) => {
    const n = parseFloat(v)
    return isNaN(n) ? 0 : n
  }

  // ============================================================
  // 1) KPIs (uma única query, 1 linha)
  // ============================================================
  const kpiSql =
    'SELECT ' +
    'COALESCE(SUM(total_linha),0) AS a, ' +
    'COALESCE(SUM(valor_liquido),0) AS b, ' +
    'COALESCE(SUM(quantidade),0) AS c, ' +
    'COUNT(DISTINCT numero_nfe) AS d, ' +
    "COALESCE(SUM(CASE WHEN tipo_documento IN ('Dev. Entrega','Dev. NF','DEVNF') THEN total_linha ELSE 0 END),0) AS e " +
    'FROM vendas WHERE ' +
    sqlWhere
  const kpiRows = runAgg(kpiSql)
  const kpiRow = kpiRows.length > 0 ? kpiRows[0] : null
  const kpis = {
    faturamento: kpiRow ? toNum(kpiRow.a) : 0,
    valorLiquido: kpiRow ? toNum(kpiRow.b) : 0,
    itensVendidos: kpiRow ? toNum(kpiRow.c) : 0,
    documentos: kpiRow ? toNum(kpiRow.d) : 0,
    devolucoes: kpiRow ? toNum(kpiRow.e) : 0,
  }

  // ============================================================
  // 2) Charts
  // ============================================================
  // vendasPorMes (GROUP BY ano-mês, ordenado ASC)
  const mesSql =
    'SELECT substr(data_lancamento,1,7) AS a, COALESCE(SUM(total_linha),0) AS b, COALESCE(SUM(valor_liquido),0) AS c, ' +
    "COALESCE(SUM(CASE WHEN tipo_documento IN ('Dev. Entrega','Dev. NF','DEVNF') THEN total_linha ELSE 0 END),0) AS d " +
    'FROM vendas WHERE ' +
    sqlWhere +
    ' AND length(data_lancamento) >= 7 ' +
    'GROUP BY substr(data_lancamento,1,7) ORDER BY 1 ASC'
  const mesRows = runAgg(mesSql)
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
  for (let i = 0; i < mesRows.length; i++) {
    const ym = mesRows[i].a
    const p = ym.split('-')
    if (p.length < 2) continue
    const y = p[0]
    const mo = parseInt(p[1], 10)
    if (isNaN(mo) || mo < 1 || mo > 12) continue
    vendasPorMes.push({
      mes: monthNames[mo - 1] + '/' + y.slice(2),
      faturamento: toNum(mesRows[i].b),
      liquido: toNum(mesRows[i].c),
      devolucoes: toNum(mesRows[i].d),
    })
  }
  // Limita aos últimos 6 meses a partir da data mais recente dos dados consolidados.
  if (vendasPorMes.length > 6) {
    vendasPorMes.splice(0, vendasPorMes.length - 6)
  }

  // ============================================================
  // vendasPorAno (GROUP BY ano, ordenado ASC, com variação percentual)
  // ============================================================
  const anoSql =
    'SELECT substr(data_lancamento,1,4) AS a, COALESCE(SUM(total_linha),0) AS b, ' +
    "COALESCE(SUM(CASE WHEN tipo_documento IN ('Dev. Entrega','Dev. NF','DEVNF') THEN total_linha ELSE 0 END),0) AS c " +
    'FROM vendas WHERE ' +
    sqlWhere +
    ' AND length(data_lancamento) >= 4 ' +
    'GROUP BY substr(data_lancamento,1,4) ORDER BY 1 ASC'
  const anoRows = runAgg(anoSql)
  const vendasPorAno = []
  let anoAnterior = null
  for (let i = 0; i < anoRows.length; i++) {
    const ano = anoRows[i].a
    const faturamento = toNum(anoRows[i].b)
    const devolucoes = toNum(anoRows[i].c)
    let variacao = null
    if (anoAnterior !== null && anoAnterior !== 0) {
      variacao = ((faturamento - anoAnterior) / anoAnterior) * 100
    }
    vendasPorAno.push({
      ano: ano,
      faturamento: faturamento,
      devolucoes: devolucoes,
      variacao: variacao,
    })
    anoAnterior = faturamento
  }

  // grupoItem (todos, value = SUM total_linha; vazio -> "Outros")
  const grupoSql =
    "SELECT COALESCE(NULLIF(grupo_item,''),'Outros') AS a, COALESCE(SUM(total_linha),0) AS b " +
    'FROM vendas WHERE ' +
    sqlWhere +
    " GROUP BY COALESCE(NULLIF(grupo_item,''),'Outros') ORDER BY 2 DESC"
  const grupoRows = runAgg(grupoSql)
  const grupoItem = []
  for (let i = 0; i < grupoRows.length; i++) {
    grupoItem.push({ name: grupoRows[i].a, value: toNum(grupoRows[i].b) })
  }

  // topVendedores (top 10 por faturamento)
  const vendSql =
    "SELECT COALESCE(NULLIF(nome_vendedor,''),'Não informado') AS a, COALESCE(SUM(total_linha),0) AS b " +
    'FROM vendas WHERE ' +
    sqlWhere +
    " GROUP BY COALESCE(NULLIF(nome_vendedor,''),'Não informado') ORDER BY 2 DESC LIMIT 10"
  const vendRows = runAgg(vendSql)
  const topVendedores = []
  for (let i = 0; i < vendRows.length; i++) {
    topVendedores.push({ name: vendRows[i].a, total: toNum(vendRows[i].b) })
  }

  // topClientes (top 10)
  const cliSql =
    "SELECT COALESCE(NULLIF(nome_cliente,''),'Cliente Diversos') AS a, COALESCE(SUM(total_linha),0) AS b " +
    'FROM vendas WHERE ' +
    sqlWhere +
    " GROUP BY COALESCE(NULLIF(nome_cliente,''),'Cliente Diversos') ORDER BY 2 DESC LIMIT 10"
  const cliRows = runAgg(cliSql)
  const topClientes = []
  for (let i = 0; i < cliRows.length; i++) {
    topClientes.push({ name: cliRows[i].a, total: toNum(cliRows[i].b) })
  }

  // estado (todos)
  const ufSql =
    "SELECT COALESCE(NULLIF(estado,''),'Outros') AS a, COALESCE(SUM(total_linha),0) AS b " +
    'FROM vendas WHERE ' +
    sqlWhere +
    " GROUP BY COALESCE(NULLIF(estado,''),'Outros') ORDER BY 2 DESC"
  const ufRows = runAgg(ufSql)
  const estado = []
  for (let i = 0; i < ufRows.length; i++) {
    estado.push({ uf: ufRows[i].a, total: toNum(ufRows[i].b) })
  }

  // ============================================================
  // 3) recentSales — findRecordsByFilter com LIMIT 8 (rápido)
  // ============================================================
  const recentSales = []
  try {
    const recent = $app.findRecordsByFilter('vendas', pbFilter, '-created', 8, 0)
    for (let i = 0; i < recent.length; i++) {
      const r = recent[i]
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
  } catch (err) {
    console.error('dashboard_stats: recentSales falhou:', err)
  }

  // ============================================================
  // 4) filterOptions (DISTINCT sobre a BASE INTEIRA — sem filtros)
  //    Uma query DISTINCT por campo; todas as colunas têm índice.
  // ============================================================
  const distinctCol = (col) => {
    const rows = arrayOf(new DynamicModel({ a: '' }))
    try {
      $app
        .db()
        .newQuery(
          'SELECT DISTINCT ' +
            col +
            ' AS a FROM vendas WHERE ' +
            col +
            ' IS NOT NULL AND ' +
            col +
            " != '' ORDER BY 1 ASC",
        )
        .all(rows)
    } catch (err) {
      console.error('dashboard_stats: DISTINCT ' + col + ' falhou:', err)
    }
    const out = []
    for (let i = 0; i < rows.length; i++) out.push(rows[i].a)
    return out
  }

  const distinctSubstr = (start, len) => {
    const rows = arrayOf(new DynamicModel({ a: '' }))
    try {
      $app
        .db()
        .newQuery(
          'SELECT DISTINCT substr(data_lancamento,' +
            start +
            ',' +
            len +
            ') AS a FROM vendas ' +
            'WHERE length(data_lancamento) >= ' +
            (start + len - 1) +
            ' AND substr(data_lancamento,' +
            start +
            ',' +
            len +
            ") != '' ORDER BY 1 ASC",
        )
        .all(rows)
    } catch (err) {
      console.error('dashboard_stats: DISTINCT substr falhou:', err)
    }
    const out = []
    for (let i = 0; i < rows.length; i++) {
      const n = parseInt(rows[i].a, 10)
      if (!isNaN(n)) out.push(n)
    }
    return out
  }

  const cleanFilterOptions = (arr, isVendedorCliente = false) => {
    const set = new Set()
    for (let i = 0; i < arr.length; i++) {
      let v = String(arr[i] || '').trim()
      if (!v) continue
      if (v === '-Nenhum vendedor / comprador-' || v.startsWith('-Nenhum vendedor / comprador-'))
        continue
      if (isVendedorCliente && v.startsWith(' > ')) continue
      set.add(v)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }

  const filterOptions = {
    vendedorCliente: cleanFilterOptions(distinctCol('vendedor_cliente'), true),
    vendedor: cleanFilterOptions(distinctCol('nome_vendedor')),
    grupoItem: cleanFilterOptions(distinctCol('grupo_item')),
    estado: cleanFilterOptions(distinctCol('estado')),
    utilizacao: cleanFilterOptions(distinctCol('utilizacao')),
    anos: distinctSubstr(1, 4),
    meses: distinctSubstr(6, 2),
    dias: distinctSubstr(9, 2),
  }

  return e.json(200, {
    kpis: kpis,
    charts: {
      vendasPorMes: vendasPorMes,
      vendasPorAno: vendasPorAno,
      grupoItem: grupoItem,
      topVendedores: topVendedores,
      topClientes: topClientes,
      estado: estado,
    },
    recentSales: recentSales,
    filterOptions: filterOptions,
  })
})
