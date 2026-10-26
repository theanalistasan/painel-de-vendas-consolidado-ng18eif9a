migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('pedidos_abertos')

    if (!col.fields.getByName('codigo_vendedor')) {
      col.fields.add(
        new TextField({
          name: 'codigo_vendedor',
          type: 'text',
        }),
      )
    }

    if (!col.fields.getByName('nome_vendedor')) {
      col.fields.add(
        new TextField({
          name: 'nome_vendedor',
          type: 'text',
        }),
      )
    }

    col.addIndex('idx_pa_codigo_vendedor', false, 'codigo_vendedor', '')
    col.addIndex('idx_pa_nome_vendedor', false, 'nome_vendedor', '')

    app.save(col)
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('pedidos_abertos')
      col.removeIndex('idx_pa_codigo_vendedor')
      col.removeIndex('idx_pa_nome_vendedor')
      const f1 = col.fields.getByName('codigo_vendedor')
      if (f1) col.fields.remove(f1)
      const f2 = col.fields.getByName('nome_vendedor')
      if (f2) col.fields.remove(f2)
      app.save(col)
    } catch (_) {}
  },
)
