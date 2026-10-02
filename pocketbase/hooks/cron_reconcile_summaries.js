// Hook: cron_reconcile_summaries.js
// Executa periodicamente a cada 2 horas para garantir que as tabelas de resumo
// SQLite (resumo_vendas_mensal, resumo_clientes_ativos, resumo_vendas_uf_regiao)
// existam e estejam atualizadas a partir da coleção `vendas`.

// Endpoint de manutenção: reconciliação sob demanda
routerAdd('POST', '/backend/v1/trigger/reconciliar-resumos', (e) => {
  const startTime = Date.now()
  const nowIso = new Date().toISOString()

  $app.db().newQuery('DELETE FROM resumo_vendas_mensal').execute()
  $app
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

  $app.db().newQuery('DELETE FROM resumo_clientes_ativos').execute()
  $app
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

  $app.db().newQuery('DELETE FROM resumo_vendas_uf_regiao').execute()
  $app
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
    GROUP BY
      CAST(substr(data_lancamento, 1, 4) AS INTEGER),
      CAST(substr(data_lancamento, 6, 2) AS INTEGER),
      substr(data_lancamento, 1, 7),
      COALESCE(NULLIF(estado, ''), 'Sem informação'),
      (CASE WHEN tem_netsales = 1 THEN 1 ELSE 0 END)
  `)
    .bind({ now: nowIso })
    .execute()

  return e.json(200, {
    success: true,
    data_carga: nowIso,
    durationMs: Date.now() - startTime,
  })
})

cronAdd('reconcile_sales_summaries', '0 */2 * * *', () => {
  try {
    const startTime = Date.now()

    // 1. Garante que as tabelas SQLite existem (se não existirem, cria com índices)
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
      .newQuery(
        'CREATE INDEX IF NOT EXISTS idx_rvm_vendedor ON resumo_vendas_mensal (nome_vendedor);',
      )
      .execute()
    $app
      .db()
      .newQuery(
        'CREATE INDEX IF NOT EXISTS idx_rvm_vend_cli ON resumo_vendas_mensal (vendedor_cliente);',
      )
      .execute()
    $app
      .db()
      .newQuery(
        'CREATE INDEX IF NOT EXISTS idx_rvm_tipo_doc ON resumo_vendas_mensal (tipo_documento);',
      )
      .execute()
    $app
      .db()
      .newQuery('CREATE INDEX IF NOT EXISTS idx_rvm_util ON resumo_vendas_mensal (utilizacao);')
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
      .newQuery(
        'CREATE INDEX IF NOT EXISTS idx_rca_cliente ON resumo_clientes_ativos (codigo_cliente);',
      )
      .execute()
    $app
      .db()
      .newQuery(
        'CREATE INDEX IF NOT EXISTS idx_rca_netsales ON resumo_clientes_ativos (tem_netsales);',
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
    $app
      .db()
      .newQuery('CREATE INDEX IF NOT EXISTS idx_rvu_uf ON resumo_vendas_uf_regiao (uf);')
      .execute()
    $app
      .db()
      .newQuery('CREATE INDEX IF NOT EXISTS idx_rvu_regiao ON resumo_vendas_uf_regiao (regiao);')
      .execute()
    $app
      .db()
      .newQuery(
        'CREATE INDEX IF NOT EXISTS idx_rvu_netsales ON resumo_vendas_uf_regiao (tem_netsales);',
      )
      .execute()

    // 2. Reconciliação atômica
    const nowIso = new Date().toISOString()

    $app.runInTransaction((txApp) => {
      // 2.1 Reconcilia resumo_vendas_mensal
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

      // 2.2 Reconcilia resumo_clientes_ativos
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

      // 2.3 Reconcilia resumo_vendas_uf_regiao
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

    console.log(
      'cron_reconcile_summaries concluído com sucesso em ' + (Date.now() - startTime) + 'ms',
    )
  } catch (err) {
    console.error('cron_reconcile_summaries falhou:', err)
  }
})
