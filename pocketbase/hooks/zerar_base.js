// Endpoint: POST /backend/v1/base/zerar          (inicia/retoma o zeramento)
// Endpoint: GET  /backend/v1/base/zerar/status   (progresso persistido + contagens atuais)
// Endpoint: POST /backend/v1/base/zerar/step     (apaga 1 lote de 1 coleção por chamada)
//
// ZERAMENTO DA BASE (tela /importar) — mesmo padrão de execução segura do
// migrar_historico.js: status persistido em tabela SQLite própria, 1 lote por
// chamada HTTP (< 3-5s), SOB COMANDO DO USUÁRIO (nada roda automaticamente no
// deploy), erros estruturados com etapa/coleção/motivo.
//
// APAGA (coleções transacionais) — lista DERIVADA DO SCHEMA REAL (app.hasTable),
// nunca hardcoded, para não voltar a citar coleção derrubada (ex.: racnew):
//   - PocketBase: vendas, vendas_historico, netsales, pedidos_abertos,
//     estoque_sap, audit_logs (logs de auditoria de carga)
//   - SQLite: resumos pré-calculados (resumo_vendas_mensal,
//     resumo_clientes_ativos, resumo_vendas_uf_regiao) e tabelas de controle
//     (vendas_staging, vendas_consolidacao_status, vendas_migracao_historico_status)
//
// SNAPSHOT FINAL: ao concluir, grava `contagem_final` (contagens PÓS-limpeza,
// apagado = 0) junto de apagado_por_colecao — o cartão da tela /importar lê
// essas contagens finais, nunca as pré-limpeza.
//
// A coluna `contagem_final` é criada pelo CREATE TABLE abaixo (e por um ALTER
// defensivo nas tabelas já existentes), pois a migration 1742600011 derrubou a
// tabela junto com o snapshot antigo.
//
// NÃO APAGA: produtos, tipos_cliente, users, canais, canais_clientes,
// canais_metas, canais_sync_state e demais coleções de configuração.
//
// IDEMPOTÊNCIA: rodar de novo numa base vazia responde "concluído, nada a
// apagar" (status completed, etapa nada_a_apagar).
//
// AO FINAL: invalida o cache do dashboard (__skipDashboardCache, mesmo padrão
// de dashboard_stats.js) e registra o evento em audit_logs (padrão audit_log.js).
//
// IMPORTANTE: o JSVM do PocketBase executa callbacks em pools separados —
// TODA a lógica vai inline dentro de cada callback (sem helpers top-level).

