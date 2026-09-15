migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('vendas')
    // Índices de alta performance para ordenação e agrupamento por NF e verificação de bases
    col.addIndex('idx_vendas_data_lancamento_nfe', false, 'data_lancamento DESC, numero_nfe', '')
    col.addIndex('idx_vendas_nfe_data', false, 'numero_nfe, data_lancamento DESC', '')
    col.addIndex('idx_vendas_netsales_data', false, 'tem_netsales, data_lancamento DESC', '')
    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('vendas')
    try {
      col.removeIndex('idx_vendas_data_lancamento_nfe')
      col.removeIndex('idx_vendas_nfe_data')
      col.removeIndex('idx_vendas_netsales_data')
      app.save(col)
    } catch (_) {}
  },
)
