// Endpoint: POST /backend/v1/import/estoque-sap
// Importação de planilha com Posição de Estoque (SAP)
// Colunas principais: Código do Item + Quantidade em Estoque + Em Trânsito (opcionais: Descrição do Item, Grupo do Item, Depósito, Data de Carga)
// Chave única: Código do Item — upsert na reimportação, nunca duplica.
// Padrão obrigatório: tudo autocontido no callback (sem referências a escopo superior no runtime Goja).

routerAdd(
  'POST',
  '/backend/v1/import/estoque-sap',
  (e) => {
    const body = e.requestInfo().body || {}
    const rawRows = Array.isArray(body.rows) ? body.rows : Array.isArray(body) ? body : []

    if (body.clearBefore === true || body.replace === true) {
      try {
        $app.db().newQuery('DELETE FROM estoque_sap').execute()
      } catch (delErr) {
        console.warn('Erro ao limpar estoque_sap:', delErr)
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

    const col = $app.findCollectionByNameOrId('estoque_sap')
    const now = new Date()
    const nowIso = now.toISOString()

    let importados = 0
    let atualizados = 0
    let mesclados = 0
    let ignorados = 0
    const erros = []
    const avisos = []

    const normalizeStrict = (val) => {
      if (val === undefined || val === null) return ''
      return String(val)
        .replace(/^\uFEFF/, '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toUpperCase()
    }

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

    const parseNumber = (val) => {
      if (val === undefined || val === null) return 0
      if (typeof val === 'number') return isNaN(val) ? 0 : val
      let s = String(val).trim()
      if (!s) return 0
      s = s.replace(/R\$/gi, '').replace(/\s+/g, '')
      if (s.indexOf('.') >= 0 && s.indexOf(',') >= 0) {
        s = s.replace(/\./g, '').replace(',', '.')
      } else if (s.indexOf(',') >= 0) {
        s = s.replace(',', '.')
      }
      const num = parseFloat(s)
      return isNaN(num) ? 0 : num
    }

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

    const COD_ITEM_KEYS = [
      'codigo item',
      'codigo do item',
      'cod item',
      'itemcode',
      'item',
      'codigo',
      'cod',
      'material',
    ]
    const DESC_ITEM_KEYS = [
      'descricao item',
      'descricao do item',
      'descricao',
      'itemname',
      'nome item',
      'denominacao',
    ]
    const GRUPO_ITEM_KEYS = ['grupo do item', 'grupo item', 'grupo', 'itmsgrpnam', 'categoria']
    const ESTOQUE_KEYS = [
      'quantidade estoque',
      'quantidade em estoque',
      'qtd estoque',
      'qtd em estoque',
      'em estoque',
      'estoque',
      'saldo estoque',
      'onhand',
      'saldo',
      'disponivel',
    ]
    const TRANSITO_KEYS = [
      'em transito',
      'transito',
      'saldo transito',
      'qtd transito',
      'quantidade em transito',
      'onorder',
      'pedido de compra',
    ]
    const DEPOSITO_KEYS = ['deposito', 'armazem', 'whscode', 'dep', 'almoxarifado']
    const DATA_CARGA_KEYS = ['data carga', 'data', 'data saldo', 'posicao em', 'docdate']

    // Carrega mapa de produtos para enriquecer descrição/grupo caso venha vazio
    const produtosMap = {}
    try {
      const prodRows = arrayOf(
        new DynamicModel({
          codigo_item: '',
          descricao_item: '',
          grupo_item: '',
        }),
      )
      $app
        .db()
        .newQuery(
          'SELECT codigo_item, descricao_item, grupo_item FROM produtos WHERE codigo_item IS NOT NULL',
        )
        .all(prodRows)
      for (let i = 0; i < prodRows.length; i++) {
        const ci = normalizeStrict(prodRows[i].codigo_item)
        if (ci) {
          produtosMap[ci] = {
            descricao: (prodRows[i].descricao_item || '').trim(),
            grupo: (prodRows[i].grupo_item || '').trim(),
          }
        }
      }
    } catch (pErr) {
      console.warn('estoque_sap: aviso ao ler produtos:', pErr)
    }

    // Índice de registros já existentes em estoque_sap por codigo_item normalizado
    const existingDbMap = {}
    try {
      const dbRows = arrayOf(
        new DynamicModel({
          id: '',
          codigo_item: '',
        }),
      )
      $app.db().newQuery('SELECT id, codigo_item FROM estoque_sap').all(dbRows)
      for (let i = 0; i < dbRows.length; i++) {
        const c = normalizeStrict(dbRows[i].codigo_item)
        if (c) {
          existingDbMap[c] = dbRows[i].id
        }
      }
    } catch (dbErr) {
      console.warn('estoque_sap: aviso ao carregar registros existentes:', dbErr)
    }

    // Deduplicação intra-arquivo por codigo_item
    const intraDeduplicated = []
    const intraMap = {}
    let mescladosNoArquivo = 0

    for (let i = 0; i < rawRows.length; i++) {
      const rawRow = rawRows[i]
      const lineNum = i + 1

      const normRow = {}
      const keys = Object.keys(rawRow)
      for (let k = 0; k < keys.length; k++) {
        normRow[normalizeKey(keys[k])] = rawRow[keys[k]]
      }

      const codItem = getRowVal(normRow, COD_ITEM_KEYS)
      let descItem = getRowVal(normRow, DESC_ITEM_KEYS)
      let grupoItem = getRowVal(normRow, GRUPO_ITEM_KEYS)
      const qtdEstoque = parseNumber(getRowVal(normRow, ESTOQUE_KEYS))
      const emTransito = parseNumber(getRowVal(normRow, TRANSITO_KEYS))
      const deposito = getRowVal(normRow, DEPOSITO_KEYS)

      if (!codItem) {
        // Se a linha é completamente vazia, ignora em silêncio
        if (!descItem && qtdEstoque === 0 && emTransito === 0) {
          ignorados++
          continue
        }
        ignorados++
        erros.push('Linha ' + lineNum + ': Código do Item ausente ou em branco.')
        continue
      }

      const normCode = normalizeStrict(codItem)
      if (produtosMap[normCode]) {
        if (!descItem) descItem = produtosMap[normCode].descricao
        if (!grupoItem) grupoItem = produtosMap[normCode].grupo
      }

      const parsed = {
        lineNum,
        codigo_item: codItem.trim(),
        descricao_item: descItem.trim(),
        grupo_item: grupoItem.trim(),
        quantidade_estoque: qtdEstoque,
        em_transito: emTransito,
        deposito: deposito.trim(),
        data_carga: nowIso,
      }

      if (intraMap[normCode] !== undefined) {
        const existingIdx = intraMap[normCode]
        intraDeduplicated[existingIdx] = parsed
        mescladosNoArquivo++
      } else {
        intraMap[normCode] = intraDeduplicated.length
        intraDeduplicated.push(parsed)
      }
    }

    mesclados += mescladosNoArquivo

    // Gravação no banco com upsert
    for (let i = 0; i < intraDeduplicated.length; i++) {
      const item = intraDeduplicated[i]
      const normCode = normalizeStrict(item.codigo_item)

      try {
        let record = null
        let isUpdate = false
        const existingId = existingDbMap[normCode]

        if (existingId) {
          try {
            record = $app.findRecordById('estoque_sap', existingId)
            isUpdate = true
          } catch (_) {
            record = null
          }
        }

        if (!record) {
          record = new Record(col)
        }

        record.set('codigo_item', item.codigo_item)
        record.set('descricao_item', item.descricao_item)
        record.set('grupo_item', item.grupo_item)
        record.set('quantidade_estoque', item.quantidade_estoque)
        record.set('em_transito', item.em_transito)
        record.set('deposito', item.deposito)
        record.set('data_carga', item.data_carga)

        $app.save(record)
        existingDbMap[normCode] = record.id

        if (isUpdate) {
          atualizados++
        } else {
          importados++
        }
      } catch (err) {
        ignorados++
        erros.push(
          'Linha ' +
            item.lineNum +
            ' (Item ' +
            item.codigo_item +
            '): ' +
            (err.message || String(err)),
        )
      }
    }

    if (mescladosNoArquivo > 0) {
      avisos.push(
        'Blindagem de duplicatas: ' +
          mescladosNoArquivo +
          ' item(ns) repetidos no arquivo foram consolidados na última posição.',
      )
    }

    return e.json(200, {
      success: true,
      importados,
      atualizados,
      mesclados,
      ignorados,
      erros,
      avisos,
      data_carga: nowIso,
    })
  },
  $apis.requireAuth(),
)
