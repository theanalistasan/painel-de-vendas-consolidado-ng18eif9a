// Endpoint: POST /backend/v1/admin/reset-bases
// Zera TODOS os registros das coleções produtos, racnew, netsales e vendas.
// Protegido por senha de administrador (secret ADMIN_PASSWORD) — exigida no body.
routerAdd(
  'POST',
  '/backend/v1/admin/reset-bases',
  (e) => {
    const body = e.requestInfo().body || {}
    const provided = (body.password || '').toString()

    // Senha configurável via variável de ambiente (secret). Fallback seguro.
    const expected = $os.getenv('ADMIN_PASSWORD') || 'admin-default-change-me'

    if (!provided || provided !== expected) {
      return e.json(403, {
        success: false,
        message: 'Senha de administrador incorreta.',
      })
    }

    // Conta registros antes de limpar (para feedback ao usuário)
    const collections = ['produtos', 'racnew', 'netsales', 'vendas']
    const counts = {}
    let totalRemovido = 0

    for (let i = 0; i < collections.length; i++) {
      const name = collections[i]
      if (!$app.hasTable(name)) {
        counts[name] = 0
        continue
      }
      const c = $app.countRecords(name)
      counts[name] = c
      totalRemovido += c
    }

    // Caso todas as bases já estejam vazias
    if (totalRemovido === 0) {
      return e.json(200, {
        success: true,
        alreadyEmpty: true,
        message: 'As bases já estão limpas.',
        counts: counts,
        total_removido: 0,
      })
    }

    // Limpa as coleções dentro de uma transação atômica
    $app.runInTransaction((txApp) => {
      for (let i = 0; i < collections.length; i++) {
        const name = collections[i]
        if (!txApp.hasTable(name)) continue
        txApp
          .db()
          .newQuery('DELETE FROM ' + name)
          .execute()
      }
    })

    return e.json(200, {
      success: true,
      alreadyEmpty: false,
      message: 'Bases zeradas com sucesso.',
      counts: counts,
      total_removido: totalRemovido,
    })
  },
  $apis.requireAuth(),
)
