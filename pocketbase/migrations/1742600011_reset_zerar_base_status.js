// 1742600011 — Reinicia o SNAPSHOT do zeramento exibido no cartão da tela
// /importar ("Zeramento da base CONCLUÍDO — estado salvo no backend").
//
// O snapshot antigo (10/11/2026 15:34) mostra contagens de uma base que já foi
// zerada de verdade (netsales/vendas/vendas_historico = 0) e ainda lista a
// coleção `racnew`, que NÃO EXISTE mais no schema (derrubada em run anterior).
// O usuário pediu: limpeza geral dos indicadores, tudo 0, racnew fora.
//
// Ações (idempotentes):
//   1. DROP da tabela zerar_base_status — o hook a recria vazia ('idle') na
//      próxima chamada, então o cartão volta ao estado neutro e o snapshot
//      antigo nunca reaparece. (Apagar o registro inteiro é a opção aceita.)
//   2. Garantia: coleção `racnew` fora do schema (drop defensivo, no-op se
//      já não existir).
//   3. NÃO toca em dados de negócio (produtos, tipos_cliente, canais_clientes,
//      canais_metas, pedidos_abertos, estoque_sap, users).
migrate(
  (app) => {
    // 1. Snapshot antigo do zeramento fora (o hook recria a tabela idle/vazia).
    try {
      app.db().newQuery('DROP TABLE IF EXISTS zerar_base_status').execute()
      console.log('[1742600011] zerar_base_status removida (snapshot antigo descartado).')
    } catch (errDrop) {
      console.warn('[1742600011] Falha ao remover zerar_base_status:', errDrop)
    }

    // 2. racnew fora do schema — defensivo: no-op quando já derrubada.
    try {
      const racnew = app.findCollectionByNameOrId('racnew')
      app.delete(racnew)
      console.log('[1742600011] coleção racnew derrubada.')
    } catch (_) {
      // já não existe — estado desejado
      console.log('[1742600011] racnew já ausente do schema — ok.')
    }
  },
  (app) => {
    // down: no-op — o snapshot antigo não é recuperável (e não deve ser).
  },
)
