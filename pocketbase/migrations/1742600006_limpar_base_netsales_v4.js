// Migration 1742600006 — LIMPEZA TOTAL das bases de vendas / RacNew / NetSales.
//
// CONTEXTO: a base antiga foi condenada pelo gerente (tabelas NetSales_v4 e
// vendas zeradas/comprometidas). O usuário decidiu LIMPAR TUDO e subir uma base
// nova e verídica: a planilha "NetSales v4" (única fonte verdadeira), que será
// importada DEPOIS pelo app. Esta migration só apaga DADOS (registros) —
// estrutura (colunas, índices, regras) fica intacta.
//
// APAGA (registros):
//   PocketBase: vendas, vendas_historico, racnew, netsales
//   SQLite (derivadas/exclusivas dessas bases):
//     - resumo_vendas_mensal, resumo_clientes_ativos, resumo_vendas_uf_regiao
//       (derivadas 100% de vendas — zerar junto para não deixar dado órfão
//       nos dashboards)
//     - vendas_staging, vendas_consolidacao_status,
//       vendas_migracao_historico_status (staging/controle da consolidação
//       da base antiga)
//
// NÃO APAGA (preservadas com dados intactos): produtos, tipos_cliente,
//   canais_clientes, canais_metas, canais_sync_state, users, pedidos_abertos,
//   estoque_sap, audit_logs.
//
// IDEMPOTENTE: rodar sobre uma base já vazia é no-op (contagens antes/depois
// iguais a 0). Não toca em migrations já aplicadas nem na janela dinâmica de
// anos. Ao final, invalida o cache em memória do dashboard e registra o
// evento em audit_logs.

migrate(
  (app) => {
    const toInt = function (v) {
      if (v === undefined || v === null || v === '') return 0
      const n = parseInt(v, 10)
      return isNaN(n) ? 0 : n
    }

    const countTable = function (t) {
      try {
        const rows = arrayOf(new DynamicModel({ c: '' }))
        app
          .db()
          .newQuery('SELECT COUNT(*) AS c FROM ' + t)
          .all(rows)
        return rows.length > 0 ? toInt(rows[0].c) : 0
      } catch (_) {
        return 0
      }
    }

    const mapa = {}

    // ---- 1. Coleções PocketBase (base transacional de vendas e brutas) ----
    const alvosPb = ['vendas', 'vendas_historico', 'racnew', 'netsales']
    for (let i = 0; i < alvosPb.length; i++) {
      const nome = alvosPb[i]
      const antes = app.countRecords(nome)
      if (antes > 0) {
        const col = app.findCollectionByNameOrId(nome)
        app.truncateCollection(col)
      }
      const depois = app.countRecords(nome)
      mapa[nome] = { antes: antes, depois: depois }
      console.log('[limpeza_netsales_v4] ' + nome + ': antes=' + antes + ' depois=' + depois)
    }

    // ---- 2. Tabelas SQLite derivadas / de staging / de controle ----
    const alvosSql = [
      'resumo_vendas_mensal',
      'resumo_clientes_ativos',
      'resumo_vendas_uf_regiao',
      'vendas_staging',
      'vendas_consolidacao_status',
      'vendas_migracao_historico_status',
    ]
    for (let j = 0; j < alvosSql.length; j++) {
      const t = alvosSql[j]
      if (!app.hasTable(t)) {
        mapa[t] = { antes: 0, depois: 0, ausente: true }
        console.log('[limpeza_netsales_v4] ' + t + ': tabela inexistente — ignorada')
        continue
      }
      const antes = countTable(t)
      if (antes > 0) {
        app
          .db()
          .newQuery('DELETE FROM ' + t)
          .execute()
      }
      const depois = countTable(t)
      mapa[t] = { antes: antes, depois: depois }
      console.log('[limpeza_netsales_v4] ' + t + ': antes=' + antes + ' depois=' + depois)
    }

    // ---- 3. Invalida o cache em memória do dashboard (mesmo padrão zerar_base) ----
    try {
      if (globalThis.__skipDashboardCache) {
        if (typeof globalThis.__skipDashboardCache.clear === 'function') {
          globalThis.__skipDashboardCache.clear()
        } else if (typeof globalThis.__skipDashboardCache.forEach === 'function') {
          const chaves = []
          globalThis.__skipDashboardCache.forEach(function (_v, k) {
            chaves.push(k)
          })
          for (let k = 0; k < chaves.length; k++) {
            globalThis.__skipDashboardCache.delete(chaves[k])
          }
        }
      }
    } catch (_) {
      /* cache indisponível nesta runtime — segue sem invalidar */
    }

    // ---- 4. Auditoria ----
    try {
      const colAudit = app.findCollectionByNameOrId('audit_logs')
      const rec = new Record(colAudit)
      rec.set('action', 'limpeza_base_netsales_v4')
      rec.set(
        'details',
        'Limpeza total das bases de vendas (migration 1742600006): ' +
          JSON.stringify(mapa) +
          ' — produtos, tipos_cliente, canais, metas, usuários, pedidos_abertos e estoque_sap preservados.',
      )
      app.save(rec)
    } catch (errAudit) {
      console.warn('[limpeza_netsales_v4] Falha ao registrar auditoria:', errAudit)
    }
  },
  (app) => {
    // down: no-op deliberado — a limpeza não é reversível (os dados antigos foram
    // condenados pelo usuário). Reaplicá-la é seguro pois é idempotente.
  },
)
