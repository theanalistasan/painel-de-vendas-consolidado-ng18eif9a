migrate(
  (app) => {
    // 1. Garantir que a coleção audit_logs permita list, view, create por autenticados (@request.auth.id != '')
    // e que o campo action seja do tipo text (ou mantenha texto livre) e user_id seja opcional
    try {
      const auditCol = app.findCollectionByNameOrId('audit_logs')
      auditCol.listRule = "@request.auth.id != ''"
      auditCol.viewRule = "@request.auth.id != ''"
      auditCol.createRule = "@request.auth.id != ''"

      // Garante que o campo action exista e tenha tipo text
      const actionField = auditCol.fields.getByName('action')
      if (!actionField) {
        auditCol.fields.add(new TextField({ name: 'action', required: true }))
      }

      // Garante que user_id seja opcional para não falhar criações sem relação
      const userIdField = auditCol.fields.getByName('user_id')
      if (userIdField) {
        userIdField.required = false
      }

      app.save(auditCol)
    } catch (e) {
      console.warn('Ajuste em audit_logs:', e)
    }

    // 2. Garantir que a coleção users permita listagem por qualquer usuário autenticado
    // e que todos os usuários existentes tenham emailVisibility = true para serem exibidos
    try {
      const usersCol = app.findCollectionByNameOrId('_pb_users_auth_')
      usersCol.listRule = "@request.auth.id != ''"
      usersCol.viewRule = "@request.auth.id != ''"
      app.save(usersCol)

      // Atualiza emailVisibility de todos os usuários para true
      app
        .db()
        .newQuery(
          'UPDATE users SET emailVisibility = 1 WHERE emailVisibility != 1 OR emailVisibility IS NULL',
        )
        .execute()
    } catch (e) {
      console.warn('Ajuste em users:', e)
    }
  },
  (app) => {
    // Reversão não necessária
  },
)
