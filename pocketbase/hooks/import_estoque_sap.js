// Endpoint: POST /backend/v1/import/estoque-sap
// Importação de planilha com Posição de Estoque / Estoque Real (SAP) — 15 colunas:
// 1. Código do Item (ex.: D-UAB-GL)
// 2. Descrição Português (ex.: CARTUCHOS DE TINTA UV 220ML VERNIZ)
// 3. Descrição Inglês (ex.: UV INK 220ML GLOSS)
// 4. Código do Grupo (ex.: 2)
// 5. Nome do Grupo (ex.: ACESSÓRIOS)
// 6. Código do Subgrupo (ex.: 199)
// 7. Nome do Subgrupo (ex.: INK VERSASTUDIO UV)
// 8. Item Code (ex.: 417081991)
// 9. Depósito (ex.: 30)
// 10. Em Estoque (ex.: 0)
// 11. Em Trânsito (ex.: 0)
// 12. Pedido Venda (ex.: 0)
// 13. Estoque Líquido (ex.: 0)
// 14. Custo do Item (ex.: 0 ou 150.50)
// 15. Última Venda (data, ex.: 14/10/2026)
//
// REQUISITO: Substituição total mandatória. Cada importação limpa a base antes
// (a menos que seja lote subsequente de carga particionada).
// Chave única: Código do Item (upsert intra-arquivo e em lotes subsequentes, nunca duplica).
//
// Padrão Goja defensivo: inicializar campos de DynamicModel com '' e converter em JS (toNum/toInt)
// para evitar "Scan error float64 to int64".

