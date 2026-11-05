// Endpoint: POST /backend/v1/vendas/migrar-historico          (inicia/retoma)
// Endpoint: GET  /backend/v1/vendas/migrar-historico/status   (progresso persistido)
// Endpoint: POST /backend/v1/vendas/migrar-historico/step     (move 1 lote por chamada)
//
// ETAPA 1 da segregação de dados históricos (decisão do usuário):
// move, em lotes curtos e SOB COMANDO DO USUÁRIO (nada roda no deploy), os
// registros de `vendas` com data_lancamento < 2025-01-01 para a coleção
// `vendas_historico` (criada pela migration 1740900019).
//
// IDEMPOTÊNCIA: só move registros cujo id AINDA NÃO existe em vendas_historico
// (NOT EXISTS por chave primária). Reexecutar não duplica nem move de novo.
//
// Mesmo padrão de execução segura da consolidação (consolidar_vendas.js):
// status persistido em tabela SQLite própria, 1 lote por chamada HTTP
// (< 3-5s), sem risco de timeout. Nenhuma query de KPI/relatório é alterada.
//
// IMPORTANTE: o JSVM do PocketBase executa callbacks em pools separados —
// TODA a lógica vai inline dentro de cada callback (sem helpers top-level).

// ---- POST /backend/v1/vendas/migrar-historico (iniciar/retomar) ----
routerAdd('POST', '/backend/v1/vendas/migrar-historico', function (e) {
  const BATCH_SIZE = 5000
  const CORTE = '2025-01-01'

  const toInt = function (v) {
    if (v === undefined || v === null || v === '') return 0
    const n = parseInt(v, 10)
    return isNaN(n) ? 0 : n
  }

  try {
    $app
      .db()
      .newQuery(
        'CREATE TABLE IF NOT EXISTS vendas_migracao_historico_status (' +
          'id INTEGER PRIMARY KEY CHECK (id = 1),' +
          "status TEXT NOT NULL DEFAULT 'idle'," +
          'etapa TEXT,' +
          'registros_movidos INTEGER DEFAULT 0,' +
          'registros_pendentes INTEGER DEFAULT 0,' +
          'total_historico INTEGER DEFAULT 0,' +
          'mensagem TEXT,' +
          'erro TEXT,' +
          'started_at TEXT,' +
          'updated_at TEXT,' +
          'finished_at TEXT' +
          ');',
      )
      .execute()
    $app
      .db()
      .newQuery(
        'INSERT OR IGNORE INTO vendas_migracao_historico_status ' +
          '(id, status, etapa, registros_movidos, registros_pendentes, total_historico, mensagem, erro, started_at, updated_at, finished_at) ' +
          "VALUES (1, 'idle', 'pronto', 0, 0, 0, 'Pronto para migrar o histórico (< 2025).', '', '', '', '');",
      )
      .execute()

    const readStatus = function () {
      const rows = arrayOf(
        new DynamicModel({
          id: '',
          status: '',
          etapa: '',
          registros_movidos: '',
          registros_pendentes: '',
          total_historico: '',
          mensagem: '',
          erro: '',
          started_at: '',
          updated_at: '',
          finished_at: '',
        }),
      )
      $app
        .db()
        .newQuery(
          "SELECT id, COALESCE(status, '') AS status, COALESCE(etapa, '') AS etapa, " +
            'COALESCE(registros_movidos, 0) AS registros_movidos, ' +
            'COALESCE(registros_pendentes, 0) AS registros_pendentes, ' +
            'COALESCE(total_historico, 0) AS total_historico, ' +
            "COALESCE(mensagem, '') AS mensagem, COALESCE(erro, '') AS erro, " +
            "COALESCE(started_at, '') AS started_at, COALESCE(updated_at, '') AS updated_at, " +
            "COALESCE(finished_at, '') AS finished_at " +
            'FROM vendas_migracao_historico_status WHERE id = 1',
        )
        .all(rows)
      if (rows.length === 0) {
        return {
          status: 'idle',
          etapa: 'pronto',
          registros_movidos: 0,
          registros_pendentes: 0,
          total_historico: 0,
          mensagem: 'Pronto para migrar o histórico (< 2025).',
          erro: '',
          started_at: '',
          updated_at: '',
          finished_at: '',
        }
      }
      const r = rows[0]
      return {
        status: String(r.status || 'idle'),
        etapa: String(r.etapa || ''),
        registros_movidos: toInt(r.registros_movidos),
        registros_pendentes: toInt(r.registros_pendentes),
        total_historico: toInt(r.total_historico),
        mensagem: String(r.mensagem || ''),
        erro: String(r.erro || ''),
        started_at: String(r.started_at || ''),
        updated_at: String(r.updated_at || ''),
        finished_at: String(r.finished_at || ''),
      }
    }

    const setStatus = function (fields) {
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
        .newQuery(
          'UPDATE vendas_migracao_historico_status SET ' + sets.join(', ') + ' WHERE id = 1',
        )
        .bind(params)
        .execute()
    }

    const sqlPendentes =
      "FROM vendas WHERE data_lancamento IS NOT NULL AND data_lancamento != '' " +
      'AND data_lancamento < {:corte} ' +
      'AND NOT EXISTS (SELECT 1 FROM vendas_historico vh WHERE vh.id = vendas.id)'

    const countPendentes = function () {
      const rows = arrayOf(new DynamicModel({ c: '' }))
      $app
        .db()
        .newQuery('SELECT COUNT(*) AS c ' + sqlPendentes)
        .bind({ corte: CORTE })
        .all(rows)
      return rows.length > 0 ? toInt(rows[0].c) : 0
    }

    const countHistorico = function () {
      const rows = arrayOf(new DynamicModel({ c: '' }))
      $app.db().newQuery('SELECT COUNT(*) AS c FROM vendas_historico').all(rows)
      return rows.length > 0 ? toInt(rows[0].c) : 0
    }

    const current = readStatus()

    // Guarda: já em andamento há menos de 5 minutos → não reseta
    if (current.status === 'in_progress' && current.started_at) {
      const elapsed = Date.now() - new Date(current.started_at).getTime()
      if (elapsed < 300000) {
        return e.json(200, {
          success: true,
          started: false,
          already_running: true,
          message: 'Migração do histórico já em andamento.',
          status: current,
        })
      }
    }

    const pendentes = countPendentes()
    const nowIso = new Date().toISOString()

    if (pendentes === 0) {
      const totalHist = countHistorico()
      setStatus({
        status: 'completed',
        etapa: 'nada_a_migrar',
        registros_movidos: current.registros_movidos || 0,
        registros_pendentes: 0,
        total_historico: totalHist,
        mensagem:
          'Nenhum registro anterior a ' +
          CORTE +
          ' pendente em vendas. Histórico atual: ' +
          totalHist +
          ' registros.',
        erro: '',
        finished_at: nowIso,
      })
      return e.json(200, {
        success: true,
        started: true,
        done: true,
        message: 'Nenhum registro anterior a ' + CORTE + ' pendente em vendas.',
        status: readStatus(),
      })
    }

    const totalLotes = Math.ceil(pendentes / BATCH_SIZE)
    setStatus({
      status: 'in_progress',
      etapa: 'iniciando',
      registros_movidos: 0,
      registros_pendentes: pendentes,
      total_historico: countHistorico(),
      mensagem:
        'Migração iniciada: ' +
        pendentes +
        ' registros < ' +
        CORTE +
        ' em ' +
        totalLotes +
        ' lotes de até ' +
        BATCH_SIZE +
        '.',
      erro: '',
      started_at: nowIso,
      finished_at: '',
    })

    return e.json(200, {
      success: true,
      started: true,
      total_pendentes: pendentes,
      total_lotes: totalLotes,
      batch_size: BATCH_SIZE,
      message: 'Migração do histórico iniciada. Use "step" para avançar lote a lote.',
      status: readStatus(),
    })
  } catch (err) {
    const msg = String(err && err.message ? err.message : err)
    console.error('[migrar_historico_iniciar] Falha:', msg)
    return e.json(500, {
      success: false,
      error: 'Falha ao iniciar migração do histórico: ' + msg,
      message: 'Falha ao iniciar migração do histórico: ' + msg,
      stage: 'iniciar',
    })
  }
})

