routerAdd(
  'POST',
  '/backend/v1/vendas/consolidar',
  (e) => {
    const nowIso = new Date().toISOString()

    let totalConsolidado = 0

    $app.runInTransaction((txApp) => {
      // 1. Clear existing vendas records
      txApp.db().newQuery('DELETE FROM vendas').execute()

      // 2. Fetch all racnew records
      const racnewCol = txApp.findCollectionByNameOrId('racnew')
      const vendasCol = txApp.findCollectionByNameOrId('vendas')

      // Processa TODOS os registros da RacNew em lotes de 5.000 (offset crescente)
      // para bases grandes (~125k) sem perder registros como acontecia com o
      // limite fixo de 20.000.
      const BATCH_SIZE = 5000
      let offset = 0

      while (true) {
        const batch = txApp.findRecordsByFilter('racnew', "id != ''", 'created', BATCH_SIZE, offset)
        if (!batch || batch.length === 0) break

        for (let i = 0; i < batch.length; i++) {
          const r = batch[i]
          const vRec = new Record(vendasCol)

          // Copy RacNew fields
          vRec.set('tipo_documento', r.getString('tipo_documento'))
          vRec.set('nf_entrega_futura', r.getString('nf_entrega_futura'))
          vRec.set('numero_sap', r.getString('numero_sap'))
          vRec.set('numero_nfe', r.getString('numero_nfe'))
          vRec.set('data_lancamento', r.getString('data_lancamento'))
          vRec.set('ultima_data_vencimento', r.getString('ultima_data_vencimento'))
          vRec.set('docto_origem_destino', r.getString('docto_origem_destino'))
          vRec.set('data_origem_destino', r.getString('data_origem_destino'))
          vRec.set('condicao_pagamento', r.getString('condicao_pagamento'))
          vRec.set('codigo_cliente', r.getString('codigo_cliente'))
          vRec.set('nome_cliente', r.getString('nome_cliente'))
          vRec.set('numero_linha', r.getInt('numero_linha'))
          vRec.set('codigo_item', r.getString('codigo_item'))
          vRec.set('descricao_item', r.getString('descricao_item'))
          vRec.set('quantidade', r.getFloat('quantidade'))
          vRec.set('qty_kg_lt', r.getFloat('qty_kg_lt'))
          vRec.set('preco_item', r.getFloat('preco_item'))
          vRec.set('desconto_linha', r.getFloat('desconto_linha'))
          vRec.set('icms', r.getFloat('icms'))
          vRec.set('pis', r.getFloat('pis'))
          vRec.set('cofins', r.getFloat('cofins'))
          vRec.set('ipi', r.getFloat('ipi'))
          vRec.set('icms_partilha', r.getFloat('icms_partilha'))
          vRec.set('total_linha', r.getFloat('total_linha'))
          vRec.set('utilizacao', r.getString('utilizacao'))
          vRec.set('nome_vendedor', r.getString('nome_vendedor'))
          vRec.set('custo_item', r.getFloat('custo_item'))
          vRec.set('nome_filial', r.getString('nome_filial'))
          vRec.set('conta', r.getString('conta'))
          vRec.set('estado', r.getString('estado'))
          vRec.set('cidade', r.getString('cidade'))

          const numSap = r.getString('numero_sap')
          const numNfe = r.getString('numero_nfe')
          const codCli = r.getString('codigo_cliente')
          const codItem = r.getString('codigo_item')

          // Join NetSales: chave_documento = numero_sap AND serial = numero_nfe AND codigo_cliente = codigo_cliente AND codigo_item = codigo_item
          const nsFilter = `chave_documento = '${numSap}' && serial = '${numNfe}' && codigo_cliente = '${codCli}' && codigo_item = '${codItem}'`
          const nsRecords = txApp.findRecordsByFilter('netsales', nsFilter, '', 1, 0)

          if (nsRecords.length > 0) {
            const ns = nsRecords[0]
            vRec.set('grupo_cliente', ns.getString('grupo_cliente'))
            vRec.set('mercado', ns.getString('mercado'))
            vRec.set('usuario_emissor_pedido', ns.getString('usuario_emissor'))
            vRec.set('itms_grp_nam', ns.getString('itms_grp_nam'))
            vRec.set('numero_documento_netsales', ns.getString('numero_documento'))
            vRec.set('preco_unitario', ns.getFloat('preco_unitario'))
            vRec.set('total_nf_sem_frete', ns.getFloat('total_nf_sem_frete'))
            vRec.set('total_nf_novo', ns.getFloat('total_nf_novo'))
            vRec.set('valor_liquido', ns.getFloat('valor_liquido'))
            vRec.set('custo_total', ns.getFloat('custo_total'))
            vRec.set('classificacao', ns.getString('classificacao'))
            vRec.set('vendedor_revenda', ns.getString('vendedor_revenda'))
          }

          // Join Produtos: codigo_item = codigo_item -> grupo_item
          try {
            const prodRec = txApp.findFirstRecordByData('produtos', 'codigo_item', codItem)
            vRec.set('grupo_item', prodRec.getString('grupo_item'))
          } catch (_) {
            vRec.set('grupo_item', '')
          }

          // Concatenated seller > client
          const vend = r.getString('nome_vendedor') || ''
          const cli = r.getString('nome_cliente') || ''
          vRec.set('vendedor_cliente', `${vend} > ${cli}`)
          vRec.set('origem', 'Consolidado')
          vRec.set('data_carga', nowIso)

          txApp.save(vRec)
          totalConsolidado++
        }

        // Próximo lote
        offset += BATCH_SIZE
        // Se o lote veio menor que o tamanho, chegamos ao fim
        if (batch.length < BATCH_SIZE) break
      }
    })

    return e.json(200, {
      success: true,
      total_consolidado: totalConsolidado,
      data_carga: nowIso,
    })
  },
  $apis.requireAuth(),
)
