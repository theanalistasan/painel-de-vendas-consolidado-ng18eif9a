// Endpoint: POST /backend/v1/vendas/consolidar
// Endpoint: POST /backend/v1/vendas/reconstruir-resumos
//
// Consolida a coleção `vendas` a partir de RacNew (base mestra) enriquecida
// com os 12 campos exclusivos da NetSales e o grupo_item da Produtos.
//
// Inclui os marcadores booleanos:
//   tem_racnew = 1 (já que r é racnew)
//   tem_netsales = 1 se houve match com netsales, 0 se não
//
// Chave de join RacNew -> NetSales:
//   racnew.numero_sap   = netsales.chave_documento
//   racnew.numero_nfe   = netsales.serial
//   racnew.data_lancamento = netsales.docdate
//   racnew.codigo_cliente = netsales.codigo_cliente
//   racnew.codigo_item   = netsales.codigo_item
//
// PROCESSAMENTO EM LOTES PROGRESSIVOS:
// Lê e grava registros em lotes utilizando rowid/id cursor progressivo com commits intermediários
// para evitar estouro de memória ou timeout do SQLite / Goja em bases de alta volumetria (~310k+ linhas).

routerAdd('POST', '/backend/v1/vendas/consolidar', (e) => {
  const startTime = Date.now()
  const nowIso = new Date().toISOString()
  let stage = 'iniciar'
  let totalConsolidado = 0
  let lotesProcessados = 0

  // Helpers defensivos do Goja/PocketBase (padrão definitivo deste projeto:
  // campos numéricos em DynamicModel NUNCA devem ser inicializados com 0/0.0)
  const toNum = (v) => {
    if (v === undefined || v === null || v === '') return 0
    const n = parseFloat(v)
    return isNaN(n) ? 0 : n
  }

  const toInt = (v) => {
    if (v === undefined || v === null || v === '') return 0
    const n = parseInt(v, 10)
    return isNaN(n) ? 0 : n
  }

  const nonEssentialIndexes = [
    'idx_vendas_vendedor_cliente',
    'idx_vendas_nome_vendedor',
    'idx_vendas_estado',
    'idx_vendas_cidade',
    'idx_vendas_utilizacao',
    'idx_vendas_numero_nfe',
    'idx_vendas_data_lancamento',
    'idx_vendas_grupo_item',
    'idx_vendas_tipo_documento',
    'idx_vendas_dt_grupo_tipo',
    'idx_vendas_nome_cliente',
    'idx_vendas_tem_netsales',
    'idx_vendas_created',
    'idx_vendas_data_desc',
    'idx_vendas_grupo_data',
    'idx_vendas_nome_cliente_total',
    'idx_vendas_data_lancamento_nfe',
    'idx_vendas_nfe_data',
    'idx_vendas_netsales_data',
    'idx_vendas_data_carga',
  ]

  const indexDefinitions = [
    'CREATE INDEX IF NOT EXISTS idx_vendas_data_lancamento ON vendas (data_lancamento);',
    'CREATE INDEX IF NOT EXISTS idx_vendas_numero_nfe ON vendas (numero_nfe);',
    'CREATE INDEX IF NOT EXISTS idx_vendas_grupo_item ON vendas (grupo_item);',
    'CREATE INDEX IF NOT EXISTS idx_vendas_tipo_documento ON vendas (tipo_documento);',
    'CREATE INDEX IF NOT EXISTS idx_vendas_tem_netsales ON vendas (tem_netsales);',
    'CREATE INDEX IF NOT EXISTS idx_vendas_nome_cliente ON vendas (nome_cliente);',
    'CREATE INDEX IF NOT EXISTS idx_vendas_nome_vendedor ON vendas (nome_vendedor);',
    'CREATE INDEX IF NOT EXISTS idx_vendas_vendedor_cliente ON vendas (vendedor_cliente);',
    'CREATE INDEX IF NOT EXISTS idx_vendas_estado ON vendas (estado);',
    'CREATE INDEX IF NOT EXISTS idx_vendas_cidade ON vendas (cidade);',
    'CREATE INDEX IF NOT EXISTS idx_vendas_utilizacao ON vendas (utilizacao);',
    'CREATE INDEX IF NOT EXISTS idx_vendas_created ON vendas (created);',
    'CREATE INDEX IF NOT EXISTS idx_vendas_data_carga ON vendas (data_carga);',
    'CREATE INDEX IF NOT EXISTS idx_vendas_dt_grupo_tipo ON vendas (data_lancamento, grupo_item, tipo_documento);',
    'CREATE INDEX IF NOT EXISTS idx_vendas_data_desc ON vendas (data_lancamento DESC);',
    'CREATE INDEX IF NOT EXISTS idx_vendas_grupo_data ON vendas (grupo_item, data_lancamento DESC);',
    'CREATE INDEX IF NOT EXISTS idx_vendas_nome_cliente_total ON vendas (nome_cliente, total_linha);',
    'CREATE INDEX IF NOT EXISTS idx_vendas_data_lancamento_nfe ON vendas (data_lancamento DESC, numero_nfe);',
    'CREATE INDEX IF NOT EXISTS idx_vendas_nfe_data ON vendas (numero_nfe, data_lancamento DESC);',
    'CREATE INDEX IF NOT EXISTS idx_vendas_netsales_data ON vendas (tem_netsales, data_lancamento DESC);',
  ]

  try {
    console.log('[consolidar_vendas] Iniciando consolidação em massa...')

    // 1. Definição dos índices SQLite da tabela vendas para drop temporário
    // Dropamos índices secundários para ganho massivo de performance em escrita progressiva
    stage = 'desativar_indices'
    for (let i = 0; i < nonEssentialIndexes.length; i++) {
      try {
        $app
          .db()
          .newQuery('DROP INDEX IF EXISTS ' + nonEssentialIndexes[i])
          .execute()
      } catch (_) {
        // Ignora erro se não existir
      }
    }

    // 2. Limpa a coleção vendas antes da nova consolidação
    stage = 'limpar_vendas'
    $app.db().newQuery('DELETE FROM vendas').execute()
    console.log('[consolidar_vendas] Tabela vendas limpa com sucesso.')

    // 3. Obter limites de id e total de registros em racnew para particionamento
    stage = 'obter_limites_racnew'
    const totalRacnewRows = arrayOf(new DynamicModel({ total: '' }))
    $app
      .db()
      .newQuery(
        "SELECT COUNT(*) AS total FROM racnew WHERE UPPER(TRIM(COALESCE(codigo_item, ''))) != 'SERVICOS'",
      )
      .all(totalRacnewRows)

    const totalRegistrosRacnew = totalRacnewRows.length > 0 ? toInt(totalRacnewRows[0].total) : 0
    console.log('[consolidar_vendas] Total de registros RacNew elegíveis: ' + totalRegistrosRacnew)

    if (totalRegistrosRacnew === 0) {
      console.log('[consolidar_vendas] Nenhum registro em RacNew para consolidar.')
      return e.json(200, {
        success: true,
        total_consolidado: 0,
        data_carga: nowIso,
        durationMs: Date.now() - startTime,
        resumos_pendentes: true,
        message: 'Nenhum registro encontrado na base RacNew para consolidar.',
      })
    }

    // 4. Processamento em LOTES progressivos
    // Tamanho do lote calibrado para 20.000 registros: rápido, eficiente em joins de SQLite
    // e com commits intermediários que liberam memória no Goja
    const BATCH_SIZE = 20000
    const totalBatches = Math.ceil(totalRegistrosRacnew / BATCH_SIZE)
    console.log(
      '[consolidar_vendas] Processando em ' +
        totalBatches +
        ' lotes de até ' +
        BATCH_SIZE +
        ' registros.',
    )

    // SQL base de inserção em lote com clausula LIMIT e OFFSET
    const batchInsertSql =
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
      '  status_cadastro, tipo_pn, tipo_cliente, ' +
      '  data_carga, created, updated' +
      ') ' +
      'SELECT ' +
      '  r.tipo_documento, r.nf_entrega_futura, r.numero_sap, r.numero_nfe, ' +
      '  r.data_lancamento, r.ultima_data_vencimento, r.docto_origem_destino, ' +
      '  r.data_origem_destino, r.condicao_pagamento, r.codigo_cliente, ' +
      '  r.nome_cliente, r.numero_linha, r.codigo_item, r.descricao_item, ' +
      // Campos numéricos da RacNew — COALESCE para 0.0 quando vierem nulos
      '  COALESCE(r.quantidade, 0.0), COALESCE(r.qty_kg_lt, 0.0), COALESCE(r.preco_item, 0.0), ' +
      '  COALESCE(r.desconto_linha, 0.0), COALESCE(r.icms, 0.0), COALESCE(r.pis, 0.0), ' +
      '  COALESCE(r.cofins, 0.0), COALESCE(r.ipi, 0.0), COALESCE(r.icms_partilha, 0.0), ' +
      '  COALESCE(r.total_linha, 0.0), r.utilizacao, ' +
      '  r.nome_vendedor, COALESCE(r.custo_item, 0.0), r.nome_filial, r.conta, ' +
      '  r.estado, r.cidade, ' +
      // Campos da NetSales (LEFT JOIN — string vazia ou 0.0 quando não há match)
      "  COALESCE(n.grupo_cliente, ''), COALESCE(n.mercado, ''), " +
      "  COALESCE(n.usuario_emissor, ''), COALESCE(n.itms_grp_nam, ''), " +
      "  COALESCE(n.numero_documento, ''), COALESCE(n.preco_unitario, 0.0), " +
      '  COALESCE(n.total_nf_sem_frete, 0.0), COALESCE(n.total_nf_novo, 0.0), ' +
      '  COALESCE(n.valor_liquido, 0.0), COALESCE(n.custo_total, 0.0), ' +
      "  COALESCE(n.classificacao, ''), COALESCE(n.vendedor_revenda, ''), " +
      // grupo_item da Produtos (LEFT JOIN por codigo_item com fallback)
      "  COALESCE(NULLIF(p.grupo_item, ''), 'Não Categorizado'), " +
      // vendedor_cliente = "nome_vendedor > nome_cliente"
      "  (r.nome_vendedor || ' > ' || r.nome_cliente), " +
      "  'Consolidado', " +
      // tem_racnew / tem_netsales
      "  1, (CASE WHEN n.chave_documento IS NOT NULL AND n.chave_documento != '' THEN 1 ELSE 0 END), " +
      // status_cadastro, tipo_pn, tipo_cliente (cruzamento com tipos_cliente por codigo_cliente / codigo_pn, fallback para r/n)
      "  COALESCE(NULLIF(tc.status_cadastro, ''), NULLIF(r.status_cadastro, ''), NULLIF(n.status_cadastro, ''), ''), " +
      "  COALESCE(NULLIF(tc.tipo_pn, ''), NULLIF(r.tipo_pn, ''), NULLIF(n.tipo_pn, ''), ''), " +
      "  COALESCE(NULLIF(tc.tipo_cliente, ''), NULLIF(r.tipo_cliente, ''), NULLIF(n.tipo_cliente, ''), ''), " +
      // data_carga / created / updated — timestamp desta consolidação
      '  {:now}, {:now}, {:now} ' +
      'FROM (' +
      '  SELECT * FROM racnew ' +
      "  WHERE UPPER(TRIM(COALESCE(codigo_item, ''))) != 'SERVICOS' " +
      '  ORDER BY id ASC ' +
      '  LIMIT {:limit} OFFSET {:offset}' +
      ') r ' +
      'LEFT JOIN netsales n ' +
      '  ON n.chave_documento = r.numero_sap ' +
      '  AND n.serial = r.numero_nfe ' +
      '  AND n.docdate = r.data_lancamento ' +
      '  AND n.codigo_cliente = r.codigo_cliente ' +
      '  AND n.codigo_item = r.codigo_item ' +
      'LEFT JOIN produtos p ' +
      '  ON p.codigo_item = r.codigo_item ' +
      'LEFT JOIN tipos_cliente tc ' +
      '  ON UPPER(TRIM(tc.codigo_pn)) = UPPER(TRIM(r.codigo_cliente))'

    for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
      const offset = batchIdx * BATCH_SIZE
      stage = 'gravar_lote_' + (batchIdx + 1) + '_de_' + totalBatches

      $app
        .db()
        .newQuery(batchInsertSql)
        .bind({
          now: nowIso,
          limit: BATCH_SIZE,
          offset: offset,
        })
        .execute()

      lotesProcessados++

      if ((batchIdx + 1) % 3 === 0 || batchIdx === totalBatches - 1) {
        console.log(
          '[consolidar_vendas] Progresso: lote ' +
            (batchIdx + 1) +
            '/' +
            totalBatches +
            ' processado (~' +
            Math.min((batchIdx + 1) * BATCH_SIZE, totalRegistrosRacnew) +
            '/' +
            totalRegistrosRacnew +
            ' linhas). Tempo decorrido: ' +
            (Date.now() - startTime) +
            'ms',
        )
      }
    }

    // 5. Reconstruir índices essenciais e secundários da tabela vendas
    stage = 'recriar_indices'
    console.log('[consolidar_vendas] Recriando índices da tabela vendas...')
    for (let j = 0; j < indexDefinitions.length; j++) {
      try {
        $app.db().newQuery(indexDefinitions[j]).execute()
      } catch (idxErr) {
        console.warn(
          '[consolidar_vendas] Aviso ao recriar índice vendas:',
          indexDefinitions[j],
          idxErr,
        )
      }
    }

    // 6. Conta quantas linhas foram inseridas no total
    stage = 'contar_linhas'
    const cnt = arrayOf(new DynamicModel({ c: '' }))
    $app.db().newQuery('SELECT COUNT(*) AS c FROM vendas').all(cnt)
    if (cnt.length > 0) totalConsolidado = toInt(cnt[0].c)

    const durationMs = Date.now() - startTime
    console.log(
      '[consolidar_vendas] Consolidação concluída com sucesso! Total consolidado: ' +
        totalConsolidado +
        ' em ' +
        durationMs +
        'ms (' +
        lotesProcessados +
        ' lotes).',
    )

    return e.json(200, {
      success: true,
      total_consolidado: totalConsolidado,
      data_carga: nowIso,
      durationMs: durationMs,
      lotes: lotesProcessados,
      resumos_pendentes: true,
      message:
        'Carga em lotes de vendas concluída com sucesso (' +
        totalConsolidado +
        ' vendas consolidadas). Proceda com a reconstrução dos resumos.',
    })
  } catch (err) {
    const errorMsg = String(err && err.message ? err.message : err)
    console.error(
      '[consolidar_vendas] Falha na consolidação na etapa [' +
        stage +
        '] após ' +
        lotesProcessados +
        ' lotes: ' +
        errorMsg,
    )

    // Tentar restaurar índices básicos caso tenha falhado durante inserção
    try {
      $app
        .db()
        .newQuery(
          'CREATE INDEX IF NOT EXISTS idx_vendas_data_lancamento ON vendas (data_lancamento);',
        )
        .execute()
      $app
        .db()
        .newQuery('CREATE INDEX IF NOT EXISTS idx_vendas_numero_nfe ON vendas (numero_nfe);')
        .execute()
    } catch (_) {}

    return e.json(500, {
      success: false,
      error:
        'Falha na consolidação de vendas na etapa [' +
        stage +
        '] (processados ' +
        lotesProcessados +
        ' lotes): ' +
        errorMsg,
      stage: stage,
      lotes_processados: lotesProcessados,
    })
  }
})

