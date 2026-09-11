migrate(
  (app) => {
    try {
      const auditCol = app.findCollectionByNameOrId('audit_logs')
      // Garante createRule aberto para qualquer requisição autenticada
      auditCol.createRule = "@request.auth.id != ''"
      auditCol.listRule = "@request.auth.id != ''"
      auditCol.viewRule = "@request.auth.id != ''"

      // Verifica campos
      const userIdField = auditCol.fields.getByName('user_id')
      if (userIdField) {
        userIdField.required = false
      }

      app.save(auditCol)
    } catch (e) {
      console.warn('Erro na migracao 0020 audit_logs:', e)
    }
  },
  (app) => {},
)
