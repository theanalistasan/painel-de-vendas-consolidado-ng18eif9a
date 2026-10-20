migrate(
  (app) => {
    // 1740900013: Disparar limpeza de órfãos e sincronização de canais
    // Exclui todos os registros com origem = 'Base Única de Canais'
    try {
      const result = app
        .db()
        .newQuery("DELETE FROM canais_clientes WHERE origem = 'Base Única de Canais'")
        .execute()
      console.log('Migration 1740900013: Limpeza de Base Única de Canais executada com sucesso.')
    } catch (err) {
      console.error('Migration 1740900013 erro ao limpar Base Única de Canais:', err)
    }
  },
  (app) => {
    // Reversão não necessária (importador desativado)
  },
)
