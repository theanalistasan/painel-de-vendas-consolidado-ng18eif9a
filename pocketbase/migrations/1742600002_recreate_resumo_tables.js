// Migration 1742600002: recria as tabelas de resumo pré-calculado
// (resumo_vendas_mensal, resumo_clientes_ativos, resumo_vendas_uf_regiao),
// que desapareceram da base viva durante o ciclo da base única NetSales_v4
// (consolidação/zeramento). Sem elas, dashboard_stats.js e canais_comparativo.js
// devolvem zeros silenciosos (os try/catch engolem o "no such table") —
// causa do relato "visão canais e visão geral estão com dados vazios".
//
// O backfill usa EXATAMENTE o mesmo SQL do cron cron_reconcile_summaries.js
// (fonte única da regra), garantindo paridade com as reconstruções futuras.

migrate(
  (app) => {
    const nowIso = new Date().toISOString()

    app
      .db()
      .newQuery(`
      CREATE TABLE IF NOT EXISTS resumo_vendas_mensal (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ano_mes TEXT NOT NULL DEFAULT '',
        ano INTEGER NOT NULL DEFAULT 0,
        mes INTEGER NOT NULL DEFAULT 0,
        tem_netsales INTEGER NOT NULL DEFAULT 0,
        grupo_item TEXT NOT NULL DEFAULT '',
        estado TEXT NOT NULL DEFAULT '',
        nome_vendedor TEXT NOT NULL DEFAULT '',
        vendedor_cliente TEXT NOT NULL DEFAULT '',
        codigo_cliente TEXT NOT NULL DEFAULT '',
        nome_cliente TEXT NOT NULL DEFAULT '',
        tipo_documento TEXT NOT NULL DEFAULT '',
        utilizacao TEXT NOT NULL DEFAULT '',
        total_linha REAL NOT NULL DEFAULT 0.0,
        valor_liquido REAL NOT NULL DEFAULT 0.0,
        quantidade REAL NOT NULL DEFAULT 0.0,
        total_devolucao REAL NOT NULL DEFAULT 0.0,
        qtd_documentos INTEGER NOT NULL DEFAULT 0,
        qtd_itens INTEGER NOT NULL DEFAULT 0,
        created TEXT NOT NULL DEFAULT '',
        updated TEXT NOT NULL DEFAULT ''
      )
    `)
      .execute()

    app
      .db()
      .newQuery(`
      CREATE TABLE IF NOT EXISTS resumo_clientes_ativos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ano_mes TEXT NOT NULL DEFAULT '',
        ano INTEGER NOT NULL DEFAULT 0,
        mes INTEGER NOT NULL DEFAULT 0,
        tem_netsales INTEGER NOT NULL DEFAULT 0,
        grupo_categoria TEXT NOT NULL DEFAULT '',
        codigo_cliente TEXT NOT NULL DEFAULT '',
        created TEXT NOT NULL DEFAULT '',
        updated TEXT NOT NULL DEFAULT ''
      )
    `)
      .execute()

    app
      .db()
      .newQuery(`
      CREATE TABLE IF NOT EXISTS resumo_vendas_uf_regiao (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ano INTEGER NOT NULL DEFAULT 0,
        mes INTEGER NOT NULL DEFAULT 0,
        ano_mes TEXT NOT NULL DEFAULT '',
        uf TEXT NOT NULL DEFAULT '',
        regiao TEXT NOT NULL DEFAULT '',
        tem_netsales INTEGER NOT NULL DEFAULT 0,
        total_linha REAL NOT NULL DEFAULT 0.0,
        qtd_documentos INTEGER NOT NULL DEFAULT 0,
        qtd_itens INTEGER NOT NULL DEFAULT 0,
        created TEXT NOT NULL DEFAULT '',
        updated TEXT NOT NULL DEFAULT ''
      )
    `)
      .execute()

    // Índices que dashboard_stats.js / canais_comparativo.js usam nos WHERE
    app.db().newQuery('DROP INDEX IF EXISTS idx_rvm_ano_mes').execute()
    app.db().newQuery('CREATE INDEX idx_rvm_ano_mes ON resumo_vendas_mensal (ano_mes)').execute()
    app.db().newQuery('DROP INDEX IF EXISTS idx_rvm_ano').execute()
    app.db().newQuery('CREATE INDEX idx_rvm_ano ON resumo_vendas_mensal (ano)').execute()
    app.db().newQuery('DROP INDEX IF EXISTS idx_rvm_dim').execute()
    app
      .db()
      .newQuery(
        'CREATE INDEX idx_rvm_dim ON resumo_vendas_mensal (grupo_item, estado, nome_vendedor, vendedor_cliente)',
      )
      .execute()
    app.db().newQuery('DROP INDEX IF EXISTS idx_rvm_base').execute()
    app.db().newQuery('CREATE INDEX idx_rvm_base ON resumo_vendas_mensal (tem_netsales)').execute()
    app.db().newQuery('DROP INDEX IF EXISTS idx_rvm_cliente').execute()
    app
      .db()
      .newQuery(
        'CREATE INDEX idx_rvm_cliente ON resumo_vendas_mensal (ano_mes, codigo_cliente, nome_cliente)',
      )
      .execute()
    app.db().newQuery('DROP INDEX IF EXISTS idx_rca_ano_mes').execute()
    app
      .db()
      .newQuery('CREATE INDEX idx_rca_ano_mes ON resumo_clientes_ativos (ano_mes, grupo_categoria)')
      .execute()
    app.db().newQuery('DROP INDEX IF EXISTS idx_rufr_ano_mes').execute()
    app
      .db()
      .newQuery('CREATE INDEX idx_rufr_ano_mes ON resumo_vendas_uf_regiao (ano_mes, uf, regiao)')
      .execute()

    app.runInTransaction((txApp) => {
      txApp.db().newQuery('DELETE FROM resumo_vendas_mensal').execute()
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
          COALESCE(SUM(total_linha), 0.0) AS total_linha,
          COALESCE(SUM(valor_liquido), 0.0) AS valor_liquido,
          COALESCE(SUM(quantidade), 0.0) AS quantidade,
          COALESCE(SUM(CASE WHEN tipo_documento IN ('Dev. Entrega','Dev. NF','DEVNF') THEN total_linha ELSE 0 END), 0.0) AS total_devolucao,
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

      txApp.db().newQuery('DELETE FROM resumo_clientes_ativos').execute()
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

      txApp.db().newQuery('DELETE FROM resumo_vendas_uf_regiao').execute()
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
          COALESCE(SUM(total_linha), 0.0) AS total_linha,
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

    console.log('1742600002: resumos pré-calculados recriados e populados a partir de vendas')
  },
  (app) => {
    app.db().newQuery('DROP TABLE IF EXISTS resumo_vendas_uf_regiao').execute()
    app.db().newQuery('DROP TABLE IF EXISTS resumo_clientes_ativos').execute()
    app.db().newQuery('DROP TABLE IF EXISTS resumo_vendas_mensal').execute()
  },
)
