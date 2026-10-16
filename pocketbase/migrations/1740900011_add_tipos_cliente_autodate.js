migrate(
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('tipos_cliente')
      if (!col.fields.getByName('created')) {
        col.fields.add(new AutodateField({ name: 'created', onCreate: true, onUpdate: false }))
      }
      if (!col.fields.getByName('updated')) {
        col.fields.add(new AutodateField({ name: 'updated', onCreate: true, onUpdate: true }))
      }
      // Garante permissões CRUD se necessário
      col.createRule = "@request.auth.id != ''"
      col.updateRule = "@request.auth.id != ''"
      col.deleteRule = "@request.auth.id != ''"
      col.listRule = "@request.auth.id != ''"
      col.viewRule = "@request.auth.id != ''"
      app.save(col)
    } catch (e) {
      console.warn('Erro ao atualizar campos de tipos_cliente:', e)
    }
  },
  (app) => {},
)
