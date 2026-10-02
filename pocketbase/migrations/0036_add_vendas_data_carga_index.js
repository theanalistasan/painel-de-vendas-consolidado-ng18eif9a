migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('vendas')
    col.addIndex('idx_vendas_data_carga', false, 'data_carga', '')
    app.save(col)
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('vendas')
      col.removeIndex('idx_vendas_data_carga')
      app.save(col)
    } catch (_) {}
  },
)
