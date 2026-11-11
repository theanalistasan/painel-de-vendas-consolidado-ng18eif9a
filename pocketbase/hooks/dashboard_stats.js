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
var __dashboardStatsHandler = (e) => {
  const startTime = Date.now()
  const MAX_EXEC_TIME_MS = 25000 // Teto reduzido para 25s

  try {
    let body = {}
    try {
      body = e.requestInfo().body || {}
    } catch (_) {
      body = {}
    }
    // Aceita também GET: parâmetros vêm da query string (filters=<JSON>)
    if (!body || typeof body !== 'object' || Object.keys(body).length === 0) {
      try {
        const q = e.requestInfo().query || {}
        if (q.filters) {
          body = { filters: typeof q.filters === 'string' ? JSON.parse(q.filters) : q.filters }
        }
        if (q.ano) body.ano = q.ano
        if (q.mes) body.mes = q.mes
      } catch (qsErr) {
        console.warn('dashboard_stats: falha ao ler query params:', qsErr)
      }
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
      const chkRows = arrayOf(new DynamicModel({ c: '' }))
      $app.db().newQuery('SELECT COUNT(*) as c FROM resumo_vendas_mensal LIMIT 1').all(chkRows)
      const rvmCount = chkRows.length > 0 ? parseInt(chkRows[0].c, 10) || 0 : 0
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
              AND UPPER(TRIM(COALESCE(codigo_item, ''))) != 'SERVICOS'
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
              AND UPPER(TRIM(COALESCE(codigo_item, ''))) != 'SERVICOS'
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
              AND UPPER(TRIM(COALESCE(codigo_item, ''))) != 'SERVICOS'
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

    // Chave de cache em memória — CANÔNICA por combinação de filtros.
    // Antes: JSON.stringify(f) cru — a MESMA combinação de filtros refeita com
    // ordem de chaves (ou de seleção em arrays) diferente gerava uma chave
    // diferente e recomputava todas as agregações (~310k registros). Agora a
    // chave serializa chaves de objeto em ordem fixa e arrays ordenados: a
    // ordem dos termos não altera o resultado das consultas (listas IN são
    // invariantes à ordem), portanto nenhum valor muda — só a taxa de acerto
    // do cache. Entradas expiram em 5 minutos por combinação de filtros.
    const stableCacheKey = (value) => {
      if (value === null) return 'null'
      if (Array.isArray(value)) {
        const items = []
        for (let i = 0; i < value.length; i++) items.push(stableCacheKey(value[i]))
        return '[' + items.sort().join('|') + ']'
      }
      const t = typeof value
      if (t === 'object') {
        const keys = Object.keys(value).sort()
        const parts = []
        for (let i = 0; i < keys.length; i++) {
          parts.push(keys[i] + '=' + stableCacheKey(value[keys[i]]))
        }
        return '{' + parts.join('&') + '}'
      }
      if (t === 'string') return 's:' + value
      if (t === 'number') return 'n:' + String(value)
      if (t === 'boolean') return 'b:' + String(value)
      return 'x:' + String(value)
    }
    const cacheKey = stableCacheKey(f || {})
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

    // Último mês disponível na base (a partir do resumo pré-calculado) — usado
    // para a janela padrão das consultas na base bruta `vendas` e para a série
    // dos últimos 6 meses. Consulta única e barata (MAX sobre índice).
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

    // Cláusulas de filtro
    const sqlParts = []
    const sqlDimParts = []
    const sqlHistParts = []
    const sqlGlobalRestrictedParts = [] // EXCLUSIVAMENTE os 5 filtros globais (Ciclo C)
    const sqlGlobalRestrictedVendasParts = [] // EXCLUSIVAMENTE os 5 filtros globais para tabela vendas / clientesAtivos
    const sqlVendasParts = [] // Cláusulas compatíveis diretamente com as colunas da tabela vendas

    // Bloco de filtros "Canais":
    // 1. Nome do Canal (f.canal)
    // 2. Clientes do Canal (f.canalClientes)
    // 3. Deploy (f.deploy: 'AGIS' | 'Roland' | 'Nenhum' | '' | array)
    // 4. Inside (f.inside: string[])
    const canaisFilter = Array.isArray(f.canal) ? f.canal : f.canal ? [f.canal] : []
    const canalClientesFilter = Array.isArray(f.canalClientes)
      ? f.canalClientes
      : f.canalClientes
        ? [f.canalClientes]
        : []
    const deployFilter = Array.isArray(f.deploy) ? f.deploy : f.deploy ? [f.deploy] : []
    const insideFilter = Array.isArray(f.inside) ? f.inside : f.inside ? [f.inside] : []

    const hasCanalFilter = canaisFilter.length > 0
    const hasCanalClientesFilter = canalClientesFilter.length > 0
    const hasDeployFilter = deployFilter.length > 0 && !deployFilter.includes('TODOS')
    const hasInsideFilter = insideFilter.length > 0

    if (hasCanalFilter || hasCanalClientesFilter || hasDeployFilter || hasInsideFilter) {
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

        if (hasInsideFilter) {
          const insideSqlList = insideFilter
            .map((ins) => "'" + sqlEsc(String(ins).trim().toUpperCase()) + "'")
            .join(',')
          ccWhereClauses.push(
            "(UPPER(TRIM(COALESCE(inside, ''))) IN (" +
              insideSqlList +
              ") OR UPPER(TRIM(COALESCE(responsavel, ''))) IN (" +
              insideSqlList +
              '))',
          )
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
    //
    // Na base bruta `vendas` o filtro de período é convertido em FAIXA DE DATAS
    // (data_lancamento >= início AND < fim) para usar o índice
    // idx_vendas_data_lancamento (migration 1741900000) — nada de substr() sobre
    // a coluna, que anularia o índice e forçaria varredura de ~310k registros.
    //
    // data_lancamento é uma coluna DATE do PocketBase, armazenada/serializada
    // como 'yyyy-mm-dd hh:mm:ss.SSSZ'. As faixas abaixo cobrem dias inteiros.
    const pad2 = (n) => String(n).padStart(2, '0')
    const anoMesBounds = [] // pares [inclusivo 'yyyy-mm-01', exclusivo 'yyyy-mm+1-01']

    if (f.dataDe) {
      const ymDe = f.dataDe.slice(0, 7)
      sqlParts.push("ano_mes >= '" + sqlEsc(ymDe) + "'")
      // Faixa aberta a partir do dia informado (inclusive)
      anoMesBounds.push(['>=', sqlEsc(f.dataDe) + ' 00:00:00.000Z'])
    }
    if (f.dataAte) {
      const ymAte = f.dataAte.slice(0, 7)
      sqlParts.push("ano_mes <= '" + sqlEsc(ymAte) + "'")
      // Exclusivo: primeiro instante do dia seguinte
      const dAte = new Date(f.dataAte + 'T00:00:00Z')
      const dNext = new Date(dAte.getTime() + 86400000)
      const nextIso =
        dNext.getUTCFullYear() +
        '-' +
        pad2(dNext.getUTCMonth() + 1) +
        '-' +
        pad2(dNext.getUTCDate()) +
        ' 00:00:00.000Z'
      anoMesBounds.push(['<', nextIso])
    }

    // anos/meses: combinação (ano, mês) em faixas contíguas por mês civil
    // (ex.: anos [2025, 2026] x meses [1, 2] => faixas jan/fev de cada ano).
    // Sem ano selecionado, o ano do último mês da base delimita a faixa.
    const anosFilter = Array.isArray(f.ano) ? f.ano : f.ano ? [f.ano] : []
    const mesesFilter = Array.isArray(f.mes) ? f.mes : f.mes ? [f.mes] : []
    const diasFilter = Array.isArray(f.dia) ? f.dia : f.dia ? [f.dia] : []

    const anosInt = anosFilter
      .map((a) => parseInt(a, 10))
      .filter((a) => !isNaN(a) && a > 1990 && a < 2100)
    const mesesInt = mesesFilter
      .map((m) => parseInt(m, 10))
      .filter((m) => !isNaN(m) && m >= 1 && m <= 12)

    if (anosInt.length > 0) {
      const anos = anosFilter.map((a) => 'ano = ' + parseInt(a, 10)).join(' OR ')
      sqlParts.push('(' + anos + ')')
    }
    if (mesesInt.length > 0) {
      const meses = mesesFilter.map((m) => 'mes = ' + parseInt(m, 10)).join(' OR ')
      sqlParts.push('(' + meses + ')')
    }

    if (anosInt.length > 0 || mesesInt.length > 0) {
      const anosParaFaixa = anosInt.length > 0 ? anosInt : [parseInt(ultimoYmGeral.slice(0, 4), 10)]
      const mesUpper = mesesInt.length > 0 ? Math.max.apply(null, mesesInt) : 12
      const mesLower = mesesInt.length > 0 ? Math.min.apply(null, mesesInt) : 1

      // Uma faixa por ano selecionado: de (ano, mesLower) até o fim de (ano, mesUpper)
      for (let ai = 0; ai < anosParaFaixa.length; ai++) {
        const y = anosParaFaixa[ai]
        const startYm = y + '-' + pad2(mesLower)
        // fim exclusivo: primeiro dia do mês seguinte ao mês superior
        const endY = mesUpper === 12 ? y + 1 : y
        const endM = mesUpper === 12 ? 1 : mesUpper + 1
        anoMesBounds.push(['>=', startYm + '-01 00:00:00.000Z'])
        anoMesBounds.push(['<', endY + '-' + pad2(endM) + '-01 00:00:00.000Z'])
      }
    }

    // dias: quando combinado com ano/mês forma um recorte pequeno; sozinho,
    // limita ao mês corrente da base (mesma janela do caso anterior)
    if (diasFilter.length > 0) {
      const diasVendas = diasFilter
        .map(
          (d) =>
            "substr(data_lancamento, 9, 2) = '" + String(parseInt(d, 10)).padStart(2, '0') + "'",
        )
        .join(' OR ')
      sqlVendasParts.push('(' + diasVendas + ')')

      // Com dia filtrado mas sem ano/mês: recorte no mês corrente da base
      if (anosInt.length === 0 && mesesInt.length === 0 && anoMesBounds.length === 0) {
        const p = ultimoYmGeral.split('-')
        const y = parseInt(p[0], 10)
        const m = parseInt(p[1], 10)
        const startYm = y + '-' + pad2(m)
        const endY = m === 12 ? y + 1 : y
        const endM = m === 12 ? 1 : m + 1
        anoMesBounds.push(['>=', startYm + '-01 00:00:00.000Z'])
        anoMesBounds.push(['<', endY + '-' + pad2(endM) + '-01 00:00:00.000Z'])
      }
    }

    // Aplica as faixas de data montadas acima na cláusula da base bruta
    for (let bi = 0; bi < anoMesBounds.length; bi++) {
      const op = anoMesBounds[bi][0]
      const val = anoMesBounds[bi][1]
      sqlVendasParts.push('data_lancamento ' + op + " '" + val + "'")
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
    // Filtro Global 1: Grupo do Item (f.grupoItem / f.grupo_item)
    const rawGrupoItem = f.grupoItem || f.grupo_item
    const grupoItemFilter = Array.isArray(rawGrupoItem)
      ? rawGrupoItem
      : rawGrupoItem
        ? [rawGrupoItem]
        : []
    if (grupoItemFilter.length > 0 && !grupoItemFilter.includes('TODOS')) {
      const sqlArr = grupoItemFilter
        .map((v) => "'" + sqlEsc(String(v).toUpperCase().trim()) + "'")
        .join(',')
      const clause = 'UPPER(TRIM(grupo_item)) IN (' + sqlArr + ')'
      sqlParts.push(clause)
      sqlDimParts.push(clause)
      sqlVendasParts.push(clause)
      sqlGlobalRestrictedParts.push(clause)
      sqlGlobalRestrictedVendasParts.push(clause)
    }

    if (Array.isArray(f.estado) && f.estado.length > 0) {
      const sqlArr = f.estado.map((v) => "'" + sqlEsc(v) + "'").join(',')
      const clause = 'estado IN (' + sqlArr + ')'
      sqlParts.push(clause)
      sqlDimParts.push(clause)
      sqlVendasParts.push(clause)
    }

    // Filtro Global 2: Utilização (f.utilizacao)
    const rawUtilizacao = f.utilizacao
    const utilizacaoFilter = Array.isArray(rawUtilizacao)
      ? rawUtilizacao
      : rawUtilizacao
        ? [rawUtilizacao]
        : []
    if (utilizacaoFilter.length > 0 && !utilizacaoFilter.includes('TODOS')) {
      const sqlArr = utilizacaoFilter.map((v) => "'" + sqlEsc(v) + "'").join(',')
      const clause = 'utilizacao IN (' + sqlArr + ')'
      sqlParts.push(clause)
      sqlDimParts.push(clause)
      sqlVendasParts.push(clause)
      sqlGlobalRestrictedParts.push(clause)
      sqlGlobalRestrictedVendasParts.push(clause)
    }

    // Filtro Global 3: Tipo de Documento (f.tipoDocumento / f.tipo_documento)
    const rawTipoDoc = f.tipoDocumento || f.tipo_documento
    const tipoDocFilter = Array.isArray(rawTipoDoc) ? rawTipoDoc : rawTipoDoc ? [rawTipoDoc] : []
    if (tipoDocFilter.length > 0 && !tipoDocFilter.includes('TODOS')) {
      const sqlArr = tipoDocFilter.map((v) => "'" + sqlEsc(v) + "'").join(',')
      const clause = 'tipo_documento IN (' + sqlArr + ')'
      sqlParts.push(clause)
      sqlDimParts.push(clause)
      sqlVendasParts.push(clause)
      sqlGlobalRestrictedParts.push(clause)
      sqlGlobalRestrictedVendasParts.push(clause)
    }

    // Filtro Global 5: Tipo de Cliente (f.tipoCliente / f.tipo_cliente)
    // (Filtro "Tipo de Devolução" removido dos Filtros Globais — aceita o campo como
    // no-op para sessões antigas, sem cláusula SQL.)
    const rawTipoCliente = f.tipoCliente || f.tipo_cliente
    const tipoClienteFilter = Array.isArray(rawTipoCliente)
      ? rawTipoCliente
      : rawTipoCliente
        ? [rawTipoCliente]
        : []
    let hasTipoCliente = false
    if (tipoClienteFilter.length > 0 && !tipoClienteFilter.includes('TODOS')) {
      hasTipoCliente = true
      const tcConds = []
      const tcValues = []
      for (let tcIdx = 0; tcIdx < tipoClienteFilter.length; tcIdx++) {
        const val = String(tipoClienteFilter[tcIdx]).trim()
        if (
          val.toUpperCase() === 'SEM INFORMACAO' ||
          val.toUpperCase() === 'VAZIO' ||
          val.toUpperCase() === 'SEM TIPO'
        ) {
          tcConds.push("(tipo_cliente IS NULL OR tipo_cliente = '')")
        } else if (val) {
          tcValues.push("'" + sqlEsc(val) + "'")
        }
      }
      if (tcValues.length > 0) {
        tcConds.push('tipo_cliente IN (' + tcValues.join(',') + ')')
      }
      if (tcConds.length > 0) {
        const tcClause = '(' + tcConds.join(' OR ') + ')'
        sqlVendasParts.push(tcClause)
        sqlGlobalRestrictedParts.push(tcClause)
        sqlGlobalRestrictedVendasParts.push(tcClause)
      }
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
          ' OR vendedor_cliente' +
          like +
          ')',
      )
    }

    // TAREFA 1: Desabilitar o produto "SERVICOS" em todas as visões
    sqlVendasParts.push("(UPPER(TRIM(COALESCE(codigo_item, ''))) != 'SERVICOS')")

    // Se o filtro incluir busca textual ('search'), 'dia' específico ou tipoCliente, precisamos consultar a tabela `vendas` bruta para a busca pontual
    const hasSearchOrDay = !!f.search || diasFilter.length > 0 || hasTipoCliente

    // Onde aplicar na tabela de resumo
    const sqlWhere = sqlParts.length > 0 ? sqlParts.join(' AND ') : '1=1'
    const sqlWhereBase = sqlDimParts.length > 0 ? sqlDimParts.join(' AND ') : '1=1'
    const sqlWhereHistorical = sqlHistParts.length > 0 ? sqlHistParts.join(' AND ') : '1=1'
    const sqlWhereGlobalRestricted =
      sqlGlobalRestrictedParts.length > 0 ? sqlGlobalRestrictedParts.join(' AND ') : '1=1'
    const sqlWhereGlobalRestrictedVendas =
      sqlGlobalRestrictedVendasParts.length > 0
        ? sqlGlobalRestrictedVendasParts.join(' AND ')
        : '1=1'
    const sqlWhereVendas = sqlVendasParts.join(' AND ')

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
    // BUG 0.0.307 (card "Valores Consolidados" zerado): a query de KPIs somava
    // total_nf_sem_frete/total_nf_novo na resumo_vendas_mensal — colunas que NÃO
    // existem na tabela de resumo. A query falhava ("no such column"), o runAgg
    // engolia o erro e TODOS os 4 valores voltavam 0 ("Nenhum dado encontrado").
    // Correção: KPIs de linha saem do resumo; os 2 valores de NF saem da base
    // bruta `vendas` agregados POR NF (MAX por numero_nfe — o valor é constante
    // por NF e repete em cada item; SUM por linha multiplicaria pelo nº de itens;
    // mesma convenção de vendas_export.js), respeitando TODOS os filtros ativos
    // (sqlWhereVendas: período + dimensões + exclusão de SERVICOS).
    let kpis = {
      faturamento: 0,
      valorLiquido: 0,
      totalNfSemFrete: 0,
      totalNfNovo: 0,
      itensVendidos: 0,
      documentos: 0,
      devolucoes: 0,
    }
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
        kpis.faturamento = toNum(kpiRows[0].a)
        kpis.valorLiquido = toNum(kpiRows[0].b)
        kpis.itensVendidos = toNum(kpiRows[0].c)
        kpis.documentos = toNum(kpiRows[0].d)
        kpis.devolucoes = toNum(kpiRows[0].e)
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
        kpis.faturamento = toNum(kpiRows[0].a)
        kpis.valorLiquido = toNum(kpiRows[0].b)
        kpis.itensVendidos = toNum(kpiRows[0].c)
        kpis.documentos = toNum(kpiRows[0].d)
        kpis.devolucoes = toNum(kpiRows[0].e)
      }
    }

    // Valor Total NF sem frete e Valor Total da NF: valores por NF na base bruta
    // (MAX por numero_nfe; uma NF sem número cai num único grupo "vazio").
    try {
      const nfSql =
        'SELECT COALESCE(SUM(t.f),0) AS f, COALESCE(SUM(t.g),0) AS g FROM (' +
        'SELECT MAX(COALESCE(total_nf_sem_frete,0)) AS f, MAX(COALESCE(total_nf_novo,0)) AS g ' +
        'FROM vendas WHERE ' +
        sqlWhereVendas +
        ' GROUP BY numero_nfe) AS t'
      // DynamicModel próprio: o runAgg só tem campos a–f e a coluna "g"
      // (totalNfNovo) não scanneia nele.
      const nfRows = arrayOf(new DynamicModel({ f: '', g: '' }))
      try {
        $app.db().newQuery(nfSql).all(nfRows)
      } catch (nfQueryErr) {
        console.error('dashboard_stats: kpis por NF falhou:', nfQueryErr)
      }
      if (nfRows.length > 0) {
        kpis.totalNfSemFrete = toNum(nfRows[0].f)
        kpis.totalNfNovo = toNum(nfRows[0].g)
      }
    } catch (nfErr) {
      console.warn('dashboard_stats: kpis por NF warning:', nfErr)
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
    // (ultimoYmGeral já foi calculado antes das cláusulas de filtro)
    const ymParts = ultimoYmGeral.split('-')
    const maxY = parseInt(ymParts[0], 10) || 2026
    const maxM = parseInt(ymParts[1], 10) || 8
    for (let i = 5; i >= 0; i--) {
      const totalMeses = maxY * 12 + (maxM - 1) - i
      const y = Math.floor(totalMeses / 12)
      const m = (totalMeses % 12) + 1
      ultimos6MesesAlvo.push(String(y) + '-' + String(m).padStart(2, '0'))
    }

    // OTIMIZAÇÃO: varredura única cobrindo os 3 anos (atual, ano anterior e ano retrasado).
    // Como os 18 períodos (6 atuais + 6 ano-1 + 6 ano-2) são disjuntos,
    // uma única varredura com IN cobre as três séries trienais (ex: 2024, 2025, 2026).
    const mesesAnoAnterior6 = ultimos6MesesAlvo.map((m) => {
      const p = m.split('-')
      const y = parseInt(p[0], 10) - 1
      return String(y) + '-' + p[1]
    })
    const mesesAnoRetrasado6 = ultimos6MesesAlvo.map((m) => {
      const p = m.split('-')
      const y = parseInt(p[0], 10) - 2
      return String(y) + '-' + p[1]
    })
    const todosMesesJanela = ultimos6MesesAlvo.concat(mesesAnoAnterior6).concat(mesesAnoRetrasado6)
    const janelaInClause = todosMesesJanela.map((m) => "'" + m + "'").join(',')

    // Ciclo C: vendasPorMes respeita EXCLUSIVAMENTE os 5 filtros globais (sqlWhereGlobalRestricted),
    // ignorando vendedor/cliente, canal, base, período selecionado etc.
    const mesSql =
      "SELECT COALESCE(ano_mes,'Sem informação') AS a, COALESCE(SUM(total_linha),0) AS b, COALESCE(SUM(valor_liquido),0) AS c, " +
      'COALESCE(SUM(total_devolucao),0) AS d ' +
      'FROM resumo_vendas_mensal WHERE ' +
      sqlWhereGlobalRestricted +
      ' AND ano_mes IN (' +
      janelaInClause +
      ') ' +
      "GROUP BY COALESCE(ano_mes,'Sem informação') ORDER BY 1 ASC"
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

    const mesMapAtual = {}
    const prevYearMap = {}
    const prevYear2Map = {}
    for (let i = 0; i < mesRows.length; i++) {
      const ym = mesRows[i].a
      if (ym) {
        const entry = {
          faturamento: toNum(mesRows[i].b),
          liquido: toNum(mesRows[i].c),
          devolucoes: toNum(mesRows[i].d),
        }
        if (ultimos6MesesAlvo.indexOf(ym) >= 0) {
          mesMapAtual[ym] = entry
        } else if (mesesAnoAnterior6.indexOf(ym) >= 0) {
          prevYearMap[ym] = toNum(mesRows[i].b)
        } else {
          prevYear2Map[ym] = toNum(mesRows[i].b)
        }
      }
    }

    const vendasPorMes = []
    for (let i = 0; i < ultimos6MesesAlvo.length; i++) {
      const ym = ultimos6MesesAlvo[i]
      const p = ym.split('-')
      const y = p[0]
      const mo = parseInt(p[1], 10)
      const prevKey = String(parseInt(y, 10) - 1) + '-' + String(mo).padStart(2, '0')
      const prev2Key = String(parseInt(y, 10) - 2) + '-' + String(mo).padStart(2, '0')
      const atual = mesMapAtual[ym] || { faturamento: 0, liquido: 0, devolucoes: 0 }

      vendasPorMes.push({
        mes: monthNames[mo - 1] + '/' + y.slice(2),
        faturamento: atual.faturamento,
        liquido: atual.liquido,
        devolucoes: atual.devolucoes,
        faturamento_ano_anterior: prevYearMap[prevKey] || 0,
        faturamento_ano_retrasado: prevYear2Map[prev2Key] || 0,
      })
    }

    // 2.2) vendasPorAno — Mostra SEMPRE todos os anos da base respeitando SOMENTE os 5 filtros globais (Ciclo C)
    const anoSql =
      'SELECT CAST(ano AS TEXT) AS a, COALESCE(SUM(total_linha),0) AS b, ' +
      'COALESCE(SUM(total_devolucao),0) AS c ' +
      'FROM resumo_vendas_mensal WHERE ' +
      sqlWhereGlobalRestricted +
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

    // 2.3–2.6) grupoItem, topVendedores, topClientes e estado
    // OTIMIZAÇÃO: as 4 agregações usavam 4 varreduras completas do resumo com o MESMO
    // sqlWhere. Agora uma única varredura (UNION ALL com rótulo de dimensão) produz as
    // quatro listas; a ordenação por valor DESC e o LIMIT 10 (top 10) são aplicados em JS,
    // preservando exatamente os mesmos valores/números de antes.
    const multiDimRows = arrayOf(new DynamicModel({ dim: '', k: '', v: '' }))
    try {
      const dimBase = 'FROM resumo_vendas_mensal WHERE ' + sqlWhere + ' GROUP BY 2'
      // tipo_documento/utilizacao: linhas NFCOMDEV têm total_linha = 0 (valor em
      // valor_liquido/total_nf_novo) e DEVNF é negativa (estorno). Para os gráficos
      // mostrarem TODOS os tipos/utilizações selecionados nos filtros, usa o maior
      // entre SUM(total_linha) e SUM(valor_liquido) por chave.
      const multiDimSql =
        "SELECT 'grupo' AS dim, COALESCE(NULLIF(grupo_item,''),'Sem informação') AS k, COALESCE(SUM(total_linha),0) AS v " +
        dimBase +
        ' UNION ALL ' +
        "SELECT 'vendedor' AS dim, COALESCE(NULLIF(nome_vendedor,''),'Sem informação') AS k, COALESCE(SUM(total_linha),0) AS v " +
        dimBase +
        ' UNION ALL ' +
        "SELECT 'cliente' AS dim, COALESCE(NULLIF(nome_cliente,''),'Sem informação') AS k, COALESCE(SUM(total_linha),0) AS v " +
        dimBase +
        ' UNION ALL ' +
        "SELECT 'estado' AS dim, COALESCE(NULLIF(estado,''),'Sem informação') AS k, COALESCE(SUM(total_linha),0) AS v " +
        dimBase +
        ' UNION ALL ' +
        "SELECT 'tipo_documento' AS dim, COALESCE(NULLIF(tipo_documento,''),'Sem classificação') AS k, MAX(COALESCE(SUM(total_linha),0), COALESCE(SUM(valor_liquido),0)) AS v " +
        dimBase +
        ' UNION ALL ' +
        "SELECT 'utilizacao' AS dim, COALESCE(NULLIF(utilizacao,''),'Sem classificação') AS k, MAX(COALESCE(SUM(total_linha),0), COALESCE(SUM(valor_liquido),0)) AS v " +
        dimBase +
        ' ORDER BY v DESC'
      $app.db().newQuery(multiDimSql).all(multiDimRows)
    } catch (err) {
      console.error('dashboard_stats: agregacao multi-dimensao falhou:', err)
    }

    const dimLists = {
      grupo: [],
      vendedor: [],
      cliente: [],
      estado: [],
      tipo_documento: [],
      utilizacao: [],
    }
    for (let i = 0; i < multiDimRows.length; i++) {
      const dim = String(multiDimRows[i].dim || '')
      const key = multiDimRows[i].k || 'Sem classificação'
      const val = toNum(multiDimRows[i].v)
      if (dimLists[dim]) dimLists[dim].push({ k: key, v: val })
    }

    const grupoItem = dimLists.grupo.map((r) => ({ name: r.k, value: r.v }))
    const topVendedores = dimLists.vendedor.slice(0, 10).map((r) => ({ name: r.k, total: r.v }))
    const topClientes = dimLists.cliente.slice(0, 10).map((r) => ({ name: r.k, total: r.v }))
    const estado = dimLists.estado.map((r) => ({ uf: r.k, total: r.v }))
    const tipoDocumento = (dimLists.tipo_documento || []).map((r) => ({ name: r.k, value: r.v }))
    const utilizacao = (dimLists.utilizacao || []).map((r) => ({ name: r.k, value: r.v }))

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
    // Harmonizado com os filtros globais e de canais aplicados (sqlWhere), para evitar divergência
    // de valores com o quadro "Vendas por Grupo do Item" (grupoItem) no mesmo período.
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
        sqlWhere +
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
      // Sem recorte de período na base bruta (sem faixa de data), limitamos o
      // ORDER BY a uma janela indexada dos últimos 2 meses da base — sem isso o
      // SQLite faria sort de toda a tabela antes do LIMIT 8 (timeout em 310k).
      let recentOrderClause = ''
      const hasFaixaData = sqlVendasParts.some((p) => p.indexOf('data_lancamento >=') === 0)
      if (!hasFaixaData) {
        const pU = ultimoYmGeral.split('-')
        const yU = parseInt(pU[0], 10)
        const mU = parseInt(pU[1], 10)
        let backM = mU - 2
        let backY = yU
        if (backM < 1) {
          backM += 12
          backY -= 1
        }
        recentOrderClause =
          "data_lancamento >= '" +
          backY +
          '-' +
          String(backM).padStart(2, '0') +
          "-01 00:00:00.000Z'"
      }
      const recentSql =
        'SELECT ' +
        "COALESCE(id,'') AS id, " +
        "COALESCE(data_lancamento,'') AS data_lancamento, " +
        "COALESCE(nome_cliente,'Sem informação') AS nome_cliente, " +
        "COALESCE(vendedor_cliente,'Sem informação') AS vendedor_cliente, " +
        "COALESCE(codigo_item,'Sem informação') AS codigo_item, " +
        "COALESCE(descricao_item,'Sem informação') AS descricao_item, " +
        "COALESCE(grupo_item,'Sem informação') AS grupo_item, " +
        "COALESCE(quantidade,'') AS quantidade, " +
        "COALESCE(total_linha,'') AS total_linha " +
        'FROM vendas WHERE ' +
        sqlWhereVendas +
        (recentOrderClause ? ' AND ' + recentOrderClause : '') +
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
        // Para tipo_cliente, busca prioritariamente da coleção de referência tipos_cliente
        if (col === 'tipo_cliente') {
          try {
            const tcRows = arrayOf(new DynamicModel({ a: '' }))
            $app
              .db()
              .newQuery(
                "SELECT DISTINCT tipo_cliente AS a FROM tipos_cliente WHERE tipo_cliente IS NOT NULL AND TRIM(tipo_cliente) != '' ORDER BY tipo_cliente ASC",
              )
              .all(tcRows)
            if (tcRows.length > 0) {
              const tcOut = []
              for (let t = 0; t < tcRows.length; t++) {
                if (tcRows[t].a) tcOut.push(tcRows[t].a)
              }
              if (tcOut.length > 0) return tcOut
            }
          } catch (_) {}
        }

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
        if (isVendedorCliente && (v.startsWith(' > ') || v.startsWith('> '))) continue
        set.add(v)
      }
      return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'))
    }

    // ============================================================
    // Cache de 30 min das opções dinâmicas (filterOptions)
    // ============================================================
    // As opções de filtro NÃO dependem do período filtrado (vêm do resumo
    // pré-calculado, sem recorte de data), então são cacheadas por TIPO de
    // opção em globalThis.__skipFilterOptionsCache com TTL de 30 minutos.
    // Os hooks de carga (import_racnew.js, import_netsales.js,
    // consolidar_vendas.js) limpam este cache ao concluir, garantindo frescor.
    const FILTER_OPTIONS_TTL_MS = 1800000
    const getFilterOptionsCache = () => {
      if (typeof globalThis === 'undefined' || !globalThis) return null
      if (
        !globalThis.__skipFilterOptionsCache ||
        typeof globalThis.__skipFilterOptionsCache.get !== 'function'
      ) {
        globalThis.__skipFilterOptionsCache = new Map()
      }
      return globalThis.__skipFilterOptionsCache
    }
    const cachedOptions = (type, compute) => {
      try {
        const cache = getFilterOptionsCache()
        if (cache) {
          const hit = cache.get(type)
          if (hit && hit.expiresAt > Date.now() && hit.data !== null && hit.data !== undefined) {
            return hit.data
          }
        }
      } catch (_) {}
      const data = compute()
      try {
        const cache = getFilterOptionsCache()
        const isEmpty =
          data === null ||
          data === undefined ||
          (Array.isArray(data) && data.length === 0) ||
          (data &&
            typeof data === 'object' &&
            !Array.isArray(data) &&
            Object.keys(data).length === 0)
        // Resultado vazio NÃO é cacheado: uma carga em andamento não congela
        // listas vazias por 30 minutos.
        if (cache && !isEmpty) {
          cache.set(type, { data: data, expiresAt: Date.now() + FILTER_OPTIONS_TTL_MS })
        }
      } catch (_) {}
      return data
    }

    // Anos disponíveis e último período (ano/mês) — com cache de 30 min
    const basePeriodo = cachedOptions('anosPeriodo', () => {
      let anosList = []
      let maxLancamento = ''
      let ultimoAnoBase = 2026
      let ultimoMesBase = 8
      try {
        const minMaxRows = arrayOf(new DynamicModel({ min_ym: '', max_ym: '' }))
        $app
          .db()
          .newQuery(
            "SELECT COALESCE(MIN(ano_mes), '') AS min_ym, COALESCE(MAX(ano_mes), '') AS max_ym FROM resumo_vendas_mensal WHERE ano_mes >= '2015-01'",
          )
          .all(minMaxRows)

        if (minMaxRows.length > 0 && minMaxRows[0].min_ym && minMaxRows[0].max_ym) {
          const minYm = String(minMaxRows[0].min_ym || '').trim()
          const maxYm = String(minMaxRows[0].max_ym || '').trim()
          if (minYm.length >= 4 && maxYm.length >= 4) {
            const minYear = parseInt(minYm.slice(0, 4), 10)
            const maxYear = parseInt(maxYm.slice(0, 4), 10)
            maxLancamento = maxYm + '-28 00:00:00.000Z'
            if (!isNaN(minYear) && !isNaN(maxYear) && maxYear >= minYear) {
              for (let y = minYear; y <= maxYear; y++) {
                anosList.push(y)
              }
              ultimoAnoBase = maxYear
              const m = parseInt(maxYm.slice(5, 7), 10)
              if (!isNaN(m)) ultimoMesBase = m
            }
          }
        }
      } catch (err) {
        console.warn('dashboard_stats: anos min/max resumo (base vazia ou sem resumo):', err)
      }
      if (anosList.length === 0) {
        anosList = [2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026]
      }
      return {
        anos: anosList,
        maxDataLancamento: maxLancamento,
        ultimoAno: ultimoAnoBase,
        ultimoMes: ultimoMesBase,
      }
    })
    const anosList = basePeriodo.anos
    const maxLancamento = basePeriodo.maxDataLancamento
    const ultimoAnoBase = basePeriodo.ultimoAno
    const ultimoMesBase = basePeriodo.ultimoMes

    // Opções de canais, clientes dos canais e inside (apenas registros onde eh_canal = 1 / true)
    // Cache de 30 min (chaves: canais, canaisClientes, inside)
    const canaisOptions = cachedOptions('canais', () => {
      const out = []
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
            out.push({
              nome: nc,
              deploy: (canalRows[i].deploy || '').trim().toUpperCase(),
            })
          }
        }
      } catch (canalOptErr) {
        console.warn('dashboard_stats: consulta de canais warning:', canalOptErr)
      }
      return out
    })

    // Consulta de todos os clientes vinculados a canais para o filtro dependente (cache 30 min)
    const canaisClientesOptions = cachedOptions('canaisClientes', () => {
      const out = []
      try {
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
            out.push({
              nome_canal: (cliCanalRows[i].nome_canal || '').trim(),
              nome_cliente: ncli,
              codigo_cliente: (cliCanalRows[i].codigo_cliente || '').trim(),
              deploy: (cliCanalRows[i].deploy || '').trim().toUpperCase(),
            })
          }
        }
      } catch (cliOptErr) {
        console.warn('dashboard_stats: consulta de clientes de canais warning:', cliOptErr)
      }
      return out
    })

    // Opções deduplicadas e normalizadas de Inside (apenas registros eh_canal = 1) — cache 30 min
    // Fallback: combina valores preenchidos tanto em inside quanto em responsavel
    const insideOptions = cachedOptions('inside', () => {
      const out = []
      try {
        const insideRows = arrayOf(
          new DynamicModel({
            inside_val: '',
            resp_val: '',
          }),
        )
        $app
          .db()
          .newQuery(
            "SELECT DISTINCT UPPER(TRIM(COALESCE(inside, ''))) AS inside_val, UPPER(TRIM(COALESCE(responsavel, ''))) AS resp_val FROM canais_clientes WHERE (eh_canal = 1 OR eh_canal = 'true' OR eh_canal = 'SIM' OR eh_canal = 'Sim' OR eh_canal = 's') AND ((inside IS NOT NULL AND TRIM(inside) != '' AND TRIM(inside) != '-') OR (responsavel IS NOT NULL AND TRIM(responsavel) != '' AND TRIM(responsavel) != '-' AND LOWER(TRIM(responsavel)) != 'null'))",
          )
          .all(insideRows)

        const insideSet = new Set()
        for (let i = 0; i < insideRows.length; i++) {
          const ins = (insideRows[i].inside_val || '').trim()
          const resp = (insideRows[i].resp_val || '').trim()
          if (ins && ins !== '-' && !insideSet.has(ins)) {
            insideSet.add(ins)
            out.push(ins)
          }
          if (resp && resp !== '-' && resp !== 'NULL' && !insideSet.has(resp)) {
            insideSet.add(resp)
            out.push(resp)
          }
        }
        out.sort((a, b) => a.localeCompare(b))
      } catch (insideOptErr) {
        console.warn('dashboard_stats: consulta de inside warning:', insideOptErr)
      }
      return out
    })

    const filterOptions = {
      vendedorCliente: cachedOptions('optVendedorCliente', () =>
        cleanFilterOptions(distinctSummaryCol('vendedor_cliente', 3000), true),
      ),
      vendedor: cachedOptions('optVendedor', () =>
        cleanFilterOptions(distinctSummaryCol('nome_vendedor', 500)),
      ),
      grupoItem: cachedOptions('optGrupoItem', () =>
        cleanFilterOptions(distinctSummaryCol('grupo_item', 100)),
      ),
      estado: cachedOptions('optEstado', () =>
        cleanFilterOptions(distinctSummaryCol('estado', 50)),
      ),
      utilizacao: cachedOptions('optUtilizacao', () =>
        cleanFilterOptions(distinctSummaryCol('utilizacao', 200)),
      ),
      tipoDocumento: cachedOptions('optTipoDocumento', () =>
        cleanFilterOptions(distinctSummaryCol('tipo_documento', 50)),
      ),
      canais: canaisOptions,
      canaisClientes: canaisClientesOptions,
      inside: insideOptions,
      tipoCliente: cachedOptions('optTipoCliente', () =>
        cleanFilterOptions(distinctSummaryCol('tipo_cliente', 50)),
      ),
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
    // REGRA DE NEGÓCIO (Ciclo C): Traz SEMPRE toda a base histórica (2015 em diante),
    // agrupada por mês (yyyy-mm), respeitando SOMENTE os 5 filtros globais (sqlWhereGlobalRestricted),
    // e ignorando todos os demais filtros (período, canal, vendedor, base, etc).
    const vendasEquipamentosHistorico = []
    try {
      const equipSql =
        'SELECT ano_mes AS a, COALESCE(SUM(total_linha),0) AS b ' +
        'FROM resumo_vendas_mensal WHERE ' +
        sqlWhereGlobalRestricted +
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
    // REGRA DE NEGÓCIO (Ciclo C): Traz SEMPRE toda a base histórica (2015 em diante),
    // agrupada por mês (yyyy-mm), dos grupos TINTAS, PEÇAS e ACESSÓRIOS.
    // Respeita SOMENTE os 5 filtros globais (sqlWhereGlobalRestricted).
    const vendasInsumosHistorico = []
    try {
      const insumoSql =
        'SELECT ano_mes AS a, COALESCE(SUM(total_linha),0) AS b ' +
        'FROM resumo_vendas_mensal WHERE ' +
        sqlWhereGlobalRestricted +
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

    // 5.3) clientesAtivosEquipamentos, clientesAtivosInsumos e segregados (Tintas, Acessórios, Peças)
    // REGRA DE NEGÓCIO (Ciclo C): Mostra SEMPRE os últimos 6 meses da base (terminando no último mês disponível, ex: Ago-2026),
    // comparados com o mesmo mês do ano anterior e retrasado, independente de período/canal/vendedor/base.
    // Respeita EXCLUSIVAMENTE os 5 filtros globais:
    // - Se não houver filtros globais específicos (sqlGlobalRestrictedParts vazio), lê da tabela de resumo_clientes_ativos ultra-rápida.
    // - Se houver filtros globais ativos (tipo_documento, utilizacao, tipo_cliente, grupo_item, tipo_devolucao):
    //   consulta `resumo_vendas_mensal` (ou `vendas` se tipo_cliente estiver ativo) aplicando sqlWhereGlobalRestricted.
    const clientesAtivosEquipamentos = []
    const clientesAtivosInsumos = []
    const clientesAtivosTintas = []
    const clientesAtivosAcessorios = []
    const clientesAtivosPecas = []

    try {
      const mesesAlvoClientes = ultimos6MesesAlvo
      const mesesAnoAnterior = mesesAlvoClientes.map((m) => {
        const p = m.split('-')
        const y = parseInt(p[0], 10) - 1
        return String(y) + '-' + p[1]
      })
      const mesesAnoRetrasado = mesesAlvoClientes.map((m) => {
        const p = m.split('-')
        const y = parseInt(p[0], 10) - 2
        return String(y) + '-' + p[1]
      })

      const allMesesNeeded = mesesAlvoClientes.concat(mesesAnoAnterior).concat(mesesAnoRetrasado)
      const inMesesList = allMesesNeeded.map((m) => "'" + m + "'").join(',')

      // Helper para montar série comparativa dos últimos 6 meses vs ano anterior vs ano retrasado (3 anos) a partir de mapa de contagens
      const buildSeriesFromMap = (mapData) => {
        const series = []
        for (let i = 0; i < mesesAlvoClientes.length; i++) {
          const m = mesesAlvoClientes[i]
          const p = m.split('-')
          const prevM = String(parseInt(p[0], 10) - 1) + '-' + p[1]
          const prev2M = String(parseInt(p[0], 10) - 2) + '-' + p[1]
          series.push({
            mes: m,
            clientes: mapData[m] || 0,
            clientesAnoAnterior: mapData[prevM] || 0,
            clientesAnoRetrasado: mapData[prev2M] || 0,
          })
        }
        return series
      }

      // Verificação: se houver filtros globais ativos além de grupoItem, usamos resumo_vendas_mensal (ou vendas se tipo_cliente)
      // para Equipamentos e Insumos, garantindo que tipo_documento, utilizacao e tipo_cliente reflitam em clientes ativos.
      const hasGlobalFiltersActive = sqlGlobalRestrictedParts.length > 0

      const cliEquipMap = {}
      const cliInsumosMap = {}

      if (!hasGlobalFiltersActive) {
        // Caminho rápido pré-calculado: resumo_clientes_ativos
        const cliCatSql =
          'SELECT ano_mes AS a, grupo_categoria AS b, COUNT(*) AS c ' +
          'FROM resumo_clientes_ativos WHERE ' +
          "grupo_categoria IN ('EQUIPAMENTOS', 'INSUMOS') " +
          'AND ano_mes IN (' +
          inMesesList +
          ') GROUP BY ano_mes, grupo_categoria'
        const cliCatRows = runAgg(cliCatSql)
        for (let i = 0; i < cliCatRows.length; i++) {
          const ym = cliCatRows[i].a
          const cnt = parseInt(cliCatRows[i].c, 10) || 0
          if (String(cliCatRows[i].b) === 'EQUIPAMENTOS') cliEquipMap[ym] = cnt
          else if (String(cliCatRows[i].b) === 'INSUMOS') cliInsumosMap[ym] = cnt
        }
      } else if (!hasTipoCliente) {
        // Filtros globais presentes (tipo_documento, utilizacao, grupo_item, tipo_devolucao), sem tipo_cliente:
        // resumo_vendas_mensal possui todas essas colunas!
        const cliEquipSql =
          'SELECT ano_mes AS a, COUNT(DISTINCT codigo_cliente) AS b ' +
          'FROM resumo_vendas_mensal WHERE ' +
          sqlWhereGlobalRestricted +
          " AND UPPER(TRIM(grupo_item)) = 'EQUIPAMENTOS' " +
          "AND codigo_cliente IS NOT NULL AND codigo_cliente != '' " +
          'AND ano_mes IN (' +
          inMesesList +
          ') GROUP BY ano_mes'
        const cliEquipRows = runAgg(cliEquipSql)
        for (let i = 0; i < cliEquipRows.length; i++) {
          cliEquipMap[cliEquipRows[i].a] = parseInt(cliEquipRows[i].b, 10) || 0
        }

        const cliInsSql =
          'SELECT ano_mes AS a, COUNT(DISTINCT codigo_cliente) AS b ' +
          'FROM resumo_vendas_mensal WHERE ' +
          sqlWhereGlobalRestricted +
          " AND UPPER(TRIM(grupo_item)) IN ('PEÇAS', 'PECAS', 'TINTAS', 'ACESSÓRIOS', 'ACESSORIOS') " +
          "AND codigo_cliente IS NOT NULL AND codigo_cliente != '' " +
          'AND ano_mes IN (' +
          inMesesList +
          ') GROUP BY ano_mes'
        const cliInsRows = runAgg(cliInsSql)
        for (let i = 0; i < cliInsRows.length; i++) {
          cliInsumosMap[cliInsRows[i].a] = parseInt(cliInsRows[i].b, 10) || 0
        }
      } else {
        // tipo_cliente ativo: consulta a tabela vendas bruta com os 5 filtros globais
        // delimitando data_lancamento para a janela necessária (inMesesList)
        const minMesYm = allMesesNeeded.sort()[0]
        const cliEquipSql =
          'SELECT substr(data_lancamento, 1, 7) AS a, COUNT(DISTINCT codigo_cliente) AS b ' +
          'FROM vendas WHERE ' +
          sqlWhereGlobalRestrictedVendas +
          " AND UPPER(TRIM(grupo_item)) = 'EQUIPAMENTOS' " +
          "AND codigo_cliente IS NOT NULL AND codigo_cliente != '' " +
          "AND data_lancamento >= '" +
          minMesYm +
          "-01 00:00:00.000Z' " +
          "(UPPER(TRIM(COALESCE(codigo_item, ''))) != 'SERVICOS') " +
          'GROUP BY substr(data_lancamento, 1, 7)'
        const cliEquipRows = runAgg(cliEquipSql)
        for (let i = 0; i < cliEquipRows.length; i++) {
          cliEquipMap[cliEquipRows[i].a] = parseInt(cliEquipRows[i].b, 10) || 0
        }

        const cliInsSql =
          'SELECT substr(data_lancamento, 1, 7) AS a, COUNT(DISTINCT codigo_cliente) AS b ' +
          'FROM vendas WHERE ' +
          sqlWhereGlobalRestrictedVendas +
          " AND UPPER(TRIM(grupo_item)) IN ('PEÇAS', 'PECAS', 'TINTAS', 'ACESSÓRIOS', 'ACESSORIOS') " +
          "AND codigo_cliente IS NOT NULL AND codigo_cliente != '' " +
          "AND data_lancamento >= '" +
          minMesYm +
          "-01 00:00:00.000Z' " +
          "(UPPER(TRIM(COALESCE(codigo_item, ''))) != 'SERVICOS') " +
          'GROUP BY substr(data_lancamento, 1, 7)'
        const cliInsRows = runAgg(cliInsSql)
        for (let i = 0; i < cliInsRows.length; i++) {
          cliInsumosMap[cliInsRows[i].a] = parseInt(cliInsRows[i].b, 10) || 0
        }
      }

      const sEquip = buildSeriesFromMap(cliEquipMap)
      for (let i = 0; i < sEquip.length; i++) clientesAtivosEquipamentos.push(sEquip[i])

      const sIns = buildSeriesFromMap(cliInsumosMap)
      for (let i = 0; i < sIns.length; i++) clientesAtivosInsumos.push(sIns[i])

      // Queries para as séries segregadas de Tintas, Acessórios e Peças
      // Se tipoCliente estiver ativo, consulta vendas; se não, consulta resumo_vendas_mensal
      if (!hasTipoCliente) {
        // Query resumo_vendas_mensal para TINTAS
        const cliTintasSql =
          'SELECT ano_mes AS a, COUNT(*) AS b ' +
          'FROM (SELECT DISTINCT ano_mes, codigo_cliente FROM resumo_vendas_mensal WHERE ' +
          sqlWhereGlobalRestricted +
          " AND UPPER(TRIM(grupo_item)) = 'TINTAS' " +
          "AND codigo_cliente IS NOT NULL AND codigo_cliente != '' " +
          'AND ano_mes IN (' +
          inMesesList +
          ')) GROUP BY ano_mes'
        const cliTintasRows = runAgg(cliTintasSql)
        const cliTintasMap = {}
        for (let i = 0; i < cliTintasRows.length; i++) {
          cliTintasMap[cliTintasRows[i].a] = parseInt(cliTintasRows[i].b, 10) || 0
        }
        const sTintas = buildSeriesFromMap(cliTintasMap)
        for (let i = 0; i < sTintas.length; i++) clientesAtivosTintas.push(sTintas[i])

        // Query resumo_vendas_mensal para ACESSORIOS
        const cliAcesSql =
          'SELECT ano_mes AS a, COUNT(*) AS b ' +
          'FROM (SELECT DISTINCT ano_mes, codigo_cliente FROM resumo_vendas_mensal WHERE ' +
          sqlWhereGlobalRestricted +
          " AND UPPER(TRIM(grupo_item)) IN ('ACESSÓRIOS', 'ACESSORIOS') " +
          "AND codigo_cliente IS NOT NULL AND codigo_cliente != '' " +
          'AND ano_mes IN (' +
          inMesesList +
          ')) GROUP BY ano_mes'
        const cliAcesRows = runAgg(cliAcesSql)
        const cliAcesMap = {}
        for (let i = 0; i < cliAcesRows.length; i++) {
          cliAcesMap[cliAcesRows[i].a] = parseInt(cliAcesRows[i].b, 10) || 0
        }
        const sAces = buildSeriesFromMap(cliAcesMap)
        for (let i = 0; i < sAces.length; i++) clientesAtivosAcessorios.push(sAces[i])

        // Query resumo_vendas_mensal para PECAS
        const cliPecasSql =
          'SELECT ano_mes AS a, COUNT(*) AS b ' +
          'FROM (SELECT DISTINCT ano_mes, codigo_cliente FROM resumo_vendas_mensal WHERE ' +
          sqlWhereGlobalRestricted +
          " AND UPPER(TRIM(grupo_item)) IN ('PEÇAS', 'PECAS') " +
          "AND codigo_cliente IS NOT NULL AND codigo_cliente != '' " +
          'AND ano_mes IN (' +
          inMesesList +
          ')) GROUP BY ano_mes'
        const cliPecasRows = runAgg(cliPecasSql)
        const cliPecasMap = {}
        for (let i = 0; i < cliPecasRows.length; i++) {
          cliPecasMap[cliPecasRows[i].a] = parseInt(cliPecasRows[i].b, 10) || 0
        }
        const sPecas = buildSeriesFromMap(cliPecasMap)
        for (let i = 0; i < sPecas.length; i++) clientesAtivosPecas.push(sPecas[i])
      } else {
        const minMesYm = allMesesNeeded.sort()[0]
        const runSegregadoVendas = (filtroGrupo) => {
          const sql =
            'SELECT substr(data_lancamento, 1, 7) AS a, COUNT(DISTINCT codigo_cliente) AS b ' +
            'FROM vendas WHERE ' +
            sqlWhereGlobalRestrictedVendas +
            ' AND ' +
            filtroGrupo +
            " AND codigo_cliente IS NOT NULL AND codigo_cliente != '' " +
            "AND data_lancamento >= '" +
            minMesYm +
            "-01 00:00:00.000Z' " +
            "AND (UPPER(TRIM(COALESCE(codigo_item, ''))) != 'SERVICOS') " +
            'GROUP BY substr(data_lancamento, 1, 7)'
          const rows = runAgg(sql)
          const map = {}
          for (let i = 0; i < rows.length; i++) {
            map[rows[i].a] = parseInt(rows[i].b, 10) || 0
          }
          return buildSeriesFromMap(map)
        }

        const sTintas = runSegregadoVendas("UPPER(TRIM(grupo_item)) = 'TINTAS'")
        for (let i = 0; i < sTintas.length; i++) clientesAtivosTintas.push(sTintas[i])

        const sAces = runSegregadoVendas("UPPER(TRIM(grupo_item)) IN ('ACESSÓRIOS', 'ACESSORIOS')")
        for (let i = 0; i < sAces.length; i++) clientesAtivosAcessorios.push(sAces[i])

        const sPecas = runSegregadoVendas("UPPER(TRIM(grupo_item)) IN ('PEÇAS', 'PECAS')")
        for (let i = 0; i < sPecas.length; i++) clientesAtivosPecas.push(sPecas[i])
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
        clientesAtivosTintas: clientesAtivosTintas,
        clientesAtivosAcessorios: clientesAtivosAcessorios,
        clientesAtivosPecas: clientesAtivosPecas,
        topVendedores: topVendedores,
        topClientes: topClientes,
        estado: estado,
        revendasFaturamento: revendasFaturamento,
        vendasPorCanal: vendasPorCanal,
        vendasPorDeploy: vendasPorDeploy,
        tipoDocumento: tipoDocumento,
        utilizacao: utilizacao,
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
        // Poda primeiro as entradas já expiradas (invalidação simples: TTL de
        // 5 min por chave de filtros); se ainda assim passar do limite, remove
        // a entrada mais antiga inserida.
        if (globalThis.__skipDashboardCache.size > 20) {
          const pruneNow = Date.now()
          const expiredKeys = []
          globalThis.__skipDashboardCache.forEach((entry, key) => {
            if (!entry || !(entry.expiresAt > pruneNow)) expiredKeys.push(key)
          })
          for (let pIdx = 0; pIdx < expiredKeys.length; pIdx++) {
            globalThis.__skipDashboardCache.delete(expiredKeys[pIdx])
          }
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
}

routerAdd('POST', '/backend/v1/dashboard/stats', __dashboardStatsHandler)
routerAdd('GET', '/backend/v1/dashboard/stats', __dashboardStatsHandler)
