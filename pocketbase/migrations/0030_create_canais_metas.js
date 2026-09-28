migrate(
  (app) => {
    // Cria a coleção canais_metas
    // Período: mensal (ano número, mes número 1-12, periodo texto "YYYY-MM")
    // Valor: valor_meta em R$
    // Regras de acesso: leitura e escrita para qualquer usuário autenticado
    const collection = new Collection({
      name: 'canais_metas',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: "@request.auth.id != ''",
      updateRule: "@request.auth.id != ''",
      deleteRule: "@request.auth.id != ''",
      fields: [
        { name: 'nome_canal', type: 'text', required: true },
        { name: 'ano', type: 'number', required: true },
        { name: 'mes', type: 'number', required: true, min: 1, max: 12 },
        { name: 'periodo', type: 'text', required: true },
        { name: 'valor_meta', type: 'number', required: true, min: 0 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_cm_canal_periodo ON canais_metas (nome_canal, periodo)',
        'CREATE INDEX idx_cm_periodo ON canais_metas (periodo)',
        'CREATE INDEX idx_cm_nome_canal ON canais_metas (nome_canal)',
      ],
    })
    app.save(collection)
  },
  (app) => {
    try {
      const collection = app.findCollectionByNameOrId('canais_metas')
      app.delete(collection)
    } catch (_) {}
  },
)