routerAdd(
  'POST',
  '/backend/v1/import/estoque-sap',
  (e) => {
    const body = e.requestInfo().body || {}
    const rawRows = Array.isArray(body.rows) ? body.rows : Array.isArray(body) ? body : []

    // Substituição total mandatória: o primeiro lote (ou requisição única sem batch) SEMPRE apaga
    // a base anterior para garantir que o que vale é sempre a importação mais recente.
    const isSubsequentBatch = body.isSubsequentBatch === true || body.batchIndex > 0
    if (!isSubsequentBatch) {
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

    const parseDateIso = (val) => {
      if (!val) return ''
      if (typeof val === 'number' && val > 30000 && val < 60000) {
        const excelEpoch = new Date(1899, 11, 30)
        const d = new Date(excelEpoch.getTime() + val * 86400000)
        if (!isNaN(d.getTime())) {
          return d.toISOString().slice(0, 10)
        }
      }
      const s = String(val).trim()
      if (!s) return ''
      const matchBr = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/)
      if (matchBr) {
        let dia = matchBr[1].padStart(2, '0')
        let mes = matchBr[2].padStart(2, '0')
        let ano = matchBr[3]
        if (ano.length === 2) {
          ano = parseInt(ano, 10) > 50 ? '19' + ano : '20' + ano
        }
        return ano + '-' + mes + '-' + dia
      }
      const matchIso = s.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/)
      if (matchIso) {
        let ano = matchIso[1]
        let mes = matchIso[2].padStart(2, '0')
        let dia = matchIso[3].padStart(2, '0')
        return ano + '-' + mes + '-' + dia
      }
      return ''
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

    // Mapeamento semântico das 15 colunas da planilha SAP Estoque Real
    const COD_ITEM_KEYS = [
      'codigo do item',
      'codigo item',
      'cod item',
      'itemcode',
      'item code',
      'item',
      'codigo',
      'cod',
      'material',
    ]

    const DESC_PT_KEYS = [
      'descricao portugues',
      'descricao em portugues',
      'descricao pt',
      'descricao do item',
      'descricao item',
      'descricao',
      'itemname',
      'nome item',
      'denominacao',
    ]

    const DESC_EN_KEYS = [
      'descricao ingles',
      'descricao em ingles',
      'descricao en',
      'description en',
      'english description',
      'desc ingles',
    ]

    const COD_GRUPO_KEYS = [
      'codigo do grupo',
      'codigo grupo',
      'cod grupo',
      'itmsgrpcod',
      'itmsgrpcode',
      'grupo cod',
    ]

    const NOME_GRUPO_KEYS = [
      'nome do grupo',
      'nome grupo',
      'grupo do item',
      'grupo item',
      'grupo',
      'itmsgrpnam',
      'categoria',
    ]

    const COD_SUBGRUPO_KEYS = [
      'codigo do subgrupo',
      'codigo subgrupo',
      'cod subgrupo',
      'subgrupo cod',
      'subgrupo codigo',
      'cod sub grupo',
    ]

    const NOME_SUBGRUPO_KEYS = [
      'nome do subgrupo',
      'nome subgrupo',
      'subgrupo',
      'sub grupo',
      'subgrupo nome',
    ]

    const ITEM_CODE_NUM_KEYS = [
      'item code',
      'itemcode',
      'sap item code',
      'codigo sap',
      'cod sap',
      'codigo numerico',
    ]

    const DEPOSITO_KEYS = ['deposito', 'armazem', 'whscode', 'dep', 'almoxarifado']

    const ESTOQUE_KEYS = [
      'em estoque',
      'quantidade em estoque',
      'quantidade estoque',
      'qtd em estoque',
      'qtd estoque',
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
      'quantidade transito',
      'onorder',
      'pedido de compra',
    ]

    const PEDIDO_VENDA_KEYS = [
      'pedido venda',
      'pedido de venda',
      'pedidos venda',
      'pedidos de venda',
      'ped venda',
      'iscommited',
      'reservado',
      'empenhado',
      'qtd comprometida',
    ]

    const ESTOQUE_LIQUIDO_KEYS = [
      'estoque liquido',
      'saldo liquido',
      'qtd liquida',
      'disponivel liquido',
      'onhand available',
    ]

    const CUSTO_ITEM_KEYS = [
      'custo do item',
      'custo item',
      'custo',
      'custo unitario',
      'stockprice',
      'avgprice',
      'valor unitario custo',
    ]

    const ULTIMA_VENDA_KEYS = [
      'ultima venda',
      'data da ultima venda',
      'data ultima venda',
      'dt ultima venda',
      'last sale',
      'last date',
    ]

    // Carrega catálogo de produtos para enriquecer descrição/grupo caso venha vazio
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
    // (relevante para lotes subsequentes quando isSubsequentBatch === true)
    const existingDbMap = {}
    if (isSubsequentBatch) {
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
    }

    // Deduplicação intra-arquivo por codigo_item (mantém a ocorrência mais recente da planilha)
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

      // Leitura com prioridade para Código do Item
      let codItem = getRowVal(normRow, [
        'codigo do item',
        'codigo item',
        'cod item',
        'itemcode',
        'item code',
        'item',
        'codigo',
        'cod',
      ])
      let itemCodeNum = getRowVal(normRow, ['item code', 'itemcode', 'sap item code', 'codigo sap'])

      // Se itemCodeNum for exatamente igual ao codItem (ex: só tinha 1 coluna chamada "Item Code" e era o código principal),
      // mantém. Se houver duas colunas ("Código do Item" e "Item Code"), codItem é o principal (ex. D-UAB-GL) e itemCodeNum é o código secundário (ex. 417081991).
      if (!codItem && itemCodeNum) {
        codItem = itemCodeNum
      }

      let descPt = getRowVal(normRow, DESC_PT_KEYS)
      const descEn = getRowVal(normRow, DESC_EN_KEYS)
      const codGrupo = getRowVal(normRow, COD_GRUPO_KEYS)
      let nomeGrupo = getRowVal(normRow, NOME_GRUPO_KEYS)
      const codSubgrupo = getRowVal(normRow, COD_SUBGRUPO_KEYS)
      const nomeSubgrupo = getRowVal(normRow, NOME_SUBGRUPO_KEYS)
      const deposito = getRowVal(normRow, DEPOSITO_KEYS)

      const qtdEstoque = parseNumber(getRowVal(normRow, ESTOQUE_KEYS))
      const emTransito = parseNumber(getRowVal(normRow, TRANSITO_KEYS))
      const pedidoVenda = parseNumber(getRowVal(normRow, PEDIDO_VENDA_KEYS))
      let estoqueLiquido = parseNumber(getRowVal(normRow, ESTOQUE_LIQUIDO_KEYS))
      // Se Estoque Líquido não veio explicitamente mas temos Em Estoque e Pedido Venda,
      // calcula o valor sugerido caso não informado
      if (!getRowVal(normRow, ESTOQUE_LIQUIDO_KEYS) && (qtdEstoque !== 0 || pedidoVenda !== 0)) {
        estoqueLiquido = qtdEstoque - pedidoVenda
      }

      const custoItem = parseNumber(getRowVal(normRow, CUSTO_ITEM_KEYS))
      const rawUltimaVenda = getRowVal(normRow, ULTIMA_VENDA_KEYS)
      const ultimaVenda = parseDateIso(rawUltimaVenda)

      if (!codItem) {
        // Se a linha for completamente vazia, ignora em silêncio
        if (!descPt && !nomeGrupo && qtdEstoque === 0 && emTransito === 0) {
          ignorados++
          continue
        }
        ignorados++
        erros.push('Linha ' + lineNum + ': Código do Item ausente ou em branco.')
        continue
      }

      const normCode = normalizeStrict(codItem)
      if (produtosMap[normCode]) {
        if (!descPt) descPt = produtosMap[normCode].descricao
        if (!nomeGrupo) nomeGrupo = produtosMap[normCode].grupo
      }

      const parsed = {
        lineNum,
        codigo_item: codItem.trim(),
        descricao_item: descPt.trim(),
        descricao_ingles: descEn.trim(),
        codigo_grupo: codGrupo.trim(),
        nome_grupo: nomeGrupo.trim(),
        grupo_item: nomeGrupo.trim(), // compatibilidade com schema anterior
        codigo_subgrupo: codSubgrupo.trim(),
        nome_subgrupo: nomeSubgrupo.trim(),
        item_code: itemCodeNum.trim(),
        deposito: deposito.trim(),
        quantidade_estoque: qtdEstoque,
        em_transito: emTransito,
        pedido_venda: pedidoVenda,
        estoque_liquido: estoqueLiquido,
        custo_item: custoItem,
        ultima_venda: ultimaVenda,
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

    // Gravação no banco com upsert por código do item
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
        record.set('descricao_ingles', item.descricao_ingles)
        record.set('codigo_grupo', item.codigo_grupo)
        record.set('nome_grupo', item.nome_grupo)
        record.set('grupo_item', item.grupo_item)
        record.set('codigo_subgrupo', item.codigo_subgrupo)
        record.set('nome_subgrupo', item.nome_subgrupo)
        record.set('item_code', item.item_code)
        record.set('deposito', item.deposito)
        record.set('quantidade_estoque', item.quantidade_estoque)
        record.set('em_transito', item.em_transito)
        record.set('pedido_venda', item.pedido_venda)
        record.set('estoque_liquido', item.estoque_liquido)
        record.set('custo_item', item.custo_item)
        if (item.ultima_venda) {
          record.set('ultima_venda', item.ultima_venda)
        }
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
