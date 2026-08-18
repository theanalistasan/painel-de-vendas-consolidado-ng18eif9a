routerAdd(
  'POST',
  '/backend/v1/import/racnew',
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

    const racnewCol = $app.findCollectionByNameOrId('racnew')
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

      const numeroSap = (
        row.numero_sap ||
        row['Número SAP'] ||
        row['Numero SAP'] ||
        row['Chave Documento'] ||
        row['numero_documento'] ||
        ''
      )
        .toString()
        .trim()
      const numeroNfe = (
        row.numero_nfe ||
        row['Nº NFe'] ||
        row['N° NFe'] ||
        row['Numero NFe'] ||
        row['Serial'] ||
        ''
      )
        .toString()
        .trim()
      const rawDataLanc = (
        row.data_lancamento ||
        row['Data de Lançamento'] ||
        row['Data de Lancamento'] ||
        row['DOCDATE'] ||
        ''
      )
        .toString()
        .trim()
      const dataLancamento = parseDateStr(rawDataLanc)
      const codigoCliente = (
        row.codigo_cliente ||
        row['Código do Cliente'] ||
        row['Codigo do Cliente'] ||
        row['Cód. Cliente'] ||
        ''
      )
        .toString()
        .trim()
      const codigoItem = (
        row.codigo_item ||
        row['Cód. do Item'] ||
        row['Codigo do Item'] ||
        row['Código do Item'] ||
        ''
      )
        .toString()
        .trim()

      // Número SAP e Nº NFe continuam obrigatórios: se QUALQUER UM destes dois
      // estiver ausente/vazio, o registro é silenciosamente pulado (sem alerta).
      // Código do Cliente e Cód. do Item passam a ser opcionais (o registro é
      // importado mesmo sem eles).
      if (!numeroSap || !numeroNfe) {
        ignorados++
        continue
      }

      try {
        let isUpdate = false
        let record

        const filter = `numero_sap = '${numeroSap}' && numero_nfe = '${numeroNfe}' && codigo_item = '${codigoItem}' && codigo_cliente = '${codigoCliente}'`
        const found = $app.findRecordsByFilter('racnew', filter, '', 1, 0)

        if (found.length > 0) {
          record = found[0]
          isUpdate = true
        } else {
          record = new Record(racnewCol)
        }

        record.set(
          'tipo_documento',
          (row.tipo_documento || row['Tipo Documento'] || row['Tipo de Documento'] || 'NF')
            .toString()
            .trim(),
        )
        record.set(
          'nf_entrega_futura',
          (row.nf_entrega_futura || row['NF Entrega Futura'] || '').toString().trim(),
        )
        record.set('numero_sap', numeroSap)
        record.set('numero_nfe', numeroNfe)
        record.set('data_lancamento', dataLancamento || '')
        record.set(
          'ultima_data_vencimento',
          parseDateStr(
            row.ultima_data_vencimento ||
              row['Última Data Vencimento'] ||
              row['Ultima Data Vencimento'],
          ),
        )
        record.set(
          'docto_origem_destino',
          (row.docto_origem_destino || row['Docto Origem Destino'] || '').toString().trim(),
        )
        record.set(
          'data_origem_destino',
          parseDateStr(row.data_origem_destino || row['Data Origem Destino']),
        )
        record.set(
          'condicao_pagamento',
          (
            row.condicao_pagamento ||
            row['Condição de Pagamento'] ||
            row['Condicao de Pagamento'] ||
            ''
          )
            .toString()
            .trim(),
        )
        record.set('codigo_cliente', codigoCliente)
        record.set(
          'nome_cliente',
          (row.nome_cliente || row['Nome do Cliente'] || row['Cliente'] || '').toString().trim(),
        )
        record.set(
          'numero_linha',
          parseNum(row.numero_linha || row['Nº da Linha'] || row['Numero Linha'] || 1),
        )
        record.set('codigo_item', codigoItem)
        record.set(
          'descricao_item',
          (row.descricao_item || row['Descrição do Item'] || row['Descricao do Item'] || '')
            .toString()
            .trim(),
        )
        record.set('quantidade', parseNum(row.quantidade || row['Quantidade'] || row['Qtd'] || 0))
        record.set(
          'qty_kg_lt',
          parseNum(row.qty_kg_lt || row['Qty (Kg/Lt)'] || row['Qty Kg Lt'] || 0),
        )
        record.set(
          'preco_item',
          parseNum(row.preco_item || row['Preço do Item'] || row['Preco do Item'] || 0),
        )
        record.set('desconto_linha', parseNum(row.desconto_linha || row['Desconto da Linha'] || 0))
        record.set('icms', parseNum(row.icms || row['ICMS'] || 0))
        record.set('pis', parseNum(row.pis || row['PIS'] || 0))
        record.set('cofins', parseNum(row.cofins || row['COFINS'] || 0))
        record.set('ipi', parseNum(row.ipi || row['IPI'] || 0))
        record.set('icms_partilha', parseNum(row.icms_partilha || row['ICMS Partilha'] || 0))
        record.set(
          'total_linha',
          parseNum(row.total_linha || row['Total da Linha'] || row['Total Linha'] || 0),
        )
        record.set(
          'utilizacao',
          (row.utilizacao || row['Utilização'] || row['Utilizacao'] || row['Usage'] || '')
            .toString()
            .trim(),
        )
        record.set(
          'nome_vendedor',
          (row.nome_vendedor || row['Nome do Vendedor'] || row['Vendedor'] || '').toString().trim(),
        )
        record.set(
          'custo_item',
          parseNum(row.custo_item || row['Custo do Item'] || row['Custo Item'] || 0),
        )
        record.set(
          'nome_filial',
          (row.nome_filial || row['Nome da Filial'] || row['Filial'] || '').toString().trim(),
        )
        record.set('conta', (row.conta || row['Conta'] || '').toString().trim())
        record.set('estado', (row.estado || row['Estado'] || row['UF'] || '').toString().trim())
        record.set(
          'cidade',
          (row.cidade || row['Cidade'] || row['Município'] || row['Municipio'] || '')
            .toString()
            .trim(),
        )
        record.set('origem', 'RacNew')
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
          `Linha ${lineNum} (${numeroSap}/${numeroNfe}): erro ao salvar: ${err.message || String(err)}`,
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