// ---- GET /backend/v1/vendas/migrar-historico/status ----
routerAdd('GET', '/backend/v1/vendas/migrar-historico/status', function (e) {
  const toInt = function (v) {
    if (v === undefined || v === null || v === '') return 0
    const n = parseInt(v, 10)
    return isNaN(n) ? 0 : n
  }

  try {
    $app
      .db()
      .newQuery(
        'CREATE TABLE IF NOT EXISTS vendas_migracao_historico_status (' +
          'id INTEGER PRIMARY KEY CHECK (id = 1),' +
          "status TEXT NOT NULL DEFAULT 'idle'," +
          'etapa TEXT,' +
          'registros_movidos INTEGER DEFAULT 0,' +
          'registros_pendentes INTEGER DEFAULT 0,' +
          'total_historico INTEGER DEFAULT 0,' +
          'mensagem TEXT,' +
          'erro TEXT,' +
          'started_at TEXT,' +
          'updated_at TEXT,' +
          'finished_at TEXT' +
          ');',
      )
      .execute()
    $app
      .db()
      .newQuery(
        'INSERT OR IGNORE INTO vendas_migracao_historico_status ' +
          '(id, status, etapa, registros_movidos, registros_pendentes, total_historico, mensagem, erro, started_at, updated_at, finished_at) ' +
          "VALUES (1, 'idle', 'pronto', 0, 0, 0, 'Pronto para migrar o histórico (< 2025).', '', '', '', '');",
      )
      .execute()

    const rows = arrayOf(
      new DynamicModel({
        id: '',
        status: '',
        etapa: '',
        registros_movidos: '',
        registros_pendentes: '',
        total_historico: '',
        mensagem: '',
        erro: '',
        started_at: '',
        updated_at: '',
        finished_at: '',
      }),
    )
    $app
      .db()
      .newQuery(
        "SELECT id, COALESCE(status, '') AS status, COALESCE(etapa, '') AS etapa, " +
          'COALESCE(registros_movidos, 0) AS registros_movidos, ' +
          'COALESCE(registros_pendentes, 0) AS registros_pendentes, ' +
          'COALESCE(total_historico, 0) AS total_historico, ' +
          "COALESCE(mensagem, '') AS mensagem, COALESCE(erro, '') AS erro, " +
          "COALESCE(started_at, '') AS started_at, COALESCE(updated_at, '') AS updated_at, " +
          "COALESCE(finished_at, '') AS finished_at " +
          'FROM vendas_migracao_historico_status WHERE id = 1',
      )
      .all(rows)

    let status
    if (rows.length === 0) {
      status = {
        status: 'idle',
        etapa: 'pronto',
        registros_movidos: 0,
        registros_pendentes: 0,
        total_historico: 0,
        mensagem: 'Pronto para migrar o histórico (< 2025).',
        erro: '',
        started_at: '',
        updated_at: '',
        finished_at: '',
      }
    } else {
      const r = rows[0]
      status = {
        status: String(r.status || 'idle'),
        etapa: String(r.etapa || ''),
        registros_movidos: toInt(r.registros_movidos),
        registros_pendentes: toInt(r.registros_pendentes),
        total_historico: toInt(r.total_historico),
        mensagem: String(r.mensagem || ''),
        erro: String(r.erro || ''),
        started_at: String(r.started_at || ''),
        updated_at: String(r.updated_at || ''),
        finished_at: String(r.finished_at || ''),
      }
    }

    return e.json(200, { success: true, status: status })
  } catch (err) {
    const msg = String(err && err.message ? err.message : err)
    console.error('[migrar_historico_status] Falha:', msg)
    return e.json(500, {
      success: false,
      error: 'Erro ao consultar status da migração: ' + msg,
      message: 'Erro ao consultar status da migração: ' + msg,
      stage: 'status',
    })
  }
})

