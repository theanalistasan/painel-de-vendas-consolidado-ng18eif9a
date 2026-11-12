// 1742600008: Remove o índice único de deduplicação da coleção `netsales`.
//
// A planilha NetSales v4 (única fonte verídica — RacNew eliminada do produto)
// traz linhas idênticas na chave chave_documento + serial + docdate +
// codigo_cliente + codigo_item (ex.: documento 37550 com 3 linhas iguais para
// MO-240). O índice único idx_netsales_unique (criado no schema inicial) e o
// upsert do importador descartavam as repetições, subfaturando os totais do
// app. O relatório agora deve espelhar a planilha linha a linha: linhas
// idênticas gravam sem bloqueio.
//
// O índice NÃO único idx_netsales_join_racnew (mesmas colunas, criado no
// schema inicial) permanece — as junções/consultas dessas colunas continuam
// indexadas.
//
// IMPORTANTE: em PocketBase os índices de coleção vivem na DEFINIÇÃO da
// coleção (sincronizados com o SQLite a cada save) — por isso a remoção usa a
// API da coleção (removeIndex + app.save(col)), como na migration 0017, e não
// SQL cru. Migration idempotente: removeIndex é no-op se o índice não existir.
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('netsales')
    try {
      col.removeIndex('idx_netsales_unique')
      app.save(col)
    } catch (_) {
      // Índice já removido — idempotente
    }
  },
  (app) => {
    const col = app.findCollectionByNameOrId('netsales')
    try {
      col.addIndex(
        'idx_netsales_unique',
        true,
        'chave_documento, serial, docdate, codigo_cliente, codigo_item',
        '',
      )
      app.save(col)
    } catch (_) {}
  },
)
