// Endpoint: POST /backend/v1/admin/reset-bases
// Zera registros das coleções produtos, racnew, netsales e vendas.
// Protegido por senha de administrador — exigida no body.
//
// Body:
//   password    (string, obrigatório) — senha de administrador
//   collections (string[], opcional)  — nomes das coleções a zerar.
//     Se ausente/vazio, zera TODAS as 4 (compatível com versão anterior).
//     Se presente, zera SOMENTE as coleções informadas (válidas).
routerAdd(
  'POST',
  '/backend/v1/admin/reset-bases',
  (e) => {
    const body = e.requestInfo().body || {}
    const provided = (body.password || '').toString()

    // Senha de administrador (hardcodeada — não depende de variável de ambiente).
    const expected = 'Reset@Painel2025'

    if (!provided || provided !== expected) {
      return e.json(403, {
        success: false,
        message: 'Senha de administrador incorreta.',
      })
    }

    // Coleções válidas gerenciadas por esta rota
    const ALL_COLLECTIONS = ['produtos', 'racnew', 'netsales', 'vendas']

    // Determina quais coleções zerar
    let requested = body.collections
    if (requested != null) {
      if (!Array.isArray(requested)) {
        return e.json(400, {
          success: false,
          message: 'O campo "collections" deve ser um array de strings.',
        })
      }
      // mantém apenas strings válidas e conhecidas, sem duplicatas
      const seen = {}
      requested = requested.filter((c) => {
        const name = (c || '').toString()
        if (!name || ALL_COLLECTIONS.indexOf(name) === -1 || seen[name]) return false
        seen[name] = true
        return true
      })
    }
    if (!requested || requested.length === 0) {
      requested = ALL_COLLECTIONS.slice()
    }

    // Conta registros antes de limpar (apenas das coleções afetadas)
    const counts = {}
    let totalRemovido = 0

    for (let i = 0; i < requested.length; i++) {
      const name = requested[i]
      if (!$app.hasTable(name)) {
        counts[name] = 0
        continue
      }
      const c = $app.countRecords(name)
      counts[name] = c
      totalRemovido += c
    }

    // Caso todas as bases selecionadas já estejam vazias
    if (totalRemovido === 0) {
      return e.json(200, {
        success: true,
        alreadyEmpty: true,
        message: 'As bases selecionadas já estão limpas.',
        counts: counts,
        total_removido: 0,
      })
    }

    // Limpa as coleções dentro de uma transação atômica
    $app.runInTransaction((txApp) => {
      for (let i = 0; i < requested.length; i++) {
        const name = requested[i]
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
