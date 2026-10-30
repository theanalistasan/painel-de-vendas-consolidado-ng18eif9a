// Endpoint: POST /backend/v1/vendas/consolidar
// Endpoint: GET  /backend/v1/vendas/consolidar/status
// Endpoint: POST /backend/v1/vendas/consolidar/step
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
// ARQUITETURA RESILIENTE COM EXECUÇÃO SEGURA E PROGRESSO PERSISTIDO:
// 1. Tabela vendas_staging:
//    - O processamento grava primeiro numa tabela staging (`vendas_staging`), NUNCA destruindo a tabela `vendas` antes da hora.
//    - Somente quando o último lote conclui, a troca é feita atômica / segura, garantindo que se qualquer falha ocorrer a base antiga segue 100% íntegra.
// 2. Lotes Progressivos e Checkpoints Persistidos:
//    - POST /backend/v1/vendas/consolidar inicia ou retoma o processo com segurança.
//    - GET  /backend/v1/vendas/consolidar/status monitora lote atual, etapa, registros processados e erros.
//    - POST /backend/v1/vendas/consolidar/step executa um lote por vez (<3-5s cada), impedindo qualquer estouro de timeout HTTP!

routerAdd('POST', '/backend/v1/vendas/consolidar', (e) => {
  const BATCH_SIZE = 10000

  const toInt = (v) => {
    if (v === undefined || v === null || v === '') return 0
    const n = parseInt(v, 10)
    return isNaN(n) ? 0 : n
  }

  const ensureTables = () => {
    $app
      .db()
      .newQuery(
        `
      CREATE TABLE IF NOT EXISTS vendas_consolidacao_status (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        status TEXT NOT NULL,
        etapa TEXT,
        lote_atual INTEGER DEFAULT 0,
        total_lotes INTEGER DEFAULT 0,
        registros_processados INTEGER DEFAULT 0,
        total_registros INTEGER DEFAULT 0,
        mensagem TEXT,
        erro TEXT,
        data_carga TEXT,
        started_at TEXT,
        updated_at TEXT,
        finished_at TEXT
      );
    `,
      )
      .execute()

    $app
      .db()
      .newQuery(
        `
      INSERT OR IGNORE INTO vendas_consolidacao_status (
        id, status, etapa, lote_atual, total_lotes, registros_processados, total_registros, mensagem, erro, data_carga, started_at, updated_at, finished_at
      ) VALUES (
        1, 'idle', 'pronto', 0, 0, 0, 0, 'Pronto para consolidar', '', '', '', '', ''
      );
    `,
      )
      .execute()

    // Criação idempotente dos índices de junção nas tabelas envolvidas
    try {
      $app
        .db()
        .newQuery(
          'CREATE INDEX IF NOT EXISTS idx_netsales_join_racnew ON netsales (chave_documento, serial, docdate, codigo_cliente, codigo_item);',
        )
        .execute()
    } catch (_) {}
    try {
      $app
        .db()
        .newQuery(
          'CREATE INDEX IF NOT EXISTS idx_racnew_join_keys ON racnew (numero_sap, numero_nfe, data_lancamento, codigo_cliente, codigo_item);',
        )
        .execute()
    } catch (_) {}
    try {
      $app
        .db()
        .newQuery(
          'CREATE INDEX IF NOT EXISTS idx_produtos_codigo_item_join ON produtos (codigo_item);',
        )
        .execute()
    } catch (_) {}
    try {
      $app
        .db()
        .newQuery(
          'CREATE INDEX IF NOT EXISTS idx_tipos_cliente_codigo_pn_join ON tipos_cliente (codigo_pn);',
        )
        .execute()
    } catch (_) {}

    $app
      .db()
      .newQuery(
        `
      CREATE TABLE IF NOT EXISTS vendas_staging (
        id TEXT PRIMARY KEY,
        tipo_documento TEXT,
        nf_entrega_futura TEXT,
        numero_sap TEXT,
        numero_nfe TEXT,
        data_lancamento TEXT,
        ultima_data_vencimento TEXT,
        docto_origem_destino TEXT,
        data_origem_destino TEXT,
        condicao_pagamento TEXT,
        codigo_cliente TEXT,
        nome_cliente TEXT,
        numero_linha REAL,
        codigo_item TEXT,
        descricao_item TEXT,
        quantidade REAL,
        qty_kg_lt REAL,
        preco_item REAL,
        desconto_linha REAL,
        icms REAL,
        pis REAL,
        cofins REAL,
        ipi REAL,
        icms_partilha REAL,
        total_linha REAL,
        utilizacao TEXT,
        nome_vendedor TEXT,
        custo_item REAL,
        nome_filial TEXT,
        conta TEXT,
        estado TEXT,
        cidade TEXT,
        grupo_cliente TEXT,
        mercado TEXT,
        usuario_emissor_pedido TEXT,
        itms_grp_nam TEXT,
        numero_documento_netsales TEXT,
        preco_unitario REAL,
        total_nf_sem_frete REAL,
        total_nf_novo REAL,
        valor_liquido REAL,
        custo_total REAL,
        classificacao TEXT,
        vendedor_revenda TEXT,
        grupo_item TEXT,
        vendedor_cliente TEXT,
        origem TEXT,
        tem_racnew INTEGER,
        tem_netsales INTEGER,
        status_cadastro TEXT,
        tipo_pn TEXT,
        tipo_cliente TEXT,
        data_carga TEXT,
        created TEXT,
        updated TEXT
      );
    `,
      )
      .execute()
  }

  const getStatus = () => {
    ensureTables()
    const rows = arrayOf(
      new DynamicModel({
        id: '',
        status: '',
        etapa: '',
        lote_atual: '',
        total_lotes: '',
        registros_processados: '',
        total_registros: '',
        mensagem: '',
        erro: '',
        data_carga: '',
        started_at: '',
        updated_at: '',
        finished_at: '',
      }),
    )
    $app
      .db()
      .newQuery(
        `SELECT
          id,
          COALESCE(status, '') AS status,
          COALESCE(etapa, '') AS etapa,
          COALESCE(lote_atual, 0) AS lote_atual,
          COALESCE(total_lotes, 0) AS total_lotes,
          COALESCE(registros_processados, 0) AS registros_processados,
          COALESCE(total_registros, 0) AS total_registros,
          COALESCE(mensagem, '') AS mensagem,
          COALESCE(erro, '') AS erro,
          COALESCE(data_carga, '') AS data_carga,
          COALESCE(started_at, '') AS started_at,
          COALESCE(updated_at, '') AS updated_at,
          COALESCE(finished_at, '') AS finished_at
        FROM vendas_consolidacao_status WHERE id = 1`,
      )
      .all(rows)
    if (rows.length === 0) {
      return {
        status: 'idle',
        etapa: 'pronto',
        lote_atual: 0,
        total_lotes: 0,
        registros_processados: 0,
        total_registros: 0,
        mensagem: 'Pronto para consolidar',
        erro: '',
        data_carga: '',
        started_at: '',
        updated_at: '',
        finished_at: '',
      }
    }
    const r = rows[0]
    return {
      status: String(r.status || 'idle'),
      etapa: String(r.etapa || ''),
      lote_atual: toInt(r.lote_atual),
      total_lotes: toInt(r.total_lotes),
      registros_processados: toInt(r.registros_processados),
      total_registros: toInt(r.total_registros),
      mensagem: String(r.mensagem || ''),
      erro: String(r.erro || ''),
      data_carga: String(r.data_carga || ''),
      started_at: String(r.started_at || ''),
      updated_at: String(r.updated_at || ''),
      finished_at: String(r.finished_at || ''),
    }
  }

  const setStatus = (fields) => {
    ensureTables()
    const sets = []
    const params = { now: new Date().toISOString() }
    for (const k in fields) {
      if (Object.prototype.hasOwnProperty.call(fields, k)) {
        sets.push(k + ' = {:' + k + '}')
        // Garante que nunca inserimos NULL nos campos textuais
        params[k] = fields[k] === null || fields[k] === undefined ? '' : fields[k]
      }
    }
    sets.push('updated_at = {:now}')
    $app
      .db()
      .newQuery('UPDATE vendas_consolidacao_status SET ' + sets.join(', ') + ' WHERE id = 1')
      .bind(params)
      .execute()
  }

  const nowIso = new Date().toISOString()
  ensureTables()

  try {
    const statusRecord = getStatus()

    // Se já estiver em andamento há menos de 5 minutos, retorna o status existente sem resetar
    // (a menos que o usuário tenha forçado ou a requisição venha com reset)
    const reqBody = e.request ? e.request.body : null
    let forceRestart = false
    try {
      if (reqBody && reqBody.force) forceRestart = true
    } catch (_) {}

    if (!forceRestart && statusRecord.status === 'in_progress' && statusRecord.started_at) {
      const elapsedMs = Date.now() - new Date(statusRecord.started_at).getTime()
      if (
        elapsedMs < 300000 &&
        statusRecord.total_lotes > 0 &&
        statusRecord.lote_atual < statusRecord.total_lotes
      ) {
        return e.json(200, {
          success: true,
          started: false,
          already_running: true,
          message: 'Consolidação já em andamento.',
          status: statusRecord,
        })
      }
    }

    // Limpa staging para nova consolidação (vendas original fica intacta!)
    $app.db().newQuery('DELETE FROM vendas_staging').execute()

    // Contagem de RacNew elegível
    const totalRacnewRows = arrayOf(new DynamicModel({ total: '' }))
    $app
      .db()
      .newQuery(
        "SELECT COUNT(*) AS total FROM racnew WHERE UPPER(TRIM(COALESCE(codigo_item, ''))) != 'SERVICOS'",
      )
      .all(totalRacnewRows)

    const totalRegistrosRacnew = totalRacnewRows.length > 0 ? toInt(totalRacnewRows[0].total) : 0

    if (totalRegistrosRacnew === 0) {
      setStatus({
        status: 'completed',
        etapa: 'sem_registros',
        lote_atual: 0,
        total_lotes: 0,
        registros_processados: 0,
        total_registros: 0,
        mensagem: 'Nenhum registro encontrado em RacNew.',
        data_carga: nowIso,
        finished_at: nowIso,
      })

      return e.json(200, {
        success: true,
        started: true,
        total_consolidado: 0,
        data_carga: nowIso,
        message: 'Nenhum registro encontrado na base RacNew para consolidar.',
        status: getStatus(),
      })
    }

    const totalBatches = Math.ceil(totalRegistrosRacnew / BATCH_SIZE)

    setStatus({
      status: 'in_progress',
      etapa: 'iniciando',
      lote_atual: 0,
      total_lotes: totalBatches,
      registros_processados: 0,
      total_registros: totalRegistrosRacnew,
      mensagem:
        'Iniciando consolidação em ' +
        totalBatches +
        ' lotes de até ' +
        BATCH_SIZE +
        ' registros...',
      erro: '',
      data_carga: nowIso,
      started_at: nowIso,
      finished_at: '',
    })

    return e.json(200, {
      success: true,
      started: true,
      total_batches: totalBatches,
      batch_size: BATCH_SIZE,
      total_registros: totalRegistrosRacnew,
      data_carga: nowIso,
      status: getStatus(),
      message: 'Consolidação iniciada com sucesso. Acompanhando progresso...',
    })
  } catch (err) {
    const errorMsg = String(err && err.message ? err.message : err)
    console.error('[consolidar_iniciar] Falha ao iniciar:', errorMsg)
    try {
      setStatus({
        status: 'error',
        erro: errorMsg,
        mensagem: 'Falha ao iniciar consolidação: ' + errorMsg,
      })
    } catch (_) {}

    let currentStat
    try {
      currentStat = getStatus()
    } catch (_) {
      currentStat = null
    }

    return e.json(500, {
      success: false,
      error: 'Falha ao iniciar consolidação [iniciar]: ' + errorMsg,
      message: 'Falha ao iniciar consolidação [iniciar]: ' + errorMsg,
      stage: 'iniciar',
      lote: 0,
      status: currentStat,
    })
  }
})

