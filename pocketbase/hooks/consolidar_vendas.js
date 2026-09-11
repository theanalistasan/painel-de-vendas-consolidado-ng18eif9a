// Endpoint: POST /backend/v1/vendas/consolidar
// Consolida a coleção `vendas` a partir de RacNew (base mestra) enriquecida
// com os 12 campos exclusivos da NetSales e o grupo_item da Produtos.
//
// Inclui os marcadores booleanos:
//   tem_racnew = true (já que r é racnew)
//   tem_netsales = (CASE WHEN n.chave_documento IS NOT NULL THEN 1 ELSE 0 END)
//
// Chave de join RacNew -> NetSales:
//   racnew.numero_sap   = netsales.chave_documento
//   racnew.numero_nfe   = netsales.serial
//   racnew.data_lancamento = netsales.docdate
//   racnew.codigo_cliente = netsales.codigo_cliente
//   racnew.codigo_item   = netsales.codigo_item
routerAdd(
  'POST',
  '/backend/v1/vendas/consolidar',
  (e) => {
    const nowIso = new Date().toISOString()

    let totalConsolidado = 0

    $app.runInTransaction((txApp) => {
      // 0. Garante que as tabelas de resumo SQLite existam
      txApp
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
      txApp
        .db()
        .newQuery('CREATE INDEX IF NOT EXISTS idx_rvm_anomes ON resumo_vendas_mensal (ano_mes);')
        .execute()
      txApp
        .db()
        .newQuery('CREATE INDEX IF NOT EXISTS idx_rvm_ano ON resumo_vendas_mensal (ano);')
        .execute()
      txApp
        .db()
        .newQuery('CREATE INDEX IF NOT EXISTS idx_rvm_grupo ON resumo_vendas_mensal (grupo_item);')
        .execute()
      txApp
        .db()
        .newQuery('CREATE INDEX IF NOT EXISTS idx_rvm_estado ON resumo_vendas_mensal (estado);')
        .execute()
      txApp
        .db()
        .newQuery(
          'CREATE INDEX IF NOT EXISTS idx_rvm_netsales ON resumo_vendas_mensal (tem_netsales);',
        )
        .execute()
      txApp
        .db()
        .newQuery(
          'CREATE INDEX IF NOT EXISTS idx_rvm_vendedor ON resumo_vendas_mensal (nome_vendedor);',
        )
        .execute()
      txApp
        .db()
        .newQuery(
          'CREATE INDEX IF NOT EXISTS idx_rvm_vend_cli ON resumo_vendas_mensal (vendedor_cliente);',
        )
        .execute()
      txApp
        .db()
        .newQuery(
          'CREATE INDEX IF NOT EXISTS idx_rvm_tipo_doc ON resumo_vendas_mensal (tipo_documento);',
        )
        .execute()
      txApp
        .db()
        .newQuery('CREATE INDEX IF NOT EXISTS idx_rvm_util ON resumo_vendas_mensal (utilizacao);')
        .execute()

      txApp
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
      txApp
        .db()
        .newQuery(
          'CREATE INDEX IF NOT EXISTS idx_rca_anomes_grp ON resumo_clientes_ativos (ano_mes, grupo_categoria);',
        )
        .execute()
      txApp
        .db()
        .newQuery(
          'CREATE INDEX IF NOT EXISTS idx_rca_ano_grp ON resumo_clientes_ativos (ano, grupo_categoria);',
        )
        .execute()
      txApp
        .db()
        .newQuery(
          'CREATE INDEX IF NOT EXISTS idx_rca_cliente ON resumo_clientes_ativos (codigo_cliente);',
        )
        .execute()
      txApp
        .db()
        .newQuery(
          'CREATE INDEX IF NOT EXISTS idx_rca_netsales ON resumo_clientes_ativos (tem_netsales);',
        )
        .execute()

      txApp
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
      txApp
        .db()
        .newQuery('CREATE INDEX IF NOT EXISTS idx_rvu_anomes ON resumo_vendas_uf_regiao (ano_mes);')
        .execute()
      txApp
        .db()
        .newQuery('CREATE INDEX IF NOT EXISTS idx_rvu_uf ON resumo_vendas_uf_regiao (uf);')
        .execute()
      txApp
        .db()
        .newQuery('CREATE INDEX IF NOT EXISTS idx_rvu_regiao ON resumo_vendas_uf_regiao (regiao);')
        .execute()
      txApp
        .db()
        .newQuery(
          'CREATE INDEX IF NOT EXISTS idx_rvu_netsales ON resumo_vendas_uf_regiao (tem_netsales);',
        )
        .execute()

      // 1. Limpa a coleção vendas (apaga registros anteriores).
      txApp.db().newQuery('DELETE FROM vendas').execute()

      // 2. INSERT em massa via LEFT JOIN:
      //    - racnew é a base mestra (todas as linhas viram vendas)
      //    - netsales enriquece com os campos exclusivos (quando há match)
      //    - produtos traz o grupo_item pelo codigo_item
      //    - tem_racnew = 1 (true)
      //    - tem_netsales = 1 se houve match com netsales, 0 se não
      const insertSql =
        'INSERT INTO vendas (' +
        '  tipo_documento, nf_entrega_futura, numero_sap, numero_nfe, ' +
        '  data_lancamento, ultima_data_vencimento, docto_origem_destino, ' +
        '  data_origem_destino, condicao_pagamento, codigo_cliente, ' +
        '  nome_cliente, numero_linha, codigo_item, descricao_item, ' +
        '  quantidade, qty_kg_lt, preco_item, desconto_linha, icms, pis, ' +
        '  cofins, ipi, icms_partilha, total_linha, utilizacao, ' +
        '  nome_vendedor, custo_item, nome_filial, conta, estado, cidade, ' +
        '  grupo_cliente, mercado, usuario_emissor_pedido, itms_grp_nam, ' +
        '  numero_documento_netsales, preco_unitario, total_nf_sem_frete, ' +
        '  total_nf_novo, valor_liquido, custo_total, classificacao, ' +
        '  vendedor_revenda, grupo_item, vendedor_cliente, origem, ' +
        '  tem_racnew, tem_netsales, ' +
        '  data_carga, created, updated' +
        ') ' +
        'SELECT ' +
        '  r.tipo_documento, r.nf_entrega_futura, r.numero_sap, r.numero_nfe, ' +
        '  r.data_lancamento, r.ultima_data_vencimento, r.docto_origem_destino, ' +
        '  r.data_origem_destino, r.condicao_pagamento, r.codigo_cliente, ' +
        '  r.nome_cliente, r.numero_linha, r.codigo_item, r.descricao_item, ' +
        // Campos numéricos da RacNew — COALESCE para 0 quando vierem vazios
        '  r.quantidade, COALESCE(r.qty_kg_lt, 0), COALESCE(r.preco_item, 0), ' +
        '  COALESCE(r.desconto_linha, 0), COALESCE(r.icms, 0), COALESCE(r.pis, 0), ' +
        '  COALESCE(r.cofins, 0), COALESCE(r.ipi, 0), COALESCE(r.icms_partilha, 0), ' +
        '  r.total_linha, r.utilizacao, ' +
        '  r.nome_vendedor, COALESCE(r.custo_item, 0), r.nome_filial, r.conta, ' +
        '  r.estado, r.cidade, ' +
        // Campos da NetSales (LEFT JOIN — NULL quando não há match).
        "  COALESCE(n.grupo_cliente, ''), COALESCE(n.mercado, ''), " +
        "  COALESCE(n.usuario_emissor, ''), COALESCE(n.itms_grp_nam, ''), " +
        "  COALESCE(n.numero_documento, ''), COALESCE(n.preco_unitario, 0), " +
        '  COALESCE(n.total_nf_sem_frete, 0), COALESCE(n.total_nf_novo, 0), ' +
        '  COALESCE(n.valor_liquido, 0), COALESCE(n.custo_total, 0), ' +
        "  COALESCE(n.classificacao, ''), COALESCE(n.vendedor_revenda, ''), " +
        // grupo_item da Produtos (LEFT JOIN por codigo_item com fallback)
        "  COALESCE(NULLIF(p.grupo_item, ''), 'Não Categorizado'), " +
        // vendedor_cliente = "nome_vendedor > nome_cliente" (concat)
        "  (r.nome_vendedor || ' > ' || r.nome_cliente), " +
        "  'Consolidado', " +
        // tem_racnew / tem_netsales
        "  1, (CASE WHEN n.chave_documento IS NOT NULL AND n.chave_documento != '' THEN 1 ELSE 0 END), " +
        // data_carga / created / updated — timestamp desta consolidação
        '  {:now}, {:now}, {:now} ' +
        'FROM racnew r ' +
        'LEFT JOIN netsales n ' +
        '  ON n.chave_documento = r.numero_sap ' +
        '  AND n.serial = r.numero_nfe ' +
        '  AND n.docdate = r.data_lancamento ' +
        '  AND n.codigo_cliente = r.codigo_cliente ' +
        '  AND n.codigo_item = r.codigo_item ' +
        'LEFT JOIN produtos p ' +
        '  ON p.codigo_item = r.codigo_item'

      txApp.db().newQuery(insertSql).bind({ now: nowIso }).execute()

      // 3. Reconcilia as tabelas de resumo pré-calculadas imediatamente
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

      // 4. Conta quantas linhas foram inseridas.
      const cnt = arrayOf(new DynamicModel({ c: 0 }))
      txApp.db().newQuery('SELECT COUNT(*) as c FROM vendas').all(cnt)
      if (cnt.length > 0) totalConsolidado = cnt[0].c
    })

    return e.json(200, {
      success: true,
      total_consolidado: totalConsolidado,
      data_carga: nowIso,
    })
  },
  $apis.requireAuth(),
)
