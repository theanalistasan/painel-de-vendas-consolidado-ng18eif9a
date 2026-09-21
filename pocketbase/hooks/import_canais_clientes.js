// Endpoint: POST /backend/v1/import/canais-clientes
// Importação ou substituição da planilha "Canais x Clientes" na coleção `canais_clientes`.
//
// Mapeamento aceito para as colunas:
// - CANAIS / eh_canal: booleano (Sim/Não, S/N, True/False, 1/0)
// - DEPLOY: AGIS / ROLAND (ou direto/revenda)
// - Nome do Canal / nome_canal: texto
// - Nome do Cliente / nome_cliente: texto
// - Status / status: texto
// - Serie / Série / serie: texto
// - Código do Cliente / Codigo do Cliente / codigo_cliente: texto (chave de ligação com vendas)
// - Contato / contato: texto
// - E-mail / Email / email: texto
//
// Opção replace: se body.replace === true ou body.mode === 'replace',
// ou na primeira fatia de uma carga se solicitado, limpa a coleção previamente.
// Por padrão, para evitar duplicidades em reimportações sem perder histórico durante lotes,
// faz upsert por combinação (codigo_cliente + nome_canal).
routerAdd(
  'POST',
  '/backend/v1/import/canais-clientes',
  (e) => {
    const body = e.requestInfo().body || {}
    const rows = Array.isArray(body.rows) ? body.rows : Array.isArray(body) ? body : []

    // Opção de limpeza prévia (truncate/delete)
    if (body.clearBefore === true || body.replace === true) {
      try {
        $app.db().newQuery('DELETE FROM canais_clientes').execute()
      } catch (delErr) {
        console.warn('Erro ao limpar canais_clientes antes de importar:', delErr)
      }
    }

    if (rows.length === 0) {
      return e.json(400, {
        message: 'Nenhum registro enviado',
        importados: 0,
        atualizados: 0,
        ignorados: 0,
        erros: ['Nenhum dado encontrado no payload'],
      })
    }

    const canaisCol = $app.findCollectionByNameOrId('canais_clientes')
    const nowIso = new Date().toISOString()

    let importados = 0
    let atualizados = 0
    let ignorados = 0
    const erros = []

    const parseBool = (val) => {
      if (typeof val === 'boolean') return val
      if (!val) return false
      const s = String(val).trim().toUpperCase()
      return s === 'SIM' || s === 'S' || s === 'TRUE' || s === '1' || s === 'YES' || s === 'Y'
    }

    // Função de normalização robusta de cabeçalhos / chaves:
    // Remove BOM UTF-8, acentos, pontuação, múltiplos espaços e converte para minúsculas
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

    // Normaliza mapa de propriedades de cada linha para busca rápida e insensível
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

    // Mapeamento de chaves candidatas com todas as variações semânticas possíveis
    const CANAL_KEYS = [
      'nome do canal',
      'nome canal',
      'canal',
      'nome_canal',
      'canal de vendas',
      'canal vendas',
      'revenda',
      'revenda oficial',
      'parceiro',
      'nome do parceiro',
      'distribuidor',
      'canal marketing',
    ]

    const CLIENTE_NOME_KEYS = [
      'nome do cliente',
      'nome cliente',
      'cliente',
      'nome_cliente',
      'razao social',
      'razao social cliente',
      'cardname',
      'nome razao social',
    ]

    const CLIENTE_COD_KEYS = [
      'codigo do cliente',
      'codigo cliente',
      'cod cliente',
      'cod do cliente',
      'codigo_cliente',
      'cliente codigo',
      'cardcode',
      'id cliente',
      'cliente id',
    ]

    const DEPLOY_KEYS = [
      'deploy',
      'modelo',
      'tipo deploy',
      'modelo deploy',
      'deploy tipo',
      'direta revenda',
      'tipo',
    ]

    const EH_CANAL_KEYS = [
      'canais',
      'eh canal',
      'eh_canal',
      'e canal',
      'canal?',
      'e canal?',
      'eh canal?',
      'is canal',
      'ativo como canal',
    ]

    const STATUS_KEYS = ['status', 'situacao', 'estado cliente']
    const SERIE_KEYS = ['serie', 'serial', 'n serie', 'numero serie', 'tipo serie']
    const CONTATO_KEYS = ['contato', 'telefone', 'celular', 'fone']
    const EMAIL_KEYS = ['email', 'e mail', 'correio']

    // Identificação de cabeçalhos presentes para aviso / telemetria
    const firstRow = rows[0] || {}
    const originalHeaders = Object.keys(firstRow)
    const normalizedHeaders = originalHeaders.map(normalizeKey)

    const hasCanalHeader = normalizedHeaders.some((nh) =>
      CANAL_KEYS.some((ck) => nh === ck || nh.includes('canal')),
    )

    let lastKnownCanal = '' // Para forward-fill de células mescladas na planilha

    for (let i = 0; i < rows.length; i++) {
      const rawRow = rows[i]
      const lineNum = i + 1

      // Cria dicionário com chaves normalizadas para esta linha
      const normRow = {}
      const keys = Object.keys(rawRow)
      for (let k = 0; k < keys.length; k++) {
        const origK = keys[k]
        normRow[normalizeKey(origK)] = rawRow[origK]
      }

      let codigoCliente = getRowVal(normRow, CLIENTE_COD_KEYS)
      let nomeCanal = getRowVal(normRow, CANAL_KEYS)
      const nomeCliente = getRowVal(normRow, CLIENTE_NOME_KEYS)
      const deploy = getRowVal(normRow, DEPLOY_KEYS).toUpperCase()
      const ehCanalRaw = getRowVal(normRow, EH_CANAL_KEYS)
      const ehCanal = parseBool(ehCanalRaw)
      const status = getRowVal(normRow, STATUS_KEYS)
      const serie = getRowVal(normRow, SERIE_KEYS)
      const contato = getRowVal(normRow, CONTATO_KEYS)
      const email = getRowVal(normRow, EMAIL_KEYS)

      // Forward-fill para células mescladas de canal:
      // Se a linha tem nomeCanal preenchido, memoriza como lastKnownCanal.
      // Se não tem nomeCanal, mas lastKnownCanal existe e a linha tem cliente/código, preenche com lastKnownCanal.
      if (nomeCanal) {
        lastKnownCanal = nomeCanal
      } else if (lastKnownCanal && (codigoCliente || nomeCliente)) {
        nomeCanal = lastKnownCanal
      }

      // Validação: linha precisa ter ao menos código do cliente ou nome do canal ou nome do cliente
      if (!codigoCliente && !nomeCanal && !nomeCliente) {
        ignorados++
        erros.push(
          `Linha ${lineNum}: linha vazia ou sem identificador (código de cliente ou canal).`,
        )
        continue
      }

      try {
        let isUpdate = false
        let record = null

        // Tenta localizar registro existente por codigo_cliente + nome_canal para upsert
        if (codigoCliente && nomeCanal) {
          try {
            const checkRows = arrayOf(new DynamicModel({ id: '' }))
            $app
              .db()
              .newQuery(
                'SELECT id FROM canais_clientes WHERE codigo_cliente = {:cod} AND nome_canal = {:canal} LIMIT 1',
              )
              .bind({ cod: codigoCliente, canal: nomeCanal })
              .all(checkRows)
            if (checkRows.length > 0 && checkRows[0].id) {
              record = $app.findRecordById('canais_clientes', checkRows[0].id)
              isUpdate = true
            }
          } catch (_) {}
          // Se não encontrou por codigo_cliente + nome_canal, procura se existe registro do cliente com nome_canal vazio
          if (!record && codigoCliente) {
            try {
              const emptyCanalRows = arrayOf(new DynamicModel({ id: '' }))
              $app
                .db()
                .newQuery(
                  "SELECT id FROM canais_clientes WHERE codigo_cliente = {:cod} AND (nome_canal IS NULL OR nome_canal = '') LIMIT 1",
                )
                .bind({ cod: codigoCliente })
                .all(emptyCanalRows)
              if (emptyCanalRows.length > 0 && emptyCanalRows[0].id) {
                record = $app.findRecordById('canais_clientes', emptyCanalRows[0].id)
                isUpdate = true
              }
            } catch (_) {}
          }
        } else if (codigoCliente) {
          try {
            record = $app.findFirstRecordByData('canais_clientes', 'codigo_cliente', codigoCliente)
            isUpdate = true
          } catch (_) {}
        }

        if (!record) {
          record = new Record(canaisCol)
        }

        record.set('eh_canal', ehCanal)
        record.set('deploy', deploy)
        record.set('nome_canal', nomeCanal)
        record.set('nome_cliente', nomeCliente)
        record.set('status', status)
        record.set('serie', serie)
        record.set('codigo_cliente', codigoCliente)
        record.set('contato', contato)
        record.set('email', email)
        record.set('origem', 'Canais x Clientes')
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
          `Linha ${lineNum} (${codigoCliente || nomeCanal}): erro ao salvar: ${err.message || String(err)}`,
        )
      }
    }

    const avisos = []
    if (!hasCanalHeader) {
      avisos.push(
        `Nenhuma coluna com nome de canal encontrada nos cabeçalhos recebidos: [${originalHeaders.join(', ')}]. Colunas esperadas incluem "Nome do Canal" ou "Canal".`,
      )
    }

    return e.json(200, {
      success: true,
      importados,
      atualizados,
      ignorados,
      erros,
      avisos,
      headersRecebidos: originalHeaders,
      data_carga: nowIso,
    })
  },
  $apis.requireAuth(),
)
