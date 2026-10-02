// Endpoint: POST /backend/v1/import/pedidos-abertos
// Importação de planilha de Pedidos em Aberto do SAP (19 colunas)
// Cabeçalhos tolerantes a acentos, caixa, espaços e BOM:
// Nº Pedido, Data do Pedido, Código Cliente, Nome Cliente, Usuário Emitente, Linha,
// Código Item, Descrição Item, Grupo do Item, Qtd Solicitada, Status da Linha, Qtd Aberto,
// Em Estoque, Em Trânsito, Depósito, Preço Unitário, % Desconto, Preço após desconto, Status.
//
// Chave única: Nº Pedido + Linha — upsert na reimportação, NUNCA duplicar.
// Enriquecimento: Canal / Deploy / Inside a partir de canais_clientes (COD = codigo_cliente)
// e Grupo do Item a partir da tabela produtos quando vier vazio.

routerAdd(
  'POST',
  '/backend/v1/import/pedidos-abertos',
  (e) => {
    const body = e.requestInfo().body || {}
    const rawRows = Array.isArray(body.rows) ? body.rows : Array.isArray(body) ? body : []

    if (body.clearBefore === true || body.replace === true) {
      try {
        $app.db().newQuery('DELETE FROM pedidos_abertos').execute()
      } catch (delErr) {
        console.warn('Erro ao limpar pedidos_abertos:', delErr)
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

    const col = $app.findCollectionByNameOrId('pedidos_abertos')
    const now = new Date()
    const nowIso = now.toISOString()

    let importados = 0
    let atualizados = 0
    let mesclados = 0
    let ignorados = 0
    const erros = []
    const avisos = []

    // Helper: normalização estrita de texto
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

    // Normalização de chaves de cabeçalho
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

    // Parse de valores numéricos tolerante ao formato pt-BR "1.000,00" ou internacional 1000.00
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

    // Parse de inteiros
    const parseIntSafe = (val) => {
      const n = parseNumber(val)
      return Math.round(n)
    }

    // Helper: normalização tolerante para casamento de código de cliente
    const normalizeCodCliente = (val) => {
      if (!val) return ''
      return String(val)
        .replace(/^\uFEFF/, '')
        .trim()
        .toUpperCase()
    }

    // Parse de data flexível: dd/mm/aaaa, aaaa-mm-dd, Excel date serial
    const parseDateIso = (val) => {
      if (!val) return ''
      if (typeof val === 'number' && val > 30000 && val < 60000) {
        // Excel serial number
        const excelEpoch = new Date(1899, 11, 30)
        const d = new Date(excelEpoch.getTime() + val * 86400000)
        if (!isNaN(d.getTime())) {
          return d.toISOString().slice(0, 10)
        }
      }
      const s = String(val).trim()
      if (!s) return ''
      // Formato dd/mm/aaaa ou dd/mm/aa
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
      // Formato ISO aaaa-mm-dd
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

    // Mapeamento semântico dos 19 campos
    const PEDIDO_KEYS = [
      'no pedido',
      'numero pedido',
      'n pedido',
      'pedido',
      'num pedido',
      'nr pedido',
      'ordem',
    ]
    const DATA_KEYS = [
      'data do pedido',
      'data pedido',
      'data',
      'dt pedido',
      'docdate',
      'data emissao',
    ]
    const COD_CLI_KEYS = [
      'codigo cliente',
      'cod cliente',
      'codigo do cliente',
      'cod',
      'cardcode',
      'id cliente',
    ]
    const NOME_CLI_KEYS = [
      'nome cliente',
      'nome do cliente',
      'cliente',
      'razao social',
      'cardname',
      'revenda',
    ]
    const USUARIO_KEYS = [
      'usuario emitente',
      'usuario emissor',
      'emitente',
      'vendedor',
      'criado por',
      'usuario',
    ]
    const LINHA_KEYS = ['linha', 'n linha', 'no linha', 'numero linha', 'item line', 'linenum']
    const COD_ITEM_KEYS = ['codigo item', 'codigo do item', 'cod item', 'itemcode', 'item']
    const DESC_ITEM_KEYS = [
      'descricao item',
      'descricao do item',
      'descricao',
      'itemname',
      'nome item',
    ]
    const GRUPO_ITEM_KEYS = ['grupo do item', 'grupo item', 'grupo', 'itmsgrpnam', 'categoria']
    const QTD_SOLICITADA_KEYS = [
      'qtd solicitada',
      'quantidade solicitada',
      'qtd pedida',
      'quantidade pedida',
      'qtd',
    ]
    const STATUS_LINHA_KEYS = ['status da linha', 'status linha', 'situacao da linha', 'linestatus']
    const QTD_ABERTO_KEYS = [
      'qtd aberto',
      'quantidade em aberto',
      'qtd em aberto',
      'quantidade aberto',
      'aberto',
    ]
    const ESTOQUE_KEYS = ['em estoque', 'estoque', 'saldo estoque', 'qtd estoque', 'onhand']
    const TRANSITO_KEYS = ['em transito', 'transito', 'saldo transito', 'qtd transito']
    const DEPOSITO_KEYS = ['deposito', 'armazem', 'whscode', 'almoxarifado', 'dep']
    const PRECO_UNIT_KEYS = [
      'preco unitario',
      'preco unit',
      'vl unitario',
      'valor unitario',
      'preco',
    ]
    const DESCONTO_KEYS = [
      'desconto',
      'desconto perc',
      'desconto percentual',
      'perc desconto',
      'desc',
    ]
    const PRECO_DESC_KEYS = [
      'preco apos desconto',
      'preco com desconto',
      'preco liquido',
      'vl liquido',
      'preco final',
    ]
    const STATUS_KEYS = ['status', 'situacao', 'docstatus', 'status doc', 'status geral']

    // Carrega enriquecimentos:
    // 1. Mapa de canais_clientes por codigo_cliente normalizado
    const canaisMap = {}
    try {
      const ccRows = arrayOf(
        new DynamicModel({
          codigo_cliente: '',
          nome_cliente: '',
          nome_canal: '',
          deploy: '',
          inside: '',
        }),
      )
      $app
        .db()
        .newQuery(
          "SELECT codigo_cliente, nome_cliente, nome_canal, deploy, inside FROM canais_clientes WHERE nome_canal IS NOT NULL AND nome_canal != ''",
        )
        .all(ccRows)
      for (let i = 0; i < ccRows.length; i++) {
        const rawCod = ccRows[i].codigo_cliente
        const cod = normalizeStrict(rawCod)
        const codTol = normalizeCodCliente(rawCod)
        const nom = normalizeStrict(ccRows[i].nome_cliente)
        let dep = (ccRows[i].deploy || '').trim().toUpperCase()
        if (dep.indexOf('AGIS') >= 0) dep = 'AGIS'
        else if (dep.indexOf('ROLAND') >= 0) dep = 'ROLAND'
        else dep = 'Nenhum'

        const info = {
          nome_canal: (ccRows[i].nome_canal || '').trim(),
          deploy: dep,
          inside: (ccRows[i].inside || '').trim().toUpperCase(),
        }
        if (cod) canaisMap[cod] = info
        if (codTol) canaisMap[codTol] = info
        if (nom && !canaisMap['NAME::' + nom]) canaisMap['NAME::' + nom] = info
      }
    } catch (cErr) {
      console.warn('pedidos_abertos: aviso ao carregar canais_clientes:', cErr)
    }

    // 2. Mapa de catálogo de produtos por codigo_item para enriquecer grupo_item se vier vazio
    const produtosGrupoMap = {}
    try {
      const prodRows = arrayOf(
        new DynamicModel({
          codigo_item: '',
          grupo_item: '',
        }),
      )
      $app
        .db()
        .newQuery(
          "SELECT codigo_item, grupo_item FROM produtos WHERE grupo_item IS NOT NULL AND grupo_item != ''",
        )
        .all(prodRows)
      for (let i = 0; i < prodRows.length; i++) {
        const c = normalizeStrict(prodRows[i].codigo_item)
        if (c) produtosGrupoMap[c] = (prodRows[i].grupo_item || '').trim()
      }
    } catch (pErr) {
      console.warn('pedidos_abertos: aviso ao carregar produtos:', pErr)
    }

    // 3. Índice em memória de registros já existentes em pedidos_abertos
    const existingDbMap = {}
    try {
      const dbRows = arrayOf(
        new DynamicModel({
          id: '',
          numero_pedido: '',
          linha: '',
        }),
      )
      $app.db().newQuery('SELECT id, numero_pedido, linha FROM pedidos_abertos').all(dbRows)
      for (let i = 0; i < dbRows.length; i++) {
        const p = normalizeStrict(dbRows[i].numero_pedido)
        const l = Number(dbRows[i].linha) || 0
        if (p) {
          existingDbMap[p + '::' + l] = dbRows[i].id
        }
      }
    } catch (dbErr) {
      console.warn('pedidos_abertos: aviso ao carregar pedidos existentes:', dbErr)
    }

    // Deduplicação intra-arquivo (Nº Pedido + Linha)
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

      const numPedido = getRowVal(normRow, PEDIDO_KEYS)
      const linhaRaw = getRowVal(normRow, LINHA_KEYS)
      const linha = linhaRaw ? parseIntSafe(linhaRaw) : 1
      const codItem = getRowVal(normRow, COD_ITEM_KEYS)
      const descItem = getRowVal(normRow, DESC_ITEM_KEYS)

      if (!numPedido && !codItem && !descItem) {
        ignorados++
        continue
      }

      if (!numPedido) {
        ignorados++
        erros.push('Linha ' + lineNum + ': Nº Pedido ausente ou em branco.')
        continue
      }

      const dataPedido = parseDateIso(getRowVal(normRow, DATA_KEYS))
      const codCli = getRowVal(normRow, COD_CLI_KEYS)
      const nomeCli = getRowVal(normRow, NOME_CLI_KEYS)
      const usuario = getRowVal(normRow, USUARIO_KEYS)
      let grupoItem = getRowVal(normRow, GRUPO_ITEM_KEYS)

      // Se grupo do item vier vazio, enriquece a partir de produtos
      if (!grupoItem && codItem) {
        const normCodItem = normalizeStrict(codItem)
        if (produtosGrupoMap[normCodItem]) {
          grupoItem = produtosGrupoMap[normCodItem]
        }
      }

      const qtdSolicitada = parseIntSafe(getRowVal(normRow, QTD_SOLICITADA_KEYS))
      const statusLinha = getRowVal(normRow, STATUS_LINHA_KEYS) || 'Aberta'
      const qtdAberto = parseIntSafe(getRowVal(normRow, QTD_ABERTO_KEYS))
      const emEstoque = parseIntSafe(getRowVal(normRow, ESTOQUE_KEYS))
      const emTransito = parseIntSafe(getRowVal(normRow, TRANSITO_KEYS))
      const deposito = getRowVal(normRow, DEPOSITO_KEYS)
      const precoUnit = parseNumber(getRowVal(normRow, PRECO_UNIT_KEYS))
      const descPerc = parseNumber(getRowVal(normRow, DESCONTO_KEYS))
      let precoAposDesc = parseNumber(getRowVal(normRow, PRECO_DESC_KEYS))
      if (precoAposDesc === 0 && precoUnit > 0) {
        precoAposDesc = precoUnit * (1 - descPerc / 100)
      }
      const statusDoc = getRowVal(normRow, STATUS_KEYS) || 'O'

      // Valor em aberto: preço após desconto * qtd em aberto
      const valorEmAberto = precoAposDesc * (qtdAberto > 0 ? qtdAberto : 0)

      // Enriquecimento de canal (casamento tolerante via COD / codigo_cliente)
      let canalInfo = null
      const normCodCli = normalizeStrict(codCli)
      const tolCodCli = normalizeCodCliente(codCli)
      const normNomeCli = normalizeStrict(nomeCli)
      if (normCodCli && canaisMap[normCodCli]) {
        canalInfo = canaisMap[normCodCli]
      } else if (tolCodCli && canaisMap[tolCodCli]) {
        canalInfo = canaisMap[tolCodCli]
      } else if (normNomeCli && canaisMap['NAME::' + normNomeCli]) {
        canalInfo = canaisMap['NAME::' + normNomeCli]
      }

      const parsedItem = {
        lineNum,
        numero_pedido: numPedido,
        data_pedido: dataPedido,
        codigo_cliente: codCli,
        nome_cliente: nomeCli,
        usuario_emitente: usuario,
        linha: linha,
        codigo_item: codItem,
        descricao_item: descItem,
        grupo_item: grupoItem,
        qtd_solicitada: qtdSolicitada,
        status_linha: statusLinha,
        qtd_aberto: qtdAberto,
        em_estoque: emEstoque,
        em_transito: emTransito,
        deposito: deposito,
        preco_unitario: precoUnit,
        desconto_percentual: descPerc,
        preco_apos_desconto: precoAposDesc,
        status: statusDoc,
        valor_em_aberto: valorEmAberto,
        nome_canal: canalInfo ? canalInfo.nome_canal : '',
        deploy: canalInfo ? canalInfo.deploy : '',
        inside: canalInfo ? canalInfo.inside : '',
        origem: 'PedidosAbertos',
        data_carga: nowIso,
      }

      const dedupeKey = normalizeStrict(numPedido) + '::' + linha
      if (intraMap[dedupeKey] !== undefined) {
        // Substitui pela ocorrência mais recente da planilha
        const existingIdx = intraMap[dedupeKey]
        intraDeduplicated[existingIdx] = parsedItem
        mescladosNoArquivo++
      } else {
        intraMap[dedupeKey] = intraDeduplicated.length
        intraDeduplicated.push(parsedItem)
      }
    }

    mesclados += mescladosNoArquivo

    // Salva registros com upsert
    for (let i = 0; i < intraDeduplicated.length; i++) {
      const item = intraDeduplicated[i]
      const key = normalizeStrict(item.numero_pedido) + '::' + item.linha

      try {
        let record = null
        let isUpdate = false
        const existingId = existingDbMap[key]

        if (existingId) {
          try {
            record = $app.findRecordById('pedidos_abertos', existingId)
            isUpdate = true
          } catch (_) {
            record = null
          }
        }

        if (!record) {
          record = new Record(col)
        }

        record.set('numero_pedido', item.numero_pedido)
        if (item.data_pedido) record.set('data_pedido', item.data_pedido)
        record.set('codigo_cliente', item.codigo_cliente)
        record.set('nome_cliente', item.nome_cliente)
        record.set('usuario_emitente', item.usuario_emitente)
        record.set('linha', item.linha)
        record.set('codigo_item', item.codigo_item)
        record.set('descricao_item', item.descricao_item)
        record.set('grupo_item', item.grupo_item)
        record.set('qtd_solicitada', item.qtd_solicitada)
        record.set('status_linha', item.status_linha)
        record.set('qtd_aberto', item.qtd_aberto)
        record.set('em_estoque', item.em_estoque)
        record.set('em_transito', item.em_transito)
        record.set('deposito', item.deposito)
        record.set('preco_unitario', item.preco_unitario)
        record.set('desconto_percentual', item.desconto_percentual)
        record.set('preco_apos_desconto', item.preco_apos_desconto)
        record.set('status', item.status)
        record.set('valor_em_aberto', item.valor_em_aberto)
        record.set('nome_canal', item.nome_canal)
        record.set('deploy', item.deploy)
        record.set('inside', item.inside)
        record.set('origem', 'PedidosAbertos')
        record.set('data_carga', nowIso)

        $app.save(record)
        existingDbMap[key] = record.id

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
            ' (Pedido ' +
            item.numero_pedido +
            ' / Linha ' +
            item.linha +
            '): ' +
            (err.message || String(err)),
        )
      }
    }

    if (mescladosNoArquivo > 0) {
      avisos.push(
        'Blindagem de duplicatas: ' +
          mescladosNoArquivo +
          ' linha(s) repetidas no arquivo (mesmo Nº Pedido + Linha) foram tratadas automaticamente sem duplicar.',
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
