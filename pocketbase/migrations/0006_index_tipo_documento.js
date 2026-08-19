// Adiciona índice na coluna `tipo_documento` da coleção `vendas` para
// acelerar o novo filtro de Tipo de Documento (WHERE tipo_documento IN (...))
// e as queries de DISTINCT usadas para popular o dropdown do filtro.
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('vendas')
    col.addIndex('idx_vendas_tipo_documento', false, 'tipo_documento', '')
    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('vendas')
    col.removeIndex('idx_vendas_tipo_documento')
    app.save(col)
  },
)
