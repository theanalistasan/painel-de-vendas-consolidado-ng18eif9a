// Migration 0008
// Redefine a senha de TODOS os usuários da coleção `users` para `Roland@1234`.
migrate(
  (app) => {
    app.runInTransaction((txApp) => {
      // 1. Buscar todos os registros da coleção `users`
      const users = txApp.findRecordsByFilter('users', '', '', -1, 0)

      // 2. Para cada usuário, redefinir a senha e salvar
      for (let i = 0; i < users.length; i++) {
        const record = users[i]
        record.setPassword('Roland@1234')
        txApp.save(record)
      }
    })
  },
  (app) => {
    // Down migration: reversão de senhas em lote não é determinística
    // (hashes anteriores são criptográficos e unidirecionais).
  },
)
