routerAdd(
  'POST',
  '/backend/v1/import/produtos',
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

    const produtosCol = $app.findCollectionByNameOrId('produtos')
    const nowIso = new Date().toISOString()

    let importados = 0
    let atualizados = 0
    let ignorados = 0
    const erros = []

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const lineNum = i + 1

      const codigoItem = (
        row.codigo_item ||
        row['Código do Item'] ||
        row['Codigo do Item'] ||
        row['Item'] ||
        ''
      )
        .toString()
        .trim()
      if (!codigoItem) {
        ignorados++
        erros.push(`Linha ${lineNum}: campo 'codigo_item' é obrigatório.`)
        continue
      }

      const descricaoItem = (
        row.descricao_item ||
        row['Descrição do Item'] ||
        row['Descricao do Item'] ||
        row['Descrição'] ||
        ''
      )
        .toString()
        .trim()
      const grupoItem = (row.grupo_item || row['Grupo do Item'] || row['Grupo'] || '')
        .toString()
        .trim()
      const ativo = (row.ativo || row['Ativo'] || 'Sim').toString().trim()

      try {
        let isUpdate = false
        let record
        try {
          record = $app.findFirstRecordByData('produtos', 'codigo_item', codigoItem)
          isUpdate = true
        } catch (_) {
          record = new Record(produtosCol)
          record.set('codigo_item', codigoItem)
        }

        record.set('descricao_item', descricaoItem)
        record.set('grupo_item', grupoItem)
        record.set('ativo', ativo)
        record.set('origem', 'Produtos')
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
          `Linha ${lineNum} (${codigoItem}): erro ao salvar: ${err.message || String(err)}`,
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
