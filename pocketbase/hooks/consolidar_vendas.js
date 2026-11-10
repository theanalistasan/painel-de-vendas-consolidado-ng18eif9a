// Endpoint: POST /backend/v1/vendas/consolidar
// Endpoint: GET  /backend/v1/vendas/consolidar/status
// Endpoint: POST /backend/v1/vendas/consolidar/step
// Endpoint: POST /backend/v1/vendas/reconstruir-resumos
//
// FONTE ÚNICA (NetSales_v4): consolida a coleção `vendas` a partir de
// `netsales` (staging da carga NetSales_v4), com grupo_item da Produtos
// (join por codigo_item), tipos de cliente (join codigo_pn = codigo_cliente)
// e vendedor via vendedor_revenda. Não existe mais join RacNew ↔ NetSales.
//
// Marcadores: tem_racnew = 0 (RacNew deixou de existir); tem_netsales = 1.
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
    // O join real usa UPPER(TRIM(tc.codigo_pn)) = UPPER(TRIM(n.codigo_cliente)):
    // índice de coluna simples não é usado pelo SQLite aqui — só o de expressão é.
    try {
      $app
        .db()
        .newQuery(
          'CREATE INDEX IF NOT EXISTS idx_tipos_cliente_codigo_pn_norm ON tipos_cliente (UPPER(TRIM(codigo_pn)));',
        )
        .execute()
    } catch (_) {}
    // Chaves do filtro de roteamento fora-da-janela em vendas_historico
    // (findRecordsByFilter por numero_sap/numero_nfe/codigo_item/codigo_cliente)
    try {
      $app
        .db()
        .newQuery(
          'CREATE INDEX IF NOT EXISTS idx_vh_routing_keys ON vendas_historico (numero_sap, numero_nfe, codigo_item, codigo_cliente);',
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

    // Contagem de NetSales_v4 elegível (fonte única — não existe mais RacNew)
    const totalRacnewRows = arrayOf(new DynamicModel({ total: '' }))
    $app
      .db()
      .newQuery(
        "SELECT COUNT(*) AS total FROM netsales WHERE UPPER(TRIM(COALESCE(codigo_item, ''))) != 'SERVICOS'",
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
        mensagem: 'Nenhum registro encontrado em NetSales_v4 (netsales).',
        data_carga: nowIso,
        finished_at: nowIso,
      })

      return e.json(200, {
        success: true,
        started: true,
        total_consolidado: 0,
        data_carga: nowIso,
        message: 'Nenhum registro encontrado na base NetSales_v4 (netsales) para consolidar.',
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

  // Helper da janela dinâmica inline (regra: dois anos anteriores + ano atual = 3 anos)
  const getJanelaDinamica = () => {
    const anoFim = new Date().getFullYear()
    const anoInicio = anoFim - 2
    return {
      anoInicio,
      anoFim,
      inicioISO: `${anoInicio}-01-01`,
      fimISO: `${anoFim}-12-31`,
    }
  }

  const isForaDaJanela = (dataLancamento) => {
    if (!dataLancamento || typeof dataLancamento !== 'string') return false
    const d = dataLancamento.trim().slice(0, 10)
    if (d.length < 10) return false
    const { inicioISO } = getJanelaDinamica()
    return d < inicioISO
  }

  const toInt = (v) => {
    if (v === undefined || v === null || v === '') return 0
    const n = parseInt(v, 10)
    return isNaN(n) ? 0 : n
  }

  const toNum = (v) => {
    if (v === undefined || v === null || v === '') return 0
    const n = parseFloat(v)
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
          WHERE SUBSTR(TRIM(COALESCE(data_lancamento, '')), 1, 10) >= {:inicioJanela}
          ORDER BY rowid ASC
          LIMIT {:limit} OFFSET {:offset};
        `,
          )
          .bind({
            inicioJanela: getJanelaDinamica().inicioISO,
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

      // Consolidação concluída: invalida o cache de opções dinâmicas dos filtros
      // (30 min) e o cache do dashboard (5 min) para refletir os dados novos.
      try {
        if (typeof globalThis !== 'undefined' && globalThis.__skipFilterOptionsCache) {
          globalThis.__skipFilterOptionsCache = new Map()
          console.log(
            'consolidar_vendas: __skipFilterOptionsCache invalidado (consolidação concluída)',
          )
        }
      } catch (cacheErr) {
        console.warn('consolidar_vendas: falha ao invalidar cache de opções:', cacheErr)
      }
      try {
        if (typeof globalThis !== 'undefined' && globalThis.__skipDashboardCache) {
          globalThis.__skipDashboardCache.clear()
          console.log('consolidar_vendas: __skipDashboardCache invalidado (consolidação concluída)')
        }
      } catch (dashCacheErr) {
        console.warn('consolidar_vendas: falha ao invalidar cache do dashboard:', dashCacheErr)
      }

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

    // Seleciona os registros consolidados deste lote
    // FONTE ÚNICA NetSales_v4: n = netsales (carga v4); p = produtos (grupo do
    // item por codigo_item); tc = tipos_cliente (tipo do cliente por codigo_pn).
    // Vendedor: coluna "Revenda" da planilha; quando vazia (venda direta),
    // cai para o próprio cliente -> regra de Não Comissionado (vendedor = cliente).
    const batchSelectSql =
      'SELECT ' +
      "  ('r' || substr(hex(randomblob(7)), 1, 14)) AS id, " +
      "  COALESCE(NULLIF(TRIM(n.tipo), ''), 'NF') AS tipo_documento, " +
      "  '' AS nf_entrega_futura, " +
      '  n.chave_documento AS numero_sap, n.serial AS numero_nfe, ' +
      '  n.docdate AS data_lancamento, ' +
      "  '' AS ultima_data_vencimento, '' AS docto_origem_destino, '' AS data_origem_destino, " +
      "  '' AS condicao_pagamento, n.codigo_cliente, n.nome_cliente, " +
      "  0.0 AS numero_linha, n.codigo_item, COALESCE(n.descrip, '') AS descricao_item, " +
      '  COALESCE(n.quantidade, 0.0) AS quantidade, 0.0 AS qty_kg_lt, 0.0 AS preco_item, ' +
      '  0.0 AS desconto_linha, 0.0 AS icms, 0.0 AS pis, ' +
      '  0.0 AS cofins, 0.0 AS ipi, 0.0 AS icms_partilha, ' +
      "  COALESCE(n.valor_mercadoria, 0.0) AS total_linha, COALESCE(n.usage, '') AS utilizacao, " +
      "  COALESCE(NULLIF(TRIM(n.revenda), ''), n.nome_cliente) AS nome_vendedor, " +
      '  0.0 AS custo_item, ' +
      "  '' AS nome_filial, '' AS conta, " +
      "  COALESCE(n.estado, '') AS estado, COALESCE(n.municipio, '') AS cidade, " +
      "  COALESCE(n.grupo_cliente, '') AS grupo_cliente, COALESCE(n.mercado, '') AS mercado, " +
      "  COALESCE(n.usuario_emissor, '') AS usuario_emissor_pedido, COALESCE(n.itms_grp_nam, '') AS itms_grp_nam, " +
      "  COALESCE(n.numero_documento, '') AS numero_documento_netsales, COALESCE(n.preco_unitario, 0.0) AS preco_unitario, " +
      '  COALESCE(n.total_nf_sem_frete, 0.0) AS total_nf_sem_frete, COALESCE(n.total_nf_novo, 0.0) AS total_nf_novo, ' +
      '  COALESCE(n.valor_liquido, 0.0) AS valor_liquido, COALESCE(n.custo_total, 0.0) AS custo_total, ' +
      "  COALESCE(n.classificacao, '') AS classificacao, COALESCE(n.vendedor_revenda, '') AS vendedor_revenda, " +
      "  COALESCE(NULLIF(p.grupo_item, ''), NULLIF(n.itms_grp_nam, ''), 'Não Categorizado') AS grupo_item, " +
      "  (COALESCE(NULLIF(TRIM(n.revenda), ''), n.nome_cliente) || ' > ' || n.nome_cliente) AS vendedor_cliente, " +
      "  'Consolidado' AS origem, " +
      '  0 AS tem_racnew, 1 AS tem_netsales, ' +
      "  COALESCE(NULLIF(tc.status_cadastro, ''), NULLIF(n.status_cadastro, ''), '') AS status_cadastro, " +
      "  COALESCE(NULLIF(tc.tipo_pn, ''), NULLIF(n.tipo_pn, ''), '') AS tipo_pn, " +
      "  COALESCE(NULLIF(tc.tipo_cliente, ''), NULLIF(n.tipo_cliente, ''), '') AS tipo_cliente " +
      'FROM (' +
      '  SELECT * FROM netsales ' +
      "  WHERE UPPER(TRIM(COALESCE(codigo_item, ''))) != 'SERVICOS' " +
      '  ORDER BY id ASC ' +
      '  LIMIT {:limit} OFFSET {:offset}' +
      ') n ' +
      'LEFT JOIN produtos p ' +
      '  ON p.codigo_item = n.codigo_item ' +
      'LEFT JOIN tipos_cliente tc ' +
      '  ON UPPER(TRIM(tc.codigo_pn)) = UPPER(TRIM(n.codigo_cliente))'

    try {
      const calculatedRows = arrayOf(
        new DynamicModel({
          id: '',
          tipo_documento: '',
          nf_entrega_futura: '',
          numero_sap: '',
          numero_nfe: '',
          data_lancamento: '',
          ultima_data_vencimento: '',
          docto_origem_destino: '',
          data_origem_destino: '',
          condicao_pagamento: '',
          codigo_cliente: '',
          nome_cliente: '',
          numero_linha: '',
          codigo_item: '',
          descricao_item: '',
          quantidade: '',
          qty_kg_lt: '',
          preco_item: '',
          desconto_linha: '',
          icms: '',
          pis: '',
          cofins: '',
          ipi: '',
          icms_partilha: '',
          total_linha: '',
          utilizacao: '',
          nome_vendedor: '',
          custo_item: '',
          nome_filial: '',
          conta: '',
          estado: '',
          cidade: '',
          grupo_cliente: '',
          mercado: '',
          usuario_emissor_pedido: '',
          itms_grp_nam: '',
          numero_documento_netsales: '',
          preco_unitario: '',
          total_nf_sem_frete: '',
          total_nf_novo: '',
          valor_liquido: '',
          custo_total: '',
          classificacao: '',
          vendedor_revenda: '',
          grupo_item: '',
          vendedor_cliente: '',
          origem: '',
          tem_racnew: '',
          tem_netsales: '',
          status_cadastro: '',
          tipo_pn: '',
          tipo_cliente: '',
        }),
      )

      $app
        .db()
        .newQuery(batchSelectSql)
        .bind({
          limit: BATCH_SIZE,
          offset: offset,
        })
        .all(calculatedRows)

      if (!calculatedRows || calculatedRows.length === 0) {
        console.warn(
          '[consolidar_step] Lote ' +
            (batchIdx + 1) +
            ' sem linhas retornadas pela query (calculatedRows vazio, offset ' +
            offset +
            '). Avançando lote.',
        )
        const processedNowEmpty = Math.min((batchIdx + 1) * BATCH_SIZE, totalRegistros)
        const nextBatchEmpty = batchIdx + 1
        setStatus({
          lote_atual: nextBatchEmpty,
          registros_processados: processedNowEmpty,
          mensagem:
            'Lote ' +
            (batchIdx + 1) +
            ' de ' +
            totalBatches +
            ' concluído (~' +
            processedNowEmpty +
            ' registros).',
        })
        return e.json(200, {
          success: true,
          done: false,
          batch_processed: batchIdx + 1,
          total_batches: totalBatches,
          registros_processados: processedNowEmpty,
          total_registros: totalRegistros,
          status: getStatus(),
        })
      }

      let historicoCol = null
      try {
        historicoCol = $app.findCollectionByNameOrId('vendas_historico')
      } catch (_) {}

      for (let i = 0; i < calculatedRows.length; i++) {
        const row = calculatedRows[i]
        const dataLanc = (row.data_lancamento || '').toString().trim()
        const foraDaJanela = isForaDaJanela(dataLanc)

        if (foraDaJanela) {
          // Roteia para vendas_historico por chave composta
          const numeroSap = (row.numero_sap || '').toString().trim()
          const numeroNfe = (row.numero_nfe || '').toString().trim()
          const codigoItem = (row.codigo_item || '').toString().trim()
          const codigoCliente = (row.codigo_cliente || '').toString().trim()

          const filter =
            "numero_sap = '" +
            numeroSap +
            "' && numero_nfe = '" +
            numeroNfe +
            "' && codigo_item = '" +
            codigoItem +
            "' && codigo_cliente = '" +
            codigoCliente +
            "'"
          let found = []
          try {
            found = $app.findRecordsByFilter('vendas_historico', filter, '', 1, 0) || []
          } catch (fErr) {
            found = []
          }

          let record
          if (found && found.length > 0) {
            record = found[0]
          } else {
            record = new Record(historicoCol)
          }

          record.set('tipo_documento', (row.tipo_documento || '').toString().trim())
          record.set('nf_entrega_futura', (row.nf_entrega_futura || '').toString().trim())
          record.set('numero_sap', numeroSap)
          record.set('numero_nfe', numeroNfe)
          record.set('data_lancamento', dataLanc)
          record.set('ultima_data_vencimento', (row.ultima_data_vencimento || '').toString().trim())
          record.set('docto_origem_destino', (row.docto_origem_destino || '').toString().trim())
          record.set('data_origem_destino', (row.data_origem_destino || '').toString().trim())
          record.set('condicao_pagamento', (row.condicao_pagamento || '').toString().trim())
          record.set('codigo_cliente', codigoCliente)
          record.set('nome_cliente', (row.nome_cliente || '').toString().trim())
          record.set('numero_linha', toNum(row.numero_linha))
          record.set('codigo_item', codigoItem)
          record.set('descricao_item', (row.descricao_item || '').toString().trim())
          record.set('quantidade', toNum(row.quantidade))
          record.set('qty_kg_lt', toNum(row.qty_kg_lt))
          record.set('preco_item', toNum(row.preco_item))
          record.set('desconto_linha', toNum(row.desconto_linha))
          record.set('icms', toNum(row.icms))
          record.set('pis', toNum(row.pis))
          record.set('cofins', toNum(row.cofins))
          record.set('ipi', toNum(row.ipi))
          record.set('icms_partilha', toNum(row.icms_partilha))
          record.set('total_linha', toNum(row.total_linha))
          record.set('utilizacao', (row.utilizacao || '').toString().trim())
          record.set('nome_vendedor', (row.nome_vendedor || '').toString().trim())
          record.set('custo_item', toNum(row.custo_item))
          record.set('nome_filial', (row.nome_filial || '').toString().trim())
          record.set('conta', (row.conta || '').toString().trim())
          record.set('estado', (row.estado || '').toString().trim())
          record.set('cidade', (row.cidade || '').toString().trim())
          record.set('grupo_cliente', (row.grupo_cliente || '').toString().trim())
          record.set('mercado', (row.mercado || '').toString().trim())
          record.set('usuario_emissor_pedido', (row.usuario_emissor_pedido || '').toString().trim())
          record.set('itms_grp_nam', (row.itms_grp_nam || '').toString().trim())
          record.set(
            'numero_documento_netsales',
            (row.numero_documento_netsales || '').toString().trim(),
          )
          record.set('preco_unitario', toNum(row.preco_unitario))
          record.set('total_nf_sem_frete', toNum(row.total_nf_sem_frete))
          record.set('total_nf_novo', toNum(row.total_nf_novo))
          record.set('valor_liquido', toNum(row.valor_liquido))
          record.set('custo_total', toNum(row.custo_total))
          record.set('classificacao', (row.classificacao || '').toString().trim())
          record.set('vendedor_revenda', (row.vendedor_revenda || '').toString().trim())
          record.set('grupo_item', (row.grupo_item || '').toString().trim())
          record.set('vendedor_cliente', (row.vendedor_cliente || '').toString().trim())
          record.set('origem', 'Consolidado')
          record.set('data_carga', nowIso)
          // Preserva proveniência do cálculo de consolidação
          record.set('tem_racnew', toInt(row.tem_racnew) === 1)
          record.set('tem_netsales', toInt(row.tem_netsales) === 1)
          record.set('status_cadastro', (row.status_cadastro || '').toString().trim())
          record.set('tipo_pn', (row.tipo_pn || '').toString().trim())
          record.set('tipo_cliente', (row.tipo_cliente || '').toString().trim())

          $app.save(record)
        } else {
          // Dentro da janela dinâmica -> grava no staging de vendas para fluxo normal
          $app
            .db()
            .newQuery(
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
                ') VALUES (' +
                '  {:id}, {:tipo_documento}, {:nf_entrega_futura}, {:numero_sap}, {:numero_nfe}, ' +
                '  {:data_lancamento}, {:ultima_data_vencimento}, {:docto_origem_destino}, ' +
                '  {:data_origem_destino}, {:condicao_pagamento}, {:codigo_cliente}, ' +
                '  {:nome_cliente}, {:numero_linha}, {:codigo_item}, {:descricao_item}, ' +
                '  {:quantidade}, {:qty_kg_lt}, {:preco_item}, {:desconto_linha}, {:icms}, {:pis}, ' +
                '  {:cofins}, {:ipi}, {:icms_partilha}, {:total_linha}, {:utilizacao}, ' +
                '  {:nome_vendedor}, {:custo_item}, {:nome_filial}, {:conta}, {:estado}, {:cidade}, ' +
                '  {:grupo_cliente}, {:mercado}, {:usuario_emissor_pedido}, {:itms_grp_nam}, ' +
                '  {:numero_documento_netsales}, {:preco_unitario}, {:total_nf_sem_frete}, ' +
                '  {:total_nf_novo}, {:valor_liquido}, {:custo_total}, {:classificacao}, ' +
                '  {:vendedor_revenda}, {:grupo_item}, {:vendedor_cliente}, {:origem}, ' +
                '  {:tem_racnew}, {:tem_netsales}, ' +
                '  {:status_cadastro}, {:tipo_pn}, {:tipo_cliente}, ' +
                '  {:now}, {:now}, {:now}' +
                ')',
            )
            .bind({
              id: row.id,
              tipo_documento: row.tipo_documento || '',
              nf_entrega_futura: row.nf_entrega_futura || '',
              numero_sap: row.numero_sap || '',
              numero_nfe: row.numero_nfe || '',
              data_lancamento: dataLanc,
              ultima_data_vencimento: row.ultima_data_vencimento || '',
              docto_origem_destino: row.docto_origem_destino || '',
              data_origem_destino: row.data_origem_destino || '',
              condicao_pagamento: row.condicao_pagamento || '',
              codigo_cliente: row.codigo_cliente || '',
              nome_cliente: row.nome_cliente || '',
              numero_linha: toNum(row.numero_linha),
              codigo_item: row.codigo_item || '',
              descricao_item: row.descricao_item || '',
              quantidade: toNum(row.quantidade),
              qty_kg_lt: toNum(row.qty_kg_lt),
              preco_item: toNum(row.preco_item),
              desconto_linha: toNum(row.desconto_linha),
              icms: toNum(row.icms),
              pis: toNum(row.pis),
              cofins: toNum(row.cofins),
              ipi: toNum(row.ipi),
              icms_partilha: toNum(row.icms_partilha),
              total_linha: toNum(row.total_linha),
              utilizacao: row.utilizacao || '',
              nome_vendedor: row.nome_vendedor || '',
              custo_item: toNum(row.custo_item),
              nome_filial: row.nome_filial || '',
              conta: row.conta || '',
              estado: row.estado || '',
              cidade: row.cidade || '',
              grupo_cliente: row.grupo_cliente || '',
              mercado: row.mercado || '',
              usuario_emissor_pedido: row.usuario_emissor_pedido || '',
              itms_grp_nam: row.itms_grp_nam || '',
              numero_documento_netsales: row.numero_documento_netsales || '',
              preco_unitario: toNum(row.preco_unitario),
              total_nf_sem_frete: toNum(row.total_nf_sem_frete),
              total_nf_novo: toNum(row.total_nf_novo),
              valor_liquido: toNum(row.valor_liquido),
              custo_total: toNum(row.custo_total),
              classificacao: row.classificacao || '',
              vendedor_revenda: row.vendedor_revenda || '',
              grupo_item: row.grupo_item || 'Não Categorizado',
              vendedor_cliente: row.vendedor_cliente || '',
              origem: 'Consolidado',
              tem_racnew: toInt(row.tem_racnew),
              tem_netsales: toInt(row.tem_netsales),
              status_cadastro: row.status_cadastro || '',
              tipo_pn: row.tipo_pn || '',
              tipo_cliente: row.tipo_cliente || '',
              now: nowIso,
            })
            .execute()
        }
      }
    } catch (insertErr) {
      const dbErrMsg = String(insertErr && insertErr.message ? insertErr.message : insertErr)
      if (dbErrMsg.indexOf('no rows in result set') >= 0) {
        console.warn(
          '[consolidar_step] lote sem linhas, avançando: ' +
            dbErrMsg +
            ' (lote ' +
            (batchIdx + 1) +
            ', offset ' +
            offset +
            ')',
        )
        const processedNowNoRows = Math.min((batchIdx + 1) * BATCH_SIZE, totalRegistros)
        const nextBatchNoRows = batchIdx + 1
        setStatus({
          lote_atual: nextBatchNoRows,
          registros_processados: processedNowNoRows,
          mensagem:
            'Lote ' +
            (batchIdx + 1) +
            ' de ' +
            totalBatches +
            ' concluído (~' +
            processedNowNoRows +
            ' registros).',
        })
        return e.json(200, {
          success: true,
          done: false,
          batch_processed: batchIdx + 1,
          total_batches: totalBatches,
          registros_processados: processedNowNoRows,
          total_registros: totalRegistros,
          status: getStatus(),
        })
      }

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
// de forma modular por etapa, evitando timeouts HTTP de requisições monolíticas com centenas de milhares de linhas.
//
// Suporta:
// - Sem parâmetro ou step='all': executa todo o fluxo (para rotinas de cron / cli)
// - step='setup': cria tabelas e índices se não existirem
// - step='vendas_mensal_init': limpa resumo_vendas_mensal
// - step='vendas_mensal_ano': processa resumo_vendas_mensal para um ano específico (ex: ano=2026)
// - step='clientes_ativos': processa resumo_clientes_ativos completo
// - step='vendas_uf_regiao': processa resumo_vendas_uf_regiao completo
// - step='list_anos': descobre anos presentes na tabela vendas
routerAdd('POST', '/backend/v1/vendas/reconstruir-resumos', (e) => {
  const startTime = Date.now()
  const nowIso = new Date().toISOString()
  let stage = 'iniciar'

  const ensureTablesAndIndexes = () => {
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
  }

  const runVendasMensalAno = (ano) => {
    stage = 'resumo_vendas_mensal_ano_' + ano
    const anoInt = parseInt(ano, 10)
    const anoStr = String(anoInt)
    const startDate = anoStr + '-01-01'
    const endDate = anoStr + '-12-31 23:59:59'

    // Limpa registros do ano antes de inserir para idempotência
    $app
      .db()
      .newQuery('DELETE FROM resumo_vendas_mensal WHERE ano = {:ano}')
      .bind({ ano: anoInt })
      .execute()

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
        WHERE data_lancamento >= {:startDate} AND data_lancamento <= {:endDate}
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
      .bind({
        now: nowIso,
        startDate: startDate,
        endDate: endDate,
      })
      .execute()
  }

  const runClientesAtivos = () => {
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
  }

  const runVendasUfRegiao = () => {
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
  }

  try {
    let body = {}
    try {
      const parsed = e.requestInfo().body
      if (parsed && typeof parsed === 'object') body = parsed
    } catch (_) {}

    const step = (body.step || e.request.url.query().get('step') || 'all').trim()
    const targetAno = body.ano || e.request.url.query().get('ano')

    if (step === 'setup') {
      ensureTablesAndIndexes()
      return e.json(200, {
        success: true,
        step: 'setup',
        message: 'Tabelas e índices de resumo configurados com sucesso.',
        durationMs: Date.now() - startTime,
      })
    }

    if (step === 'list_anos') {
      ensureTablesAndIndexes()
      stage = 'descobrir_anos'
      const rows = arrayOf(new DynamicModel({ ano: '' }))
      $app
        .db()
        .newQuery(
          "SELECT DISTINCT CAST(substr(data_lancamento, 1, 4) AS INTEGER) AS ano FROM vendas WHERE data_lancamento IS NOT NULL AND data_lancamento >= '2015-01-01' ORDER BY ano ASC",
        )
        .all(rows)
      const anos = []
      for (let i = 0; i < rows.length; i++) {
        const a = parseInt(rows[i].ano, 10)
        if (a && a >= 2015) anos.push(a)
      }
      return e.json(200, {
        success: true,
        step: 'list_anos',
        anos: anos,
        durationMs: Date.now() - startTime,
      })
    }

    if (step === 'vendas_mensal_init') {
      ensureTablesAndIndexes()
      stage = 'vendas_mensal_init'
      $app.db().newQuery('DELETE FROM resumo_vendas_mensal').execute()
      return e.json(200, {
        success: true,
        step: 'vendas_mensal_init',
        message: 'Tabela resumo_vendas_mensal limpa com sucesso.',
        durationMs: Date.now() - startTime,
      })
    }

    if (step === 'vendas_mensal_ano') {
      ensureTablesAndIndexes()
      const anoVal = parseInt(targetAno, 10)
      if (!anoVal || isNaN(anoVal)) {
        return e.json(400, {
          success: false,
          error: "O parâmetro 'ano' é obrigatório para step='vendas_mensal_ano'.",
          stage: 'validar_ano',
        })
      }
      runVendasMensalAno(anoVal)
      return e.json(200, {
        success: true,
        step: 'vendas_mensal_ano',
        ano: anoVal,
        message: 'Resumo mensal do ano ' + anoVal + ' processado com sucesso.',
        durationMs: Date.now() - startTime,
      })
    }

    if (step === 'clientes_ativos') {
      ensureTablesAndIndexes()
      runClientesAtivos()
      return e.json(200, {
        success: true,
        step: 'clientes_ativos',
        message: 'Resumo de clientes ativos reconstruído com sucesso.',
        durationMs: Date.now() - startTime,
      })
    }

    if (step === 'vendas_uf_regiao') {
      ensureTablesAndIndexes()
      runVendasUfRegiao()
      return e.json(200, {
        success: true,
        step: 'vendas_uf_regiao',
        message: 'Resumo de vendas por UF e Região reconstruído com sucesso.',
        durationMs: Date.now() - startTime,
      })
    }

    // Fluxo monolítico legado (step === 'all')
    ensureTablesAndIndexes()
    stage = 'resumo_vendas_mensal'
    $app.db().newQuery('DELETE FROM resumo_vendas_mensal').execute()
    // Processa por anos sequencialmente no backend para não estourar locks
    const rowsAnos = arrayOf(new DynamicModel({ ano: '' }))
    $app
      .db()
      .newQuery(
        "SELECT DISTINCT CAST(substr(data_lancamento, 1, 4) AS INTEGER) AS ano FROM vendas WHERE data_lancamento IS NOT NULL AND data_lancamento >= '2015-01-01' ORDER BY ano ASC",
      )
      .all(rowsAnos)
    for (let i = 0; i < rowsAnos.length; i++) {
      const a = parseInt(rowsAnos[i].ano, 10)
      if (a && a >= 2015) {
        runVendasMensalAno(a)
      }
    }
    runClientesAtivos()
    runVendasUfRegiao()

    const durationMs = Date.now() - startTime

    return e.json(200, {
      success: true,
      step: 'all',
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
