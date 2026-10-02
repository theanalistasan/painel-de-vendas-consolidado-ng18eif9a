migrate(
  (app) => {
    // 0037: Carga rápida exclusiva do mês de Setembro/2026 na tabela vendas
    // sem apagar o histórico existente e sem timeout
    const startTime = Date.now()
    const nowIso = new Date().toISOString()

    // 1. Remove qualquer resíduo prévio de Setembro/2026 em vendas
    app
      .db()
      .newQuery(
        "DELETE FROM vendas WHERE data_lancamento >= '2026-09-01' AND data_lancamento <= '2026-09-30'",
      )
      .execute()

    // 2. Insere os registros de Setembro/2026 a partir de RacNew com join em NetSales e Produtos
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
      '  COALESCE(r.quantidade, 0.0), COALESCE(r.qty_kg_lt, 0.0), COALESCE(r.preco_item, 0.0), ' +
      '  COALESCE(r.desconto_linha, 0.0), COALESCE(r.icms, 0.0), COALESCE(r.pis, 0.0), ' +
      '  COALESCE(r.cofins, 0.0), COALESCE(r.ipi, 0.0), COALESCE(r.icms_partilha, 0.0), ' +
      '  COALESCE(r.total_linha, 0.0), r.utilizacao, ' +
      '  r.nome_vendedor, COALESCE(r.custo_item, 0.0), r.nome_filial, r.conta, ' +
      '  r.estado, r.cidade, ' +
      "  COALESCE(n.grupo_cliente, ''), COALESCE(n.mercado, ''), " +
      "  COALESCE(n.usuario_emissor, ''), COALESCE(n.itms_grp_nam, ''), " +
      "  COALESCE(n.numero_documento, ''), COALESCE(n.preco_unitario, 0.0), " +
      '  COALESCE(n.total_nf_sem_frete, 0.0), COALESCE(n.total_nf_novo, 0.0), ' +
      '  COALESCE(n.valor_liquido, 0.0), COALESCE(n.custo_total, 0.0), ' +
      "  COALESCE(n.classificacao, ''), COALESCE(n.vendedor_revenda, ''), " +
      "  COALESCE(NULLIF(p.grupo_item, ''), 'Não Categorizado'), " +
      "  (r.nome_vendedor || ' > ' || r.nome_cliente), " +
      "  'Consolidado', " +
      "  1, (CASE WHEN n.chave_documento IS NOT NULL AND n.chave_documento != '' THEN 1 ELSE 0 END), " +
      '  {:now}, {:now}, {:now} ' +
      'FROM racnew r ' +
      'LEFT JOIN netsales n ' +
      '  ON n.chave_documento = r.numero_sap ' +
      '  AND n.serial = r.numero_nfe ' +
      '  AND n.docdate = r.data_lancamento ' +
      '  AND n.codigo_cliente = r.codigo_cliente ' +
      '  AND n.codigo_item = r.codigo_item ' +
      'LEFT JOIN produtos p ' +
      '  ON p.codigo_item = r.codigo_item ' +
      "WHERE r.data_lancamento >= '2026-09-01' AND r.data_lancamento <= '2026-09-30'"

    app.db().newQuery(insertSql).bind({ now: nowIso }).execute()

    // 3. Reconciliação dos resumos adicionando/atualizando o mês de Setembro/2026
    app.db().newQuery("DELETE FROM resumo_vendas_mensal WHERE ano_mes = '2026-09'").execute()
    app
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
      WHERE data_lancamento >= '2026-09-01' AND data_lancamento <= '2026-09-30'
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

    app.db().newQuery("DELETE FROM resumo_clientes_ativos WHERE ano_mes = '2026-09'").execute()
    app
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
      WHERE data_lancamento >= '2026-09-01' AND data_lancamento <= '2026-09-30'
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

    app.db().newQuery("DELETE FROM resumo_vendas_uf_regiao WHERE ano_mes = '2026-09'").execute()
    app
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
      WHERE data_lancamento >= '2026-09-01' AND data_lancamento <= '2026-09-30'
      GROUP BY
        CAST(substr(data_lancamento, 1, 4) AS INTEGER),
        CAST(substr(data_lancamento, 6, 2) AS INTEGER),
        substr(data_lancamento, 1, 7),
        COALESCE(NULLIF(estado, ''), 'Sem informação'),
        (CASE WHEN tem_netsales = 1 THEN 1 ELSE 0 END)
    `)
      .bind({ now: nowIso })
      .execute()

    console.log('Migração 0037 (carga setembro) concluída em ' + (Date.now() - startTime) + 'ms')
  },
  (app) => {
    app
      .db()
      .newQuery(
        "DELETE FROM vendas WHERE data_lancamento >= '2026-09-01' AND data_lancamento <= '2026-09-30'",
      )
      .execute()
  },
)