// ---- POST /backend/v1/base/zerar (iniciar/retomar) ----
routerAdd('POST', '/backend/v1/base/zerar', function (e) {
  const ALVO_PB = [
    'vendas',
    'vendas_historico',
    'netsales',
    'pedidos_abertos',
    'estoque_sap',
    'audit_logs',
  ]
  const ALVO_SQL = [
    'resumo_vendas_mensal',
    'resumo_clientes_ativos',
    'resumo_vendas_uf_regiao',
    'vendas_staging',
    'vendas_consolidacao_status',
    'vendas_migracao_historico_status',
  ]

  const toInt = function (v) {
    if (v === undefined || v === null || v === '') return 0
    const n = parseInt(v, 10)
    return isNaN(n) ? 0 : n
  }

  try {
    $app
      .db()
      .newQuery(
        'CREATE TABLE IF NOT EXISTS zerar_base_status (' +
          'id INTEGER PRIMARY KEY CHECK (id = 1),' +
          "status TEXT NOT NULL DEFAULT 'idle'," +
          'etapa TEXT,' +
          'colecao_atual TEXT,' +
          'total_planejado INTEGER DEFAULT 0,' +
          'total_apagado INTEGER DEFAULT 0,' +
          'apagado_por_colecao TEXT,' +
          'contagem_inicial TEXT,' +
          'contagem_final TEXT,' +
          'mensagem TEXT,' +
          'erro TEXT,' +
          'started_at TEXT,' +
          'updated_at TEXT,' +
          'finished_at TEXT' +
          ');',
      )
      .execute()
    // Tabelas criadas por versões antigas, sem contagem_final: ALTER defensivo.
    try {
      $app
        .db()
        .newQuery(
          "SELECT COUNT(*) AS c FROM pragma_table_info('zerar_base_status') WHERE name = 'contagem_final'",
        )
        .all(cols)
      if (toInt(cols[0].c) === 0) {
        $app
          .db()
          .newQuery("ALTER TABLE zerar_base_status ADD COLUMN contagem_final TEXT DEFAULT '{}'")
          .execute()
      }
    } catch (errAlter) {
      console.warn('[zerar_base] ALTER contagem_final falhou:', errAlter)
    }
    $app
      .db()
      .newQuery(
        'INSERT OR IGNORE INTO zerar_base_status ' +
          '(id, status, etapa, colecao_atual, total_planejado, total_apagado, apagado_por_colecao, contagem_inicial, contagem_final, mensagem, erro, started_at, updated_at, finished_at) ' +
          "VALUES (1, 'idle', 'pronto', '', 0, 0, '{}', '{}', '{}', 'Pronto para zerar a base de dados.', '', '', '', '');",
      )
      .execute()

    const countTable = function (t) {
      try {
        const rows = arrayOf(new DynamicModel({ c: '' }))
        $app
          .db()
          .newQuery('SELECT COUNT(*) AS c FROM ' + t)
          .all(rows)
        return rows.length > 0 ? toInt(rows[0].c) : 0
      } catch (_) {
        return 0
      }
    }

    const contagensAtuais = function () {
      const out = {}
      for (let i = 0; i < ALVO_PB.length; i++) out[ALVO_PB[i]] = countTable(ALVO_PB[i])
      for (let j = 0; j < ALVO_SQL.length; j++) out[ALVO_SQL[j]] = countTable(ALVO_SQL[j])
      return out
    }

    const readStatus = function () {
      const rows = arrayOf(
        new DynamicModel({
          id: '',
          status: '',
          etapa: '',
          colecao_atual: '',
          total_planejado: '',
          total_apagado: '',
          apagado_por_colecao: '',
          contagem_inicial: '',
          contagem_final: '',
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
            "COALESCE(colecao_atual, '') AS colecao_atual, " +
            'COALESCE(total_planejado, 0) AS total_planejado, ' +
            'COALESCE(total_apagado, 0) AS total_apagado, ' +
            "COALESCE(apagado_por_colecao, '{}') AS apagado_por_colecao, " +
            "COALESCE(contagem_inicial, '{}') AS contagem_inicial, " +
            "COALESCE(contagem_final, '{}') AS contagem_final, " +
            "COALESCE(mensagem, '') AS mensagem, COALESCE(erro, '') AS erro, " +
            "COALESCE(started_at, '') AS started_at, COALESCE(updated_at, '') AS updated_at, " +
            "COALESCE(finished_at, '') AS finished_at " +
            'FROM zerar_base_status WHERE id = 1',
        )
        .all(rows)
      const parseMap = function (s) {
        try {
          const v = JSON.parse(s || '{}')
          return v && typeof v === 'object' ? v : {}
        } catch (_) {
          return {}
        }
      }
      if (rows.length === 0) {
        return {
          status: 'idle',
          etapa: 'pronto',
          colecao_atual: '',
          total_planejado: 0,
          total_apagado: 0,
          apagado_por_colecao: {},
          contagem_inicial: {},
          contagem_final: {},
          mensagem: 'Pronto para zerar a base de dados.',
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
        colecao_atual: String(r.colecao_atual || ''),
        total_planejado: toInt(r.total_planejado),
        total_apagado: toInt(r.total_apagado),
        apagado_por_colecao: parseMap(String(r.apagado_por_colecao || '{}')),
        contagem_inicial: parseMap(String(r.contagem_inicial || '{}')),
        contagem_final: parseMap(String(r.contagem_final || '{}')),
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
          params[k] =
            fields[k] === null || fields[k] === undefined
              ? ''
              : typeof fields[k] === 'object'
                ? JSON.stringify(fields[k])
                : fields[k]
        }
      }
      sets.push('updated_at = {:now}')
      $app
        .db()
        .newQuery('UPDATE zerar_base_status SET ' + sets.join(', ') + ' WHERE id = 1')
        .bind(params)
        .execute()
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
          message: 'Zeramento já em andamento.',
          status: current,
        })
      }
    }

    const contagens = contagensAtuais()
    let total = 0
    for (const t in contagens) {
      if (Object.prototype.hasOwnProperty.call(contagens, t)) total += toInt(contagens[t])
    }
    const nowIso = new Date().toISOString()

    if (total === 0) {
      // Idempotência: base já vazia → concluído, nada a apagar
      setStatus({
        status: 'completed',
        etapa: 'nada_a_apagar',
        colecao_atual: '',
        total_planejado: 0,
        total_apagado: 0,
        apagado_por_colecao: {},
        contagem_inicial: contagens,
        contagem_final: contagens,
        mensagem: 'Nada a apagar — todas as coleções transacionais já estão vazias (base zerada).',
        erro: '',
        finished_at: nowIso,
      })
      return e.json(200, {
        success: true,
        started: true,
        done: true,
        nada_a_apagar: true,
        message: 'Nada a apagar — a base já está vazia.',
        status: readStatus(),
        contagens_atuais: contagens,
      })
    }

    setStatus({
      status: 'in_progress',
      etapa: 'iniciando',
      colecao_atual: '',
      total_planejado: total,
      total_apagado: 0,
      apagado_por_colecao: {},
      contagem_inicial: contagens,
      contagem_final: {},
      mensagem: 'Zeramento iniciado: ' + total + ' registros distribuídos nas coleções alvo.',
      erro: '',
      started_at: nowIso,
      finished_at: '',
    })

    return e.json(200, {
      success: true,
      started: true,
      total_planejado: total,
      contagens_atuais: contagens,
      message: 'Zeramento da base iniciado. Use "step" para apagar lote a lote.',
      status: readStatus(),
    })
  } catch (err) {
    const msg = String(err && err.message ? err.message : err)
    console.error('[zerar_base_iniciar] Falha:', msg)
    return e.json(500, {
      success: false,
      error: 'Falha ao iniciar o zeramento da base: ' + msg,
      message: 'Falha ao iniciar o zeramento da base: ' + msg,
      stage: 'iniciar',
    })
  }
})

