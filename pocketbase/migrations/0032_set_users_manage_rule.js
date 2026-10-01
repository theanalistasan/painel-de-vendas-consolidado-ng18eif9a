migrate(
  (app) => {
    try {
      const usersCol = app.findCollectionByNameOrId('_pb_users_auth_')
      // Permite que usuários com role admin gerenciem registros de auth (incluindo redefinir senha sem oldPassword)
      usersCol.manageRule = "@request.auth.id != '' && @request.auth.role = 'admin'"
      // Assegura regras de CRUD completas
      usersCol.listRule = "@request.auth.id != ''"
      usersCol.viewRule = "@request.auth.id != ''"
      usersCol.createRule = "@request.auth.id != ''"
      usersCol.updateRule = "@request.auth.id != ''"
      usersCol.deleteRule = "@request.auth.id != ''"
      app.save(usersCol)
    } catch (e) {
      console.warn('Erro ao atualizar regras da coleção users:', e)
      throw e
    }
  },
  (app) => {
    try {
      const usersCol = app.findCollectionByNameOrId('_pb_users_auth_')
      usersCol.manageRule = null
      app.save(usersCol)
    } catch (e) {
      console.warn('Erro ao reverter regras da coleção users:', e)
    }
  },
)