// ---- POST /backend/v1/vendas/migrar-historico/step (1 lote por chamada) ----
routerAdd('POST', '/backend/v1/vendas/migrar-historico/step', function (e) {
  const BATCH_SIZE = 5000
  const CORTE = '2025-01-01'

  const toInt = function (v) {
    if (v === undefined || v === null || v === '') return 0
    const n = parseInt(v, 10)
    return isNaN(n) ? 0 : n
  }

  const COLUNAS =
    'id, tipo_documento, nf_entrega_futura, numero_sap, numero_nfe, ' +
    'data_lancamento, ultima_data_vencimento, docto_origem_destino, ' +
    'data_origem_destino, condicao_pagamento, codigo_cliente, ' +
    'nome_cliente, numero_linha, codigo_item, descricao_item, ' +
    'quantidade, qty_kg_lt, preco_item, desconto_linha, icms, pis, ' +
    'cofins, ipi, icms_partilha, total_linha, utilizacao, ' +
    'nome_vendedor, custo_item, nome_filial, conta, estado, cidade, ' +
    'grupo_cliente, mercado, usuario_emissor_pedido, itms_grp_nam, ' +
    'numero_documento_netsales, preco_unitario, total_nf_sem_frete, ' +
    'total_nf_novo, valor_liquido, custo_total, classificacao, ' +
    'vendedor_revenda, grupo_item, vendedor_cliente, origem, ' +
    'tem_racnew, tem_netsales, ' +
    'status_cadastro, tipo_pn, tipo_cliente, ' +
    'data_carga, created, updated'

  try {
    $app
      .db()
      .newQuery(
        'CREATE TABLE IF NOT EXISTS vendas_migracao_historico_status (' +
          'id INTEGER PRIMARY KEY CHECK (id = 1),' +
          "status TEXT NOT NULL DEFAULT 'idle'," +
          'etapa TEXT,' +
          'registros_movidos INTEGER DEFAULT 0,' +
          'registros_pendentes INTEGER DEFAULT 0,' +
          'total_historico INTEGER DEFAULT 0,' +
          'mensagem TEXT,' +
          'erro TEXT,' +
          'started_at TEXT,' +
          'updated_at TEXT,' +
          'finished_at TEXT' +
          ');',
      )
      .execute()
    $app
      .db()
      .newQuery(
        'INSERT OR IGNORE INTO vendas_migracao_historico_status ' +
          '(id, status, etapa, registros_movidos, registros_pendentes, total_historico, mensagem, erro, started_at, updated_at, finished_at) ' +
          "VALUES (1, 'idle', 'pronto', 0, 0, 0, 'Pronto para migrar o histórico (< 2025).', '', '', '', '');",
      )
      .execute()

    const readStatus = function () {
      const rows = arrayOf(
        new DynamicModel({
          id: '',
          status: '',
          etapa: '',
          registros_movidos: '',
          registros_pendentes: '',
          total_historico: '',
          mensagem: '',
          erro: '',
          started_at: '',
          updated_at: '',
          finished_at: '',
        }),
      )
      $app
        .db()
        .newQuery(
          "SELECT id, COALESCE(status, '') AS status, COALESCE(etapa, '') AS etapa, " +
            'COALESCE(registros_movidos, 0) AS registros_movidos, ' +
            'COALESCE(registros_pendentes, 0) AS registros_pendentes, ' +
            'COALESCE(total_historico, 0) AS total_historico, ' +
            "COALESCE(mensagem, '') AS mensagem, COALESCE(erro, '') AS erro, " +
            "COALESCE(started_at, '') AS started_at, COALESCE(updated_at, '') AS updated_at, " +
            "COALESCE(finished_at, '') AS finished_at " +
            'FROM vendas_migracao_historico_status WHERE id = 1',
        )
        .all(rows)
      if (rows.length === 0) {
        return {
          status: 'idle',
          etapa: 'pronto',
          registros_movidos: 0,
          registros_pendentes: 0,
          total_historico: 0,
          mensagem: 'Pronto para migrar o histórico (< 2025).',
          erro: '',
          started_at: '',
          updated_at: '',
          finished_at: '',
        }
      }
      const r = rows[0]
      return {
        status: String(r.status || 'idle'),
        etapa: String(r.etapa || ''),
        registros_movidos: toInt(r.registros_movidos),
        registros_pendentes: toInt(r.registros_pendentes),
        total_historico: toInt(r.total_historico),
        mensagem: String(r.mensagem || ''),
        erro: String(r.erro || ''),
        started_at: String(r.started_at || ''),
        updated_at: String(r.updated_at || ''),
        finished_at: String(r.finished_at || ''),
      }
    }

    const setStatus = function (fields) {
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
        .newQuery(
          'UPDATE vendas_migracao_historico_status SET ' + sets.join(', ') + ' WHERE id = 1',
        )
        .bind(params)
        .execute()
    }

    const sqlPendentes =
      "FROM vendas WHERE data_lancamento IS NOT NULL AND data_lancamento != '' " +
      'AND data_lancamento < {:corte} ' +
      'AND NOT EXISTS (SELECT 1 FROM vendas_historico vh WHERE vh.id = vendas.id)'

    const countPendentes = function () {
      const rows = arrayOf(new DynamicModel({ c: '' }))
      $app
        .db()
        .newQuery('SELECT COUNT(*) AS c ' + sqlPendentes)
        .bind({ corte: CORTE })
        .all(rows)
      return rows.length > 0 ? toInt(rows[0].c) : 0
    }

    const countHistorico = function () {
      const rows = arrayOf(new DynamicModel({ c: '' }))
      $app.db().newQuery('SELECT COUNT(*) AS c FROM vendas_historico').all(rows)
      return rows.length > 0 ? toInt(rows[0].c) : 0
    }

    const current = readStatus()

    if (current.status !== 'in_progress') {
      return e.json(200, { success: true, already_finished: true, status: current })
    }

    // Quantos cabem neste lote (entre os pendentes)
    const rowsLote = arrayOf(new DynamicModel({ c: '' }))
    $app
      .db()
      .newQuery('SELECT COUNT(*) AS c FROM (SELECT 1 ' + sqlPendentes + ' LIMIT {:lim})')
      .bind({ corte: CORTE, lim: BATCH_SIZE })
      .all(rowsLote)
    const lote = rowsLote.length > 0 ? toInt(rowsLote[0].c) : 0

    if (lote === 0) {
      // Nada mais a mover → conclusão explícita e persistida
      const totalHist = countHistorico()
      const restantesVendas = countPendentes()
      const duracaoMs = current.started_at ? Date.now() - new Date(current.started_at).getTime() : 0
      setStatus({
        status: 'completed',
        etapa: 'concluido',
        registros_pendentes: 0,
        total_historico: totalHist,
        mensagem:
          'Migração do histórico concluída: ' +
          current.registros_movidos +
          ' registros movidos para vendas_historico em ' +
          Math.round(duracaoMs / 1000) +
          's. Restantes em vendas (< ' +
          CORTE +
          '): ' +
          restantesVendas +
          '.',
        erro: '',
        finished_at: new Date().toISOString(),
      })
      return e.json(200, {
        success: true,
        done: true,
        registros_movidos: current.registros_movidos,
        total_historico: totalHist,
        restantes_em_vendas: restantesVendas,
        duracao_ms: duracaoMs,
        status: readStatus(),
      })
    }

    setStatus({
      etapa: 'movendo_lote',
      mensagem: 'Movendo lote de até ' + lote + ' registros (< ' + CORTE + ')...',
    })

    // 1) Copia o lote para vendas_historico preservando id/created/updated (SQL cru)
    $app
      .db()
      .newQuery(
        'INSERT INTO vendas_historico (' +
          COLUNAS +
          ') ' +
          'SELECT ' +
          COLUNAS +
          ' ' +
          sqlPendentes +
          ' ORDER BY vendas.id LIMIT {:lim}',
      )
      .bind({ corte: CORTE, lim: lote })
      .execute()

    // 2) Remove de vendas EXATAMENTE os ids que agora existem no histórico
    //    (não depende de reavaliar "pendentes": nunca apaga sem ter copiado)
    $app
      .db()
      .newQuery(
        "DELETE FROM vendas WHERE data_lancamento IS NOT NULL AND data_lancamento != '' " +
          'AND data_lancamento < {:corte} ' +
          'AND id IN (SELECT id FROM vendas_historico)',
      )
      .bind({ corte: CORTE })
      .execute()

    const pendentesAgora = countPendentes()
    const movidosTotal = current.registros_movidos + lote
    setStatus({
      etapa: 'lote_ok',
      registros_movidos: movidosTotal,
      registros_pendentes: pendentesAgora,
      total_historico: countHistorico(),
      mensagem:
        movidosTotal + ' registros movidos; ' + pendentesAgora + ' restantes (< ' + CORTE + ').',
    })

    return e.json(200, {
      success: true,
      done: pendentesAgora === 0,
      lote_processado: lote,
      registros_movidos: movidosTotal,
      registros_pendentes: pendentesAgora,
      status: readStatus(),
    })
  } catch (err) {
    const errorMsg = String(err && err.message ? err.message : err)
    console.error('[migrar_historico_step] Exceção:', errorMsg)
    return e.json(500, {
      success: false,
      error: 'Falha ao mover lote do histórico: ' + errorMsg,
      message: 'Falha ao mover lote do histórico: ' + errorMsg,
      stage: 'step',
    })
  }
})
