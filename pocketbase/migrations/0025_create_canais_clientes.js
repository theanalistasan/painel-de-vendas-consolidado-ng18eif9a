migrate(
  (app) => {
    // Cria a coleção canais_clientes
    const collection = new Collection({
      name: 'canais_clientes',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: 'eh_canal', type: 'bool' },
        { name: 'deploy', type: 'text' },
        { name: 'nome_canal', type: 'text' },
        { name: 'nome_cliente', type: 'text' },
        { name: 'status', type: 'text' },
        { name: 'serie', type: 'text' },
        { name: 'codigo_cliente', type: 'text' },
        { name: 'contato', type: 'text' },
        { name: 'email', type: 'text' },
        { name: 'origem', type: 'text' },
        { name: 'data_carga', type: 'date' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_cc_codigo_cliente ON canais_clientes (codigo_cliente)',
        'CREATE INDEX idx_cc_nome_canal ON canais_clientes (nome_canal)',
        'CREATE INDEX idx_cc_eh_canal ON canais_clientes (eh_canal)',
        'CREATE INDEX idx_cc_deploy ON canais_clientes (deploy)',
      ],
    })
    app.save(collection)
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId('canais_clientes')
      app.delete(collection)
    } catch (_) {}
  },
)
