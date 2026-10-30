migrate(
  (app) => {
    // 1740900016: Índices de performance para consolidação de vendas
    // Chaves de join da RacNew com NetSales, Produtos e Tipos de Cliente:
    // - netsales: (chave_documento, serial, docdate, codigo_cliente, codigo_item)
    // - racnew: (numero_sap, numero_nfe, data_lancamento, codigo_cliente, codigo_item)
    // - produtos: (codigo_item)
    // - tipos_cliente: (codigo_pn)

    try {
      const colNetSales = app.findCollectionByNameOrId('netsales')
      // Índice composto cobrindo exatamente os campos da junção na NetSales
      colNetSales.addIndex(
        'idx_netsales_join_racnew',
        false,
        'chave_documento, serial, docdate, codigo_cliente, codigo_item',
        '',
      )
      // Índices individuais auxiliares
      colNetSales.addIndex('idx_netsales_chave_documento', false, 'chave_documento', '')
      colNetSales.addIndex('idx_netsales_serial', false, 'serial', '')
      app.save(colNetSales)
    } catch (err) {
      console.warn('Erro ao indexar netsales na migration 1740900016:', err)
    }

    try {
      const colRacnew = app.findCollectionByNameOrId('racnew')
      // Índices individuais auxiliares nas chaves de join
      colRacnew.addIndex('idx_racnew_numero_sap', false, 'numero_sap', '')
      colRacnew.addIndex('idx_racnew_numero_nfe', false, 'numero_nfe', '')
      // Índice composto de cobertura para o join
      colRacnew.addIndex(
        'idx_racnew_join_keys',
        false,
        'numero_sap, numero_nfe, data_lancamento, codigo_cliente, codigo_item',
        '',
      )
      app.save(colRacnew)
    } catch (err) {
      console.warn('Erro ao indexar racnew na migration 1740900016:', err)
    }

    try {
      const colProdutos = app.findCollectionByNameOrId('produtos')
      colProdutos.addIndex('idx_produtos_codigo_item_join', false, 'codigo_item', '')
      app.save(colProdutos)
    } catch (err) {
      console.warn('Erro ao indexar produtos na migration 1740900016:', err)
    }

    try {
      const colTiposCliente = app.findCollectionByNameOrId('tipos_cliente')
      colTiposCliente.addIndex('idx_tipos_cliente_codigo_pn_join', false, 'codigo_pn', '')
      app.save(colTiposCliente)
    } catch (err) {
      console.warn('Erro ao indexar tipos_cliente na migration 1740900016:', err)
    }
  },
  (app) => {
    try {
      const colNetSales = app.findCollectionByNameOrId('netsales')
      colNetSales.removeIndex('idx_netsales_join_racnew')
      colNetSales.removeIndex('idx_netsales_chave_documento')
      colNetSales.removeIndex('idx_netsales_serial')
      app.save(colNetSales)
    } catch (_) {}

    try {
      const colRacnew = app.findCollectionByNameOrId('racnew')
      colRacnew.removeIndex('idx_racnew_numero_sap')
      colRacnew.removeIndex('idx_racnew_numero_nfe')
      colRacnew.removeIndex('idx_racnew_join_keys')
      app.save(colRacnew)
    } catch (_) {}

    try {
      const colProdutos = app.findCollectionByNameOrId('produtos')
      colProdutos.removeIndex('idx_produtos_codigo_item_join')
      app.save(colProdutos)
    } catch (_) {}

    try {
      const colTiposCliente = app.findCollectionByNameOrId('tipos_cliente')
      colTiposCliente.removeIndex('idx_tipos_cliente_codigo_pn_join')
      app.save(colTiposCliente)
    } catch (_) {}
  },
)
