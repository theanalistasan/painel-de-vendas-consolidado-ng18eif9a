// admin_reset_bases.js — Endpoint de Zeramento (POST /backend/v1/admin/reset-bases).
//
// BUG CORRIGIDO (0.0.34x): o Zeramento apagava apenas `produtos` e `vendas`
// (e tentava uma coleção inexistente `netsales_v4`), de modo que a bruta
// `netsales` ACUMULAVA cargas: cada reimportação somava em vez de substituir
// (53.030 linhas = 3 cargas de ~17.677). O consolidador 1:1 então triplicava
// tudo em `vendas`.
//
// AGORA: apaga TODAS as bases brutas de importação (netsales) e as bases
// consolidadas (vendas, vendas_historico) + staging/resumos pré-calculados,
// e PRESERVA produtos, tipos_cliente, canais_clientes, canais_metas,
// pedidos_abertos, estoque_sap, usuários e demais coleções de configuração.
// Ao final invalida os caches de dashboard/filtros (mesmo mecanismo do importador).

routerAdd('POST', '/backend/v1/admin/reset-bases', (e) => {
  const auth = e.auth
  if (!auth || auth.get('role') !== 'admin') {
    return e.json(403, { error: 'Somente administradores podem zerar as bases.' })
  }

  // Coleções PocketBase a esvaziar, na ordem: brutas primeiro, consolidadas depois.
  const pbCollections = ['netsales', 'vendas', 'vendas_historico']
  // Tabelas SQLite auxiliares (staging e resumos pré-calculados do dashboard).
  const sqlTables = [
    'vendas_staging',
    'resumo_vendas_mensal',
    'resumo_clientes_ativos',
    'resumo_vendas_uf_regiao',
  ]

  const deleted = {}
  const errors = []

  for (let i = 0; i < pbCollections.length; i++) {
    const name = pbCollections[i]
    try {
      const col = app.findCollectionByNameOrId(name)
      app.truncateCollection(col)
      deleted[name] = true
    } catch (errTrunc) {
      try {
        app
          .db()
          .newQuery('DELETE FROM ' + name)
          .execute()
        deleted[name] = true
      } catch (errDel) {
        deleted[name] = false
        errors.push(name + ': ' + errDel)
      }
    }
  }

  for (let j = 0; j < sqlTables.length; j++) {
    const t = sqlTables[j]
    try {
      app
        .db()
        .newQuery('DELETE FROM ' + t)
        .execute()
      deleted[t] = true
    } catch (errSql) {
      // Tabela pode não existir (base nova) — segue.
      deleted[t] = true
    }
  }

  // Auditoria do zeramento.
  try {
    const logsCol = app.findCollectionByNameOrId('audit_logs')
    const record = new Record(logsCol)
    record.set('action', 'reset_bases')
    record.set('user', auth.get('id'))
    record.set(
      'details',
      'Zeramento: brutas (netsales) + consolidadas (vendas, vendas_historico) + staging/resumos',
    )
    app.save(record)
  } catch (errAudit) {
    console.warn('[reset-bases] auditoria falhou:', errAudit)
  }

  // Invalida os mesmos caches do importador (dashboard/filtros), reutilizando o
  // mecanismo global via $app.store — chaves canônicas são podadas na próxima leitura.
  try {
    const store = $app.store()
    const keys = store.keys()
    for (let k = 0; k < keys.length; k++) {
      if (
        String(keys[k]).indexOf('__skipDashboardCache') === 0 ||
        String(keys[k]).indexOf('__skipFilterCache') === 0
      ) {
        store.delete(keys[k])
      }
    }
  } catch (errCache) {
    console.warn('[reset-bases] invalidação de cache falhou:', errCache)
  }

  if (errors.length) {
    return e.json(500, { error: 'Falha ao zerar bases.', details: errors })
  }
  return e.json(200, {
    ok: true,
    message: 'Bases zeradas com sucesso.',
    deleted: deleted,
  })
})