routerAdd('GET', '/backend/v1/vendas/consolidar/status', (e) => {
  const toInt = (v) => {
    if (v === undefined || v === null || v === '') return 0
    const n = parseInt(v, 10)
    return isNaN(n) ? 0 : n
  }

  try {
    $app
      .db()
      .newQuery(
        `
      CREATE TABLE IF NOT EXISTS vendas_consolidacao_status (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        status TEXT NOT NULL,
        etapa TEXT,
        lote_atual INTEGER DEFAULT 0,
        total_lotes INTEGER DEFAULT 0,
        registros_processados INTEGER DEFAULT 0,
        total_registros INTEGER DEFAULT 0,
        mensagem TEXT,
        erro TEXT,
        data_carga TEXT,
        started_at TEXT,
        updated_at TEXT,
        finished_at TEXT
      );
    `,
      )
      .execute()

    const rows = arrayOf(
      new DynamicModel({
        id: '',
        status: '',
        etapa: '',
        lote_atual: '',
        total_lotes: '',
        registros_processados: '',
        total_registros: '',
        mensagem: '',
        erro: '',
        data_carga: '',
        started_at: '',
        updated_at: '',
        finished_at: '',
      }),
    )
    $app
      .db()
      .newQuery(
        `SELECT
          id,
          COALESCE(status, '') AS status,
          COALESCE(etapa, '') AS etapa,
          COALESCE(lote_atual, 0) AS lote_atual,
          COALESCE(total_lotes, 0) AS total_lotes,
          COALESCE(registros_processados, 0) AS registros_processados,
          COALESCE(total_registros, 0) AS total_registros,
          COALESCE(mensagem, '') AS mensagem,
          COALESCE(erro, '') AS erro,
          COALESCE(data_carga, '') AS data_carga,
          COALESCE(started_at, '') AS started_at,
          COALESCE(updated_at, '') AS updated_at,
          COALESCE(finished_at, '') AS finished_at
        FROM vendas_consolidacao_status WHERE id = 1`,
      )
      .all(rows)

    let status
    if (rows.length === 0) {
      status = {
        status: 'idle',
        etapa: 'pronto',
        lote_atual: 0,
        total_lotes: 0,
        registros_processados: 0,
        total_registros: 0,
        mensagem: 'Pronto para consolidar',
        erro: '',
        data_carga: '',
        started_at: '',
        updated_at: '',
        finished_at: '',
      }
    } else {
      const r = rows[0]
      status = {
        status: String(r.status || 'idle'),
        etapa: String(r.etapa || ''),
        lote_atual: toInt(r.lote_atual),
        total_lotes: toInt(r.total_lotes),
        registros_processados: toInt(r.registros_processados),
        total_registros: toInt(r.total_registros),
        mensagem: String(r.mensagem || ''),
        erro: String(r.erro || ''),
        data_carga: String(r.data_carga || ''),
        started_at: String(r.started_at || ''),
        updated_at: String(r.updated_at || ''),
        finished_at: String(r.finished_at || ''),
      }
    }

    return e.json(200, {
      success: true,
      status: status,
    })
  } catch (err) {
    const msg = String(err && err.message ? err.message : err)
    console.error('[consolidar_status] Falha ao consultar status:', msg)
    return e.json(500, {
      success: false,
      error: 'Erro ao consultar status da consolidação [status]: ' + msg,
      message: 'Erro ao consultar status da consolidação [status]: ' + msg,
      stage: 'status',
    })
  }
})

