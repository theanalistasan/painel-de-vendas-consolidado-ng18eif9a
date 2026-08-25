// Migration 0009
// Adiciona as colunas booleanas `tem_racnew` e `tem_netsales` à coleção `vendas`.
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('vendas')

    if (!col.fields.getByName('tem_racnew')) {
      col.fields.add(
        new BoolField({
          name: 'tem_racnew',
          required: false,
        }),
      )
    }

    if (!col.fields.getByName('tem_netsales')) {
      col.fields.add(
        new BoolField({
          name: 'tem_netsales',
          required: false,
        }),
      )
    }

    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('vendas')
    col.fields.removeByName('tem_racnew')
    col.fields.removeByName('tem_netsales')
    app.save(col)
  },
)
