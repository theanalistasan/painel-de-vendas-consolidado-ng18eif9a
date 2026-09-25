// Endpoint: POST /backend/v1/dashboard/stats
// Agrega no servidor os KPIs, gráficos e opções de filtro.
// Execução de altíssima performance lendo prioritariamente das tabelas de resumo pré-calculadas
// (resumo_vendas_mensal, resumo_clientes_ativos, resumo_vendas_uf_regiao) via SQL puro ($app.db().newQuery).
//
// Regras de negócio preservadas:
// (i) Tendência de Vendas — Equipamentos e Acumulado — Insumos trazem SEMPRE toda a base histórica (2015+),
//     ignorando filtros de período, respeitando apenas a seleção de base (ambos/racnew/netsales).
// (ii) Evolução de Vendas por Ano traz todos os anos independente dos filtros, respeitando apenas a seleção de base.
// (iii) Clientes Ativos — Equipamentos e Insumos com comparativo do ano anterior.
// (iv) Filtros de período/tipo/grupo/utilização funcionam sobre os resumos.
// (v) Mapa do Brasil com ranking por região e pinos de revendas com faturamento continuam funcionando.
// (vi) Filtros iniciais preservados.
routerAdd('POST', '/backend/v1/dashboard/stats', (e) => {
  const startTime = Date.now()
  const MAX_EXEC_TIME_MS = 25000 // Teto reduzido para 25s

  try {
    let body = {}
    try {
      body = e.requestInfo().body || {}
    } catch (_) {
      body = {}
    }
    const f = body.filters || {}

    // 0. Auto-inicialização defensiva das tabelas de resumo SQLite (executa em < 1ms se já existem)
    try {
      $app
        .db()
        .newQuery(`
        CREATE TABLE IF NOT EXISTS resumo_vendas_mensal (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          ano_mes TEXT NOT NULL,
          ano INTEGER NOT NULL,
          mes INTEGER NOT NULL,
          tem_netsales INTEGER DEFAULT 0,
          grupo_item TEXT,
          estado TEXT,
          nome_vendedor TEXT,
          vendedor_cliente TEXT,
          codigo_cliente TEXT,
          nome_cliente TEXT,
          tipo_documento TEXT,
          utilizacao TEXT,
          total_linha REAL DEFAULT 0,
          valor_liquido REAL DEFAULT 0,
          quantidade REAL DEFAULT 0,
          total_devolucao REAL DEFAULT 0,
          qtd_documentos INTEGER DEFAULT 0,
          qtd_itens INTEGER DEFAULT 0,
          created TEXT,
          updated TEXT
        );
      `)
        .execute()
      $app
        .db()
        .newQuery('CREATE INDEX IF NOT EXISTS idx_rvm_anomes ON resumo_vendas_mensal (ano_mes);')
        .execute()
      $app
        .db()
        .newQuery('CREATE INDEX IF NOT EXISTS idx_rvm_ano ON resumo_vendas_mensal (ano);')
        .execute()
      $app
        .db()
        .newQuery('CREATE INDEX IF NOT EXISTS idx_rvm_grupo ON resumo_vendas_mensal (grupo_item);')
        .execute()
      $app
        .db()
        .newQuery('CREATE INDEX IF NOT EXISTS idx_rvm_estado ON resumo_vendas_mensal (estado);')
        .execute()
      $app
        .db()
        .newQuery(
          'CREATE INDEX IF NOT EXISTS idx_rvm_netsales ON resumo_vendas_mensal (tem_netsales);',
        )
        .execute()

      $app
        .db()
        .newQuery(`
        CREATE TABLE IF NOT EXISTS resumo_clientes_ativos (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          ano_mes TEXT NOT NULL,
          ano INTEGER NOT NULL,
          mes INTEGER NOT NULL,
          tem_netsales INTEGER DEFAULT 0,
          grupo_categoria TEXT NOT NULL,
          codigo_cliente TEXT NOT NULL,
          created TEXT,
          updated TEXT
        );
      `)
        .execute()
      $app
        .db()
        .newQuery(
          'CREATE INDEX IF NOT EXISTS idx_rca_anomes_grp ON resumo_clientes_ativos (ano_mes, grupo_categoria);',
        )
        .execute()
      $app
        .db()
        .newQuery(
          'CREATE INDEX IF NOT EXISTS idx_rca_ano_grp ON resumo_clientes_ativos (ano, grupo_categoria);',
        )
        .execute()

      $app
        .db()
        .newQuery(`
        CREATE TABLE IF NOT EXISTS resumo_vendas_uf_regiao (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          ano INTEGER NOT NULL,
          mes INTEGER NOT NULL,
          ano_mes TEXT NOT NULL,
          uf TEXT NOT NULL,
          regiao TEXT NOT NULL,
          tem_netsales INTEGER DEFAULT 0,
          total_linha REAL DEFAULT 0,
          qtd_documentos INTEGER DEFAULT 0,
          qtd_itens INTEGER DEFAULT 0,
          created TEXT,
          updated TEXT
        );
      `)
        .execute()
      $app
        .db()
        .newQuery('CREATE INDEX IF NOT EXISTS idx_rvu_anomes ON resumo_vendas_uf_regiao (ano_mes);')
        .execute()

      // Verifica se a tabela resumo_vendas_mensal está preenchida
      const chkRows = arrayOf(new DynamicModel({ c: 0 }))
      $app.db().newQuery('SELECT COUNT(*) as c FROM resumo_vendas_mensal LIMIT 1').all(chkRows)
      const rvmCount = chkRows.length > 0 ? chkRows[0].c : 0

      if (rvmCount === 0) {
        // Preenchimento inicial rápido
        const nowIso = new Date().toISOString()
        $app.runInTransaction((txApp) => {
          txApp
            .db()
            .newQuery(`
            INSERT INTO resumo_vendas_mensal (
              ano_mes, ano, mes, tem_netsales, grupo_item, estado,
              nome_vendedor, vendedor_cliente, codigo_cliente, nome_cliente,
              tipo_documento, utilizacao, total_linha, valor_liquido,
              quantidade, total_devolucao, qtd_documentos, qtd_itens,
              created, updated
            )
            SELECT
              substr(data_lancamento, 1, 7) AS ano_mes,
              CAST(substr(data_lancamento, 1, 4) AS INTEGER) AS ano,
              CAST(substr(data_lancamento, 6, 2) AS INTEGER) AS mes,
              (CASE WHEN tem_netsales = 1 THEN 1 ELSE 0 END) AS tem_netsales,
              COALESCE(NULLIF(grupo_item, ''), 'Sem informação') AS grupo_item,
              COALESCE(NULLIF(estado, ''), 'Sem informação') AS estado,
              COALESCE(NULLIF(nome_vendedor, ''), 'Sem informação') AS nome_vendedor,
              COALESCE(NULLIF(vendedor_cliente, ''), 'Sem informação') AS vendedor_cliente,
              COALESCE(NULLIF(codigo_cliente, ''), '') AS codigo_cliente,
              COALESCE(NULLIF(nome_cliente, ''), 'Sem informação') AS nome_cliente,
              COALESCE(NULLIF(tipo_documento, ''), 'Sem informação') AS tipo_documento,
              COALESCE(NULLIF(utilizacao, ''), 'Sem informação') AS utilizacao,
              COALESCE(SUM(total_linha), 0) AS total_linha,
              COALESCE(SUM(valor_liquido), 0) AS valor_liquido,
              COALESCE(SUM(quantidade), 0) AS quantidade,
              COALESCE(SUM(CASE WHEN tipo_documento IN ('Dev. Entrega','Dev. NF','DEVNF') THEN total_linha ELSE 0 END), 0) AS total_devolucao,
              COUNT(DISTINCT numero_nfe) AS qtd_documentos,
              COUNT(*) AS qtd_itens,
              {:now} AS created,
              {:now} AS updated
            FROM vendas
            WHERE data_lancamento IS NOT NULL AND data_lancamento != '' AND data_lancamento >= '2015-01-01'
            GROUP BY
              substr(data_lancamento, 1, 7),
              CAST(substr(data_lancamento, 1, 4) AS INTEGER),
              CAST(substr(data_lancamento, 6, 2) AS INTEGER),
              (CASE WHEN tem_netsales = 1 THEN 1 ELSE 0 END),
              COALESCE(NULLIF(grupo_item, ''), 'Sem informação'),
              COALESCE(NULLIF(estado, ''), 'Sem informação'),
              COALESCE(NULLIF(nome_vendedor, ''), 'Sem informação'),
              COALESCE(NULLIF(vendedor_cliente, ''), 'Sem informação'),
              COALESCE(NULLIF(codigo_cliente, ''), ''),
              COALESCE(NULLIF(nome_cliente, ''), 'Sem informação'),
              COALESCE(NULLIF(tipo_documento, ''), 'Sem informação'),
              COALESCE(NULLIF(utilizacao, ''), 'Sem informação')
          `)
            .bind({ now: nowIso })
            .execute()

          txApp
            .db()
            .newQuery(`
            INSERT INTO resumo_clientes_ativos (
              ano_mes, ano, mes, tem_netsales, grupo_categoria, codigo_cliente, created, updated
            )
            SELECT
              substr(data_lancamento, 1, 7) AS ano_mes,
              CAST(substr(data_lancamento, 1, 4) AS INTEGER) AS ano,
              CAST(substr(data_lancamento, 6, 2) AS INTEGER) AS mes,
              (CASE WHEN tem_netsales = 1 THEN 1 ELSE 0 END) AS tem_netsales,
              (CASE
                WHEN UPPER(TRIM(grupo_item)) = 'EQUIPAMENTOS' THEN 'EQUIPAMENTOS'
                WHEN UPPER(TRIM(grupo_item)) IN ('PEÇAS', 'PECAS', 'TINTAS', 'ACESSÓRIOS', 'ACESSORIOS') THEN 'INSUMOS'
                ELSE 'OUTROS'
              END) AS grupo_categoria,
              codigo_cliente,
              {:now} AS created,
              {:now} AS updated
            FROM vendas
            WHERE data_lancamento IS NOT NULL AND data_lancamento != '' AND data_lancamento >= '2015-01-01'
              AND codigo_cliente IS NOT NULL AND codigo_cliente != ''
              AND UPPER(TRIM(grupo_item)) IN ('EQUIPAMENTOS', 'PEÇAS', 'PECAS', 'TINTAS', 'ACESSÓRIOS', 'ACESSORIOS')
            GROUP BY
              substr(data_lancamento, 1, 7),
              CAST(substr(data_lancamento, 1, 4) AS INTEGER),
              CAST(substr(data_lancamento, 6, 2) AS INTEGER),
              (CASE WHEN tem_netsales = 1 THEN 1 ELSE 0 END),
              (CASE
                WHEN UPPER(TRIM(grupo_item)) = 'EQUIPAMENTOS' THEN 'EQUIPAMENTOS'
                WHEN UPPER(TRIM(grupo_item)) IN ('PEÇAS', 'PECAS', 'TINTAS', 'ACESSÓRIOS', 'ACESSORIOS') THEN 'INSUMOS'
                ELSE 'OUTROS'
              END),
              codigo_cliente
          `)
            .bind({ now: nowIso })
            .execute()

          txApp
            .db()
            .newQuery(`
            INSERT INTO resumo_vendas_uf_regiao (
              ano, mes, ano_mes, uf, regiao, tem_netsales, total_linha, qtd_documentos, qtd_itens, created, updated
            )
            SELECT
              CAST(substr(data_lancamento, 1, 4) AS INTEGER) AS ano,
              CAST(substr(data_lancamento, 6, 2) AS INTEGER) AS mes,
              substr(data_lancamento, 1, 7) AS ano_mes,
              COALESCE(NULLIF(estado, ''), 'Sem informação') AS uf,
              (CASE
                WHEN estado IN ('SP', 'RJ', 'MG', 'ES') THEN 'Sudeste'
                WHEN estado IN ('PR', 'RS', 'SC') THEN 'Sul'
                WHEN estado IN ('BA', 'PE', 'CE', 'MA', 'PB', 'RN', 'AL', 'SE', 'PI') THEN 'Nordeste'
                WHEN estado IN ('GO', 'MT', 'MS', 'DF') THEN 'Centro-Oeste'
                WHEN estado IN ('AM', 'PA', 'RO', 'TO', 'AC', 'AP', 'RR') THEN 'Norte'
                ELSE 'Outros'
              END) AS regiao,
              (CASE WHEN tem_netsales = 1 THEN 1 ELSE 0 END) AS tem_netsales,
              COALESCE(SUM(total_linha), 0) AS total_linha,
              COUNT(DISTINCT numero_nfe) AS qtd_documentos,
              COUNT(*) AS qtd_itens,
              {:now} AS created,
              {:now} AS updated
            FROM vendas
            WHERE data_lancamento IS NOT NULL AND data_lancamento != '' AND data_lancamento >= '2015-01-01'
            GROUP BY
              CAST(substr(data_lancamento, 1, 4) AS INTEGER),
              CAST(substr(data_lancamento, 6, 2) AS INTEGER),
              substr(data_lancamento, 1, 7),
              COALESCE(NULLIF(estado, ''), 'Sem informação'),
              (CASE WHEN tem_netsales = 1 THEN 1 ELSE 0 END)
          `)
            .bind({ now: nowIso })
            .execute()
        })
      }
    } catch (tblErr) {
      console.warn('dashboard_stats: auto-inicializacao resumo warning:', tblErr)
    }

    // Chave de cache em memória
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

    const sqlEsc = (s) => String(s).replace(/'/g, "''")

    // Cláusulas de filtro
    const sqlParts = []
    const sqlDimParts = []
    const sqlHistParts = []
    const sqlVendasParts = [] // Cláusulas compatíveis diretamente com as colunas da tabela vendas

    // Bloco de filtros "Canais":
    // 1. Nome do Canal (f.canal)
    // 2. Clientes do Canal (f.canalClientes)
    // 3. Deploy (f.deploy: 'AGIS' | 'Roland' | 'Nenhum' | '' | array)
    const canaisFilter = Array.isArray(f.canal) ? f.canal : f.canal ? [f.canal] : []
    const canalClientesFilter = Array.isArray(f.canalClientes)
      ? f.canalClientes
      : f.canalClientes
        ? [f.canalClientes]
        : []
    const deployFilter = Array.isArray(f.deploy) ? f.deploy : f.deploy ? [f.deploy] : []

    const hasCanalFilter = canaisFilter.length > 0
    const hasCanalClientesFilter = canalClientesFilter.length > 0
    const hasDeployFilter = deployFilter.length > 0 && !deployFilter.includes('TODOS')

    if (hasCanalFilter || hasCanalClientesFilter || hasDeployFilter) {
      try {
        const ccWhereClauses = [
          "(eh_canal = 1 OR eh_canal = 'true' OR eh_canal = 'SIM' OR eh_canal = 'Sim' OR eh_canal = 's')",
        ]

        if (hasCanalFilter) {
          const canaisSqlList = canaisFilter.map((c) => "'" + sqlEsc(c) + "'").join(',')
          ccWhereClauses.push('nome_canal IN (' + canaisSqlList + ')')
        }

        if (hasCanalClientesFilter) {
          const clisSqlList = canalClientesFilter.map((c) => "'" + sqlEsc(c) + "'").join(',')
          ccWhereClauses.push('nome_cliente IN (' + clisSqlList + ')')
        }

        if (hasDeployFilter) {
          const depConditions = []
          for (let d = 0; d < deployFilter.length; d++) {
            const rawDep = String(deployFilter[d]).trim()
            const depUpper = rawDep.toUpperCase()
            if (depUpper === 'AGIS' || depUpper.indexOf('AGIS') >= 0) {
              depConditions.push("UPPER(deploy) LIKE '%AGIS%'")
            } else if (depUpper === 'ROLAND' || depUpper.indexOf('ROLAND') >= 0) {
              depConditions.push("UPPER(deploy) LIKE '%ROLAND%'")
            } else if (depUpper === 'NENHUM' || depUpper === 'SEM DEPLOY' || depUpper === 'VAZIO') {
              depConditions.push(
                "(deploy IS NULL OR deploy = '' OR UPPER(deploy) = 'NENHUM' OR UPPER(deploy) = 'SEM DEPLOY')",
              )
            }
          }
          if (depConditions.length > 0) {
            ccWhereClauses.push('(' + depConditions.join(' OR ') + ')')
          }
        }

        const ccQuerySql =
          'SELECT DISTINCT codigo_cliente AS cc, nome_cliente AS nc FROM canais_clientes WHERE ' +
          ccWhereClauses.join(' AND ')

        const ccRows = arrayOf(new DynamicModel({ cc: '', nc: '' }))
        $app.db().newQuery(ccQuerySql).all(ccRows)

        const matchedCodigos = []
        const matchedNomes = []
        for (let k = 0; k < ccRows.length; k++) {
          const cod = (ccRows[k].cc || '').trim()
          const nom = (ccRows[k].nc || '').trim()
          if (cod && cod !== '-') matchedCodigos.push(cod)
          if (nom) matchedNomes.push(nom)
        }

        if (matchedCodigos.length > 0 || matchedNomes.length > 0) {
          const subClauses = []
          if (matchedCodigos.length > 0) {
            const codSqlIn = matchedCodigos.map((c) => "'" + sqlEsc(c) + "'").join(',')
            subClauses.push('codigo_cliente IN (' + codSqlIn + ')')
          }
          if (matchedNomes.length > 0) {
            const nomSqlIn = matchedNomes.map((n) => "'" + sqlEsc(n) + "'").join(',')
            subClauses.push('nome_cliente IN (' + nomSqlIn + ')')
          }
          const finalClause = '(' + subClauses.join(' OR ') + ')'
          sqlParts.push(finalClause)
          sqlDimParts.push(finalClause)
          sqlVendasParts.push(finalClause)
        } else {
          // Nenhum cliente encontrado para os critérios de canais
          const emptyClause = '1=0'
          sqlParts.push(emptyClause)
          sqlDimParts.push(emptyClause)
          sqlVendasParts.push(emptyClause)
        }
      } catch (canalErr) {
        console.warn('dashboard_stats: expansao canais/deploy warning:', canalErr)
      }
    }

    // Filtro de base
    if (f.base === 'racnew') {
      const clause = '(tem_netsales = 0 OR tem_netsales IS NULL)'
      sqlParts.push(clause)
      sqlDimParts.push(clause)
      sqlHistParts.push(clause)
      sqlVendasParts.push(clause)
    } else if (f.base === 'netsales') {
      const clause = 'tem_netsales = 1'
      sqlParts.push(clause)
      sqlDimParts.push(clause)
      sqlHistParts.push(clause)
      sqlVendasParts.push(clause)
    }

    // Filtros de data
    if (f.dataDe) {
      const ymDe = f.dataDe.slice(0, 7)
      sqlParts.push("ano_mes >= '" + sqlEsc(ymDe) + "'")
      sqlVendasParts.push("data_lancamento >= '" + sqlEsc(f.dataDe) + " 00:00:00'")
    }
    if (f.dataAte) {
      const ymAte = f.dataAte.slice(0, 7)
      sqlParts.push("ano_mes <= '" + sqlEsc(ymAte) + "'")
      sqlVendasParts.push("data_lancamento <= '" + sqlEsc(f.dataAte) + " 23:59:59'")
    }
    const anosFilter = Array.isArray(f.ano) ? f.ano : f.ano ? [f.ano] : []
    if (anosFilter.length > 0) {
      const anos = anosFilter.map((a) => 'ano = ' + parseInt(a, 10)).join(' OR ')
      sqlParts.push('(' + anos + ')')
      const anosVendas = anosFilter
        .map((a) => "substr(data_lancamento, 1, 4) = '" + sqlEsc(String(parseInt(a, 10))) + "'")
        .join(' OR ')
      sqlVendasParts.push('(' + anosVendas + ')')
    }
    const mesesFilter = Array.isArray(f.mes) ? f.mes : f.mes ? [f.mes] : []
    if (mesesFilter.length > 0) {
      const meses = mesesFilter.map((m) => 'mes = ' + parseInt(m, 10)).join(' OR ')
      sqlParts.push('(' + meses + ')')
      const mesesVendas = mesesFilter
        .map(
          (m) =>
            "substr(data_lancamento, 6, 2) = '" + String(parseInt(m, 10)).padStart(2, '0') + "'",
        )
        .join(' OR ')
      sqlVendasParts.push('(' + mesesVendas + ')')
    }

    const diasFilter = Array.isArray(f.dia) ? f.dia : f.dia ? [f.dia] : []
    if (diasFilter.length > 0) {
      const diasVendas = diasFilter
        .map(
          (d) =>
            "substr(data_lancamento, 9, 2) = '" + String(parseInt(d, 10)).padStart(2, '0') + "'",
        )
        .join(' OR ')
      sqlVendasParts.push('(' + diasVendas + ')')
    }

    // Filtros de dimensão
    if (Array.isArray(f.vendedorCliente) && f.vendedorCliente.length > 0) {
      const sqlArr = f.vendedorCliente.map((v) => "'" + sqlEsc(v) + "'").join(',')
      const clause = 'vendedor_cliente IN (' + sqlArr + ')'
      sqlParts.push(clause)
      sqlDimParts.push(clause)
      sqlVendasParts.push(clause)
    }
    if (Array.isArray(f.vendedor) && f.vendedor.length > 0) {
      const sqlArr = f.vendedor.map((v) => "'" + sqlEsc(v) + "'").join(',')
      const clause = 'nome_vendedor IN (' + sqlArr + ')'
      sqlParts.push(clause)
      sqlDimParts.push(clause)
      sqlVendasParts.push(clause)
    }
    if (Array.isArray(f.grupoItem) && f.grupoItem.length > 0) {
      const sqlArr = f.grupoItem
        .map((v) => "'" + sqlEsc(String(v).toUpperCase().trim()) + "'")
        .join(',')
      const clause = 'UPPER(TRIM(grupo_item)) IN (' + sqlArr + ')'
      sqlParts.push(clause)
      sqlDimParts.push(clause)
      sqlVendasParts.push(clause)
    }
    if (Array.isArray(f.estado) && f.estado.length > 0) {
      const sqlArr = f.estado.map((v) => "'" + sqlEsc(v) + "'").join(',')
      const clause = 'estado IN (' + sqlArr + ')'
      sqlParts.push(clause)
      sqlDimParts.push(clause)
      sqlVendasParts.push(clause)
    }
    if (Array.isArray(f.utilizacao) && f.utilizacao.length > 0) {
      const sqlArr = f.utilizacao.map((v) => "'" + sqlEsc(v) + "'").join(',')
      const clause = 'utilizacao IN (' + sqlArr + ')'
      sqlParts.push(clause)
      sqlDimParts.push(clause)
      sqlVendasParts.push(clause)
    }
    if (Array.isArray(f.tipoDocumento) && f.tipoDocumento.length > 0) {
      const sqlArr = f.tipoDocumento.map((v) => "'" + sqlEsc(v) + "'").join(',')
      const clause = 'tipo_documento IN (' + sqlArr + ')'
      sqlParts.push(clause)
      sqlDimParts.push(clause)
      sqlVendasParts.push(clause)
    }
    if (f.tipoDevolucao) {
      const td = sqlEsc(f.tipoDevolucao)
      const clause = "tipo_documento = '" + td + "'"
      sqlParts.push(clause)
      sqlDimParts.push(clause)
      sqlVendasParts.push(clause)
    }

    if (f.search) {
      const q = sqlEsc(f.search)
      const like = " LIKE '%" + q + "%'"
      sqlVendasParts.push(
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
          ')',
      )
    }

    // Se o filtro incluir busca textual ('search') ou 'dia' específico, precisamos consultar a tabela `vendas` bruta para a busca pontual
    const hasSearchOrDay = !!f.search || diasFilter.length > 0

    // Onde aplicar na tabela de resumo
    const sqlWhere = sqlParts.length > 0 ? sqlParts.join(' AND ') : '1=1'
    const sqlWhereBase = sqlDimParts.length > 0 ? sqlDimParts.join(' AND ') : '1=1'
    const sqlWhereHistorical = sqlHistParts.length > 0 ? sqlHistParts.join(' AND ') : '1=1'
    const sqlWhereVendas = sqlVendasParts.length > 0 ? sqlVendasParts.join(' AND ') : '1=1'

    // Helper de execução rápida
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
    // 1) KPIs
    // ============================================================
    let kpis = { faturamento: 0, valorLiquido: 0, itensVendidos: 0, documentos: 0, devolucoes: 0 }
    if (!hasSearchOrDay) {
      const kpiSql =
        'SELECT ' +
        'COALESCE(SUM(total_linha),0) AS a, ' +
        'COALESCE(SUM(valor_liquido),0) AS b, ' +
        'COALESCE(SUM(quantidade),0) AS c, ' +
        'COALESCE(SUM(qtd_documentos),0) AS d, ' +
        'COALESCE(SUM(total_devolucao),0) AS e ' +
        'FROM resumo_vendas_mensal WHERE ' +
        sqlWhere
      const kpiRows = runAgg(kpiSql)
      if (kpiRows.length > 0) {
        kpis = {
          faturamento: toNum(kpiRows[0].a),
          valorLiquido: toNum(kpiRows[0].b),
          itensVendidos: toNum(kpiRows[0].c),
          documentos: toNum(kpiRows[0].d),
          devolucoes: toNum(kpiRows[0].e),
        }
      }
    } else {
      // Fallback para filtros textuais finos ou dia
      const kpiSql =
        'SELECT ' +
        'COALESCE(SUM(total_linha),0) AS a, ' +
        'COALESCE(SUM(valor_liquido),0) AS b, ' +
        'COALESCE(SUM(quantidade),0) AS c, ' +
        'COUNT(DISTINCT numero_nfe) AS d, ' +
        "COALESCE(SUM(CASE WHEN tipo_documento IN ('Dev. Entrega','Dev. NF','DEVNF') THEN total_linha ELSE 0 END),0) AS e " +
        'FROM vendas WHERE ' +
        sqlWhereVendas
      const kpiRows = runAgg(kpiSql)
      if (kpiRows.length > 0) {
        kpis = {
          faturamento: toNum(kpiRows[0].a),
          valorLiquido: toNum(kpiRows[0].b),
          itensVendidos: toNum(kpiRows[0].c),
          documentos: toNum(kpiRows[0].d),
          devolucoes: toNum(kpiRows[0].e),
        }
      }
    }

    // ============================================================
    // 2) Charts
    // ============================================================
    // 2.1) vendasPorMes (últimos 6 meses)
    // REGRA DE NEGÓCIO: O dashboard da Visão Geral deve SEMPRE mostrar as movimentações
    // dos últimos 6 meses da base (terminando no último mês disponível na base, ex: Ago-2026),
    // independente do filtro de período (ano/mês/dia) selecionado, mantendo a regra dos gráficos históricos.
    // Respeita os filtros de dimensão e base (sqlWhereBase).
    const ultimos6MesesAlvo = []
    // Determina o último mês geral da base a partir do resumo
    let ultimoYmGeral = '2026-08'
    try {
      const maxYmRows = arrayOf(new DynamicModel({ a: '' }))
      $app
        .db()
        .newQuery(
          "SELECT COALESCE(MAX(ano_mes),'2026-08') AS a FROM resumo_vendas_mensal WHERE ano_mes >= '2015-01'",
        )
        .all(maxYmRows)
      if (maxYmRows.length > 0 && maxYmRows[0].a && maxYmRows[0].a.indexOf('-') >= 0) {
        ultimoYmGeral = maxYmRows[0].a
      }
    } catch (_) {
      ultimoYmGeral = '2026-08'
    }

    const ymParts = ultimoYmGeral.split('-')
    const maxY = parseInt(ymParts[0], 10) || 2026
    const maxM = parseInt(ymParts[1], 10) || 8
    for (let i = 5; i >= 0; i--) {
      const totalMeses = maxY * 12 + (maxM - 1) - i
      const y = Math.floor(totalMeses / 12)
      const m = (totalMeses % 12) + 1
      ultimos6MesesAlvo.push(String(y) + '-' + String(m).padStart(2, '0'))
    }

    const minMes6 = ultimos6MesesAlvo[0]
    const maxMes6 = ultimos6MesesAlvo[ultimos6MesesAlvo.length - 1]

    const mesSql =
      "SELECT COALESCE(ano_mes,'Sem informação') AS a, COALESCE(SUM(total_linha),0) AS b, COALESCE(SUM(valor_liquido),0) AS c, " +
      'COALESCE(SUM(total_devolucao),0) AS d ' +
      'FROM resumo_vendas_mensal WHERE ' +
      sqlWhereBase +
      " AND ano_mes >= '" +
      minMes6 +
      "' AND ano_mes <= '" +
      maxMes6 +
      "' " +
      "GROUP BY COALESCE(ano_mes,'Sem informação') ORDER BY 1 ASC"
    const mesRows = runAgg(mesSql)

    // Série de ano anterior para os mesmos 6 meses
    const mesesAnoAnterior6 = ultimos6MesesAlvo.map((m) => {
      const p = m.split('-')
      const y = parseInt(p[0], 10) - 1
      return String(y) + '-' + p[1]
    })
    const prevYearInClause = mesesAnoAnterior6.map((m) => "'" + m + "'").join(',')

    const prevYearSql =
      "SELECT COALESCE(ano_mes,'Sem informação') AS a, COALESCE(SUM(total_linha),0) AS b " +
      'FROM resumo_vendas_mensal WHERE ' +
      sqlWhereBase +
      ' AND ano_mes IN (' +
      prevYearInClause +
      ') ' +
      "GROUP BY COALESCE(ano_mes,'Sem informação') ORDER BY 1 ASC"
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

    const mesMapAtual = {}
    for (let i = 0; i < mesRows.length; i++) {
      const ym = mesRows[i].a
      if (ym) {
        mesMapAtual[ym] = {
          faturamento: toNum(mesRows[i].b),
          liquido: toNum(mesRows[i].c),
          devolucoes: toNum(mesRows[i].d),
        }
      }
    }

    const prevYearMap = {}
    for (let i = 0; i < prevYearRows.length; i++) {
      const ym = prevYearRows[i].a
      if (ym) prevYearMap[ym] = toNum(prevYearRows[i].b)
    }

    const vendasPorMes = []
    for (let i = 0; i < ultimos6MesesAlvo.length; i++) {
      const ym = ultimos6MesesAlvo[i]
      const p = ym.split('-')
      const y = p[0]
      const mo = parseInt(p[1], 10)
      const prevKey = String(parseInt(y, 10) - 1) + '-' + String(mo).padStart(2, '0')
      const atual = mesMapAtual[ym] || { faturamento: 0, liquido: 0, devolucoes: 0 }

      vendasPorMes.push({
        mes: monthNames[mo - 1] + '/' + y.slice(2),
        faturamento: atual.faturamento,
        liquido: atual.liquido,
        devolucoes: atual.devolucoes,
        faturamento_ano_anterior: prevYearMap[prevKey] || 0,
      })
    }

    // 2.2) vendasPorAno — Mostra SEMPRE todos os anos da base (sqlWhereHistorical)
    const anoSql =
      'SELECT CAST(ano AS TEXT) AS a, COALESCE(SUM(total_linha),0) AS b, ' +
      'COALESCE(SUM(total_devolucao),0) AS c ' +
      'FROM resumo_vendas_mensal WHERE ' +
      sqlWhereHistorical +
      ' AND ano >= 2015 ' +
      'GROUP BY ano ORDER BY ano ASC'
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

    // 2.3) grupoItem
    // Mostra as vendas por grupo do item dentro do filtro ativo (ou 1=1)
    const grupoSql =
      "SELECT COALESCE(NULLIF(grupo_item,''),'Sem informação') AS a, COALESCE(SUM(total_linha),0) AS b " +
      'FROM resumo_vendas_mensal WHERE ' +
      sqlWhere +
      " GROUP BY COALESCE(NULLIF(grupo_item,''),'Sem informação') ORDER BY 2 DESC"
    const grupoRows = runAgg(grupoSql)
    const grupoItem = []
    for (let i = 0; i < grupoRows.length; i++) {
      grupoItem.push({ name: grupoRows[i].a || 'Sem informação', value: toNum(grupoRows[i].b) })
    }

    // 2.4) topVendedores
    const vendSql =
      "SELECT COALESCE(NULLIF(nome_vendedor,''),'Sem informação') AS a, COALESCE(SUM(total_linha),0) AS b " +
      'FROM resumo_vendas_mensal WHERE ' +
      sqlWhere +
      " GROUP BY COALESCE(NULLIF(nome_vendedor,''),'Sem informação') ORDER BY 2 DESC LIMIT 10"
    const vendRows = runAgg(vendSql)
    const topVendedores = []
    for (let i = 0; i < vendRows.length; i++) {
      topVendedores.push({ name: vendRows[i].a || 'Sem informação', total: toNum(vendRows[i].b) })
    }

    // 2.5) topClientes
    const cliSql =
      "SELECT COALESCE(NULLIF(nome_cliente,''),'Sem informação') AS a, COALESCE(SUM(total_linha),0) AS b " +
      'FROM resumo_vendas_mensal WHERE ' +
      sqlWhere +
      " GROUP BY COALESCE(NULLIF(nome_cliente,''),'Sem informação') ORDER BY 2 DESC LIMIT 10"
    const cliRows = runAgg(cliSql)
    const topClientes = []
    for (let i = 0; i < cliRows.length; i++) {
      topClientes.push({ name: cliRows[i].a || 'Sem informação', total: toNum(cliRows[i].b) })
    }

    // 2.6) estado
    const ufSql =
      "SELECT COALESCE(NULLIF(estado,''),'Sem informação') AS a, COALESCE(SUM(total_linha),0) AS b " +
      'FROM resumo_vendas_mensal WHERE ' +
      sqlWhere +
      " GROUP BY COALESCE(NULLIF(estado,''),'Sem informação') ORDER BY 2 DESC"
    const ufRows = runAgg(ufSql)
    const estado = []
    for (let i = 0; i < ufRows.length; i++) {
      estado.push({ uf: ufRows[i].a || 'Sem informação', total: toNum(ufRows[i].b) })
    }

    // 2.7) revendasFaturamento
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
        'COALESCE(SUM(qtd_documentos),0) AS c, COALESCE(SUM(qtd_itens),0) AS d ' +
        'FROM resumo_vendas_mensal WHERE ' +
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

    // 2.8) vendasPorGrupoItemMensal — últimos 6 meses
    // REGRA DE NEGÓCIO: Mostra SEMPRE os últimos 6 meses da base (terminando no último mês disponível, ex: Ago-2026),
    // independente do filtro de período, respeitando dimensões e seleção de base (sqlWhereBase).
    const vendasPorGrupoItemMensal = []
    try {
      const mesesAlvoGrupo = ultimos6MesesAlvo
      const minMesTarget = mesesAlvoGrupo[0]
      const maxMesTarget = mesesAlvoGrupo[mesesAlvoGrupo.length - 1]
      const gmSql =
        "SELECT COALESCE(ano_mes,'Sem informação') AS a, " +
        "COALESCE(NULLIF(grupo_item,''),'Sem informação') AS b, " +
        'COALESCE(SUM(total_linha),0) AS c ' +
        'FROM resumo_vendas_mensal WHERE ' +
        sqlWhereBase +
        " AND ano_mes >= '" +
        minMesTarget +
        "' AND ano_mes <= '" +
        maxMesTarget +
        "' " +
        "GROUP BY ano_mes, COALESCE(NULLIF(grupo_item,''),'Sem informação') " +
        'ORDER BY 1 ASC'
      const gmRows = runAgg(gmSql)

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

      for (let i = 0; i < mesesAlvoGrupo.length; i++) {
        const mes = mesesAlvoGrupo[i]
        vendasPorGrupoItemMensal.push({
          mes: mes,
          grupos: porMes[mes] || [],
        })
      }
    } catch (err) {
      console.error('dashboard_stats: vendasPorGrupoItemMensal falhou:', err)
    }

    // ============================================================
    // 3) recentSales — LIMIT 8 da tabela vendas
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
        sqlWhereVendas +
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
    // 4) filterOptions — Buscado das tabelas de resumo (< 20ms!)
    // ============================================================
    const distinctSummaryCol = (col, maxLimit) => {
      const rows = arrayOf(new DynamicModel({ a: '' }))
      try {
        const lim = maxLimit ? ' LIMIT ' + maxLimit : ''
        $app
          .db()
          .newQuery(
            'SELECT COALESCE(' +
              col +
              ",'Sem informação') AS a FROM resumo_vendas_mensal WHERE " +
              col +
              ' IS NOT NULL AND ' +
              col +
              " != '' AND " +
              col +
              " != 'Sem informação' GROUP BY " +
              col +
              ' ORDER BY 1 ASC' +
              lim,
          )
          .all(rows)
      } catch (err) {
        console.error('dashboard_stats: DISTINCT summary ' + col + ' falhou:', err)
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

    // Anos disponíveis e último período (ano/mês)
    let anosList = []
    let maxLancamento = ''
    let ultimoAnoBase = 2026
    let ultimoMesBase = 8
    try {
      const minMaxRows = arrayOf(new DynamicModel({ min_ym: '', max_ym: '' }))
      $app
        .db()
        .newQuery(
          "SELECT MIN(ano_mes) AS min_ym, MAX(ano_mes) AS max_ym FROM resumo_vendas_mensal WHERE ano_mes >= '2015-01'",
        )
        .all(minMaxRows)

      if (minMaxRows.length > 0 && minMaxRows[0].min_ym && minMaxRows[0].max_ym) {
        const minYear = parseInt(minMaxRows[0].min_ym.slice(0, 4), 10)
        const maxYear = parseInt(minMaxRows[0].max_ym.slice(0, 4), 10)
        maxLancamento = minMaxRows[0].max_ym + '-28 00:00:00.000Z'
        if (!isNaN(minYear) && !isNaN(maxYear) && maxYear >= minYear) {
          for (let y = minYear; y <= maxYear; y++) {
            anosList.push(y)
          }
          ultimoAnoBase = maxYear
          const m = parseInt(minMaxRows[0].max_ym.slice(5, 7), 10)
          if (!isNaN(m)) ultimoMesBase = m
        }
      }
    } catch (err) {
      console.error('dashboard_stats: anos min/max resumo falhou:', err)
    }
    if (anosList.length === 0) {
      anosList = [2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026]
    }

    // Opções de canais e clientes dos canais (apenas registros onde eh_canal = 1 / true)
    let canaisOptions = []
    let canaisClientesOptions = []
    try {
      const canalRows = arrayOf(
        new DynamicModel({
          nome_canal: '',
          deploy: '',
        }),
      )
      $app
        .db()
        .newQuery(
          "SELECT nome_canal, MAX(deploy) AS deploy FROM canais_clientes WHERE (eh_canal = 1 OR eh_canal = 'true' OR eh_canal = 'SIM' OR eh_canal = 'Sim' OR eh_canal = 's') AND nome_canal IS NOT NULL AND nome_canal != '' GROUP BY nome_canal ORDER BY nome_canal ASC",
        )
        .all(canalRows)

      for (let i = 0; i < canalRows.length; i++) {
        const nc = (canalRows[i].nome_canal || '').trim()
        if (nc) {
          canaisOptions.push({
            nome: nc,
            deploy: (canalRows[i].deploy || '').trim().toUpperCase(),
          })
        }
      }

      // Consulta de todos os clientes vinculados a canais para o filtro dependente
      const cliCanalRows = arrayOf(
        new DynamicModel({
          nome_canal: '',
          nome_cliente: '',
          codigo_cliente: '',
          deploy: '',
        }),
      )
      $app
        .db()
        .newQuery(
          "SELECT DISTINCT nome_canal, nome_cliente, codigo_cliente, deploy FROM canais_clientes WHERE (eh_canal = 1 OR eh_canal = 'true' OR eh_canal = 'SIM' OR eh_canal = 'Sim' OR eh_canal = 's') AND nome_cliente IS NOT NULL AND nome_cliente != '' ORDER BY nome_cliente ASC",
        )
        .all(cliCanalRows)

      for (let i = 0; i < cliCanalRows.length; i++) {
        const ncli = (cliCanalRows[i].nome_cliente || '').trim()
        if (ncli) {
          canaisClientesOptions.push({
            nome_canal: (cliCanalRows[i].nome_canal || '').trim(),
            nome_cliente: ncli,
            codigo_cliente: (cliCanalRows[i].codigo_cliente || '').trim(),
            deploy: (cliCanalRows[i].deploy || '').trim().toUpperCase(),
          })
        }
      }
    } catch (canalOptErr) {
      console.warn('dashboard_stats: consulta de canais warning:', canalOptErr)
    }

    const filterOptions = {
      vendedorCliente: cleanFilterOptions(distinctSummaryCol('vendedor_cliente', 3000), true),
      vendedor: cleanFilterOptions(distinctSummaryCol('nome_vendedor', 500)),
      grupoItem: cleanFilterOptions(distinctSummaryCol('grupo_item', 100)),
      estado: cleanFilterOptions(distinctSummaryCol('estado', 50)),
      utilizacao: cleanFilterOptions(distinctSummaryCol('utilizacao', 200)),
      tipoDocumento: cleanFilterOptions(distinctSummaryCol('tipo_documento', 50)),
      canais: canaisOptions,
      canaisClientes: canaisClientesOptions,
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
    // REGRA DE NEGÓCIO: Traz SEMPRE toda a base histórica (2015 em diante),
    // agrupada por mês (yyyy-mm), independente dos filtros de período ativos.
    // Respeita APENAS o filtro de seleção de base (sqlWhereHistorical).
    const vendasEquipamentosHistorico = []
    try {
      const equipSql =
        'SELECT ano_mes AS a, COALESCE(SUM(total_linha),0) AS b ' +
        'FROM resumo_vendas_mensal WHERE ' +
        sqlWhereHistorical +
        " AND UPPER(TRIM(grupo_item)) = 'EQUIPAMENTOS' " +
        'AND ano >= 2015 ' +
        'GROUP BY ano_mes ORDER BY ano_mes ASC'
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
    // REGRA DE NEGÓCIO: Traz SEMPRE toda a base histórica (2015 em diante),
    // agrupada por mês (yyyy-mm), dos grupos TINTAS, PEÇAS e ACESSÓRIOS.
    // Respeita APENAS o filtro de seleção de base (sqlWhereHistorical).
    const vendasInsumosHistorico = []
    try {
      const insumoSql =
        'SELECT ano_mes AS a, COALESCE(SUM(total_linha),0) AS b ' +
        'FROM resumo_vendas_mensal WHERE ' +
        sqlWhereHistorical +
        " AND UPPER(TRIM(grupo_item)) IN ('PEÇAS', 'PECAS', 'TINTAS', 'ACESSÓRIOS', 'ACESSORIOS') " +
        'AND ano >= 2015 ' +
        'GROUP BY ano_mes ORDER BY ano_mes ASC'
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

    // 5.3) clientesAtivosEquipamentos e 5.4) clientesAtivosInsumos
    // REGRA DE NEGÓCIO: Mostra SEMPRE os últimos 6 meses da base (terminando no último mês disponível, ex: Ago-2026),
    // comparados com o mesmo mês do ano anterior, independente do filtro de período ativo.
    // Respeita APENAS a seleção de base (sqlWhereHistorical).
    const clientesAtivosEquipamentos = []
    const clientesAtivosInsumos = []

    try {
      const mesesAlvoClientes = ultimos6MesesAlvo
      const mesesAnoAnterior = mesesAlvoClientes.map((m) => {
        const p = m.split('-')
        const y = parseInt(p[0], 10) - 1
        return String(y) + '-' + p[1]
      })

      const allMesesNeeded = mesesAlvoClientes.concat(mesesAnoAnterior)
      const inMesesList = allMesesNeeded.map((m) => "'" + m + "'").join(',')

      // Query resumo_clientes_ativos para EQUIPAMENTOS
      const cliEqSql =
        'SELECT ano_mes AS a, COUNT(DISTINCT codigo_cliente) AS b ' +
        'FROM resumo_clientes_ativos WHERE ' +
        sqlWhereHistorical +
        " AND grupo_categoria = 'EQUIPAMENTOS' " +
        'AND ano_mes IN (' +
        inMesesList +
        ') GROUP BY ano_mes'
      const cliEquipRows = runAgg(cliEqSql)
      const cliEquipMap = {}
      for (let i = 0; i < cliEquipRows.length; i++) {
        cliEquipMap[cliEquipRows[i].a] = parseInt(cliEquipRows[i].b, 10) || 0
      }

      for (let i = 0; i < mesesAlvoClientes.length; i++) {
        const m = mesesAlvoClientes[i]
        const p = m.split('-')
        const prevM = String(parseInt(p[0], 10) - 1) + '-' + p[1]
        clientesAtivosEquipamentos.push({
          mes: m,
          clientes: cliEquipMap[m] || 0,
          clientesAnoAnterior: cliEquipMap[prevM] || 0,
        })
      }

      // Query resumo_clientes_ativos para INSUMOS
      const cliInsSql =
        'SELECT ano_mes AS a, COUNT(DISTINCT codigo_cliente) AS b ' +
        'FROM resumo_clientes_ativos WHERE ' +
        sqlWhereHistorical +
        " AND grupo_categoria = 'INSUMOS' " +
        'AND ano_mes IN (' +
        inMesesList +
        ') GROUP BY ano_mes'
      const cliInsumosRows = runAgg(cliInsSql)
      const cliInsumosMap = {}
      for (let i = 0; i < cliInsumosRows.length; i++) {
        cliInsumosMap[cliInsumosRows[i].a] = parseInt(cliInsumosRows[i].b, 10) || 0
      }

      for (let i = 0; i < mesesAlvoClientes.length; i++) {
        const m = mesesAlvoClientes[i]
        const p = m.split('-')
        const prevM = String(parseInt(p[0], 10) - 1) + '-' + p[1]
        clientesAtivosInsumos.push({
          mes: m,
          clientes: cliInsumosMap[m] || 0,
          clientesAnoAnterior: cliInsumosMap[prevM] || 0,
        })
      }
    } catch (err) {
      console.error('dashboard_stats: clientesAtivos queries falharam:', err)
    }

    // ============================================================
    // 5.5) Vendas por Canal & Vendas por Deploy (Visão Geral & Canais)
    // Agregação rápida cruzando canais_clientes (eh_canal = SIM/1/true) com resumo_vendas_mensal
    // Respeita todos os filtros ativos (sqlWhere)
    // ============================================================
    const vendasPorCanal = []
    const vendasPorDeploy = []
    let canaisSummary = { canaisAtivos: 0, clientesVinculados: 0, faturamentoTotal: 0 }

    try {
      // 1. Mapa de todos os canais_clientes ativos (eh_canal = true)
      // Carrega em memória (são poucas centenas de registros na tabela canais_clientes)
      const ccMapRows = arrayOf(
        new DynamicModel({
          codigo_cliente: '',
          nome_cliente: '',
          nome_canal: '',
          deploy: '',
        }),
      )
      $app
        .db()
        .newQuery(
          "SELECT DISTINCT COALESCE(codigo_cliente,'') AS codigo_cliente, " +
            "COALESCE(nome_cliente,'') AS nome_cliente, " +
            "COALESCE(nome_canal,'') AS nome_canal, " +
            "COALESCE(deploy,'') AS deploy " +
            "FROM canais_clientes WHERE (eh_canal = 1 OR eh_canal = 'true' OR eh_canal = 'SIM' OR eh_canal = 'Sim' OR eh_canal = 's') " +
            "AND nome_canal IS NOT NULL AND nome_canal != ''",
        )
        .all(ccMapRows)

      // Mapas deduplicados: codigo_cliente -> lista de { canal, deploy }
      // e nome_cliente (fallback) -> lista de { canal, deploy }
      const codToCanalMap = {}
      const nomToCanalMap = {}
      const todosCanaisSet = new Set()
      const todosClientesSet = new Set()

      for (let i = 0; i < ccMapRows.length; i++) {
        const cod = (ccMapRows[i].codigo_cliente || '').trim()
        const nom = (ccMapRows[i].nome_cliente || '').trim().toUpperCase()
        const canal = (ccMapRows[i].nome_canal || '').trim()
        let dep = (ccMapRows[i].deploy || '').trim().toUpperCase()
        if (dep.indexOf('AGIS') >= 0) dep = 'AGIS'
        else if (dep.indexOf('ROLAND') >= 0) dep = 'ROLAND'
        else dep = 'Nenhum'

        if (canal) {
          todosCanaisSet.add(canal)
          if (cod && cod !== '-') {
            todosClientesSet.add(cod)
            if (!codToCanalMap[cod]) codToCanalMap[cod] = []
            const exists = codToCanalMap[cod].some(
              (item) => item.canal === canal && item.deploy === dep,
            )
            if (!exists) {
              codToCanalMap[cod].push({ canal: canal, deploy: dep })
            }
          }
          if (nom) {
            todosClientesSet.add(nom)
            if (!nomToCanalMap[nom]) nomToCanalMap[nom] = []
            const exists = nomToCanalMap[nom].some(
              (item) => item.canal === canal && item.deploy === dep,
            )
            if (!exists) {
              nomToCanalMap[nom].push({ canal: canal, deploy: dep })
            }
          }
        }
      }

      // 2. Consulta agrupada por cliente (codigo_cliente, nome_cliente) a partir do resumo_vendas_mensal (ou vendas se hasSearchOrDay)
      // aplicando todos os filtros ativos (sqlWhere)
      let cliSalesSql = ''
      if (!hasSearchOrDay) {
        cliSalesSql =
          "SELECT COALESCE(codigo_cliente,'') AS a, COALESCE(nome_cliente,'') AS b, COALESCE(SUM(total_linha),0) AS c, COUNT(DISTINCT qtd_documentos) AS d " +
          'FROM resumo_vendas_mensal WHERE ' +
          sqlWhere +
          ' GROUP BY codigo_cliente, nome_cliente'
      } else {
        cliSalesSql =
          "SELECT COALESCE(codigo_cliente,'') AS a, COALESCE(nome_cliente,'') AS b, COALESCE(SUM(total_linha),0) AS c, COUNT(DISTINCT numero_nfe) AS d " +
          'FROM vendas WHERE ' +
          sqlWhereVendas +
          ' GROUP BY codigo_cliente, nome_cliente'
      }

      const cliSalesRows = arrayOf(
        new DynamicModel({
          a: '',
          b: '',
          c: '',
          d: '',
        }),
      )
      $app.db().newQuery(cliSalesSql).all(cliSalesRows)

      const canalTotals = {}
      const canalClientesUnicos = {}
      const deployTotals = {
        AGIS: 0,
        Roland: 0,
        Nenhum: 0,
      }
      let totalRecorteCanais = 0
      const clientesComVendaNoRecorte = new Set()
      const canaisComVendaNoRecorte = new Set()

      for (let i = 0; i < cliSalesRows.length; i++) {
        const cod = (cliSalesRows[i].a || '').trim()
        const nom = (cliSalesRows[i].b || '').trim().toUpperCase()
        const total = toNum(cliSalesRows[i].c)
        if (total === 0) continue

        // Encontra os canais associados a este cliente
        let matches = codToCanalMap[cod]
        if (!matches || matches.length === 0) {
          matches = nomToCanalMap[nom]
        }

        if (matches && matches.length > 0) {
          // Cliente vinculado a canal(is)
          // Se houver mais de 1 canal para o mesmo cliente, distribui proporcionalmente ou associa a cada um
          const splitFactor = matches.length
          for (let m = 0; m < matches.length; m++) {
            const canalName = matches[m].canal
            const depName = matches[m].deploy
            const partTotal = total / splitFactor

            if (!canalTotals[canalName]) {
              canalTotals[canalName] = 0
              canalClientesUnicos[canalName] = new Set()
            }
            canalTotals[canalName] += partTotal
            if (cod) canalClientesUnicos[canalName].add(cod)
            else canalClientesUnicos[canalName].add(nom)

            if (depName === 'AGIS') {
              deployTotals.AGIS += partTotal
            } else if (depName === 'ROLAND') {
              deployTotals.Roland += partTotal
            } else {
              deployTotals.Nenhum += partTotal
            }

            totalRecorteCanais += partTotal
            canaisComVendaNoRecorte.add(canalName)
            if (cod) clientesComVendaNoRecorte.add(cod)
            else clientesComVendaNoRecorte.add(nom)
          }
        } else {
          // Vendas de clientes que NÃO estão vinculados a nenhum canal (Deploy: Nenhum)
          deployTotals.Nenhum += total
        }
      }

      // Ordena os canais por faturamento decrescente
      const sortedCanais = Object.keys(canalTotals).sort((a, b) => canalTotals[b] - canalTotals[a])

      for (let i = 0; i < sortedCanais.length; i++) {
        const cName = sortedCanais[i]
        vendasPorCanal.push({
          canal: cName,
          faturamento: canalTotals[cName],
          clientesQtd: canalClientesUnicos[cName] ? canalClientesUnicos[cName].size : 0,
        })
      }

      // Estrutura do deploy (AGIS, Roland, Nenhum)
      vendasPorDeploy.push(
        { deploy: 'AGIS', faturamento: deployTotals.AGIS, label: 'AGIS (revenda)' },
        { deploy: 'Roland', faturamento: deployTotals.Roland, label: 'Roland (direta)' },
        { deploy: 'Nenhum', faturamento: deployTotals.Nenhum, label: 'Nenhum (sem deploy)' },
      )

      canaisSummary = {
        canaisAtivos: canaisComVendaNoRecorte.size,
        clientesVinculados: clientesComVendaNoRecorte.size,
        faturamentoTotal: totalRecorteCanais,
      }
    } catch (canalAggErr) {
      console.error(
        'dashboard_stats: agregacao vendasPorCanal/vendasPorDeploy falhou:',
        canalAggErr,
      )
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
        vendasPorCanal: vendasPorCanal,
        vendasPorDeploy: vendasPorDeploy,
        canaisSummary: canaisSummary,
      },
      recentSales: recentSales,
      filterOptions: filterOptions,
    }

    // Salva no cache por 5 minutos
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
