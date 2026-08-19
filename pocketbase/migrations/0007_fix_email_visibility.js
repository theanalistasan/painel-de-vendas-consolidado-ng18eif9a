// Migration 0007
// Corrige o problema de usuários com `emailVisibility: false`, que fazia o
// e-mail não aparecer na tela de Gestão de Usuários (/usuarios) e impossibilitava
// identificar/buscar o usuário. O caso relatado foi o do Nicolas Brito
// (nicolas.brito@rolanddg.com.br, role=admin), que também não conseguia logar.
//
// Ações:
//  1. Define `emailVisibility = true` para TODOS os usuários existentes (a tela
//     de gestão exige o e-mail visível para identificar, buscar e gerar convites;
//     novos/edições já garantem isso via src/services/users.ts).
//  2. Para o Nicolas especificamente: marca `verified = true` (para que a
//     verificação de e-mail não bloqueie o login) e redefine a senha para a
//     senha padrão do admin (`Skip@Pass`), já que não era possível confirmar
//     se a senha havia sido definida corretamente — assim o login volta a
//     funcionar independentemente do estado anterior.
migrate(
  (app) => {
    // 1. Torna o e-mail visível para todos os usuários existentes.
    try {
      const all = app.findRecordsByFilter('_pb_users_auth_', '1=1', '', 500, 0)
      for (let i = 0; i < all.length; i++) {
        const rec = all[i]
        if (rec.get('emailVisibility') !== true) {
          rec.set('emailVisibility', true)
          app.save(rec)
        }
      }
    } catch (_) {}

    // 2. Corrige especificamente o Nicolas: verified=true + senha padrão.
    try {
      const nicolas = app.findAuthRecordByEmail('_pb_users_auth_', 'nicolas.brito@rolanddg.com.br')
      nicolas.set('emailVisibility', true)
      nicolas.setVerified(true)
      // setPassword já aplica o hash bcrypt (record.set não serve p/ senha).
      nicolas.setPassword('Skip@Pass')
      app.save(nicolas)
    } catch (_) {}
  },
  (app) => {
    // Revert: não é possível restaurar a senha original (hash desconhecido),
    // mas mantemos o emailVisibility=true pois é o estado desejado para a
    // tela de gestão. Apenas desmarcamos o verified do Nicolas de volta.
    try {
      const nicolas = app.findAuthRecordByEmail('_pb_users_auth_', 'nicolas.brito@rolanddg.com.br')
      nicolas.setVerified(false)
      app.save(nicolas)
    } catch (_) {}
  },
)
