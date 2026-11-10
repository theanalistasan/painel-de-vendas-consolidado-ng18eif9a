/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    // Ciclo D - Reconciliação dos contatos de canais com inside Paloma desvinculado na base oficial
    // Na base oficial ("Gestão de Canais de Vendas"), Paloma foi desvinculada dos canais
    // (POTISIGNS PB, FORMATO BH, FORMATO GO, SUBSTRATO e SHOP SIGN).
    // Esta migração executa o expurgo/limpeza imediata dos vínculos órfãos de Paloma
    // e o hook sync_canais.js garante a reconciliação automática contínua em qualquer nova sincronização.
    try {
      app
        .db()
        .newQuery(
          "UPDATE canais_clientes SET inside = '', updated = datetime('now') WHERE UPPER(TRIM(inside)) = 'PALOMA'",
        )
        .execute()
    } catch (err) {
      console.warn('1742500001_reconcile_paloma_inside: aviso ao limpar inside Paloma:', err)
    }
  },
  (app) => {
    // Reversão não necessária / sem efeito retroativo para vínculos órfãos
  },
)
