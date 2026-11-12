// Migration 1742600007 — PURGA IDEMPOTENTE dos vestígios de vendas / RacNew / NetSales.
//
// CONTEXTO: a migration 1742600006 (limpeza total para a base nova NetSales v4)
// foi aplicada, mas a coleção vendas_historico ainda tinha registros (o
// truncate não surtiu efeito — instância sob carga / countRecords retornando
// 0 em erro silencioso). Esta migration garante o estado final esperado.
//
// ESTRATÉGIA DIFERENTE DA 1742600006: em vez de depender de
// countRecords + truncateCollection (que falhou silenciosamente), usa DELETE
// SQL direto na tabela subjacente de cada coleção — idempotente por natureza
// (DELETE em tabela já vazia é no-op).
//
// APAGA registros de (se a tabela existir):
//   PocketBase: vendas, vendas_historico, racnew, netsales
//   SQLite derivadas/staging: resumo_vendas_mensal, resumo_clientes_ativos,
//     resumo_vendas_uf_regiao, vendas_staging, vendas_consolidacao_status,
//     vendas_migracao_historico_status
//
// NÃO TOCA em: produtos, tipos_cliente, canais_clientes, canais_metas,
//   canais_sync_state, users, pedidos_abertos, estoque_sap, audit_logs.

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

    const purgarTabela = function (t) {
      if (!app.hasTable(t)) {
        console.log('[purga_netsales_v4] ' + t + ': tabela inexistente — ignorada')
        return
      }
      const antes = countTable(t)
      if (antes > 0) {
        app
          .db()
          .newQuery('DELETE FROM ' + t)
          .execute()
      }
      const depois = countTable(t)
      console.log('[purga_netsales_v4] ' + t + ': antes=' + antes + ' depois=' + depois)
      if (depois > 0) {
        throw new Error(
          '[purga_netsales_v4] falha ao limpar ' + t + ' — restaram ' + depois + ' registros',
        )
      }
    }

    // Coleções PocketBase de vendas/origens brutas.
    const alvosPb = ['vendas', 'vendas_historico', 'racnew', 'netsales']
    for (let i = 0; i < alvosPb.length; i++) {
      purgarTabela(alvosPb[i])
    }

    // Derivadas / staging / controle — zeradas junto (mesma decisão da 1742600006).
    const alvosSql = [
      'resumo_vendas_mensal',
      'resumo_clientes_ativos',
      'resumo_vendas_uf_regiao',
      'vendas_staging',
      'vendas_consolidacao_status',
      'vendas_migracao_historico_status',
    ]
    for (let j = 0; j < alvosSql.length; j++) {
      purgarTabela(alvosSql[j])
    }

    // Invalida o cache em memória do dashboard (mesmo padrão da 1742600006).
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

    console.log('[purga_netsales_v4] concluída')
  },
  (app) => {
    // down: no-op deliberado — a limpeza não é reversível (dados condenados).
  },
)
