// Endpoint: POST /backend/v1/import/tipos-cliente
// Importação de planilha de Tipos de Cliente do SAP (Substituição Total)
// Estrutura esperada:
// - Código do PN (ex.: C00002)
// - Nome do PN (ex.: INTERMUSIC ELETRONICA, INDUSTRIA E COMERCIO LTDA)
// - Status do cadastro (ex.: Ativo)
// - Tipo de PN (ex.: Cliente)
// - Tipo de Cliente (ex.: Prospect, Revenda, Ata, etc.)
// Chave única: Código do PN.
// Aceita tanto formato colunar padrão quanto pares campo/valor exportados do SAP.

routerAdd(
  'POST',
  '/backend/v1/import/tipos-cliente',
  (e) => {
    const body = e.requestInfo().body || {}
    const rawRows = Array.isArray(body.rows) ? body.rows : Array.isArray(body) ? body : []

    // Substituição Total: o primeiro lote (ou sem flag de lote subsequente) sempre limpa a coleção
    const isSubsequentBatch = body.isSubsequentBatch === true || body.batchIndex > 0
    if (!isSubsequentBatch) {
      try {
        $app.db().newQuery('DELETE FROM tipos_cliente').execute()
      } catch (delErr) {
        console.warn('Erro ao limpar tipos_cliente:', delErr)
      }
    }

    if (rawRows.length === 0) {
      return e.json(400, {
        message: 'Nenhum registro enviado',
        importados: 0,
        atualizados: 0,
        mesclados: 0,
        ignorados: 0,
        erros: ['Nenhum dado encontrado no payload'],
      })
    }

    const col = $app.findCollectionByNameOrId('tipos_cliente')
    const nowIso = new Date().toISOString()

    let importados = 0
    let atualizados = 0
    let ignorados = 0
    let mesclados = 0
    const erros = []

    const normalizeKey = (k) => {
      if (!k) return ''
      return String(k)
        .replace(/^\uFEFF/, '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    }

    const normalizeStrict = (val) => {
      if (val === undefined || val === null) return ''
      return String(val)
        .replace(/^\uFEFF/, '')
        .replace(/\s+/g, ' ')
        .trim()
    }

    const COD_KEYS = [
      'codigo do pn',
      'codigo pn',
      'cod pn',
      'codigo cliente',
      'cod cliente',
      'cardcode',
      'codigo',
      'cod',
    ]
    const NOME_KEYS = [
      'nome do pn',
      'nome pn',
      'nome cliente',
      'razao social',
      'cardname',
      'cliente',
      'nome',
    ]
    const STATUS_CADASTRO_KEYS = [
      'status do cadastro',
      'status cadastro',
      'status cad',
      'situacao do cadastro',
      'status',
    ]
    const TIPO_PN_KEYS = ['tipo de pn', 'tipo pn', 'tipo do pn', 'tipo parceiro', 'cardtype']
    const TIPO_CLIENTE_KEYS = [
      'tipo de cliente',
      'tipo cliente',
      'tipo do cliente',
      'categoria cliente',
      'classificacao cliente',
    ]

    const getRowVal = (normalizedRow, candidateKeys) => {
      for (let i = 0; i < candidateKeys.length; i++) {
        const ck = normalizeKey(candidateKeys[i])
        if (
          normalizedRow[ck] !== undefined &&
          normalizedRow[ck] !== null &&
          String(normalizedRow[ck]).trim() !== ''
        ) {
          return String(normalizedRow[ck]).trim()
        }
      }
      return ''
    }

    // Suporte também a pares de campo/valor quando o SAP exporta verticalmente
    // Se a lista de rows consistir em { campo, valor } ou { coluna, valor }
    const looksLikeKeyValuePairs =
      rawRows.length > 0 &&
      (rawRows[0].campo !== undefined ||
        rawRows[0].Campo !== undefined ||
        rawRows[0]['Nome do Campo'] !== undefined) &&
      (rawRows[0].valor !== undefined ||
        rawRows[0].Valor !== undefined ||
        rawRows[0]['Valor do Campo'] !== undefined)

    let rowsToProcess = rawRows
    if (looksLikeKeyValuePairs) {
      // Reconstroi registros a partir dos blocos de pares
      const reconstructed = []
      let currentItem = {}
      for (let i = 0; i < rawRows.length; i++) {
        const r = rawRows[i]
        const campo = normalizeKey(r.campo || r.Campo || r['Nome do Campo'] || '')
        const valor = normalizeStrict(r.valor || r.Valor || r['Valor do Campo'] || '')
        if (COD_KEYS.indexOf(campo) >= 0) {
          if (Object.keys(currentItem).length > 0) {
            reconstructed.push(currentItem)
          }
          currentItem = {}
          currentItem.codigo_pn = valor
        } else if (NOME_KEYS.indexOf(campo) >= 0) {
          currentItem.nome_pn = valor
        } else if (STATUS_CADASTRO_KEYS.indexOf(campo) >= 0) {
          currentItem.status_cadastro = valor
        } else if (TIPO_PN_KEYS.indexOf(campo) >= 0) {
          currentItem.tipo_pn = valor
        } else if (TIPO_CLIENTE_KEYS.indexOf(campo) >= 0) {
          currentItem.tipo_cliente = valor
        }
      }
      if (Object.keys(currentItem).length > 0) {
        reconstructed.push(currentItem)
      }
      rowsToProcess = reconstructed
    }

    // Carrega registros existentes no banco caso seja lote subsequente
    const existingDbMap = {}
    if (isSubsequentBatch) {
      try {
        const dbRows = arrayOf(
          new DynamicModel({
            id: '',
            codigo_pn: '',
          }),
        )
        $app.db().newQuery('SELECT id, codigo_pn FROM tipos_cliente').all(dbRows)
        for (let i = 0; i < dbRows.length; i++) {
          const cod = normalizeStrict(dbRows[i].codigo_pn).toUpperCase()
          if (cod) existingDbMap[cod] = dbRows[i].id
        }
      } catch (dbErr) {
        console.warn('tipos_cliente: aviso ao ler existentes:', dbErr)
      }
    }

    const intraMap = {}
    const deduplicated = []

    for (let i = 0; i < rowsToProcess.length; i++) {
      const raw = rowsToProcess[i]
      const lineNum = i + 1

      const normRow = {}
      const keys = Object.keys(raw)
      for (let k = 0; k < keys.length; k++) {
        normRow[normalizeKey(keys[k])] = raw[keys[k]]
      }

      const codPn = getRowVal(normRow, COD_KEYS) || normalizeStrict(raw.codigo_pn)
      const nomePn = getRowVal(normRow, NOME_KEYS) || normalizeStrict(raw.nome_pn)
      const statusCad =
        getRowVal(normRow, STATUS_CADASTRO_KEYS) || normalizeStrict(raw.status_cadastro)
      const tipoPn = getRowVal(normRow, TIPO_PN_KEYS) || normalizeStrict(raw.tipo_pn)
      const tipoCli = getRowVal(normRow, TIPO_CLIENTE_KEYS) || normalizeStrict(raw.tipo_cliente)

      if (!codPn && !nomePn && !tipoCli) {
        ignorados++
        continue
      }

      if (!codPn) {
        ignorados++
        erros.push('Linha ' + lineNum + ': Código do PN ausente.')
        continue
      }

      const item = {
        codigo_pn: codPn.trim().toUpperCase(),
        nome_pn: nomePn.trim(),
        status_cadastro: statusCad.trim(),
        tipo_pn: tipoPn.trim(),
        tipo_cliente: tipoCli.trim(),
        data_carga: nowIso,
      }

      const key = item.codigo_pn
      if (intraMap[key] !== undefined) {
        deduplicated[intraMap[key]] = item
        mesclados++
      } else {
        intraMap[key] = deduplicated.length
        deduplicated.push(item)
      }
    }

    for (let i = 0; i < deduplicated.length; i++) {
      const item = deduplicated[i]
      try {
        let record = null
        let isUpdate = false
        const existingId = existingDbMap[item.codigo_pn]

        if (existingId) {
          try {
            record = $app.findRecordById('tipos_cliente', existingId)
            isUpdate = true
          } catch (_) {
            record = null
          }
        }

        if (!record) {
          record = new Record(col)
        }

        record.set('codigo_pn', item.codigo_pn)
        record.set('nome_pn', item.nome_pn)
        record.set('status_cadastro', item.status_cadastro)
        record.set('tipo_pn', item.tipo_pn)
        record.set('tipo_cliente', item.tipo_cliente)
        record.set('data_carga', item.data_carga)

        $app.save(record)
        existingDbMap[item.codigo_pn] = record.id

        if (isUpdate) {
          atualizados++
        } else {
          importados++
        }
      } catch (err) {
        ignorados++
        erros.push('Código ' + item.codigo_pn + ': ' + (err.message || String(err)))
      }
    }

    return e.json(200, {
      success: true,
      importados,
      atualizados,
      mesclados,
      ignorados,
      erros,
      data_carga: nowIso,
    })
  },
  $apis.requireAuth(),
)

// Endpoint: GET /backend/v1/tipos-cliente/options
// Retorna os valores distintos de tipo_cliente para alimentar os filtros multi-select
routerAdd(
  'GET',
  '/backend/v1/tipos-cliente/options',
  (e) => {
    try {
      const rows = arrayOf(new DynamicModel({ tipo_cliente: '' }))
      $app
        .db()
        .newQuery(
          "SELECT DISTINCT tipo_cliente FROM tipos_cliente WHERE tipo_cliente IS NOT NULL AND TRIM(tipo_cliente) != '' ORDER BY tipo_cliente ASC",
        )
        .all(rows)

      const options = []
      for (let i = 0; i < rows.length; i++) {
        const val = (rows[i].tipo_cliente || '').trim()
        if (val && options.indexOf(val) === -1) {
          options.push(val)
        }
      }

      // Se a coleção tipos_cliente estiver vazia mas já existirem tipos preenchidos em vendas ou pedidos_abertos
      if (options.length === 0) {
        const vRows = arrayOf(new DynamicModel({ tipo_cliente: '' }))
        try {
          $app
            .db()
            .newQuery(
              "SELECT DISTINCT tipo_cliente FROM vendas WHERE tipo_cliente IS NOT NULL AND TRIM(tipo_cliente) != '' ORDER BY tipo_cliente ASC",
            )
            .all(vRows)
          for (let i = 0; i < vRows.length; i++) {
            const val = (vRows[i].tipo_cliente || '').trim()
            if (val && options.indexOf(val) === -1) {
              options.push(val)
            }
          }
        } catch (_) {}
      }

      return e.json(200, { options })
    } catch (err) {
      console.warn('Erro ao listar opcoes de tipo_cliente:', err)
      return e.json(200, { options: [] })
    }
  },
  $apis.requireAuth(),
)
