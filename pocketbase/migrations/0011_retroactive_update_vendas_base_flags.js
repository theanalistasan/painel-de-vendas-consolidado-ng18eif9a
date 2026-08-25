// Migration 0011: No-op
migrate(
  (app) => {
    console.log('Migration 0011 no-op')
  },
  (app) => {
    console.log('Migration 0011 rollback')
  },
)
