migrate(
  (app) => {
    const usersCollection = app.findCollectionByNameOrId('_pb_users_auth_')

    const usersToSeed = [
      { email: 'silvio.mattos@rolanddg.com.br', name: 'Silvio Mattos', role: 'admin' },
      { email: 'nicolas.brito@rolanddg.com.br', name: 'Nicolas Brito', role: 'admin' },
      { email: 'fred.lunardini@rolanddg.com.br', name: 'Fred Lunardini', role: 'user' },
      { email: 'anderson.clayton@rolanddg.com.br', name: 'Anderson Clayton', role: 'user' },
      { email: 'edson.salles@rolanddg.com.br', name: 'Edson Salles', role: 'user' },
      { email: 'caroline.diniz@rolanddg.com.br', name: 'Caroline Diniz', role: 'user' },
      { email: 'carine.santos@rolanddg.com.br', name: 'Carine Santos', role: 'user' },
    ]

    for (let i = 0; i < usersToSeed.length; i++) {
      const u = usersToSeed[i]
      try {
        const existing = app.findAuthRecordByEmail('_pb_users_auth_', u.email)
        existing.setPassword('Roland@1234')
        existing.setVerified(true)
        existing.set('name', u.name)
        existing.set('role', u.role)
        existing.set('active', true)
        existing.set('emailVisibility', true)
        app.save(existing)
      } catch (_) {
        const record = new Record(usersCollection)
        record.setEmail(u.email)
        record.setPassword('Roland@1234')
        record.setVerified(true)
        record.set('name', u.name)
        record.set('role', u.role)
        record.set('active', true)
        record.set('emailVisibility', true)
        app.save(record)
      }
    }
  },
  (app) => {},
)
