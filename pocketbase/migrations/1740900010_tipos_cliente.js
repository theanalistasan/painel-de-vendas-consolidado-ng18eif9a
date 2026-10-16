migrate(
  (app) => {
    const collection = new Collection({
      name: 'tipos_cliente',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: 'codigo_pn', type: 'text', required: false },
        { name: 'nome_pn', type: 'text', required: false },
        { name: 'status_cadastro', type: 'text', required: false },
        { name: 'tipo_pn', type: 'text', required: false },
        { name: 'tipo_cliente', type: 'text', required: false },
        { name: 'data_carga', type: 'date', required: false },
      ],
      indexes: [
        'CREATE INDEX idx_tipos_cliente_codigo ON tipos_cliente (codigo_pn)',
        'CREATE INDEX idx_tipos_cliente_tipo ON tipos_cliente (tipo_cliente)',
      ],
    })
    app.save(collection)

    const colNames = ['racnew', 'netsales', 'pedidos_abertos', 'vendas']
    for (const name of colNames) {
      try {
        const col = app.findCollectionByNameOrId(name)
        col.fields.add(new Field({ name: 'status_cadastro', type: 'text' }))
        col.fields.add(new Field({ name: 'tipo_pn', type: 'text' }))
        col.fields.add(new Field({ name: 'tipo_cliente', type: 'text' }))
        app.save(col)
      } catch (err) {
        console.warn('Field add err for ' + name, err)
      }
    }
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('tipos_cliente')
      app.delete(col)
    } catch (e) {}
  },
)
