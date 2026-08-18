routerAdd(
  'POST',
  '/backend/v1/import/netsales',
  (e) => {
    const body = e.requestInfo().body || {}
    const rows = Array.isArray(body.rows) ? body.rows : Array.isArray(body) ? body : []

    if (rows.length === 0) {
      return e.json(400, {
        message: 'Nenhum registro enviado',
        importados: 0,
        atualizados: 0,
        ignorados: 0,
        erros: ['Nenhum dado encontrado no payload'],
      })
    }

    const netsalesCol = $app.findCollectionByNameOrId('netsales')
    const nowIso = new Date().toISOString()

    let importados = 0
    let atualizados = 0
    let ignorados = 0
    const erros = []

    const parseNum = (val) => {
      if (val === undefined || val === null || val === '') return 0
      if (typeof val === 'number') return val
      let s = val.toString().trim().replace('R$', '').replace(/\s/g, '')
      if (s.includes(',') && s.includes('.')) {
        s = s.replace(/\./g, '').replace(',', '.')
      } else if (s.includes(',')) {
        s = s.replace(',', '.')
      }
      const n = parseFloat(s)
      return isNaN(n) ? 0 : n
    }

    const parseDateStr = (val) => {
      if (!val) return ''
      const s = val.toString().trim()
      if (s.includes('/')) {
        const parts = s.split('/')
        if (parts.length === 3) {
          let d = parseInt(parts[0], 10)
          let m = parseInt(parts[1], 10)
          let y = parseInt(parts[2], 10)
          if (y < 100) y += 2000
          const mm = String(m).padStart(2, '0')
          const dd = String(d).padStart(2, '0')
          return `${y}-${mm}-${dd} 00:00:00.000Z`
        }
      }
      if (s.includes('-')) {
        if (s.length === 10) return `${s} 00:00:00.000Z`
        return s
      }
      return s
    }

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const lineNum = i + 1

      const chaveDocumento = (
        row.chave_documento ||
        row['Chave Documento'] ||
        row['Chave_Documento'] ||
        row['Número SAP'] ||
        row['Numero SAP'] ||
        ''
      )
        .toString()
        .trim()
      const serial = (
        row.serial ||
        row['Serial'] ||
        row['Nº NFe'] ||
        row['N° NFe'] ||
        row['Numero NFe'] ||
        ''
      )
        .toString()
        .trim()
      const rawDocDate = (
        row.docdate ||
        row['DOCDATE'] ||
        row['DocDate'] ||
        row['Data de Lançamento'] ||
        ''
      )
        .toString()
        .trim()
      const docDate = parseDateStr(rawDocDate)
      const codigoCliente = (
        row.codigo_cliente ||
        row['Cód. Cliente'] ||
        row['Cod. Cliente'] ||
        row['Código do Cliente'] ||
        row['Codigo do Cliente'] ||
        ''
      )
        .toString()
        .trim()
      const codigoItem = (
        row.codigo_item ||
        row['Código do item'] ||
        row['Codigo do item'] ||
        row['Cód. do Item'] ||
        row['Codigo do Item'] ||
        ''
      )
        .toString()
        .trim()

      // Chave Documento (Número SAP) e Serial (Nº NFe) continuam obrigatórios:
      // se QUALQUER UM destes dois estiver ausente/vazio, o registro é
      // silenciosamente pulado (sem alerta). Cód. Cliente e Código do item
      // passam a ser opcionais (o registro é importado mesmo sem eles).
      if (!chaveDocumento || !serial) {
        ignorados++
        continue
      }

      try {
        let isUpdate = false
        let record

        const filter = `chave_documento = '${chaveDocumento}' && serial = '${serial}' && codigo_item = '${codigoItem}' && codigo_cliente = '${codigoCliente}'`
        const found = $app.findRecordsByFilter('netsales', filter, '', 1, 0)

        if (found.length > 0) {
          record = found[0]
          isUpdate = true
        } else {
          record = new Record(netsalesCol)
        }

        record.set('tipo', (row.tipo || row['Tipo'] || 'NF').toString().trim())
        record.set('codigo_cliente', codigoCliente)
        record.set(
          'nome_cliente',
          (row.nome_cliente || row['Nome do Cliente'] || row['Cliente'] || '').toString().trim(),
        )
        record.set(
          'grupo_cliente',
          (row.grupo_cliente || row['Grupo do Cliente'] || row['Grupo de Cliente'] || '')
            .toString()
            .trim(),
        )
        record.set('mercado', (row.mercado || row['Mercado'] || '').toString().trim())
        record.set(
          'usuario_emissor',
          (
            row.usuario_emissor ||
            row['Usuário Emitente do Pedido'] ||
            row['Usuario Emitente do Pedido'] ||
            row['Usuário Emissor'] ||
            ''
          )
            .toString()
            .trim(),
        )
        record.set('docdate', docDate || '')
        record.set('chave_documento', chaveDocumento)
        record.set(
          'descrip',
          (row.descrip || row['Descrip'] || row['Descrição'] || '').toString().trim(),
        )
        record.set(
          'itms_grp_nam',
          (row.itms_grp_nam || row['ItmsGrpNam'] || row['Itms Grp Nam'] || '').toString().trim(),
        )
        record.set('codigo_item', codigoItem)
        record.set(
          'numero_documento',
          (
            row.numero_documento ||
            row['N° do documento'] ||
            row['Nº do documento'] ||
            row['Numero Documento'] ||
            ''
          )
            .toString()
            .trim(),
        )
        record.set('quantidade', parseNum(row.quantidade || row['Quantidade'] || row['Qtd'] || 0))
        record.set(
          'preco_unitario',
          parseNum(row.preco_unitario || row['Preço Unitário'] || row['Preco Unitario'] || 0),
        )
        record.set(
          'valor_mercadoria',
          parseNum(row.valor_mercadoria || row['Valor Mercadoria'] || row['Total da Linha'] || 0),
        )
        record.set(
          'total_nf_sem_frete',
          parseNum(
            row.total_nf_sem_frete || row['Total NF SEM Frete'] || row['Total NF sem Frete'] || 0,
          ),
        )
        record.set(
          'total_nf_novo',
          parseNum(row.total_nf_novo || row['Total NF Novo'] || row['Total NF novo'] || 0),
        )
        record.set(
          'valor_liquido',
          parseNum(row.valor_liquido || row['Valor Liquido'] || row['Valor Líquido'] || 0),
        )
        record.set('serial', serial)
        record.set('custo_total', parseNum(row.custo_total || row['Custo Total'] || 0))
        record.set(
          'usage',
          (row.usage || row['Usage'] || row['Utilização'] || '').toString().trim(),
        )
        record.set(
          'classificacao',
          (row.classificacao || row['Classificacao'] || row['Classificação'] || '')
            .toString()
            .trim(),
        )
        record.set('revenda', (row.revenda || row['Revenda'] || '').toString().trim())
        record.set(
          'vendedor_revenda',
          (row.vendedor_revenda || row['Vendedor Revenda'] || '').toString().trim(),
        )
        record.set(
          'municipio',
          (row.municipio || row['Município'] || row['Municipio'] || row['Cidade'] || '')
            .toString()
            .trim(),
        )
        record.set('estado', (row.estado || row['Estado'] || row['UF'] || '').toString().trim())
        record.set('origem', 'NetSales')
        record.set('data_carga', nowIso)

        $app.save(record)
        if (isUpdate) {
          atualizados++
        } else {
          importados++
        }
      } catch (err) {
        ignorados++
        erros.push(
          `Linha ${lineNum} (${chaveDocumento}/${serial}): erro ao salvar: ${err.message || String(err)}`,
        )
      }
    }

    return e.json(200, {
      success: true,
      importados,
      atualizados,
      ignorados,
      erros,
      data_carga: nowIso,
    })
  },
  $apis.requireAuth(),
)
