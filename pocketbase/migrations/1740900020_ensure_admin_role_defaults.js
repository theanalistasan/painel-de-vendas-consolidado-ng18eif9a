migrate(
  (app) => {
    // 1740900020: Assegurar que usuários administradores padrão e usuários sem role definida tenham o perfil correto
    try {
      // 1. Qualquer usuário com role nula ou vazia recebe 'user' por padrão
      app.db().newQuery("UPDATE users SET role = 'user' WHERE role IS NULL OR role = ''").execute()

      // 2. Administradores conhecidos/provisionados ou superusuários:
      // Se houver admin@rolanddg.com.br, silvio*, ou primeiro usuário cadastrado
      app
        .db()
        .newQuery(
          "UPDATE users SET role = 'admin' WHERE email LIKE '%admin%' OR email LIKE '%silvio%'",
        )
        .execute()

      // 3. Se ainda não houver nenhum admin, garantir que pelo menos o primeiro usuário seja admin
      const admins = app.findRecordsByFilter('users', "role = 'admin'", '-created', 1, 0)
      if (!admins || admins.length === 0) {
        const firstUser = app.findRecordsByFilter('users', 'active = true', '+created', 1, 0)
        if (firstUser && firstUser.length > 0) {
          firstUser[0].set('role', 'admin')
          app.save(firstUser[0])
        }
      }
    } catch (err) {
      console.warn('Erro ao verificar/ajustar roles de usuários:', err)
    }
  },
  (app) => {
    // No-op rollback
  },
)
