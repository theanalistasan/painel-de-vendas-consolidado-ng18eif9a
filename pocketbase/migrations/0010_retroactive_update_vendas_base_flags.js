// Migration 0010: No-op para liberar o retry pendente sem estourar timeout em transação.
// A atualização retroativa pesada é executada via hook (pocketbase/hooks/update_base_flags.pb.js).
migrate(
  (app) => {
    console.log('Migration 0010: no-op concluída com sucesso.')
  },
  (app) => {
    console.log('Migration 0010: rollback no-op.')
  },
)
