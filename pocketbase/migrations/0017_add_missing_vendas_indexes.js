migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('vendas')
    // Adicionar índices essenciais para acelerar filtros e ordenações em vendas
    col.addIndex('idx_vendas_nome_cliente', false, 'nome_cliente', '')
    col.addIndex('idx_vendas_tem_netsales', false, 'tem_netsales', '')
    col.addIndex('idx_vendas_created', false, 'created', '')
    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('vendas')
    try {
      col.removeIndex('idx_vendas_nome_cliente')
      col.removeIndex('idx_vendas_tem_netsales')
      col.removeIndex('idx_vendas_created')
      app.save(col)
    } catch (_) {}
  },
)
