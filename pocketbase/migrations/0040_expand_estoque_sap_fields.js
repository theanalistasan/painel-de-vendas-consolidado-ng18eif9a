migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('estoque_sap')

    // Adiciona os novos campos para comportar a estrutura completa do relatório Estoque Real (SAP)
    if (!col.fields.getByName('descricao_ingles')) {
      col.fields.add(new TextField({ name: 'descricao_ingles' }))
    }
    if (!col.fields.getByName('codigo_grupo')) {
      col.fields.add(new TextField({ name: 'codigo_grupo' }))
    }
    if (!col.fields.getByName('nome_grupo')) {
      col.fields.add(new TextField({ name: 'nome_grupo' }))
    }
    if (!col.fields.getByName('codigo_subgrupo')) {
      col.fields.add(new TextField({ name: 'codigo_subgrupo' }))
    }
    if (!col.fields.getByName('nome_subgrupo')) {
      col.fields.add(new TextField({ name: 'nome_subgrupo' }))
    }
    if (!col.fields.getByName('item_code')) {
      col.fields.add(new TextField({ name: 'item_code' }))
    }
    if (!col.fields.getByName('pedido_venda')) {
      col.fields.add(new NumberField({ name: 'pedido_venda' }))
    }
    if (!col.fields.getByName('estoque_liquido')) {
      col.fields.add(new NumberField({ name: 'estoque_liquido' }))
    }
    if (!col.fields.getByName('custo_item')) {
      col.fields.add(new NumberField({ name: 'custo_item' }))
    }
    if (!col.fields.getByName('ultima_venda')) {
      col.fields.add(new DateField({ name: 'ultima_venda' }))
    }

    app.save(col)
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('estoque_sap')
      const fieldsToRemove = [
        'descricao_ingles',
        'codigo_grupo',
        'nome_grupo',
        'codigo_subgrupo',
        'nome_subgrupo',
        'item_code',
        'pedido_venda',
        'estoque_liquido',
        'custo_item',
        'ultima_venda',
      ]
      for (let i = 0; i < fieldsToRemove.length; i++) {
        const f = col.fields.getByName(fieldsToRemove[i])
        if (f) col.fields.removeByName(fieldsToRemove[i])
      }
      app.save(col)
    } catch (_) {}
  },
)