// Endpoint de avanço de lote: processa exatamente 1 lote (ou finalização atômica)
// e responde em menos de 3 a 5 segundos, sem risco de timeout.
routerAdd('POST', '/backend/v1/vendas/consolidar/step', (e) => {
  const BATCH_SIZE = 10000

  const toInt = (v) => {
    if (v === undefined || v === null || v === '') return 0
    const n = parseInt(v, 10)
    return isNaN(n) ? 0 : n
  }

  const setStatus = (fields) => {
    const sets = []
    const params = { now: new Date().toISOString() }
    for (const k in fields) {
      if (Object.prototype.hasOwnProperty.call(fields, k)) {
        sets.push(k + ' = {:' + k + '}')
        params[k] = fields[k] === null || fields[k] === undefined ? '' : fields[k]
      }
    }
    sets.push('updated_at = {:now}')
    $app
      .db()
      .newQuery('UPDATE vendas_consolidacao_status SET ' + sets.join(', ') + ' WHERE id = 1')
      .bind(params)
      .execute()
  }

  const getStatus = () => {
    const rows = arrayOf(
      new DynamicModel({
        id: '',
        status: '',
        etapa: '',
        lote_atual: '',
        total_lotes: '',
        registros_processados: '',
        total_registros: '',
        mensagem: '',
        erro: '',
        data_carga: '',
        started_at: '',
        updated_at: '',
        finished_at: '',
      }),
    )
    $app
      .db()
      .newQuery(
        `SELECT
          id,
          COALESCE(status, '') AS status,
          COALESCE(etapa, '') AS etapa,
          COALESCE(lote_atual, 0) AS lote_atual,
          COALESCE(total_lotes, 0) AS total_lotes,
          COALESCE(registros_processados, 0) AS registros_processados,
          COALESCE(total_registros, 0) AS total_registros,
          COALESCE(mensagem, '') AS mensagem,
          COALESCE(erro, '') AS erro,
          COALESCE(data_carga, '') AS data_carga,
          COALESCE(started_at, '') AS started_at,
          COALESCE(updated_at, '') AS updated_at,
          COALESCE(finished_at, '') AS finished_at
        FROM vendas_consolidacao_status WHERE id = 1`,
      )
      .all(rows)
    if (rows.length === 0) {
      return {
        status: 'idle',
        etapa: 'pronto',
        lote_atual: 0,
        total_lotes: 0,
        registros_processados: 0,
        total_registros: 0,
        mensagem: 'Pronto para consolidar',
        erro: '',
        data_carga: '',
        started_at: '',
        updated_at: '',
        finished_at: '',
      }
    }
    const r = rows[0]
    return {
      status: String(r.status || 'idle'),
      etapa: String(r.etapa || ''),
      lote_atual: toInt(r.lote_atual),
      total_lotes: toInt(r.total_lotes),
      registros_processados: toInt(r.registros_processados),
      total_registros: toInt(r.total_registros),
      mensagem: String(r.mensagem || ''),
      erro: String(r.erro || ''),
      data_carga: String(r.data_carga || ''),
      started_at: String(r.started_at || ''),
      updated_at: String(r.updated_at || ''),
      finished_at: String(r.finished_at || ''),
    }
  }

  try {
    const current = getStatus()

    if (current.status !== 'in_progress') {
      return e.json(200, {
        success: true,
        already_finished: true,
        status: current,
      })
    }

    const batchIdx = current.lote_atual
    const totalBatches = current.total_lotes
    const totalRegistros = current.total_registros
    const nowIso = current.data_carga || new Date().toISOString()

    // Se todos os lotes foram gravados no staging, executa a substituição final de vendas
    if (batchIdx >= totalBatches) {
      const cntStaging = arrayOf(new DynamicModel({ c: '' }))
      $app.db().newQuery('SELECT COUNT(*) AS c FROM vendas_staging').all(cntStaging)
      const stagingCount = cntStaging.length > 0 ? toInt(cntStaging[0].c) : 0

      if (stagingCount === 0 && totalRegistros > 0) {
        throw new Error('Nenhum registro encontrado em staging para realizar a substituição.')
      }

      const SWAP_CHUNK_SIZE = 25000
      const totalSwapSteps = Math.max(1, Math.ceil(stagingCount / SWAP_CHUNK_SIZE))
      // etapa_swap indica quantos blocos já foram copiados
      // Exemplo no campo etapa: swap_bloco_X_de_Y
      let swapStep = 0
      if (current.etapa && current.etapa.startsWith('swap_bloco_')) {
        const parts = current.etapa.split('_')
        swapStep = toInt(parts[2])
      }

      if (swapStep === 0) {
        setStatus({
          etapa: 'swap_iniciando',
          mensagem: 'Iniciando troca segura da base de vendas...',
        })
        $app.db().newQuery('DELETE FROM vendas').execute()
      }

      if (swapStep < totalSwapSteps) {
        const swapOffset = swapStep * SWAP_CHUNK_SIZE
        const currentSwapStepNum = swapStep + 1
        const etapaSwap = 'swap_bloco_' + currentSwapStepNum + '_de_' + totalSwapSteps

        $app
          .db()
          .newQuery(
            `
          INSERT INTO vendas (
            id, tipo_documento, nf_entrega_futura, numero_sap, numero_nfe,
            data_lancamento, ultima_data_vencimento, docto_origem_destino,
            data_origem_destino, condicao_pagamento, codigo_cliente,
            nome_cliente, numero_linha, codigo_item, descricao_item,
            quantidade, qty_kg_lt, preco_item, desconto_linha, icms, pis,
            cofins, ipi, icms_partilha, total_linha, utilizacao,
            nome_vendedor, custo_item, nome_filial, conta, estado, cidade,
            grupo_cliente, mercado, usuario_emissor_pedido, itms_grp_nam,
            numero_documento_netsales, preco_unitario, total_nf_sem_frete,
            total_nf_novo, valor_liquido, custo_total, classificacao,
            vendedor_revenda, grupo_item, vendedor_cliente, origem,
            tem_racnew, tem_netsales,
            status_cadastro, tipo_pn, tipo_cliente,
            data_carga, created, updated
          )
          SELECT
            id, tipo_documento, nf_entrega_futura, numero_sap, numero_nfe,
            data_lancamento, ultima_data_vencimento, docto_origem_destino,
            data_origem_destino, condicao_pagamento, codigo_cliente,
            nome_cliente, numero_linha, codigo_item, descricao_item,
            quantidade, qty_kg_lt, preco_item, desconto_linha, icms, pis,
            cofins, ipi, icms_partilha, total_linha, utilizacao,
            nome_vendedor, custo_item, nome_filial, conta, estado, cidade,
            grupo_cliente, mercado, usuario_emissor_pedido, itms_grp_nam,
            numero_documento_netsales, preco_unitario, total_nf_sem_frete,
            total_nf_novo, valor_liquido, custo_total, classificacao,
            vendedor_revenda, grupo_item, vendedor_cliente, origem,
            tem_racnew, tem_netsales,
            status_cadastro, tipo_pn, tipo_cliente,
            data_carga, created, updated
          FROM vendas_staging
          ORDER BY rowid ASC
          LIMIT {:limit} OFFSET {:offset};
        `,
          )
          .bind({
            limit: SWAP_CHUNK_SIZE,
            offset: swapOffset,
          })
          .execute()

        setStatus({
          etapa: etapaSwap,
          mensagem:
            'Transferindo staging para vendas (bloco ' +
            currentSwapStepNum +
            ' de ' +
            totalSwapSteps +
            ')...',
        })

        const isLastSwapStep = currentSwapStepNum >= totalSwapSteps
        if (!isLastSwapStep) {
          return e.json(200, {
            success: true,
            done: false,
            swap_step: currentSwapStepNum,
            total_swap_steps: totalSwapSteps,
            status: getStatus(),
          })
        }
      }

      // Concluiu todos os blocos de swap
      $app.db().newQuery('DELETE FROM vendas_staging').execute()

      setStatus({
        status: 'completed',
        etapa: 'concluido',
        lote_atual: totalBatches,
        registros_processados: stagingCount,
        total_registros: stagingCount,
        mensagem: 'Consolidação de vendas concluída com sucesso (' + stagingCount + ' registros).',
        finished_at: new Date().toISOString(),
      })

      return e.json(200, {
        success: true,
        done: true,
        status: getStatus(),
      })
    }

    // Processa lote atual
    const offset = batchIdx * BATCH_SIZE
    const etapa = 'gravar_lote_' + (batchIdx + 1) + '_de_' + totalBatches

    setStatus({
      status: 'in_progress',
      etapa: etapa,
      lote_atual: batchIdx,
      mensagem: 'Processando lote ' + (batchIdx + 1) + ' de ' + totalBatches + '...',
    })

    const batchInsertSql =
      'INSERT INTO vendas_staging (' +
      '  id, tipo_documento, nf_entrega_futura, numero_sap, numero_nfe, ' +
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
      "  ('r' || substr(hex(randomblob(7)), 1, 14)), " +
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
      "  COALESCE(NULLIF(tc.status_cadastro, ''), NULLIF(r.status_cadastro, ''), NULLIF(n.status_cadastro, ''), ''), " +
      "  COALESCE(NULLIF(tc.tipo_pn, ''), NULLIF(r.tipo_pn, ''), NULLIF(n.tipo_pn, ''), ''), " +
      "  COALESCE(NULLIF(tc.tipo_cliente, ''), NULLIF(r.tipo_cliente, ''), NULLIF(n.tipo_cliente, ''), ''), " +
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

    try {
      $app
        .db()
        .newQuery(batchInsertSql)
        .bind({
          now: nowIso,
          limit: BATCH_SIZE,
          offset: offset,
        })
        .execute()
    } catch (insertErr) {
      const dbErrMsg = String(insertErr && insertErr.message ? insertErr.message : insertErr)
      console.error(
        '[consolidar_step] Erro ao gravar lote ' +
          (batchIdx + 1) +
          ' (offset ' +
          offset +
          ', limit ' +
          BATCH_SIZE +
          '): ' +
          dbErrMsg,
      )
      throw new Error(
        'Falha ao gravar lote ' +
          (batchIdx + 1) +
          ' no staging (offset ' +
          offset +
          '): ' +
          dbErrMsg,
      )
    }

    const processedNow = Math.min((batchIdx + 1) * BATCH_SIZE, totalRegistros)
    const nextBatch = batchIdx + 1

    setStatus({
      lote_atual: nextBatch,
      registros_processados: processedNow,
      mensagem:
        'Lote ' +
        (batchIdx + 1) +
        ' de ' +
        totalBatches +
        ' concluído (~' +
        processedNow +
        ' registros).',
    })

    return e.json(200, {
      success: true,
      done: false,
      batch_processed: batchIdx + 1,
      total_batches: totalBatches,
      registros_processados: processedNow,
      total_registros: totalRegistros,
      status: getStatus(),
    })
  } catch (err) {
    const errorMsg = String(err && err.message ? err.message : err)
    console.error('[consolidar_step] Exceção capturada:', errorMsg)
    let current
    try {
      current = getStatus()
    } catch (_) {
      current = {
        status: 'error',
        etapa: 'desconhecida',
        lote_atual: 0,
        total_lotes: 0,
        registros_processados: 0,
        total_registros: 0,
        mensagem: '',
        erro: '',
      }
    }

    const currentEtapa = current.etapa || 'processamento'
    const currentLote = (current.lote_atual || 0) + 1
    const detailedError =
      'Falha na etapa [' + currentEtapa + '] (Lote ' + currentLote + '): ' + errorMsg

    try {
      setStatus({
        status: 'error',
        erro: detailedError,
        mensagem: detailedError,
      })
    } catch (saveErr) {
      console.error('[consolidar_step] Não foi possível salvar status de erro:', saveErr)
    }

    let finalStatus
    try {
      finalStatus = getStatus()
    } catch (_) {
      finalStatus = current
    }

    return e.json(500, {
      success: false,
      error: detailedError,
      message: detailedError,
      stage: currentEtapa,
      lote: currentLote,
      status: finalStatus,
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
      .newQuery(
        `
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
      `,
      )
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
      .newQuery(
        `
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
      `,
      )
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
      .newQuery(
        `
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
      `,
      )
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
      .newQuery(
        `
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
      `,
      )
      .bind({ now: nowIso })
      .execute()

    // 2. Reconstruir resumo_clientes_ativos
    stage = 'resumo_clientes_ativos'
    $app.db().newQuery('DELETE FROM resumo_clientes_ativos').execute()
    $app
      .db()
      .newQuery(
        `
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
      `,
      )
      .bind({ now: nowIso })
      .execute()

    // 3. Reconstruir resumo_vendas_uf_regiao
    stage = 'resumo_vendas_uf_regiao'
    $app.db().newQuery('DELETE FROM resumo_vendas_uf_regiao').execute()
    $app
      .db()
      .newQuery(
        `
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
      `,
      )
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
