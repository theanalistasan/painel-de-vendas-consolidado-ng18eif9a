migrate(
  (app) => {
    // Coleção estoque_sap para armazenar a posição de estoque atual e em trânsito (SAP)
    const collection = new Collection({
      name: 'estoque_sap',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: 'codigo_item', type: 'text', required: true },
        { name: 'descricao_item', type: 'text' },
        { name: 'grupo_item', type: 'text' },
        { name: 'quantidade_estoque', type: 'number' },
        { name: 'em_transito', type: 'number' },
        { name: 'deposito', type: 'text' },
        { name: 'data_carga', type: 'date' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_estoque_sap_codigo_item ON estoque_sap (codigo_item)',
        'CREATE INDEX idx_estoque_sap_data_carga ON estoque_sap (data_carga)',
      ],
    })
    app.save(collection)
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId('estoque_sap')
      app.delete(collection)
    } catch (_) {}
  },
)
