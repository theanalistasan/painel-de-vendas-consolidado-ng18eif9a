// 1742600010 — Limpa as bases de vendas empilhadas: a bruta `netsales` acumulou
// TRÊS cargas (data_carga 19:45, 22:37 do dia anterior e 22:56 de hoje, ~17.677
// linhas cada / 53.030 no total) porque o Zeramento nunca apagava a bruta; a
// consolidação 1:1 herdou tudo triplicado em `vendas`. Esta migration zera:
//   - netsales, vendas, vendas_historico (coleções PocketBase)
//   - vendas_staging + resumos pré-calculados (tabelas SQLite, ficam vazias e
//     serão reconstruídas após a reimportação única de NetSales v4)
// Preserva: produtos, tipos_cliente, canais_clientes, canais_metas,
// pedidos_abertos, estoque_sap, users e demais coleções de configuração.
// IDEMPOTENTE: DELETE em tabela vazia é no-op (não depende de registros).
migrate(
  (app) => {
    const pbCols = ['netsales', 'vendas', 'vendas_historico']
    const sqlTables = [
      'vendas_staging',
      'resumo_vendas_mensal',
      'resumo_clientes_ativos',
      'resumo_vendas_uf_regiao',
    ]

    for (let i = 0; i < pbCols.length; i++) {
      const name = pbCols[i]
      try {
        const col = app.findCollectionByNameOrId(name)
        app.truncateCollection(col)
        console.log('[1742600010] ' + name + ' truncada.')
      } catch (errTrunc) {
        // Fallback defensivo: truncateCollection pode falhar com regras/atrelagens;
        // DELETE cru é equivalente aqui (tabela pertence a coleções PB conhecidas).
        try {
          app
            .db()
            .newQuery('DELETE FROM ' + name)
            .execute()
          console.log('[1742600010] ' + name + ' limpa via DELETE (fallback).')
        } catch (errDel) {
          console.error('[1742600010] Falha ao limpar ' + name + ':', errDel)
          throw errDel
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
      } catch (errSql) {
        // Tabela pode não existir ainda (base nova) — no-op.
        console.warn('[1742600010] Ignorado ' + t + ':', errSql)
      }
    }
  },
  (app) => {
    // down: no-op — a limpeza de cargas corrompidas não é reversível.
  },
)
