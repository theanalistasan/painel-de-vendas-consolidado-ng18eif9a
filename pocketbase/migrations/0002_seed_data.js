migrate(
  (app) => {
    // 1. Seed user: silvio.mattos@rolanddg.com.br / Skip@Pass / "Silvio Mattos"
    const usersCol = app.findCollectionByNameOrId('_pb_users_auth_')
    try {
      app.findAuthRecordByEmail('_pb_users_auth_', 'silvio.mattos@rolanddg.com.br')
    } catch (_) {
      const user = new Record(usersCol)
      user.setEmail('silvio.mattos@rolanddg.com.br')
      user.setPassword('Skip@Pass')
      user.setVerified(true)
      user.set('name', 'Silvio Mattos')
      app.save(user)
    }

    const nowIso = new Date().toISOString()

    // 2. Seed produtos
    const produtosCol = app.findCollectionByNameOrId('produtos')
    const produtosSeed = [
      {
        codigo_item: '1000007767',
        descricao_item: 'SENSOR,PS124TL1',
        grupo_item: 'ACESSÓRIOS',
        ativo: 'Sim',
      },
      {
        codigo_item: 'GS-24',
        descricao_item: 'MAQUINA DE CORTE DE VINIL.',
        grupo_item: 'EQUIPAMENTOS',
        ativo: 'Sim',
      },
      {
        codigo_item: 'D-EA2-5YE',
        descricao_item: 'CARTUCHOS DE TINTA YE 500ML',
        grupo_item: 'TINTAS',
        ativo: 'Sim',
      },
      {
        codigo_item: 'EUV5P-7WH',
        descricao_item: 'CARTUCHOS DE TINTA UV INK WH.',
        grupo_item: 'TINTAS',
        ativo: 'Sim',
      },
    ]

    for (let p of produtosSeed) {
      try {
        app.findFirstRecordByData('produtos', 'codigo_item', p.codigo_item)
      } catch (_) {
        const rec = new Record(produtosCol)
        rec.set('codigo_item', p.codigo_item)
        rec.set('descricao_item', p.descricao_item)
        rec.set('grupo_item', p.grupo_item)
        rec.set('ativo', p.ativo)
        rec.set('origem', 'Produtos')
        rec.set('data_carga', nowIso)
        app.save(rec)
      }
    }

    // 3. Seed racnew
    const racnewCol = app.findCollectionByNameOrId('racnew')
    const racnewSeed = [
      {
        tipo_documento: 'NF',
        nf_entrega_futura: '',
        numero_sap: '19995',
        numero_nfe: '56316',
        data_lancamento: '2021-01-29 00:00:00.000Z',
        ultima_data_vencimento: '2021-03-15 00:00:00.000Z',
        docto_origem_destino: '5126',
        data_origem_destino: '2021-01-29 00:00:00.000Z',
        condicao_pagamento: 'Quinzenal - 15/30/45 dias',
        codigo_cliente: 'C08484',
        nome_cliente: 'DIAMANTE COMERCIO DE TINTAS LTDA',
        numero_linha: 1,
        codigo_item: 'GS-24',
        descricao_item: 'MAQUINA DE CORTE DE VINIL.',
        quantidade: 1,
        qty_kg_lt: 13.6,
        preco_item: 9400,
        desconto_linha: 0,
        icms: 827.22,
        pis: 155.1,
        cofins: 714.4,
        ipi: 0,
        icms_partilha: 0,
        total_linha: 9400,
        utilizacao: 'VENDA DE MERCADORIA',
        nome_vendedor: 'Roland DG Brasil',
        custo_item: 5502.61,
        nome_filial: 'Roland DG Brasil Importação e Exportação Ltda',
        conta: '3.1.1.1.01',
        estado: 'SP',
        cidade: 'São Paulo',
        origem: 'RacNew',
        data_carga: nowIso,
      },
      {
        tipo_documento: 'NF',
        nf_entrega_futura: '',
        numero_sap: '92489',
        numero_nfe: '85918',
        data_lancamento: '2026-06-30 00:00:00.000Z',
        ultima_data_vencimento: '2026-07-06 00:00:00.000Z',
        docto_origem_destino: '30943',
        data_origem_destino: '2026-06-30 00:00:00.000Z',
        condicao_pagamento: 'Especial - 02 dias',
        codigo_cliente: 'C08484',
        nome_cliente: 'DIAMANTE COMERCIO DE TINTAS LTDA',
        numero_linha: 1,
        codigo_item: 'D-EA2-5YE',
        descricao_item: 'CARTUCHOS DE TINTA YE 500ML',
        quantidade: 10,
        qty_kg_lt: 6.7,
        preco_item: 208.23,
        desconto_linha: 0,
        icms: 374.81,
        pis: 28.17,
        cofins: 129.77,
        ipi: 67.67,
        icms_partilha: 0,
        total_linha: 2082.3,
        utilizacao: 'VENDA DE MERCADORIA',
        nome_vendedor: 'Roland DG Brasil',
        custo_item: 106.87,
        nome_filial: 'Roland DG Brasil Importação e Exportação Ltda',
        conta: '3.1.1.1.01',
        estado: 'SP',
        cidade: 'Pescador',
        origem: 'RacNew',
        data_carga: nowIso,
      },
      {
        tipo_documento: 'NF',
        nf_entrega_futura: '',
        numero_sap: '92489',
        numero_nfe: '85918',
        data_lancamento: '2026-06-30 00:00:00.000Z',
        ultima_data_vencimento: '2026-07-06 00:00:00.000Z',
        docto_origem_destino: '30943',
        data_origem_destino: '2026-06-30 00:00:00.000Z',
        condicao_pagamento: 'Especial - 02 dias',
        codigo_cliente: 'C08484',
        nome_cliente: 'DIAMANTE COMERCIO DE TINTAS LTDA',
        numero_linha: 2,
        codigo_item: 'EUV5P-7WH',
        descricao_item: 'CARTUCHOS DE TINTA UV INK WH.',
        quantidade: 2,
        qty_kg_lt: 2.33,
        preco_item: 682.81,
        desconto_linha: 0,
        icms: 245.81,
        pis: 18.48,
        cofins: 85.11,
        ipi: 44.38,
        icms_partilha: 0,
        total_linha: 1365.62,
        utilizacao: 'VENDA DE MERCADORIA',
        nome_vendedor: 'Roland DG Brasil',
        custo_item: 343.93,
        nome_filial: 'Roland DG Brasil Importação e Exportação Ltda',
        conta: '3.1.1.1.01',
        estado: 'SP',
        cidade: 'Pescador',
        origem: 'RacNew',
        data_carga: nowIso,
      },
    ]

    for (let r of racnewSeed) {
      const filter = `numero_sap = '${r.numero_sap}' && numero_nfe = '${r.numero_nfe}' && codigo_item = '${r.codigo_item}' && codigo_cliente = '${r.codigo_cliente}'`
      const found = app.findRecordsByFilter('racnew', filter, '', 1, 0)
      if (found.length === 0) {
        const rec = new Record(racnewCol)
        for (let k in r) {
          rec.set(k, r[k])
        }
        app.save(rec)
      }
    }

    // 4. Seed netsales
    const netsalesCol = app.findCollectionByNameOrId('netsales')
    const netsalesSeed = [
      {
        tipo: 'NF',
        codigo_cliente: 'C08484',
        nome_cliente: 'DIAMANTE COMERCIO DE TINTAS LTDA',
        grupo_cliente: 'REVENDAS 18% ICMS',
        mercado: 'REVENDAS',
        usuario_emissor: 'vanisse.ferreira',
        docdate: '2021-01-29 00:00:00.000Z',
        chave_documento: '19995',
        descrip: 'EQUIPAMENTOS',
        itms_grp_nam: 'FORA DE LINHA',
        codigo_item: 'GS-24',
        numero_documento: '7772',
        quantidade: 1,
        preco_unitario: 9400,
        valor_mercadoria: 9400,
        total_nf_sem_frete: 9400,
        total_nf_novo: 9400,
        valor_liquido: 7703.28,
        serial: '56316',
        custo_total: 5502.62,
        usage: 'VENDA DE MERCADORIA',
        classificacao: 'SIGN',
        revenda: 'Roland DG Brasil',
        vendedor_revenda: 'Roland Brasil Vendedor Revenda',
        municipio: 'Campinas',
        estado: 'SP',
        origem: 'NetSales',
        data_carga: nowIso,
      },
      {
        tipo: 'NF',
        codigo_cliente: 'C08484',
        nome_cliente: 'DIAMANTE COMERCIO DE TINTAS LTDA',
        grupo_cliente: 'REVENDAS 18% ICMS',
        mercado: 'REVENDAS',
        usuario_emissor: 'carine.santos',
        docdate: '2026-06-30 00:00:00.000Z',
        chave_documento: '92489',
        descrip: 'TINTAS',
        itms_grp_nam: 'INK DGXPRESS SOLVENTE',
        codigo_item: 'D-EA2-5YE',
        numero_documento: '37615',
        quantidade: 10,
        preco_unitario: 208.23,
        valor_mercadoria: 2082.3,
        total_nf_sem_frete: 2274.38,
        total_nf_novo: 2274.38,
        valor_liquido: 1549.55,
        serial: '85918',
        custo_total: 1068.66,
        usage: 'VENDA DE MERCADORIA',
        classificacao: 'SOLVENTE INK',
        revenda: 'Roland DG Brasil',
        vendedor_revenda: 'Roland Brasil',
        municipio: 'Hortolândia',
        estado: 'SP',
        origem: 'NetSales',
        data_carga: nowIso,
      },
      {
        tipo: 'NF',
        codigo_cliente: 'C08484',
        nome_cliente: 'DIAMANTE COMERCIO DE TINTAS LTDA',
        grupo_cliente: 'REVENDAS 18% ICMS',
        mercado: 'REVENDAS',
        usuario_emissor: 'carine.santos',
        docdate: '2026-06-30 00:00:00.000Z',
        chave_documento: '92489',
        descrip: 'TINTAS',
        itms_grp_nam: 'INK VERSAOBJECT UV VD',
        codigo_item: 'EUV5P-7WH',
        numero_documento: '37615',
        quantidade: 2,
        preco_unitario: 682.81,
        valor_mercadoria: 1365.62,
        total_nf_sem_frete: 1491.59,
        total_nf_novo: 1491.59,
        valor_liquido: 1016.22,
        serial: '85918',
        custo_total: 687.85,
        usage: 'VENDA DE MERCADORIA',
        classificacao: 'EUV INK',
        revenda: 'Roland DG Brasil',
        vendedor_revenda: 'Roland Brasil',
        municipio: 'Hortolândia',
        estado: 'SP',
        origem: 'NetSales',
        data_carga: nowIso,
      },
    ]

    for (let n of netsalesSeed) {
      const filter = `chave_documento = '${n.chave_documento}' && serial = '${n.serial}' && codigo_item = '${n.codigo_item}' && codigo_cliente = '${n.codigo_cliente}'`
      const found = app.findRecordsByFilter('netsales', filter, '', 1, 0)
      if (found.length === 0) {
        const rec = new Record(netsalesCol)
        for (let k in n) {
          rec.set(k, n[k])
        }
        app.save(rec)
      }
    }

    // 5. Consolidate into vendas
    const vendasCol = app.findCollectionByNameOrId('vendas')
    const existingVendas = app.findRecordsByFilter('vendas', "id != ''", '', 1, 0)
    if (existingVendas.length === 0) {
      const allRacnew = app.findRecordsByFilter('racnew', "id != ''", 'created', 1000, 0)
      for (let r of allRacnew) {
        const vRec = new Record(vendasCol)

        // Copy RacNew fields
        const racFields = [
          'tipo_documento',
          'nf_entrega_futura',
          'numero_sap',
          'numero_nfe',
          'data_lancamento',
          'ultima_data_vencimento',
          'docto_origem_destino',
          'data_origem_destino',
          'condicao_pagamento',
          'codigo_cliente',
          'nome_cliente',
          'numero_linha',
          'codigo_item',
          'descricao_item',
          'quantidade',
          'qty_kg_lt',
          'preco_item',
          'desconto_linha',
          'icms',
          'pis',
          'cofins',
          'ipi',
          'icms_partilha',
          'total_linha',
          'utilizacao',
          'nome_vendedor',
          'custo_item',
          'nome_filial',
          'conta',
          'estado',
          'cidade',
        ]
        for (let f of racFields) {
          vRec.set(f, r.get(f))
        }

        // Join NetSales
        const numSap = r.getString('numero_sap')
        const numNfe = r.getString('numero_nfe')
        const codItem = r.getString('codigo_item')
        const codCli = r.getString('codigo_cliente')
        const nsFilter = `chave_documento = '${numSap}' && serial = '${numNfe}' && codigo_cliente = '${codCli}' && codigo_item = '${codItem}'`
        const nsRecords = app.findRecordsByFilter('netsales', nsFilter, '', 1, 0)

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

        // Join Produtos
        try {
          const prodRec = app.findFirstRecordByData('produtos', 'codigo_item', codItem)
          vRec.set('grupo_item', prodRec.getString('grupo_item'))
        } catch (_) {
          vRec.set('grupo_item', '')
        }

        // Concatenated seller > client
        const vend = r.getString('nome_vendedor')
        const cli = r.getString('nome_cliente')
        vRec.set('vendedor_cliente', `${vend} > ${cli}`)
        vRec.set('origem', 'Consolidado')
        vRec.set('data_carga', nowIso)

        app.save(vRec)
      }
    }
  },
  (app) => {
    // down migration
  },
)