// Endpoint: POST /backend/v1/vendas/reconstruir-resumos
// Reconstrói as 3 tabelas de resumo SQLite (resumo_vendas_mensal, resumo_clientes_ativos, resumo_vendas_uf_regiao)
// de forma idempotente e separada da carga para caber folgadamente no teto de tempo.
routerAdd('POST', '/backend/v1/vendas/reconstruir-resumos', (e) => {
  const startTime = Date.now()
  const nowIso = new Date().toISOString()
  let stage = 'iniciar'

  try {
    stage = 'garantir_tabelas_resumo'
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

    // 1. Reconstruir resumo_vendas_mensal
    stage = 'resumo_vendas_mensal'
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

    // 2. Reconstruir resumo_clientes_ativos
    stage = 'resumo_clientes_ativos'
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

    // 3. Reconstruir resumo_vendas_uf_regiao
    stage = 'resumo_vendas_uf_regiao'
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

    const durationMs = Date.now() - startTime

    return e.json(200, {
      success: true,
      message: 'Reconstrução de resumos concluída com sucesso em ' + durationMs + 'ms.',
      durationMs: durationMs,
      data_carga: nowIso,
    })
  } catch (err) {
    const errorMsg = String(err && err.message ? err.message : err)
    console.error('[reconstruir_resumos] Falha na etapa [' + stage + ']:', errorMsg)
    return e.json(500, {
      success: false,
      error: 'Falha na reconstrução de resumos na etapa [' + stage + ']: ' + errorMsg,
      stage: stage,
    })
  }
})
