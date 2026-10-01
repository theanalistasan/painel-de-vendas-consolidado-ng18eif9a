migrate(
  (app) => {
    // 1. Criar coleção de sincronização canais_sync_state
    try {
      app.findCollectionByNameOrId('canais_sync_state')
    } catch (_) {
      const syncCol = new Collection({
        name: 'canais_sync_state',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != ''",
        deleteRule: "@request.auth.id != ''",
        fields: [
          { name: 'chave', type: 'text', required: true },
          { name: 'ultimo_corte', type: 'text' },
          { name: 'ultimo_sucesso', type: 'text' },
          { name: 'status', type: 'text' },
          { name: 'detalhes', type: 'text' },
          { name: 'revendas_lidas', type: 'number' },
          { name: 'revendas_atualizadas', type: 'number' },
          { name: 'contatos_lidos', type: 'number' },
          { name: 'contatos_atualizados', type: 'number' },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: ['CREATE UNIQUE INDEX idx_sync_state_chave ON canais_sync_state (chave)'],
      })
      app.save(syncCol)
    }

    // 2. Adicionar campos complementares em canais_clientes se ainda não existirem
    const col = app.findCollectionByNameOrId('canais_clientes')
    if (!col.fields.getByName('responsavel')) {
      col.fields.add(new TextField({ name: 'responsavel' }))
    }
    if (!col.fields.getByName('observacoes')) {
      col.fields.add(new TextField({ name: 'observacoes' }))
    }
    if (!col.fields.getByName('status_cor')) {
      col.fields.add(new TextField({ name: 'status_cor' }))
    }
    if (!col.fields.getByName('contato_principal')) {
      col.fields.add(new BoolField({ name: 'contato_principal' }))
    }
    if (!col.fields.getByName('status_contato')) {
      col.fields.add(new TextField({ name: 'status_contato' }))
    }
    if (!col.fields.getByName('origem_id_revenda')) {
      col.fields.add(new TextField({ name: 'origem_id_revenda' }))
    }
    if (!col.fields.getByName('origem_id_contato')) {
      col.fields.add(new TextField({ name: 'origem_id_contato' }))
    }
    if (!col.fields.getByName('origem_updated')) {
      col.fields.add(new TextField({ name: 'origem_updated' }))
    }
    app.save(col)
  },
  (app) => {
    try {
      const syncCol = app.findCollectionByNameOrId('canais_sync_state')
      app.delete(syncCol)
    } catch (_) {}
  },
)
