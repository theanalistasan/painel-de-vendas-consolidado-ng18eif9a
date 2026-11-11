// Helper compartilhado: garante que as tabelas SQLite de resumo existem e estão povoadas.
//
// Contexto: as tabelas de resumo (resumo_vendas_mensal, resumo_clientes_ativos,
// resumo_vendas_uf_regiao) são SQLite puro — não são coleções PocketBase — e já
// sumiram da base viva uma vez (cron de reconciliação rodando durante consolidação).
// dashboard_stats.js e canais_comparativo.js leem EXCLUSIVAMENTE delas e engolem
// "no such table" devolvendo zeros com 200 — telas vazias sem erro aparente.
//
// Este arquivo define globalThis.__ensureResumoTables(forceRebuild):
//  - Cria as 3 tabelas + índices se não existirem (IF NOT EXISTS, <1ms se já existem).
//  - Backfill cada tabela INDEPENDENTEMENTE quando está vazia (o bloco legacy do
//    dashboard_stats só backfilava as 3 juntas quando resumo_vendas_mensal estava vazia).
//  - forceRebuild=true: apaga e reconstrói (usado ao concluir a consolidação).
//  - Quando insere linhas, limpa os caches em memória (__skipDashboardCache e
//    __skipFilterOptionsCache) para não servir zeros velhos.
//
// Mesmo SQL do backfill da migration 1742600002 e do cron_reconcile_summaries.js
// (janela >= 2015, excluindo SERVICOS).
//
// NOTA (bug Goja/PocketBase): DynamicModel nunca inicializa número com 0/0.0 —
// vira int64 no Go e quebra "Scan error float64 to int64". Usamos '' + parseInt.
;(function () {
  const countOf = function (table) {
    const rows = arrayOf(new DynamicModel({ c: '' }))
    $app
      .db()
      .newQuery('SELECT COUNT(*) AS c FROM ' + table)
      .all(rows)
    if (rows.length === 0) return 0
    return parseInt(rows[0].c, 10) || 0
  }

  const ensureResumoTables = function (forceRebuild) {
    const inserted = { mensal: 0, clientes: 0, uf: 0 }

    // --- Criação (idempotente) ---
    $app
      .db()
      .newQuery(
        'CREATE TABLE IF NOT EXISTS resumo_vendas_mensal (' +
          'id INTEGER PRIMARY KEY AUTOINCREMENT, ' +
          'ano_mes TEXT NOT NULL, ano INTEGER NOT NULL, mes INTEGER NOT NULL, ' +
          'tem_netsales INTEGER DEFAULT 0, grupo_item TEXT, estado TEXT, ' +
          'nome_vendedor TEXT, vendedor_cliente TEXT, codigo_cliente TEXT, ' +
          'nome_cliente TEXT, tipo_documento TEXT, utilizacao TEXT, ' +
          'total_linha REAL DEFAULT 0, valor_liquido REAL DEFAULT 0, ' +
          'quantidade REAL DEFAULT 0, total_devolucao REAL DEFAULT 0, ' +
          'qtd_documentos INTEGER DEFAULT 0, qtd_itens INTEGER DEFAULT 0, ' +
          'created TEXT, updated TEXT)',
      )
      .execute()
    $app
      .db()
      .newQuery('CREATE INDEX IF NOT EXISTS idx_rvm_anomes ON resumo_vendas_mensal (ano_mes)')
      .execute()
    $app
      .db()
      .newQuery('CREATE INDEX IF NOT EXISTS idx_rvm_ano ON resumo_vendas_mensal (ano)')
      .execute()
    $app
      .db()
      .newQuery('CREATE INDEX IF NOT EXISTS idx_rvm_grupo ON resumo_vendas_mensal (grupo_item)')
      .execute()
    $app
      .db()
      .newQuery('CREATE INDEX IF NOT EXISTS idx_rvm_estado ON resumo_vendas_mensal (estado)')
      .execute()
    $app
      .db()
      .newQuery(
        'CREATE INDEX IF NOT EXISTS idx_rvm_netsales ON resumo_vendas_mensal (tem_netsales)',
      )
      .execute()

    $app
      .db()
      .newQuery(
        'CREATE TABLE IF NOT EXISTS resumo_clientes_ativos (' +
          'id INTEGER PRIMARY KEY AUTOINCREMENT, ' +
          'ano_mes TEXT NOT NULL, ano INTEGER NOT NULL, mes INTEGER NOT NULL, ' +
          'tem_netsales INTEGER DEFAULT 0, grupo_categoria TEXT NOT NULL, ' +
          'codigo_cliente TEXT NOT NULL, created TEXT, updated TEXT)',
      )
      .execute()
    $app
      .db()
      .newQuery(
        'CREATE INDEX IF NOT EXISTS idx_rca_anomes_grp ON resumo_clientes_ativos (ano_mes, grupo_categoria)',
      )
      .execute()
    $app
      .db()
      .newQuery(
        'CREATE INDEX IF NOT EXISTS idx_rca_ano_grp ON resumo_clientes_ativos (ano, grupo_categoria)',
      )
      .execute()

    $app
      .db()
      .newQuery(
        'CREATE TABLE IF NOT EXISTS resumo_vendas_uf_regiao (' +
          'id INTEGER PRIMARY KEY AUTOINCREMENT, ' +
          'ano INTEGER NOT NULL, mes INTEGER NOT NULL, ano_mes TEXT NOT NULL, ' +
          'uf TEXT NOT NULL, regiao TEXT NOT NULL, tem_netsales INTEGER DEFAULT 0, ' +
          'total_linha REAL DEFAULT 0, qtd_documentos INTEGER DEFAULT 0, ' +
          'qtd_itens INTEGER DEFAULT 0, created TEXT, updated TEXT)',
      )
      .execute()
    $app
      .db()
      .newQuery('CREATE INDEX IF NOT EXISTS idx_rvu_anomes ON resumo_vendas_uf_regiao (ano_mes)')
      .execute()

    // --- Zeramento opcional (rebuild forçado, ex.: fim de consolidação) ---
    if (forceRebuild) {
      $app.db().newQuery('DELETE FROM resumo_vendas_mensal').execute()
      $app.db().newQuery('DELETE FROM resumo_clientes_ativos').execute()
      $app.db().newQuery('DELETE FROM resumo_vendas_uf_regiao').execute()
    }

    const rvmCount = countOf('resumo_vendas_mensal')
    const rcaCount = countOf('resumo_clientes_ativos')
    const rvuCount = countOf('resumo_vendas_uf_regiao')

    if (rvmCount === 0 && rcaCount === 0 && rvuCount === 0 && !forceRebuild) {
      // Nada povoado e sem rebuild: backfill direto, sem transação grande
      // (mesmo comportamento do bloco legacy).
    }

    const nowIso = new Date().toISOString()

    if (countOf('resumo_vendas_mensal') === 0) {
      $app
        .db()
        .newQuery(
          'INSERT INTO resumo_vendas_mensal (' +
            'ano_mes, ano, mes, tem_netsales, grupo_item, estado, ' +
            'nome_vendedor, vendedor_cliente, codigo_cliente, nome_cliente, ' +
            'tipo_documento, utilizacao, total_linha, valor_liquido, ' +
            'quantidade, total_devolucao, qtd_documentos, qtd_itens, created, updated) ' +
            'SELECT ' +
            'substr(data_lancamento, 1, 7) AS ano_mes, ' +
            'CAST(substr(data_lancamento, 1, 4) AS INTEGER) AS ano, ' +
            'CAST(substr(data_lancamento, 6, 2) AS INTEGER) AS mes, ' +
            '(CASE WHEN tem_netsales = 1 THEN 1 ELSE 0 END) AS tem_netsales, ' +
            "COALESCE(NULLIF(grupo_item, ''), 'Sem informação') AS grupo_item, " +
            "COALESCE(NULLIF(estado, ''), 'Sem informação') AS estado, " +
            "COALESCE(NULLIF(nome_vendedor, ''), 'Sem informação') AS nome_vendedor, " +
            "COALESCE(NULLIF(vendedor_cliente, ''), 'Sem informação') AS vendedor_cliente, " +
            "COALESCE(NULLIF(codigo_cliente, ''), '') AS codigo_cliente, " +
            "COALESCE(NULLIF(nome_cliente, ''), 'Sem informação') AS nome_cliente, " +
            "COALESCE(NULLIF(tipo_documento, ''), 'Sem informação') AS tipo_documento, " +
            "COALESCE(NULLIF(utilizacao, ''), 'Sem informação') AS utilizacao, " +
            'COALESCE(SUM(total_linha), 0) AS total_linha, ' +
            'COALESCE(SUM(valor_liquido), 0) AS valor_liquido, ' +
            'COALESCE(SUM(quantidade), 0) AS quantidade, ' +
            "COALESCE(SUM(CASE WHEN tipo_documento IN ('Dev. Entrega','Dev. NF','DEVNF') THEN total_linha ELSE 0 END), 0) AS total_devolucao, " +
            'COUNT(DISTINCT numero_nfe) AS qtd_documentos, ' +
            'COUNT(*) AS qtd_itens, ' +
            '{:now} AS created, {:now} AS updated ' +
            'FROM vendas ' +
            "WHERE data_lancamento IS NOT NULL AND data_lancamento != '' AND data_lancamento >= '2015-01-01' " +
            "AND UPPER(TRIM(COALESCE(codigo_item, ''))) != 'SERVICOS' " +
            'GROUP BY substr(data_lancamento, 1, 7), ' +
            'CAST(substr(data_lancamento, 1, 4) AS INTEGER), ' +
            'CAST(substr(data_lancamento, 6, 2) AS INTEGER), ' +
            '(CASE WHEN tem_netsales = 1 THEN 1 ELSE 0 END), ' +
            "COALESCE(NULLIF(grupo_item, ''), 'Sem informação'), " +
            "COALESCE(NULLIF(estado, ''), 'Sem informação'), " +
            "COALESCE(NULLIF(nome_vendedor, ''), 'Sem informação'), " +
            "COALESCE(NULLIF(vendedor_cliente, ''), 'Sem informação'), " +
            "COALESCE(NULLIF(codigo_cliente, ''), ''), " +
            "COALESCE(NULLIF(nome_cliente, ''), 'Sem informação'), " +
            "COALESCE(NULLIF(tipo_documento, ''), 'Sem informação'), " +
            "COALESCE(NULLIF(utilizacao, ''), 'Sem informação')",
        )
        .bind({ now: nowIso })
        .execute()
      inserted.mensal = countOf('resumo_vendas_mensal')
    }

    if (countOf('resumo_clientes_ativos') === 0) {
      $app
        .db()
        .newQuery(
          'INSERT INTO resumo_clientes_ativos (' +
            'ano_mes, ano, mes, tem_netsales, grupo_categoria, codigo_cliente, created, updated) ' +
            'SELECT ' +
            'substr(data_lancamento, 1, 7) AS ano_mes, ' +
            'CAST(substr(data_lancamento, 1, 4) AS INTEGER) AS ano, ' +
            'CAST(substr(data_lancamento, 6, 2) AS INTEGER) AS mes, ' +
            '(CASE WHEN tem_netsales = 1 THEN 1 ELSE 0 END) AS tem_netsales, ' +
            '(CASE ' +
            "WHEN UPPER(TRIM(grupo_item)) = 'EQUIPAMENTOS' THEN 'EQUIPAMENTOS' " +
            "WHEN UPPER(TRIM(grupo_item)) IN ('PEÇAS', 'PECAS', 'TINTAS', 'ACESSÓRIOS', 'ACESSORIOS') THEN 'INSUMOS' " +
            "ELSE 'OUTROS' END) AS grupo_categoria, " +
            'codigo_cliente, {:now} AS created, {:now} AS updated ' +
            'FROM vendas ' +
            "WHERE data_lancamento IS NOT NULL AND data_lancamento != '' AND data_lancamento >= '2015-01-01' " +
            "AND codigo_cliente IS NOT NULL AND codigo_cliente != '' " +
            "AND UPPER(TRIM(grupo_item)) IN ('EQUIPAMENTOS', 'PEÇAS', 'PECAS', 'TINTAS', 'ACESSÓRIOS', 'ACESSORIOS') " +
            "AND UPPER(TRIM(COALESCE(codigo_item, ''))) != 'SERVICOS' " +
            'GROUP BY substr(data_lancamento, 1, 7), ' +
            'CAST(substr(data_lancamento, 1, 4) AS INTEGER), ' +
            'CAST(substr(data_lancamento, 6, 2) AS INTEGER), ' +
            '(CASE WHEN tem_netsales = 1 THEN 1 ELSE 0 END), ' +
            '(CASE ' +
            "WHEN UPPER(TRIM(grupo_item)) = 'EQUIPAMENTOS' THEN 'EQUIPAMENTOS' " +
            "WHEN UPPER(TRIM(grupo_item)) IN ('PEÇAS', 'PECAS', 'TINTAS', 'ACESSÓRIOS', 'ACESSORIOS') THEN 'INSUMOS' " +
            "ELSE 'OUTROS' END), codigo_cliente",
        )
        .bind({ now: nowIso })
        .execute()
      inserted.clientes = countOf('resumo_clientes_ativos')
    }

    if (countOf('resumo_vendas_uf_regiao') === 0) {
      $app
        .db()
        .newQuery(
          'INSERT INTO resumo_vendas_uf_regiao (' +
            'ano, mes, ano_mes, uf, regiao, tem_netsales, total_linha, qtd_documentos, qtd_itens, created, updated) ' +
            'SELECT ' +
            'CAST(substr(data_lancamento, 1, 4) AS INTEGER) AS ano, ' +
            'CAST(substr(data_lancamento, 6, 2) AS INTEGER) AS mes, ' +
            'substr(data_lancamento, 1, 7) AS ano_mes, ' +
            "COALESCE(NULLIF(estado, ''), 'Sem informação') AS uf, " +
            '(CASE ' +
            "WHEN estado IN ('SP', 'RJ', 'MG', 'ES') THEN 'Sudeste' " +
            "WHEN estado IN ('PR', 'RS', 'SC') THEN 'Sul' " +
            "WHEN estado IN ('BA', 'PE', 'CE', 'MA', 'PB', 'RN', 'AL', 'SE', 'PI') THEN 'Nordeste' " +
            "WHEN estado IN ('GO', 'MT', 'MS', 'DF') THEN 'Centro-Oeste' " +
            "WHEN estado IN ('AM', 'PA', 'RO', 'TO', 'AC', 'AP', 'RR') THEN 'Norte' " +
            "ELSE 'Outros' END) AS regiao, " +
            '(CASE WHEN tem_netsales = 1 THEN 1 ELSE 0 END) AS tem_netsales, ' +
            'COALESCE(SUM(total_linha), 0) AS total_linha, ' +
            'COUNT(DISTINCT numero_nfe) AS qtd_documentos, ' +
            'COUNT(*) AS qtd_itens, {:now} AS created, {:now} AS updated ' +
            'FROM vendas ' +
            "WHERE data_lancamento IS NOT NULL AND data_lancamento != '' AND data_lancamento >= '2015-01-01' " +
            "AND UPPER(TRIM(COALESCE(codigo_item, ''))) != 'SERVICOS' " +
            'GROUP BY CAST(substr(data_lancamento, 1, 4) AS INTEGER), ' +
            'CAST(substr(data_lancamento, 6, 2) AS INTEGER), ' +
            'substr(data_lancamento, 1, 7), ' +
            "COALESCE(NULLIF(estado, ''), 'Sem informação'), " +
            '(CASE WHEN tem_netsales = 1 THEN 1 ELSE 0 END)',
        )
        .bind({ now: nowIso })
        .execute()
      inserted.uf = countOf('resumo_vendas_uf_regiao')
    }

    const totalInserted = inserted.mensal + inserted.clientes + inserted.uf
    if (totalInserted > 0) {
      // Resumo repovoado: caches em memória podem estar servindo zeros velhos.
      try {
        if (
          globalThis.__skipDashboardCache &&
          typeof globalThis.__skipDashboardCache.clear === 'function'
        ) {
          globalThis.__skipDashboardCache.clear()
        }
        if (
          globalThis.__skipFilterOptionsCache &&
          typeof globalThis.__skipFilterOptionsCache.clear === 'function'
        ) {
          globalThis.__skipFilterOptionsCache.clear()
        }
      } catch (_) {}
      console.log(
        'ensure_resumo_tables: resumo repovoado — mensal=' +
          inserted.mensal +
          ', clientes_ativos=' +
          inserted.clientes +
          ', uf_regiao=' +
          inserted.uf +
          (forceRebuild ? ' (rebuild forçado)' : ''),
      )
    }

    return inserted
  }

  globalThis.__ensureResumoTables = ensureResumoTables
})()
