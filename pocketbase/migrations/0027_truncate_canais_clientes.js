migrate(
  (app) => {
    // Limpeza completa dos registros da coleção canais_clientes.
    // Preserva a coleção, seus campos e índices intactos para nova importação.
    try {
      if (app.hasTable('canais_clientes')) {
        app.db().newQuery('DELETE FROM canais_clientes').execute()
      }
    } catch (err) {
      console.error('Erro ao truncar canais_clientes na migracao 0027:', err)
      throw err
    }
  },
  (app) => {
    // Reversão não é necessária pois dados excluídos eram de importação desatualizada
  },
)
