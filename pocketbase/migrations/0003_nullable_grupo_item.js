migrate(
  (app) => {
    // 1. Atualizar coleção vendas
    const vendas = app.findCollectionByNameOrId('vendas')
    if (vendas) {
      // Garantir que nenhum campo de vendas tenha required: true desnecessário
      vendas.fields.forEach((field) => {
        if (field.name !== 'id' && field.name !== 'created' && field.name !== 'updated') {
          field.required = false
        }
      })
      app.save(vendas)
    }

    // 2. Atualizar coleção racnew
    const racnew = app.findCollectionByNameOrId('racnew')
    if (racnew) {
      racnew.fields.forEach((field) => {
        if (field.name !== 'id' && field.name !== 'created' && field.name !== 'updated') {
          field.required = false
        }
      })
      app.save(racnew)
    }

    // 3. Atualizar coleção netsales
    const netsales = app.findCollectionByNameOrId('netsales')
    if (netsales) {
      netsales.fields.forEach((field) => {
        if (field.name !== 'id' && field.name !== 'created' && field.name !== 'updated') {
          field.required = false
        }
      })
      app.save(netsales)
    }

    // 4. Atualizar coleção produtos (manter apenas codigo_item como required se desejado, ou flexibilizar)
    const produtos = app.findCollectionByNameOrId('produtos')
    if (produtos) {
      produtos.fields.forEach((field) => {
        if (
          field.name === 'grupo_item' ||
          field.name === 'descricao_item' ||
          field.name === 'ativo'
        ) {
          field.required = false
        }
      })
      app.save(produtos)
    }
  },
  (app) => {
    // Down migration
  },
)
