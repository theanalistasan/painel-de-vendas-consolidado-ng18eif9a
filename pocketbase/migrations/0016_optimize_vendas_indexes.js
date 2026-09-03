migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('vendas')
    // Garantir índices para as colunas mais filtradas:
    // data_lancamento, grupo_item, tipo_documento, e índices compostos frequentes
    col.addIndex('idx_vendas_data_lancamento', false, 'data_lancamento', '')
    col.addIndex('idx_vendas_grupo_item', false, 'grupo_item', '')
    col.addIndex('idx_vendas_tipo_documento', false, 'tipo_documento', '')
    col.addIndex(
      'idx_vendas_dt_grupo_tipo',
      false,
      'data_lancamento, grupo_item, tipo_documento',
      '',
    )
    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('vendas')
    try {
      col.removeIndex('idx_vendas_dt_grupo_tipo')
      app.save(col)
    } catch (_) {}
  },
)
