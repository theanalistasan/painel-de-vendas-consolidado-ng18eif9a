migrate(
  (app) => {
    // 0022: Provisionar Rodrigo de Medeiros Machado
    const userEmail = 'rodrigo.machado@rolanddg.com.br'
    let record
    try {
      record = app.findAuthRecordByEmail('_pb_users_auth_', userEmail)
    } catch (_) {
      const usersCol = app.findCollectionByNameOrId('_pb_users_auth_')
      record = new Record(usersCol)
    }

    record.setEmail(userEmail)
    record.setPassword('Roland@1234')
    record.setVerified(true)
    record.set('name', 'Rodrigo de Medeiros Machado')
    record.set('role', 'user')
    record.set('active', true)
    record.set('emailVisibility', true)

    app.save(record)
  },
  (app) => {
    try {
      const record = app.findAuthRecordByEmail('_pb_users_auth_', 'rodrigo.machado@rolanddg.com.br')
      app.delete(record)
    } catch (_) {}
  },
)
