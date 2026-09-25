migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('canais_clientes')
    // Habilita operações para todos os perfis de usuários autenticados
    col.listRule = "@request.auth.id != ''"
    col.viewRule = "@request.auth.id != ''"
    col.createRule = "@request.auth.id != ''"
    col.updateRule = "@request.auth.id != ''"
    col.deleteRule = "@request.auth.id != ''"
    app.save(col)
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('canais_clientes')
      col.createRule = null
      col.updateRule = null
      col.deleteRule = null
      app.save(col)
    } catch (_) {}
  },
)
