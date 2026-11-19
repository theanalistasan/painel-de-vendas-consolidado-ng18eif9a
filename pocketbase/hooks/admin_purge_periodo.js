// admin_purge_periodo.js — Purga CONTROLADA de um intervalo de anos da base.
// Endpoint: POST /backend/v1/admin/purge-periodo
// Header:   X-Purge-Key: <segredo PURGE_KEY>
// Body:     { "anos": [2020, 2021, 2022, 2023], "dry_run": true }
//
// POR QUE EXISTE (2026-11-19): as cargas de 2020-2023 foram feitas pelo script
// `prep_netsales.py`, que NÃO calculava `numero_linha`. Todas as linhas desses
// anos entraram com numero_linha = 0 e o dedupe do importador fundiu linhas
// legítimas (656 linhas, R$ 12,2 mi de faturamento). Reimportar não basta: as
// linhas novas vêm com numero_linha 1,2,3... e não casam com as antigas (0),
// então elas seriam SOMADAS em vez de substituídas. É preciso remover o período
// antes de reimportar.
//
// SEGURANÇA: protegida por segredo (como a consulta por serial), porque as
// rotas de admin exigem role=admin e a automação opera com um usuário comum.
// O purge é restrito a `netsales` e por INTERVALO DE ANOS — nunca apaga a base
// inteira e nunca toca em coleções de gestão (pedidos_abertos, estoque_sap,
// produtos, tipos_cliente, canais_*, users, audit_logs).
//
// A base derivada `vendas` não precisa ser limpa à mão: `consolidar_vendas.js`
// faz DELETE FROM vendas e reconstrói tudo a partir de `netsales`.
//
// IMPORTANTE: cada callback do Skip Cloud roda em VM separada, então TODA a
// lógica vai inline aqui (sem helper top-level).
routerAdd('POST', '/backend/v1/admin/purge-periodo', (e) => {
  // ATENÇÃO: headers chegam com underscore em requestInfo(); use header.get().
  const expected = $secrets.get('PURGE_KEY')
  const provided = String(e.request.header.get('X-Purge-Key') || '').trim()
  if (!expected) {
    return e.json(503, { error: 'Purga não configurada neste ambiente.' })
  }
  if (provided !== String(expected).trim()) {
    return e.json(401, { error: 'Credencial inválida para purga.' })
  }

  const body = e.requestInfo().body || {}
  const anos = Array.isArray(body.anos) ? body.anos : []
  const dryRun = body.dry_run !== false

  // Guarda-corpo: só aceita anos numéricos dentro de uma faixa plausível.
  const anosLimpos = []
  for (let i = 0; i < anos.length; i++) {
    const a = parseInt(String(anos[i]), 10)
    if (!isNaN(a) && a >= 2000 && a <= 2100) anosLimpos.push(a)
  }
  if (anosLimpos.length === 0) {
    return e.json(400, { error: 'Informe "anos": [2020, 2021, ...].' })
  }
  if (anosLimpos.length > 10) {
    return e.json(400, { error: 'Máximo de 10 anos por chamada.' })
  }

  const contar = (ano) => {
    const rows = arrayOf(new DynamicModel({ c: '' }))
    $app
      .db()
      .newQuery(
        "SELECT COUNT(*) AS c FROM netsales WHERE SUBSTR(TRIM(COALESCE(docdate, '')), 1, 4) = {:ano}",
      )
      .bind({ ano: String(ano) })
      .all(rows)
    return rows.length > 0 ? parseInt(rows[0].c, 10) || 0 : 0
  }

  const contarHistorico = (ano) => {
    const rows = arrayOf(new DynamicModel({ c: '' }))
    try {
      $app
        .db()
        .newQuery(
          "SELECT COUNT(*) AS c FROM vendas_historico WHERE SUBSTR(TRIM(COALESCE(data_lancamento, '')), 1, 4) = {:ano}",
        )
        .bind({ ano: String(ano) })
        .all(rows)
      return rows.length > 0 ? parseInt(rows[0].c, 10) || 0 : 0
    } catch (_) {
      return 0
    }
  }

  const antes = {}
  let totalNetsales = 0
  let totalHistorico = 0
  for (let i = 0; i < anosLimpos.length; i++) {
    const a = anosLimpos[i]
    const n = contar(a)
    const h = contarHistorico(a)
    antes[a] = { netsales: n, historico: h }
    totalNetsales += n
    totalHistorico += h
  }

  if (dryRun) {
    return e.json(200, {
      success: true,
      dry_run: true,
      anos: anosLimpos,
      antes: antes,
      total_netsales: totalNetsales,
      total_historico: totalHistorico,
      mensagem:
        'Simulação: ' +
        totalNetsales +
        ' registro(s) em netsales e ' +
        totalHistorico +
        ' em vendas_historico seriam removidos. Nada foi apagado.',
    })
  }

  // Execução: apaga por ano, sempre restrito ao intervalo pedido.
  const removidos = {}
  const erros = []
  for (let i = 0; i < anosLimpos.length; i++) {
    const a = anosLimpos[i]
    removidos[a] = { netsales: 0, historico: 0 }
    try {
      $app
        .db()
        .newQuery("DELETE FROM netsales WHERE SUBSTR(TRIM(COALESCE(docdate, '')), 1, 4) = {:ano}")
        .bind({ ano: String(a) })
        .execute()
      removidos[a].netsales = antes[a].netsales
    } catch (errDel) {
      erros.push('netsales ' + a + ': ' + String(errDel))
    }
    try {
      if (antes[a].historico > 0) {
        $app
          .db()
          .newQuery(
            "DELETE FROM vendas_historico WHERE SUBSTR(TRIM(COALESCE(data_lancamento, '')), 1, 4) = {:ano}",
          )
          .bind({ ano: String(a) })
          .execute()
        removidos[a].historico = antes[a].historico
      }
    } catch (errHist) {
      erros.push('vendas_historico ' + a + ': ' + String(errHist))
    }
  }

  const depois = {}
  for (let i = 0; i < anosLimpos.length; i++) depois[anosLimpos[i]] = contar(anosLimpos[i])

  // Auditoria
  try {
    const logsCol = $app.findCollectionByNameOrId('audit_logs')
    const record = new Record(logsCol)
    record.set('action', 'purge_periodo')
    record.set(
      'details',
      'Purga por período: anos ' +
        anosLimpos.join(', ') +
        ' | removidos netsales=' +
        totalNetsales +
        ' historico=' +
        totalHistorico +
        (erros.length ? ' | erros: ' + erros.join('; ') : ''),
    )
    $app.save(record)
  } catch (errAudit) {
    console.warn('[purge-periodo] auditoria falhou:', errAudit)
  }

  // Invalida caches do painel (mesmo mecanismo do importador)
  try {
    if (typeof globalThis !== 'undefined' && globalThis.__skipDashboardCache) {
      globalThis.__skipDashboardCache.clear()
    }
  } catch (_) {}
  try {
    if (typeof globalThis !== 'undefined' && globalThis.__skipFilterOptionsCache) {
      globalThis.__skipFilterOptionsCache = new Map()
    }
  } catch (_) {}

  console.log(
    '[purge-periodo] anos=' +
      anosLimpos.join(',') +
      ' netsales=' +
      totalNetsales +
      ' historico=' +
      totalHistorico +
      ' erros=' +
      erros.length,
  )

  return e.json(200, {
    success: erros.length === 0,
    dry_run: false,
    anos: anosLimpos,
    removidos: removidos,
    depois: depois,
    erros: erros,
    mensagem:
      'Removidos ' +
      totalNetsales +
      ' registro(s) de netsales e ' +
      totalHistorico +
      ' de vendas_historico. Reimporte o período e rode a consolidação.',
  })
})
