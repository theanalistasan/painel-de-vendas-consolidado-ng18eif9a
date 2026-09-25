migrate(
  (app) => {
    // Adiciona os novos campos da "Base Única de Canais" na coleção canais_clientes:
    // segmento, inside, cargo, telefone
    const col = app.findCollectionByNameOrId('canais_clientes')

    if (!col.fields.getByName('segmento')) {
      col.fields.add(new TextField({ name: 'segmento' }))
    }
    if (!col.fields.getByName('inside')) {
      col.fields.add(new TextField({ name: 'inside' }))
    }
    if (!col.fields.getByName('cargo')) {
      col.fields.add(new TextField({ name: 'cargo' }))
    }
    if (!col.fields.getByName('telefone')) {
      col.fields.add(new TextField({ name: 'telefone' }))
    }

    app.save(col)
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('canais_clientes')
      const f1 = col.fields.getByName('segmento')
      if (f1) col.fields.remove(f1)
      const f2 = col.fields.getByName('inside')
      if (f2) col.fields.remove(f2)
      const f3 = col.fields.getByName('cargo')
      if (f3) col.fields.remove(f3)
      const f4 = col.fields.getByName('telefone')
      if (f4) col.fields.remove(f4)
      app.save(col)
    } catch (_) {}
  },
)