// ---- GET /backend/v1/base/zerar/status ----
routerAdd('GET', '/backend/v1/base/zerar/status', function (e) {
  const ALVO_PB = [
    'vendas',
    'vendas_historico',
    'netsales',
    'pedidos_abertos',
    'estoque_sap',
    'audit_logs',
  ]
  const ALVO_SQL = [
    'resumo_vendas_mensal',
    'resumo_clientes_ativos',
    'resumo_vendas_uf_regiao',
    'vendas_staging',
    'vendas_consolidacao_status',
    'vendas_migracao_historico_status',
  ]

  const toInt = function (v) {
    if (v === undefined || v === null || v === '') return 0
    const n = parseInt(v, 10)
    return isNaN(n) ? 0 : n
  }

  try {
    $app
      .db()
      .newQuery(
        'CREATE TABLE IF NOT EXISTS zerar_base_status (' +
          'id INTEGER PRIMARY KEY CHECK (id = 1),' +
          "status TEXT NOT NULL DEFAULT 'idle'," +
          'etapa TEXT,' +
          'colecao_atual TEXT,' +
          'total_planejado INTEGER DEFAULT 0,' +
          'total_apagado INTEGER DEFAULT 0,' +
          'apagado_por_colecao TEXT,' +
          'contagem_inicial TEXT,' +
          'contagem_final TEXT,' +
          'mensagem TEXT,' +
          'erro TEXT,' +
          'started_at TEXT,' +
          'updated_at TEXT,' +
          'finished_at TEXT' +
          ');',
      )
      .execute()
    try {
      const cols = arrayOf(new DynamicModel({ c: '' }))
      $app
        .db()
        .newQuery(
          "SELECT COUNT(*) AS c FROM pragma_table_info('zerar_base_status') WHERE name = 'contagem_final'",
        )
        .all(cols)
      if (toInt(cols[0].c) === 0) {
        $app
          .db()
          .newQuery("ALTER TABLE zerar_base_status ADD COLUMN contagem_final TEXT DEFAULT '{}'")
          .execute()
      }
    } catch (errAlter) {
      console.warn('[zerar_base_status] ALTER contagem_final falhou:', errAlter)
    }
    $app
      .db()
      .newQuery(
        'INSERT OR IGNORE INTO zerar_base_status ' +
          '(id, status, etapa, colecao_atual, total_planejado, total_apagado, apagado_por_colecao, contagem_inicial, contagem_final, mensagem, erro, started_at, updated_at, finished_at) ' +
          "VALUES (1, 'idle', 'pronto', '', 0, 0, '{}', '{}', '{}', 'Pronto para zerar a base de dados.', '', '', '', '');",
      )
      .execute()

    const countTable = function (t) {
      try {
        const rows = arrayOf(new DynamicModel({ c: '' }))
        $app
          .db()
          .newQuery('SELECT COUNT(*) AS c FROM ' + t)
          .all(rows)
        return rows.length > 0 ? toInt(rows[0].c) : 0
      } catch (_) {
        return 0
      }
    }

    const contagensAtuais = function () {
      const out = {}
      for (let i = 0; i < ALVO_PB.length; i++) out[ALVO_PB[i]] = countTable(ALVO_PB[i])
      for (let j = 0; j < ALVO_SQL.length; j++) out[ALVO_SQL[j]] = countTable(ALVO_SQL[j])
      return out
    }

    const rows = arrayOf(
      new DynamicModel({
        id: '',
        status: '',
        etapa: '',
        colecao_atual: '',
        total_planejado: '',
        total_apagado: '',
        apagado_por_colecao: '',
        contagem_inicial: '',
        contagem_final: '',
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
          "COALESCE(colecao_atual, '') AS colecao_atual, " +
          'COALESCE(total_planejado, 0) AS total_planejado, ' +
          'COALESCE(total_apagado, 0) AS total_apagado, ' +
          "COALESCE(apagado_por_colecao, '{}') AS apagado_por_colecao, " +
          "COALESCE(contagem_inicial, '{}') AS contagem_inicial, " +
          "COALESCE(contagem_final, '{}') AS contagem_final, " +
          "COALESCE(mensagem, '') AS mensagem, COALESCE(erro, '') AS erro, " +
          "COALESCE(started_at, '') AS started_at, COALESCE(updated_at, '') AS updated_at, " +
          "COALESCE(finished_at, '') AS finished_at " +
          'FROM zerar_base_status WHERE id = 1',
      )
      .all(rows)

    const parseMap = function (s) {
      try {
        const v = JSON.parse(s || '{}')
        return v && typeof v === 'object' ? v : {}
      } catch (_) {
        return {}
      }
    }

    let status
    if (rows.length === 0) {
      status = {
        status: 'idle',
        etapa: 'pronto',
        colecao_atual: '',
        total_planejado: 0,
        total_apagado: 0,
        apagado_por_colecao: {},
        contagem_inicial: {},
        contagem_final: {},
        mensagem: 'Pronto para zerar a base de dados.',
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
        colecao_atual: String(r.colecao_atual || ''),
        total_planejado: toInt(r.total_planejado),
        total_apagado: toInt(r.total_apagado),
        apagado_por_colecao: parseMap(String(r.apagado_por_colecao || '{}')),
        contagem_inicial: parseMap(String(r.contagem_inicial || '{}')),
        contagem_final: parseMap(String(r.contagem_final || '{}')),
        mensagem: String(r.mensagem || ''),
        erro: String(r.erro || ''),
        started_at: String(r.started_at || ''),
        updated_at: String(r.updated_at || ''),
        finished_at: String(r.finished_at || ''),
      }
    }

    return e.json(200, {
      success: true,
      status: status,
      contagens_atuais: contagensAtuais(),
    })
  } catch (err) {
    const msg = String(err && err.message ? err.message : err)
    console.error('[zerar_base_status] Falha:', msg)
    return e.json(500, {
      success: false,
      error: 'Erro ao consultar status do zeramento: ' + msg,
      message: 'Erro ao consultar status do zeramento: ' + msg,
      stage: 'status',
    })
  }
})

// ---- POST /backend/v1/base/zerar/step (1 lote de 1 coleção por chamada) ----
routerAdd('POST', '/backend/v1/base/zerar/step', function (e) {
  const BATCH_SIZE = 5000
  const ALVO_PB = [
    'vendas',
    'vendas_historico',
    'netsales',
    'pedidos_abertos',
    'estoque_sap',
    'audit_logs',
  ]
  const ALVO_SQL = [
    'resumo_vendas_mensal',
    'resumo_clientes_ativos',
    'resumo_vendas_uf_regiao',
    'vendas_staging',
    'vendas_consolidacao_status',
    'vendas_migracao_historico_status',
  ]

  const toInt = function (v) {
    if (v === undefined || v === null || v === '') return 0
    const n = parseInt(v, 10)
    return isNaN(n) ? 0 : n
  }

  try {
    $app
      .db()
      .newQuery(
        'CREATE TABLE IF NOT EXISTS zerar_base_status (' +
          'id INTEGER PRIMARY KEY CHECK (id = 1),' +
          "status TEXT NOT NULL DEFAULT 'idle'," +
          'etapa TEXT,' +
          'colecao_atual TEXT,' +
          'total_planejado INTEGER DEFAULT 0,' +
          'total_apagado INTEGER DEFAULT 0,' +
          'apagado_por_colecao TEXT,' +
          'contagem_inicial TEXT,' +
          'mensagem TEXT,' +
          'erro TEXT,' +
          'started_at TEXT,' +
          'updated_at TEXT,' +
          'finished_at TEXT' +
          ');',
      )
      .execute()
    try {
      const cols = arrayOf(new DynamicModel({ c: '' }))
      $app
        .db()
        .newQuery(
          "SELECT COUNT(*) AS c FROM pragma_table_info('zerar_base_status') WHERE name = 'contagem_final'",
        )
        .all(cols)
      if (toInt(cols[0].c) === 0) {
        $app
          .db()
          .newQuery("ALTER TABLE zerar_base_status ADD COLUMN contagem_final TEXT DEFAULT '{}'")
          .execute()
      }
    } catch (errAlter) {
      console.warn('[zerar_base_step] ALTER contagem_final falhou:', errAlter)
    }
    $app
      .db()
      .newQuery(
        'INSERT OR IGNORE INTO zerar_base_status ' +
          '(id, status, etapa, colecao_atual, total_planejado, total_apagado, apagado_por_colecao, contagem_inicial, contagem_final, mensagem, erro, started_at, updated_at, finished_at) ' +
          "VALUES (1, 'idle', 'pronto', '', 0, 0, '{}', '{}', '{}', 'Pronto para zerar a base de dados.', '', '', '', '');",
      )
      .execute()

    const countTable = function (t) {
      try {
        const rows = arrayOf(new DynamicModel({ c: '' }))
        $app
          .db()
          .newQuery('SELECT COUNT(*) AS c FROM ' + t)
          .all(rows)
        return rows.length > 0 ? toInt(rows[0].c) : 0
      } catch (_) {
        return 0
      }
    }

    const readStatus = function () {
      const rows = arrayOf(
        new DynamicModel({
          id: '',
          status: '',
          etapa: '',
          colecao_atual: '',
          total_planejado: '',
          total_apagado: '',
          apagado_por_colecao: '',
          contagem_inicial: '',
          contagem_final: '',
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
            "COALESCE(colecao_atual, '') AS colecao_atual, " +
            'COALESCE(total_planejado, 0) AS total_planejado, ' +
            'COALESCE(total_apagado, 0) AS total_apagado, ' +
            "COALESCE(apagado_por_colecao, '{}') AS apagado_por_colecao, " +
            "COALESCE(contagem_inicial, '{}') AS contagem_inicial, " +
            "COALESCE(contagem_final, '{}') AS contagem_final, " +
            "COALESCE(mensagem, '') AS mensagem, COALESCE(erro, '') AS erro, " +
            "COALESCE(started_at, '') AS started_at, COALESCE(updated_at, '') AS updated_at, " +
            "COALESCE(finished_at, '') AS finished_at " +
            'FROM zerar_base_status WHERE id = 1',
        )
        .all(rows)
      const parseMap = function (s) {
        try {
          const v = JSON.parse(s || '{}')
          return v && typeof v === 'object' ? v : {}
        } catch (_) {
          return {}
        }
      }
      if (rows.length === 0) {
        return {
          status: 'idle',
          etapa: 'pronto',
          colecao_atual: '',
          total_planejado: 0,
          total_apagado: 0,
          apagado_por_colecao: {},
          contagem_inicial: {},
          contagem_final: {},
          mensagem: 'Pronto para zerar a base de dados.',
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
        colecao_atual: String(r.colecao_atual || ''),
        total_planejado: toInt(r.total_planejado),
        total_apagado: toInt(r.total_apagado),
        apagado_por_colecao: parseMap(String(r.apagado_por_colecao || '{}')),
        contagem_inicial: parseMap(String(r.contagem_inicial || '{}')),
        contagem_final: parseMap(String(r.contagem_final || '{}')),
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
          params[k] =
            fields[k] === null || fields[k] === undefined
              ? ''
              : typeof fields[k] === 'object'
                ? JSON.stringify(fields[k])
                : fields[k]
        }
      }
      sets.push('updated_at = {:now}')
      $app
        .db()
        .newQuery('UPDATE zerar_base_status SET ' + sets.join(', ') + ' WHERE id = 1')
        .bind(params)
        .execute()
    }

    const invalidarCache = function () {
      try {
        // O cache de opções dinâmicas dos filtros (__skipFilterOptionsCache) é
        // reconstruído a partir da base: com a base zerada, as listas de
        // Cliente/Vendedor/Grupo/Ano... voltam VAZIAS na próxima consulta.
        if (typeof globalThis.__skipFilterOptionsCache !== 'undefined') {
          globalThis.__skipFilterOptionsCache = new Map()
        }
        if (globalThis.__skipDashboardCache) {
          if (typeof globalThis.__skipDashboardCache.clear === 'function') {
            globalThis.__skipDashboardCache.clear()
          } else if (typeof globalThis.__skipDashboardCache.forEach === 'function') {
            const chaves = []
            globalThis.__skipDashboardCache.forEach(function (_v, k) {
              chaves.push(k)
            })
            for (let i = 0; i < chaves.length; i++) {
              globalThis.__skipDashboardCache.delete(chaves[i])
            }
          }
        }
      } catch (_) {
        /* cache indisponível nesta runtime — segue sem invalidar */
      }
    }

    const registrarAuditoria = function (totalApagado, duracaoS, mapa) {
      try {
        const col = $app.findCollectionByNameOrId('audit_logs')
        const rec = new Record(col)
        rec.set('action', 'zerar_base')
        rec.set(
          'details',
          'Zeramento da base concluído: ' +
            totalApagado +
            ' registros apagados em ' +
            duracaoS +
            's. Por coleção: ' +
            JSON.stringify(mapa),
        )
        $app.save(rec)
      } catch (errAudit) {
        console.warn('[zerar_base] Falha ao registrar auditoria:', errAudit)
      }
    }

    const current = readStatus()

    if (current.status !== 'in_progress') {
      return e.json(200, { success: true, already_finished: true, status: current })
    }

    // Percorre os alvos na ordem fixa e apaga o próximo lote pendente
    const todosAlvos = ALVO_PB.concat(ALVO_SQL)
    for (let i = 0; i < todosAlvos.length; i++) {
      const t = todosAlvos[i]
      const restantes = countTable(t)
      if (restantes === 0) continue

      let apagadoAgora = 0
      if (ALVO_PB.indexOf(t) !== -1) {
        // Coleção PocketBase: apaga em lotes por id (não depende de reavaliar filtros)
        const lote = restantes < BATCH_SIZE ? restantes : BATCH_SIZE
        $app
          .db()
          .newQuery('DELETE FROM ' + t + ' WHERE id IN (SELECT id FROM ' + t + ' LIMIT {:lim})')
          .bind({ lim: lote })
          .execute()
        apagadoAgora = lote
      } else {
        // Tabela SQLite (resumo/controle): pequena, apaga tudo de uma vez
        $app
          .db()
          .newQuery('DELETE FROM ' + t)
          .execute()
        apagadoAgora = restantes
      }

      const mapa = current.apagado_por_colecao || {}
      mapa[t] = toInt(mapa[t]) + apagadoAgora
      const apagadoTotal = current.total_apagado + apagadoAgora
      const restantesApos = countTable(t)

      setStatus({
        etapa: 'lote_ok',
        colecao_atual: t,
        total_apagado: apagadoTotal,
        apagado_por_colecao: mapa,
        mensagem:
          'Apagando ' +
          t +
          ': ' +
          toInt(mapa[t]) +
          ' registros removidos' +
          (restantesApos > 0 ? ', ' + restantesApos + ' restantes.' : ' — coleção vazia.'),
      })

      return e.json(200, {
        success: true,
        done: false,
        colecao: t,
        apagado_lote: apagadoAgora,
        total_apagado: apagadoTotal,
        restantes_colecao: restantesApos,
        status: readStatus(),
      })
    }

    // Nenhum alvo com registros → conclusão explícita e persistida
    const duracaoMs = current.started_at ? Date.now() - new Date(current.started_at).getTime() : 0
    const duracaoS = Math.round(duracaoMs / 1000)
    // SNAPSHOT FINAL = contagens PÓS-limpeza (apagado ⇒ 0). O cartão da tela
    // /importar lê estas contagens, nunca as pré-limpeza (contagem_inicial).
    const contagensFinais = {}
    for (let f = 0; f < todosAlvos.length; f++)
      contagensFinais[todosAlvos[f]] = countTable(todosAlvos[f])
    setStatus({
      status: 'completed',
      etapa: 'concluido',
      colecao_atual: '',
      contagem_final: contagensFinais,
      mensagem:
        'Zeramento concluído: ' +
        current.total_apagado +
        ' registros apagados em ' +
        duracaoS +
        's. Produtos, Tipos de Cliente, Canais, Metas e usuários permanecem intactos.',
      erro: '',
      finished_at: new Date().toISOString(),
    })

    invalidarCache()
    registrarAuditoria(current.total_apagado, duracaoS, current.apagado_por_colecao || {})

    const finalStatus = readStatus()
    return e.json(200, {
      success: true,
      done: true,
      total_apagado: current.total_apagado,
      apagado_por_colecao: current.apagado_por_colecao || {},
      contagens_finais: finalStatus.contagem_final || contagensFinais,
      duracao_ms: duracaoMs,
      status: finalStatus,
    })
  } catch (err) {
    const errorMsg = String(err && err.message ? err.message : err)
    console.error('[zerar_base_step] Exceção:', errorMsg)
    try {
      $app
        .db()
        .newQuery(
          "UPDATE zerar_base_status SET status = 'error', erro = {:err}, updated_at = {:now} WHERE id = 1",
        )
        .bind({ err: errorMsg, now: new Date().toISOString() })
        .execute()
    } catch (_) {
      /* falha ao persistir o erro — o erro segue na resposta */
    }
    return e.json(500, {
      success: false,
      error: 'Falha ao apagar lote no zeramento: ' + errorMsg,
      message: 'Falha ao apagar lote no zeramento: ' + errorMsg,
      stage: 'step',
    })
  }
})
