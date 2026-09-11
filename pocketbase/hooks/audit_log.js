// Hook: POST /backend/v1/audit/log
// Registra evento na tabela audit_logs usando $app (superuser context),
// retornando detalhes exatos em caso de erro de validação ou payload.
routerAdd(
  'POST',
  '/backend/v1/audit/log',
  (e) => {
    try {
      const auth = e.auth
      const body = e.requestInfo().body || {}

      const action = (body.action || '').toString().trim()
      if (!action) {
        return e.json(400, {
          success: false,
          message: 'O campo action é obrigatório.',
        })
      }

      const auditCol = $app.findCollectionByNameOrId('audit_logs')
      const record = new Record(auditCol)

      record.set('action', action)
      record.set('details', (body.details || '').toString())

      // Prioriza usuário autenticado se presente, com fallback para o body
      const userId = auth && auth.id ? auth.id : (body.user_id || '').toString()
      const userEmail = auth && auth.email ? auth.email : (body.user_email || '').toString()
      const userName = auth && auth.name ? auth.name : (body.user_name || '').toString()

      if (userId) {
        record.set('user_id', userId)
      }
      if (userEmail) {
        record.set('user_email', userEmail)
      }
      if (userName) {
        record.set('user_name', userName)
      }

      const clientIp = e.requestInfo().clientIP || ''
      record.set('ip', clientIp)

      $app.save(record)

      return e.json(200, {
        success: true,
        id: record.id,
      })
    } catch (err) {
      console.warn('Falha no hook audit_log:', err)
      return e.json(500, {
        success: false,
        message: err ? err.toString() : 'Erro ao gravar auditoria',
      })
    }
  },
  $apis.requireAuth(),
)
