// Endpoint: POST /backend/v1/vendas/consolidar
// Consolida a coleção `vendas` a partir de RacNew (base mestra) enriquecida
// com os 12 campos exclusivos da NetSales e o grupo_item da Produtos.
//
// O JOIN é feito em SQL nativo (INSERT ... SELECT ... LEFT JOIN), o que é
// O(maginitude) mais rápido que iterar 125k registros em JS fazendo uma
// consulta findRecordsByFilter por linha (que é a causa dos timeouts e dos
// campos da NetSales em branco — o filtro antigo usava aspas simples, que o
// PocketBase não interpreta como string literal, retornando 0 matches).
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
      // 1. Limpa a coleção vendas (apaga registros anteriores).
      txApp.db().newQuery('DELETE FROM vendas').execute()

      // 2. INSERT em massa via LEFT JOIN:
      //    - racnew é a base mestra (todas as linhas viram vendas)
      //    - netsales enriquece com os campos exclusivos (quando há match)
      //    - produtos traz o grupo_item pelo codigo_item
      //    Em SQL, literais de texto usam aspas SIMPLES (não duplas) — este é
      //    o oposto do filtro do findRecordsByFilter, que usa aspas duplas.
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
        '  data_carga, created, updated' +
        ') ' +
        'SELECT ' +
        '  r.tipo_documento, r.nf_entrega_futura, r.numero_sap, r.numero_nfe, ' +
        '  r.data_lancamento, r.ultima_data_vencimento, r.docto_origem_destino, ' +
        '  r.data_origem_destino, r.condicao_pagamento, r.codigo_cliente, ' +
        '  r.nome_cliente, r.numero_linha, r.codigo_item, r.descricao_item, ' +
        // Campos numéricos da RacNew — COALESCE para 0 quando vierem vazios
        // (evita NULL em colunas eventualmente NOT NULL e normaliza o dado).
        '  r.quantidade, COALESCE(r.qty_kg_lt, 0), COALESCE(r.preco_item, 0), ' +
        '  COALESCE(r.desconto_linha, 0), COALESCE(r.icms, 0), COALESCE(r.pis, 0), ' +
        '  COALESCE(r.cofins, 0), COALESCE(r.ipi, 0), COALESCE(r.icms_partilha, 0), ' +
        '  r.total_linha, r.utilizacao, ' +
        '  r.nome_vendedor, COALESCE(r.custo_item, 0), r.nome_filial, r.conta, ' +
        '  r.estado, r.cidade, ' +
        // Campos da NetSales (LEFT JOIN — NULL quando não há match).
        // COALESCE em TODOS para nunca inserir NULL (textos -> '', números -> 0),
        // evitando `NOT NULL constraint failed` mesmo que alguma coluna ainda
        // esteja marcada como NOT NULL no SQLite.
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

      // 3. Conta quantas linhas foram inseridas.
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
