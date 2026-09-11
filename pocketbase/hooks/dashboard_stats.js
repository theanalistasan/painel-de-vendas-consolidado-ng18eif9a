// Endpoint: POST /backend/v1/dashboard/stats
// Agrega no servidor os KPIs, gráficos e opções de filtro da coleção `vendas`.
// Execução via SQL puro ($app.db().newQuery) para alta performance e suporte a múltiplos filtros.
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
//     base, dataDe, dataAte, ano, mes, dia, vendedorCliente[], vendedor[],
//     grupoItem[], estado[], utilizacao[], tipoDocumento[], search, tipoDevolucao
//
// Retorna: { kpis, charts, recentSales, filterOptions }
routerAdd('POST', '/backend/v1/dashboard/stats', (e) => {
  const startTime = Date.now()
  const MAX_EXEC_TIME_MS = 25000 // Teto reduzido para 25s (garante resposta bem antes do timeout de 35s/45s)
  try {
    let body = {}
    try {
      body = e.requestInfo().body || {}
    } catch (_) {
      body = {}
    }
    const f = body.filters || {}

    // Chave de cache baseada nos filtros (defensivo: falha de cache NUNCA derruba a consulta principal)
    const cacheKey = JSON.stringify(f)
    const now = Date.now()
    let cachedEntry = null
    try {
      if (
        typeof globalThis !== 'undefined' &&
        globalThis &&
        globalThis.__skipDashboardCache &&
        typeof globalThis.__skipDashboardCache.get === 'function'
      ) {
        cachedEntry = globalThis.__skipDashboardCache.get(cacheKey)
      }
    } catch (cacheReadErr) {
      console.warn('dashboard_stats: cache read warning:', cacheReadErr)
    }

    if (cachedEntry && cachedEntry.expiresAt > now) {
      return e.json(200, cachedEntry.data)
    }

    // ---- Escape SQL (aspas simples duplicadas) ----
    const sqlEsc = (s) => String(s).replace(/'/g, "''")

    // ---- Constrói cláusula WHERE (SQL) e filtro PocketBase em paralelo ----
    // sqlWhere: usado na maioria das queries (KPIs, charts filtrados, recentSales).
    // sqlWhereBase: apenas filtros de DIMENSÃO (sem data) — usado pela série
    //   de "ano anterior" do gráfico mensal e clientes ativos, já que filtros de ano/mês/data
    //   excluiriam sempre o período anterior.
    // sqlWhereHistorical: apenas filtro de base de dados (racnew / netsales / ambos) —
    //   usado pelos gráficos históricos contínuos ("Tendência de Vendas — Equipamentos"
    //   e "Acumulado — Insumos"), ignorando TODOS os filtros de período e dimensão.
    const sqlParts = []
    const sqlDimParts = []
    const sqlHistParts = []

    // --- Filtro de BASE (Seleção de Bases: ambos | racnew | netsales) ---
    if (f.base === 'racnew') {
      const clause = '(tem_netsales = 0 OR tem_netsales IS NULL)'
      sqlParts.push(clause)
      sqlDimParts.push(clause)
      sqlHistParts.push(clause)
    } else if (f.base === 'netsales') {
      const clause = 'tem_netsales = 1'
      sqlParts.push(clause)
      sqlDimParts.push(clause)
      sqlHistParts.push(clause)
    }

    // --- Filtros de DATA (não entram em sqlDimParts) ---
    if (f.dataDe) {
      sqlParts.push("data_lancamento >= '" + sqlEsc(f.dataDe) + " 00:00:00'")
    }
    if (f.dataAte) {
      sqlParts.push("data_lancamento <= '" + sqlEsc(f.dataAte) + " 23:59:59'")
    }
    const anosFilter = Array.isArray(f.ano) ? f.ano : f.ano ? [f.ano] : []
    if (anosFilter.length > 0) {
      const anos = anosFilter
        .map((a) => "data_lancamento LIKE '" + sqlEsc(String(a)) + "-%'")
        .join(' OR ')
      sqlParts.push('(' + anos + ')')
    }
    const mesesFilter = Array.isArray(f.mes) ? f.mes : f.mes ? [f.mes] : []
    if (mesesFilter.length > 0) {
      const meses = mesesFilter
        .map((m) => "data_lancamento LIKE '%-" + String(m).padStart(2, '0') + "-%'")
        .join(' OR ')
      sqlParts.push('(' + meses + ')')
    }
    const diasFilter = Array.isArray(f.dia) ? f.dia : f.dia ? [f.dia] : []
    if (diasFilter.length > 0) {
      const dias = diasFilter
        .map((d) => "data_lancamento LIKE '%-" + String(d).padStart(2, '0') + " %'")
        .join(' OR ')
      sqlParts.push('(' + dias + ')')
    }

    // --- Filtros de DIMENSÃO (reutilizados pela série de ano anterior) ---
    if (Array.isArray(f.vendedorCliente) && f.vendedorCliente.length > 0) {
      const sqlArr = f.vendedorCliente.map((v) => "'" + sqlEsc(v) + "'").join(',')
      const clause = 'vendedor_cliente IN (' + sqlArr + ')'
      sqlParts.push(clause)
      sqlDimParts.push(clause)
    }
    if (Array.isArray(f.vendedor) && f.vendedor.length > 0) {
      const sqlArr = f.vendedor.map((v) => "'" + sqlEsc(v) + "'").join(',')
      const clause = 'nome_vendedor IN (' + sqlArr + ')'
      sqlParts.push(clause)
      sqlDimParts.push(clause)
    }
    if (Array.isArray(f.grupoItem) && f.grupoItem.length > 0) {
      const sqlArr = f.grupoItem.map((v) => "'" + sqlEsc(v) + "'").join(',')
      const clause = 'grupo_item IN (' + sqlArr + ')'
      sqlParts.push(clause)
      sqlDimParts.push(clause)
    }
    if (Array.isArray(f.estado) && f.estado.length > 0) {
      const sqlArr = f.estado.map((v) => "'" + sqlEsc(v) + "'").join(',')
      const clause = 'estado IN (' + sqlArr + ')'
      sqlParts.push(clause)
      sqlDimParts.push(clause)
    }
    if (Array.isArray(f.utilizacao) && f.utilizacao.length > 0) {
      const sqlArr = f.utilizacao.map((v) => "'" + sqlEsc(v) + "'").join(',')
      const clause = 'utilizacao IN (' + sqlArr + ')'
      sqlParts.push(clause)
      sqlDimParts.push(clause)
    }
    // Filtro Tipo de Documento (multi-valor) — campo `tipo_documento`.
    if (Array.isArray(f.tipoDocumento) && f.tipoDocumento.length > 0) {
      const sqlArr = f.tipoDocumento.map((v) => "'" + sqlEsc(v) + "'").join(',')
      const clause = 'tipo_documento IN (' + sqlArr + ')'
      sqlParts.push(clause)
      sqlDimParts.push(clause)
    }
    if (f.tipoDevolucao) {
      const td = sqlEsc(f.tipoDevolucao)
      const clause = "tipo_documento = '" + td + "'"
      sqlParts.push(clause)
      sqlDimParts.push(clause)
    }
    if (f.search) {
      const q = sqlEsc(f.search)
      const like = " LIKE '%" + q + "%'"
      const clause =
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
        ')'
      sqlParts.push(clause)
      sqlDimParts.push(clause)
    }

    const sqlWhere = sqlParts.length > 0 ? sqlParts.join(' AND ') : '1=1'
    // Apenas filtros de dimensão (sem data) — usado pela série de ano anterior.
    const sqlWhereBase = sqlDimParts.length > 0 ? sqlDimParts.join(' AND ') : '1=1'
    // Apenas filtro de base — usado para gráficos históricos completos (ignora período e dimensões).
    const sqlWhereHistorical = sqlHistParts.length > 0 ? sqlHistParts.join(' AND ') : '1=1'

    // ---- Helper: roda SELECT e devolve array de DynamicModel (campos a..f) ----
    const runAgg = (sql) => {
      if (Date.now() - startTime > MAX_EXEC_TIME_MS) {
        throw new Error('TIMEOUT_EXCEEDED')
      }
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
    // Faturamento Total: soma bruta de total_linha respeitando os filtros selecionados
    const kpiSql =
      'SELECT ' +
      'COALESCE(SUM(total_linha),0) AS a, ' +
      'COALESCE(SUM(valor_liquido),0) AS b, ' +
      'COALESCE(SUM(quantidade),0) AS c, ' +
      'COUNT(DISTINCT numero_nfe) AS d, ' +
      "COALESCE(SUM(CASE WHEN tipo_documento IN ('Dev. Entrega','Dev. NF','DEVNF') THEN total_linha ELSE 0 END),0) AS e, " +
      'COUNT(*) AS f ' +
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
      "SELECT COALESCE(substr(data_lancamento,1,7),'Sem informação') AS a, COALESCE(SUM(total_linha),0) AS b, COALESCE(SUM(valor_liquido),0) AS c, " +
      "COALESCE(SUM(CASE WHEN tipo_documento IN ('Dev. Entrega','Dev. NF','DEVNF') THEN total_linha ELSE 0 END),0) AS d " +
      'FROM vendas WHERE ' +
      sqlWhere +
      " AND data_lancamento >= '2015-01-01' " +
      "GROUP BY COALESCE(substr(data_lancamento,1,7),'Sem informação') ORDER BY 1 ASC"
    const mesRows = runAgg(mesSql)

    // Série de ano anterior: mesmo mês/ano-1, com os mesmos filtros de
    // DIMENSÃO (sem os filtros de data) — caso contrário ano/mês/data
    // excluiriam sempre o período anterior.
    const prevYearSql =
      "SELECT COALESCE(substr(data_lancamento,1,7),'Sem informação') AS a, COALESCE(SUM(total_linha),0) AS b " +
      'FROM vendas WHERE ' +
      sqlWhereBase +
      " AND data_lancamento >= '2015-01-01' " +
      "GROUP BY COALESCE(substr(data_lancamento,1,7),'Sem informação') ORDER BY 1 ASC"
    const prevYearRows = runAgg(prevYearSql)

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
        faturamento_ano_anterior: 0,
      })
    }
    // Limita aos últimos 6 meses a partir da data mais recente dos dados consolidados.
    if (vendasPorMes.length > 6) {
      vendasPorMes.splice(0, vendasPorMes.length - 6)
    }

    // Mapeia a chave real "yyyy-mm" -> faturamento daquele mês, e injeta em
    // cada um dos últimos 6 meses da série atual o valor do mesmo mês no
    // ano anterior (prevKey = (ano-1) + "-mm").
    const prevYearMap = {}
    for (let i = 0; i < prevYearRows.length; i++) {
      const ym = prevYearRows[i].a
      if (!ym) continue
      prevYearMap[ym] = toNum(prevYearRows[i].b)
    }
    const mesOffset = mesRows.length - vendasPorMes.length
    for (let i = 0; i < vendasPorMes.length; i++) {
      const ym = mesRows[i + mesOffset].a
      if (!ym || ym.indexOf('-') < 0) continue
      const p = ym.split('-')
      const y = parseInt(p[0], 10)
      const mo = parseInt(p[1], 10)
      if (isNaN(y) || isNaN(mo)) continue
      const prevKey = String(y - 1) + '-' + String(mo).padStart(2, '0')
      vendasPorMes[i].faturamento_ano_anterior = prevYearMap[prevKey] || 0
    }

    // ============================================================
    // vendasPorAno (GROUP BY ano, ordenado ASC, com variação percentual)
    // Mostra todos os anos da base independentemente do filtro de período aplicado,
    // respeitando apenas o filtro de seleção de base (sqlWhereHistorical),
    // idêntico aos gráficos históricos contínuos de equipamentos e insumos.
    // ============================================================
    const anoSql =
      "SELECT COALESCE(substr(data_lancamento,1,4),'Sem informação') AS a, COALESCE(SUM(total_linha),0) AS b, " +
      "COALESCE(SUM(CASE WHEN tipo_documento IN ('Dev. Entrega','Dev. NF','DEVNF') THEN total_linha ELSE 0 END),0) AS c " +
      'FROM vendas WHERE ' +
      sqlWhereHistorical +
      " AND data_lancamento >= '2015-01-01' " +
      "GROUP BY COALESCE(substr(data_lancamento,1,4),'Sem informação') ORDER BY 1 ASC"
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

    // grupoItem (todos, value = SUM total_linha; vazio -> "Sem informação")
    const grupoSql =
      "SELECT COALESCE(NULLIF(grupo_item,''),'Sem informação') AS a, COALESCE(SUM(total_linha),0) AS b " +
      'FROM vendas WHERE ' +
      sqlWhere +
      " GROUP BY COALESCE(NULLIF(grupo_item,''),'Sem informação') ORDER BY 2 DESC"
    const grupoRows = runAgg(grupoSql)
    const grupoItem = []
    for (let i = 0; i < grupoRows.length; i++) {
      grupoItem.push({ name: grupoRows[i].a || 'Sem informação', value: toNum(grupoRows[i].b) })
    }

    // topVendedores (top 10 por faturamento)
    const vendSql =
      "SELECT COALESCE(NULLIF(nome_vendedor,''),'Sem informação') AS a, COALESCE(SUM(total_linha),0) AS b " +
      'FROM vendas WHERE ' +
      sqlWhere +
      " GROUP BY COALESCE(NULLIF(nome_vendedor,''),'Sem informação') ORDER BY 2 DESC LIMIT 10"
    const vendRows = runAgg(vendSql)
    const topVendedores = []
    for (let i = 0; i < vendRows.length; i++) {
      topVendedores.push({ name: vendRows[i].a || 'Sem informação', total: toNum(vendRows[i].b) })
    }

    // topClientes (top 10)
    const cliSql =
      "SELECT COALESCE(NULLIF(nome_cliente,''),'Sem informação') AS a, COALESCE(SUM(total_linha),0) AS b " +
      'FROM vendas WHERE ' +
      sqlWhere +
      " GROUP BY COALESCE(NULLIF(nome_cliente,''),'Sem informação') ORDER BY 2 DESC LIMIT 10"
    const cliRows = runAgg(cliSql)
    const topClientes = []
    for (let i = 0; i < cliRows.length; i++) {
      topClientes.push({ name: cliRows[i].a || 'Sem informação', total: toNum(cliRows[i].b) })
    }

    // estado (todos)
    const ufSql =
      "SELECT COALESCE(NULLIF(estado,''),'Sem informação') AS a, COALESCE(SUM(total_linha),0) AS b " +
      'FROM vendas WHERE ' +
      sqlWhere +
      " GROUP BY COALESCE(NULLIF(estado,''),'Sem informação') ORDER BY 2 DESC"
    const ufRows = runAgg(ufSql)
    const estado = []
    for (let i = 0; i < ufRows.length; i++) {
      estado.push({ uf: ufRows[i].a || 'Sem informação', total: toNum(ufRows[i].b) })
    }

    // ============================================================
    // faturamentoPorRevenda — Agregação por revenda autorizada oficial
    // Respeita todos os filtros ativos (sqlWhere) do Dashboard.
    // Agrupa diretamente por nome_cliente e faz o matching na memória do JS!
    // Isso substitui 26 CASE WHEN com 50+ LIKEs por um GROUP BY rápido indexado.
    // ============================================================
    const revendaConfigs = [
      { id: 'adenil', patterns: ['ADENIL', 'ADENILL'] },
      { id: 'aquarela', patterns: ['AQUARELA'] },
      { id: 'bluebird', patterns: ['BLUE BIRD'] },
      { id: 'brastech', patterns: ['BRASTECH', 'CARVALHO LIMA'] },
      { id: 'ch-suprimentos', patterns: ['CH SUPRIMENTOS'] },
      { id: 'cyancolor', patterns: ['CYANCOLOR', 'CYANPRINT', 'CYAN PRINT'] },
      { id: 'd-printer', patterns: ['D PRINTER', 'DPRINTER', 'D. PRINTER'] },
      { id: 'dental-globo', patterns: ['DENTAL GLOBO'] },
      {
        id: 'diamante-tintas',
        patterns: ['DIAMANTE COMERCIO DE TINTAS', 'DIAMANTE TINTAS', 'DIAMANTE COM DE TINTAS'],
      },
      { id: 'dj-comercio', patterns: ['DJ COMERCIO', 'DJ COMÉRCIO', 'DJ COM. DE ADESIVOS'] },
      { id: 'drucken', patterns: ['DRUCKEN'] },
      { id: 'eldorado', patterns: ['ELDORADO', 'ROBERTO LEITE DOS SANTOS'] },
      { id: 'emporio-do-adesivo', patterns: ['EMPORIO DO ADESIVO', 'EMPÓRIO DO ADESIVO'] },
      {
        id: 'formato-go',
        patterns: ['FORMATO GO', 'FORMATO GYN', 'FORMATO DIGITAL GO', 'FORMATO COM'],
      },
      {
        id: 'formato-mg',
        patterns: ['FORMATO MG', 'FORMATO BH', 'FORMATO DIGITAL MG', 'FORMATO COMERCIO'],
      },
      { id: 'impar', patterns: ['IMPAR', 'ÍMPAR'] },
      { id: 'konica-minolta', patterns: ['KONICA MINOLTA', 'KONICA'] },
      { id: 'kromadecka', patterns: ['KROMADECKA'] },
      { id: 'm2', patterns: ['M2 DIGITAL', 'M2 SOLUCOES', 'M2'] },
      { id: 'nrm-leite', patterns: ['N. R. M. LEITE', 'NRM LEITE', 'N R M LEITE', 'LEITE &'] },
      { id: 'neodent', patterns: ['NEODENT', 'JJGC IND'] },
      { id: 'nova-silk', patterns: ['NOVA SILK', 'NOVASILK'] },
      { id: 'novo-tempo-digital', patterns: ['NOVO TEMPO', 'NOVO TEMPO DIGITAL'] },
      { id: 'ocean', patterns: ['OCEAN SOLUCOES', 'OCEAN SOLUÇÕES', 'OCEAN'] },
      { id: 'plastsign', patterns: ['PLASTSIGN', 'PLAST SIGN'] },
      { id: 'substrato', patterns: ['SUBSTRATO'] },
    ]

    const revendasFaturamento = {}
    for (let rIdx = 0; rIdx < revendaConfigs.length; rIdx++) {
      revendasFaturamento[revendaConfigs[rIdx].id] = { faturamento: 0, documentos: 0, itens: 0 }
    }

    try {
      // Cláusula otimizada: busca no banco apenas clientes cujo nome coincide com padrões das revendas
      // evitando GROUP BY em 5.000+ clientes avulsos que nunca pontuam como revenda
      const revPatternClauses = []
      for (let rIdx = 0; rIdx < revendaConfigs.length; rIdx++) {
        const pats = revendaConfigs[rIdx].patterns
        for (let pIdx = 0; pIdx < pats.length; pIdx++) {
          revPatternClauses.push("UPPER(nome_cliente) LIKE '%" + sqlEsc(pats[pIdx]) + "%'")
        }
      }
      const revMatchClause = '(' + revPatternClauses.join(' OR ') + ')'

      const revSql =
        "SELECT COALESCE(nome_cliente,'') AS a, COALESCE(SUM(total_linha),0) AS b, " +
        'COUNT(DISTINCT numero_nfe) AS c, COUNT(*) AS d ' +
        'FROM vendas WHERE ' +
        sqlWhere +
        " AND nome_cliente IS NOT NULL AND nome_cliente != '' AND " +
        revMatchClause +
        ' GROUP BY nome_cliente'
      const revRows = arrayOf(new DynamicModel({ a: '', b: '', c: '', d: '' }))
      $app.db().newQuery(revSql).all(revRows)

      for (let i = 0; i < revRows.length; i++) {
        const clienteUpper = String(revRows[i].a || '').toUpperCase()
        const fat = toNum(revRows[i].b)
        const doc = parseInt(revRows[i].c, 10) || 0
        const itens = parseInt(revRows[i].d, 10) || 0

        for (let rIdx = 0; rIdx < revendaConfigs.length; rIdx++) {
          const rev = revendaConfigs[rIdx]
          let matches = false
          for (let pIdx = 0; pIdx < rev.patterns.length; pIdx++) {
            if (clienteUpper.indexOf(rev.patterns[pIdx]) >= 0) {
              matches = true
              break
            }
          }
          if (matches) {
            revendasFaturamento[rev.id].faturamento += fat
            revendasFaturamento[rev.id].documentos += doc
            revendasFaturamento[rev.id].itens += itens
            break
          }
        }
      }
    } catch (err) {
      console.error('dashboard_stats: revendasFaturamento falhou:', err)
    }

    // ============================================================
    // vendasPorGrupoItemMensal — últimos 6 meses yyyy-mm a partir da
    // data mais recente dos dados consolidados filtrados, GROUP BY mês + grupo_item.
    // ============================================================
    const vendasPorGrupoItemMensal = []
    try {
      // 1) Data mais recente
      // Se mesRows já obteve dados, pegamos a data máxima a partir do último mês de mesRows
      // evitando um SELECT MAX(data_lancamento) completo sobre 125k linhas
      let maxDate = ''
      if (mesRows.length > 0 && mesRows[mesRows.length - 1].a) {
        maxDate = mesRows[mesRows.length - 1].a
      } else {
        const maxDateRows = arrayOf(new DynamicModel({ a: '' }))
        $app
          .db()
          .newQuery(
            "SELECT COALESCE(MAX(data_lancamento),'') AS a FROM vendas WHERE " +
              sqlWhere +
              " AND data_lancamento >= '2015-01-01'",
          )
          .all(maxDateRows)
        maxDate = maxDateRows.length > 0 && maxDateRows[0].a ? maxDateRows[0].a : ''
      }
      if (maxDate && maxDate.indexOf('-') >= 0) {
        const parts = maxDate.split('-') // ["yyyy","mm","dd ..."]
        const maxYear = parseInt(parts[0], 10)
        const maxMonth = parseInt(parts[1], 10)
        if (!isNaN(maxYear) && !isNaN(maxMonth) && maxMonth >= 1 && maxMonth <= 12) {
          // 2) Determina os últimos 6 meses yyyy-mm a partir da data mais recente.
          const mesesAlvo = []
          for (let i = 5; i >= 0; i--) {
            const totalMeses = maxYear * 12 + (maxMonth - 1) - i
            const y = Math.floor(totalMeses / 12)
            const m = (totalMeses % 12) + 1
            mesesAlvo.push(String(y) + '-' + String(m).padStart(2, '0'))
          }

          // 3) GROUP BY substr(data_lancamento,1,7), grupo_item — só os
          //    meses-alvo, respeitando sqlWhere.
          const mesesInList = mesesAlvo.map((m) => "'" + m + "'").join(',')
          // Otimizado: usar data_lancamento >= minMes AND data_lancamento <= maxMes (aproveita índice)
          const minMesTarget = mesesAlvo[0] + '-01 00:00:00'
          const maxMesTarget = mesesAlvo[mesesAlvo.length - 1] + '-31 23:59:59'
          const gmSql =
            "SELECT COALESCE(substr(data_lancamento,1,7),'Sem informação') AS a, " +
            "COALESCE(NULLIF(grupo_item,''),'Sem informação') AS b, " +
            'COALESCE(SUM(total_linha),0) AS c ' +
            'FROM vendas WHERE ' +
            sqlWhere +
            " AND data_lancamento >= '" +
            minMesTarget +
            "' AND data_lancamento <= '" +
            maxMesTarget +
            "' " +
            "GROUP BY COALESCE(substr(data_lancamento,1,7),'Sem informação'), COALESCE(NULLIF(grupo_item,''),'Sem informação') " +
            'ORDER BY 1 ASC'
          const gmRows = runAgg(gmSql)

          // 4) Agrupa por mês (a) e monta a estrutura esperada pelo front.
          const porMes = {}
          for (let i = 0; i < gmRows.length; i++) {
            const mes = gmRows[i].a
            const grupo = gmRows[i].b || 'Sem informação'
            const total = toNum(gmRows[i].c)
            if (!mes || !grupo) continue
            if (total === 0) continue
            if (!porMes[mes]) porMes[mes] = []
            porMes[mes].push({ grupo: grupo, total: total })
          }

          // 5) Garante que TODOS os meses-alvo apareçam na ordem ASC
          for (let i = 0; i < mesesAlvo.length; i++) {
            const mes = mesesAlvo[i]
            vendasPorGrupoItemMensal.push({
              mes: mes,
              grupos: porMes[mes] || [],
            })
          }
        }
      }
    } catch (err) {
      console.error('dashboard_stats: vendasPorGrupoItemMensal falhou:', err)
    }

    // ============================================================
    // 3) recentSales — LIMIT 8 (SQL puro)
    // ============================================================
    const recentSales = []
    try {
      const recentSql =
        'SELECT ' +
        "COALESCE(id,'') AS id, " +
        "COALESCE(data_lancamento,'') AS data_lancamento, " +
        "COALESCE(nome_cliente,'Sem informação') AS nome_cliente, " +
        "COALESCE(vendedor_cliente,'Sem informação') AS vendedor_cliente, " +
        "COALESCE(codigo_item,'Sem informação') AS codigo_item, " +
        "COALESCE(descricao_item,'Sem informação') AS descricao_item, " +
        "COALESCE(grupo_item,'Sem informação') AS grupo_item, " +
        'COALESCE(quantidade,0) AS quantidade, ' +
        'COALESCE(total_linha,0) AS total_linha ' +
        'FROM vendas WHERE ' +
        sqlWhere +
        ' ORDER BY data_lancamento DESC LIMIT 8'
      const recentRows = arrayOf(
        new DynamicModel({
          id: '',
          data_lancamento: '',
          nome_cliente: '',
          vendedor_cliente: '',
          codigo_item: '',
          descricao_item: '',
          grupo_item: '',
          quantidade: '',
          total_linha: '',
        }),
      )
      $app.db().newQuery(recentSql).all(recentRows)
      for (let i = 0; i < recentRows.length; i++) {
        const r = recentRows[i]
        recentSales.push({
          id: r.id,
          data_lancamento: r.data_lancamento,
          nome_cliente: r.nome_cliente,
          vendedor_cliente: r.vendedor_cliente,
          codigo_item: r.codigo_item,
          descricao_item: r.descricao_item,
          grupo_item: r.grupo_item,
          quantidade: toNum(r.quantidade),
          total_linha: toNum(r.total_linha),
        })
      }
    } catch (err) {
      console.error('dashboard_stats: recentSales falhou:', err)
    }

    // ============================================================
    // 4) filterOptions (com fallback e cache em memória rápida)
    // ============================================================
    // Para evitar que cada chamada ao dashboard_stats execute 9 DISTINCTs
    // completos sobre os 125k+ registros de vendas (que causavam 30-70s de execução),
    // as opções de filtro são buscadas com queries otimizadas ou retornam
    // os valores padrão consolidados conhecidos se a base não mudou.
    const distinctCol = (col, maxLimit) => {
      const rows = arrayOf(new DynamicModel({ a: '' }))
      try {
        if (Date.now() - startTime > MAX_EXEC_TIME_MS) {
          return []
        }
        const lim = maxLimit ? ' LIMIT ' + maxLimit : ''
        // Se a coluna tiver índice (como vendedor_cliente, nome_vendedor, grupo_item, estado, utilizacao, tipo_documento),
        // GROUP BY costuma ser ainda mais eficiente que DISTINCT no SQLite
        $app
          .db()
          .newQuery(
            'SELECT COALESCE(' +
              col +
              ",'Sem informação') AS a FROM vendas WHERE " +
              col +
              ' IS NOT NULL AND ' +
              col +
              " != '' GROUP BY " +
              col +
              ' ORDER BY 1 ASC' +
              lim,
          )
          .all(rows)
      } catch (err) {
        console.error('dashboard_stats: DISTINCT ' + col + ' falhou:', err)
      }
      const out = []
      for (let i = 0; i < rows.length; i++) {
        if (rows[i].a && rows[i].a !== 'Sem informação') out.push(rows[i].a)
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

    // Obter anos disponíveis e último período (ano/mês) da base via queries indexadas rápidas
    // (ORDER BY data_lancamento ASC/DESC LIMIT 1 é instantâneo em vez de MIN/MAX que varre tabela)
    let anosList = []
    let maxLancamento = ''
    let ultimoAnoBase = 2026
    let ultimoMesBase = 8
    try {
      const minRow = arrayOf(new DynamicModel({ d: '' }))
      const maxRow = arrayOf(new DynamicModel({ d: '' }))
      $app
        .db()
        .newQuery(
          "SELECT data_lancamento AS d FROM vendas WHERE data_lancamento >= '2015-01-01' ORDER BY data_lancamento ASC LIMIT 1",
        )
        .all(minRow)
      $app
        .db()
        .newQuery(
          "SELECT data_lancamento AS d FROM vendas WHERE data_lancamento >= '2015-01-01' ORDER BY data_lancamento DESC LIMIT 1",
        )
        .all(maxRow)

      const minD = minRow.length > 0 ? minRow[0].d : ''
      const maxD = maxRow.length > 0 ? maxRow[0].d : ''

      if (minD && maxD) {
        maxLancamento = maxD
        const startYear = parseInt(minD.slice(0, 4), 10)
        const endYear = parseInt(maxD.slice(0, 4), 10)
        if (!isNaN(startYear) && !isNaN(endYear) && endYear >= startYear) {
          for (let y = startYear; y <= endYear; y++) {
            anosList.push(y)
          }
        }
        if (!isNaN(endYear)) {
          ultimoAnoBase = endYear
        }
        if (maxLancamento.length >= 7) {
          const parsedM = parseInt(maxLancamento.slice(5, 7), 10)
          if (!isNaN(parsedM) && parsedM >= 1 && parsedM <= 12) {
            ultimoMesBase = parsedM
          }
        }
      }
    } catch (err) {
      console.error('dashboard_stats: anos min/max falhou:', err)
    }
    if (anosList.length === 0) {
      anosList = [2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026]
    }

    const filterOptions = {
      vendedorCliente: cleanFilterOptions(distinctCol('vendedor_cliente', 3000), true),
      vendedor: cleanFilterOptions(distinctCol('nome_vendedor', 500)),
      grupoItem: cleanFilterOptions(distinctCol('grupo_item', 100)),
      estado: cleanFilterOptions(distinctCol('estado', 50)),
      utilizacao: cleanFilterOptions(distinctCol('utilizacao', 200)),
      tipoDocumento: cleanFilterOptions(distinctCol('tipo_documento', 50)),
      anos: anosList,
      meses: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
      dias: [
        1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25,
        26, 27, 28, 29, 30, 31,
      ],
      ultimoAno: ultimoAnoBase,
      ultimoMes: ultimoMesBase,
      maxDataLancamento: maxLancamento,
    }

    // ============================================================
    // 5) Queries de Análise
    // ============================================================

    // 5.1) vendasEquipamentosHistorico — Tendência de Vendas de Equipamentos
    // Usa sqlWhereHistorical para trazer a base inteira contínua histórica (respeita apenas filtro de base)
    const vendasEquipamentosHistorico = []
    try {
      const equipSql =
        "SELECT COALESCE(substr(data_lancamento,1,7),'Sem informação') AS a, COALESCE(SUM(total_linha),0) AS b " +
        'FROM vendas WHERE ' +
        sqlWhereHistorical +
        " AND grupo_item = 'EQUIPAMENTOS' " +
        "AND data_lancamento >= '2015-01-01' " +
        "GROUP BY COALESCE(substr(data_lancamento,1,7),'Sem informação') " +
        'ORDER BY 1 ASC'
      const equipRows = runAgg(equipSql)

      for (let i = 0; i < equipRows.length; i++) {
        const periodo = equipRows[i].a
        if (!periodo || periodo.indexOf('-') < 0) continue
        vendasEquipamentosHistorico.push({
          periodo: periodo,
          total: toNum(equipRows[i].b),
        })
      }
    } catch (err) {
      console.error('dashboard_stats: vendasEquipamentosHistorico falhou:', err)
    }

    // 5.2) vendasInsumosHistorico — Histórico/Tendência de Insumos (Acumulado de Vendas — Insumos)
    // Usa sqlWhereHistorical para trazer a base inteira contínua histórica (respeita apenas filtro de base)
    const vendasInsumosHistorico = []
    try {
      const insumoSql =
        "SELECT COALESCE(substr(data_lancamento,1,7),'Sem informação') AS a, COALESCE(SUM(total_linha),0) AS b " +
        'FROM vendas WHERE ' +
        sqlWhereHistorical +
        " AND grupo_item IN ('PEÇAS', 'PECAS', 'TINTAS', 'ACESSÓRIOS', 'ACESSORIOS') " +
        "AND data_lancamento >= '2015-01-01' " +
        "GROUP BY COALESCE(substr(data_lancamento,1,7),'Sem informação') " +
        'ORDER BY 1 ASC'
      const insumoRows = runAgg(insumoSql)

      for (let i = 0; i < insumoRows.length; i++) {
        const periodo = insumoRows[i].a
        if (!periodo || periodo.indexOf('-') < 0) continue
        vendasInsumosHistorico.push({
          periodo: periodo,
          total: toNum(insumoRows[i].b),
        })
      }
    } catch (err) {
      console.error('dashboard_stats: vendasInsumosHistorico falhou:', err)
    }

    // 5.3) clientesAtivosEquipamentos — Clientes Ativos Equipamentos (últimos 6 meses)
    const clientesAtivosEquipamentos = []
    // 5.4) clientesAtivosInsumos — Clientes Ativos Insumos (últimos 6 meses + ano anterior)
    const clientesAtivosInsumos = []

    try {
      // 1) Data mais recente considerando os filtros ativos (obtém a partir de mesRows ou MAX(data_lancamento))
      let maxDate2 = ''
      if (
        mesRows.length > 0 &&
        mesRows[mesRows.length - 1].a &&
        mesRows[mesRows.length - 1].a !== 'Sem informação'
      ) {
        maxDate2 = mesRows[mesRows.length - 1].a
      } else {
        const maxDateRows2 = arrayOf(new DynamicModel({ a: '' }))
        $app
          .db()
          .newQuery(
            "SELECT COALESCE(MAX(data_lancamento),'') AS a FROM vendas WHERE " +
              sqlWhere +
              " AND data_lancamento >= '2015-01-01'",
          )
          .all(maxDateRows2)
        maxDate2 = maxDateRows2.length > 0 && maxDateRows2[0].a ? maxDateRows2[0].a : ''
      }

      if (maxDate2 && maxDate2.indexOf('-') >= 0) {
        const parts = maxDate2.split('-')
        const maxYear = parseInt(parts[0], 10)
        const maxMonth = parseInt(parts[1], 10)
        if (!isNaN(maxYear) && !isNaN(maxMonth) && maxMonth >= 1 && maxMonth <= 12) {
          // Se o usuário filtrou explicitamente um único ano e mês (ou período com poucos meses),
          // ou se temos filtros de ano/mês:
          // Vamos determinar a lista de meses a exibir respeitando o que está disponível no filtro
          // ou os últimos 6 meses até maxDate2 se for um período contínuo.
          // Mas note: se o usuário filtra mês 3 (Março) de 2025, maxDate2 será 2025-03-...
          // Se gerarmos 6 meses retroativos (2024-10 a 2025-03), mas a query de 'clientes' usa `sqlWhere`
          // (que restringe a 2025-03), os meses anteriores terão 0 clientes atuais, ou se usarmos os meses filtrados
          // mesSql já agrega agrupado por substr(data_lancamento,1,7).
          // Vejamos os meses encontrados em mesRows (que respeita sqlWhere):
          const mesesFiltrados = mesRows.map((r) => r.a).filter((m) => !!m)

          let mesesAlvo = []
          if (mesesFiltrados.length > 0 && mesesFiltrados.length <= 6) {
            // Se o filtro restringe para meses específicos (ex.: apenas 2025-03), usamos exatamente os meses filtrados
            // garantindo que não exibamos 5 meses vazios desnecessariamente se o filtro for estrito de data.
            // Mas se o usuário filtrou apenas ano 2025, mesesFiltrados terá todos os meses com venda em 2025 (até 12 meses, pegamos até 6 ou todos).
            if (mesesFiltrados.length === 1) {
              mesesAlvo = mesesFiltrados
            } else if (mesesFiltrados.length <= 6) {
              mesesAlvo = mesesFiltrados
            } else {
              mesesAlvo = mesesFiltrados.slice(mesesFiltrados.length - 6)
            }
          } else {
            // Fallback padrão: últimos 6 meses a partir de maxDate2
            for (let i = 5; i >= 0; i--) {
              const totalMeses = maxYear * 12 + (maxMonth - 1) - i
              const y = Math.floor(totalMeses / 12)
              const m = (totalMeses % 12) + 1
              mesesAlvo.push(String(y) + '-' + String(m).padStart(2, '0'))
            }
          }

          // --- 5.3 Clientes Ativos Equipamentos ---
          const minEquipDate = mesesAlvo[0] + '-01 00:00:00'
          const maxEquipDate = mesesAlvo[mesesAlvo.length - 1] + '-31 23:59:59'
          const cliEquipSql =
            "SELECT COALESCE(substr(data_lancamento,1,7),'Sem informação') AS a, COUNT(DISTINCT codigo_cliente) AS b " +
            'FROM vendas WHERE ' +
            sqlWhere +
            " AND grupo_item = 'EQUIPAMENTOS' " +
            "AND data_lancamento >= '" +
            minEquipDate +
            "' AND data_lancamento <= '" +
            maxEquipDate +
            "' " +
            "GROUP BY COALESCE(substr(data_lancamento,1,7),'Sem informação') ORDER BY 1 ASC"
          const cliEquipRows = runAgg(cliEquipSql)
          const cliEquipMap = {}
          for (let i = 0; i < cliEquipRows.length; i++) {
            cliEquipMap[cliEquipRows[i].a] = parseInt(cliEquipRows[i].b, 10) || 0
          }

          // Série ano anterior (usando sqlWhereBase para poder comparar o mesmo mês do ano anterior com mesmos filtros de dimensão)
          const mesesAnoAnteriorEquip = mesesAlvo.map((m) => {
            const p = m.split('-')
            const y = parseInt(p[0], 10) - 1
            return String(y) + '-' + p[1]
          })
          const minEquipPrevDate = mesesAnoAnteriorEquip[0] + '-01 00:00:00'
          const maxEquipPrevDate =
            mesesAnoAnteriorEquip[mesesAnoAnteriorEquip.length - 1] + '-31 23:59:59'
          const cliEquipPrevSql =
            "SELECT COALESCE(substr(data_lancamento,1,7),'Sem informação') AS a, COUNT(DISTINCT codigo_cliente) AS b " +
            'FROM vendas WHERE ' +
            sqlWhereBase +
            " AND grupo_item = 'EQUIPAMENTOS' " +
            "AND data_lancamento >= '" +
            minEquipPrevDate +
            "' AND data_lancamento <= '" +
            maxEquipPrevDate +
            "' " +
            "GROUP BY COALESCE(substr(data_lancamento,1,7),'Sem informação') ORDER BY 1 ASC"
          const cliEquipPrevRows = runAgg(cliEquipPrevSql)
          const cliEquipPrevMap = {}
          for (let i = 0; i < cliEquipPrevRows.length; i++) {
            cliEquipPrevMap[cliEquipPrevRows[i].a] = parseInt(cliEquipPrevRows[i].b, 10) || 0
          }

          for (let i = 0; i < mesesAlvo.length; i++) {
            const m = mesesAlvo[i]
            const p = m.split('-')
            const prevM = String(parseInt(p[0], 10) - 1) + '-' + p[1]
            clientesAtivosEquipamentos.push({
              mes: m,
              clientes: cliEquipMap[m] || 0,
              clientesAnoAnterior: cliEquipPrevMap[prevM] || 0,
            })
          }

          // --- 5.4 Clientes Ativos Insumos ---
          const minInsumoDate = mesesAlvo[0] + '-01 00:00:00'
          const maxInsumoDate = mesesAlvo[mesesAlvo.length - 1] + '-31 23:59:59'
          const cliInsumosSql =
            "SELECT COALESCE(substr(data_lancamento,1,7),'Sem informação') AS a, COUNT(DISTINCT codigo_cliente) AS b " +
            'FROM vendas WHERE ' +
            sqlWhere +
            " AND grupo_item IN ('PEÇAS', 'PECAS', 'TINTAS', 'ACESSÓRIOS', 'ACESSORIOS') " +
            "AND data_lancamento >= '" +
            minInsumoDate +
            "' AND data_lancamento <= '" +
            maxInsumoDate +
            "' " +
            "GROUP BY COALESCE(substr(data_lancamento,1,7),'Sem informação') ORDER BY 1 ASC"
          const cliInsumosRows = runAgg(cliInsumosSql)
          const cliInsumosMap = {}
          for (let i = 0; i < cliInsumosRows.length; i++) {
            cliInsumosMap[cliInsumosRows[i].a] = parseInt(cliInsumosRows[i].b, 10) || 0
          }

          // Série ano anterior (usando sqlWhereBase para poder comparar o mesmo mês do ano anterior com mesmos filtros de dimensão)
          const mesesAnoAnterior = mesesAlvo.map((m) => {
            const p = m.split('-')
            const y = parseInt(p[0], 10) - 1
            return String(y) + '-' + p[1]
          })
          const minInsumoPrevDate = mesesAnoAnterior[0] + '-01 00:00:00'
          const maxInsumoPrevDate = mesesAnoAnterior[mesesAnoAnterior.length - 1] + '-31 23:59:59'
          const cliInsumosPrevSql =
            "SELECT COALESCE(substr(data_lancamento,1,7),'Sem informação') AS a, COUNT(DISTINCT codigo_cliente) AS b " +
            'FROM vendas WHERE ' +
            sqlWhereBase +
            " AND grupo_item IN ('PEÇAS', 'PECAS', 'TINTAS', 'ACESSÓRIOS', 'ACESSORIOS') " +
            "AND data_lancamento >= '" +
            minInsumoPrevDate +
            "' AND data_lancamento <= '" +
            maxInsumoPrevDate +
            "' " +
            "GROUP BY COALESCE(substr(data_lancamento,1,7),'Sem informação') ORDER BY 1 ASC"
          const cliInsumosPrevRows = runAgg(cliInsumosPrevSql)
          const cliInsumosPrevMap = {}
          for (let i = 0; i < cliInsumosPrevRows.length; i++) {
            cliInsumosPrevMap[cliInsumosPrevRows[i].a] = parseInt(cliInsumosPrevRows[i].b, 10) || 0
          }

          for (let i = 0; i < mesesAlvo.length; i++) {
            const m = mesesAlvo[i]
            const p = m.split('-')
            const prevM = String(parseInt(p[0], 10) - 1) + '-' + p[1]
            clientesAtivosInsumos.push({
              mes: m,
              clientes: cliInsumosMap[m] || 0,
              clientesAnoAnterior: cliInsumosPrevMap[prevM] || 0,
            })
          }
        }
      }
    } catch (err) {
      console.error('dashboard_stats: clientesAtivos queries falharam:', err)
    }

    const responsePayload = {
      kpis: kpis,
      charts: {
        vendasPorMes: vendasPorMes,
        vendasPorAno: vendasPorAno,
        grupoItem: grupoItem,
        vendasPorGrupoItemMensal: vendasPorGrupoItemMensal,
        vendasEquipamentosPorAno: vendasEquipamentosHistorico,
        vendasInsumosPorAno: vendasInsumosHistorico,
        vendasEquipamentosHistorico: vendasEquipamentosHistorico,
        vendasInsumosHistorico: vendasInsumosHistorico,
        clientesAtivosEquipamentos: clientesAtivosEquipamentos,
        clientesAtivosInsumos: clientesAtivosInsumos,
        topVendedores: topVendedores,
        topClientes: topClientes,
        estado: estado,
        revendasFaturamento: revendasFaturamento,
      },
      recentSales: recentSales,
      filterOptions: filterOptions,
    }

    // Armazena no cache por 5 minutos (300.000 ms) com blindagem completa
    // Limita o tamanho do cache para até 50 entradas para economizar memória
    try {
      if (typeof globalThis !== 'undefined' && globalThis) {
        if (
          !globalThis.__skipDashboardCache ||
          typeof globalThis.__skipDashboardCache.set !== 'function'
        ) {
          globalThis.__skipDashboardCache = new Map()
        }
        if (globalThis.__skipDashboardCache.size > 50) {
          const firstKey = globalThis.__skipDashboardCache.keys().next().value
          if (firstKey) globalThis.__skipDashboardCache.delete(firstKey)
        }
        globalThis.__skipDashboardCache.set(cacheKey, {
          data: responsePayload,
          expiresAt: Date.now() + 300000,
        })
      }
    } catch (cacheWriteErr) {
      console.warn('dashboard_stats: cache write warning:', cacheWriteErr)
    }

    return e.json(200, responsePayload)
  } catch (err) {
    if (err && String(err.message).indexOf('TIMEOUT_EXCEEDED') >= 0) {
      return e.json(504, {
        error:
          'A consulta demorou mais do que o esperado. Por favor, refine os filtros selecionados.',
      })
    }
    console.error('dashboard_stats fatal error:', err)
    return e.json(500, {
      error: 'Erro interno ao processar dados do painel: ' + String(err),
    })
  }
})
