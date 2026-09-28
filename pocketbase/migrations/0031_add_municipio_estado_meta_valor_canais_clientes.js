migrate(
  (app) => {
    // Adiciona os novos campos da nova estrutura da planilha de canais:
    // municipio (text), estado (text), meta_valor (number)
    const col = app.findCollectionByNameOrId('canais_clientes')

    if (!col.fields.getByName('municipio')) {
      col.fields.add(new TextField({ name: 'municipio' }))
    }
    if (!col.fields.getByName('estado')) {
      col.fields.add(new TextField({ name: 'estado' }))
    }
    if (!col.fields.getByName('meta_valor')) {
      col.fields.add(new NumberField({ name: 'meta_valor' }))
    }

    app.save(col)
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('canais_clientes')
      const f1 = col.fields.getByName('municipio')
      if (f1) col.fields.remove(f1)
      const f2 = col.fields.getByName('estado')
      if (f2) col.fields.remove(f2)
      const f3 = col.fields.getByName('meta_valor')
      if (f3) col.fields.remove(f3)
      app.save(col)
    } catch (_) {}
  },
)
