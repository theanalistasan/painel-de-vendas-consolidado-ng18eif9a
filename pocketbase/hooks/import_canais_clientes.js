// Endpoint: POST /backend/v1/import/canais-clientes
// Importação ou substituição da planilha "Base Única de Canais" na coleção `canais_clientes`.
//
// Cabeçalhos suportados (Base Única e legado):
// - Status (valores: "Ativo", "Atvo", etc.)
// - Série / Serie (valores: "Manual", "Clientes", etc.)
// - CANAIS (valores: "SIM" / "Não", boolean)
// - CANAL_FATURAMENTO / DEPLOY ("AGIS", "AGIS - CONFIRMAR" -> AGIS; "ROLAND" -> ROLAND; vazio -> "")
// - SEGMENTO ("DIGITAL PRINTING (DP)", "3D", "DENTAL")
// - INSIDE (nome do vendedor interno, ex: CARINE, FERNANDA, PALOMA)
// - COD / Código do Cliente (código do cliente, ex: C00099, C08551, C11379)
// - CANAL / Nome do Canal (nome curto do canal, ex: BLUE BIRD, KONICA, ELETRONICPRINT)
// - REVENDA / Nome do Cliente (razão social do cliente)
// - NOME DO CONTATO / Contato
// - CARGO (DONO, VENDEDOR, GERENTE, etc.)
// - E-MAIL / Email
// - TELEFONE
//
// Múltiplos contatos por cliente:
// Para manter os contatos detalhados sem duplicar desnecessariamente em reimportações,
// a chave de identificação única no upsert é: (codigo_cliente + nome_canal + contato + email).
// Quando a mesma linha for reimportada, ela é atualizada; se houver novo contato para o mesmo cliente,
// um novo registro de contato é criado. Os hooks deduplicam clientes por código/nome para filtros.
//
// Regras de normalização de negócio:
// - CANAIS: "SIM" (normalizado, tolerante a acentos/caixa) -> true
// - CANAL_FATURAMENTO:
//   "AGIS - CONFIRMAR", "AGIS", "AGIS-CONFIRMAR" -> "AGIS"
//   "ROLAND" -> "ROLAND"
//   Vazio ou outros -> ""
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

    // Normalização de cabeçalhos / chaves:
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

    // Normaliza Deploy: "AGIS - CONFIRMAR", "AGIS" -> "AGIS"; "ROLAND" -> "ROLAND"
    const normalizeDeploy = (val) => {
      if (!val) return ''
      const upper = String(val)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toUpperCase()
      if (upper.indexOf('AGIS') >= 0) return 'AGIS'
      if (upper.indexOf('ROLAND') >= 0) return 'ROLAND'
      if (upper === 'NENHUM' || upper === 'SEM DEPLOY' || upper === 'VAZIO' || upper === '-')
        return ''
      return upper
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

    // Mapeamento semântico de chaves candidatas (cabeçalhos novos + antigos)
    const STATUS_KEYS = ['status', 'situacao', 'estado cliente']
    const SERIE_KEYS = ['serie', 'serie', 'serial', 'n serie', 'numero serie', 'tipo serie']
    const EH_CANAL_KEYS = [
      'canais',
      'canais sim nao',
      'eh canal',
      'eh_canal',
      'e canal',
      'canal?',
      'e canal?',
      'eh canal?',
      'is canal',
      'ativo como canal',
    ]
    const DEPLOY_KEYS = [
      'canal faturamento',
      'canal_faturamento',
      'canalfaturamento',
      'deploy',
      'modelo',
      'tipo deploy',
      'modelo deploy',
      'deploy tipo',
      'direta revenda',
      'tipo faturamento',
    ]
    const SEGMENTO_KEYS = ['segmento', 'segmentacao', 'ramo', 'segmento canal']
    const INSIDE_KEYS = [
      'inside',
      'inside sales',
      'vendedor interno',
      'vendedora interna',
      'comercial interno',
    ]
    const CLIENTE_COD_KEYS = [
      'cod',
      'cod cliente',
      'codigo',
      'codigo do cliente',
      'codigo cliente',
      'cod do cliente',
      'codigo_cliente',
      'cliente codigo',
      'cardcode',
      'id cliente',
      'cliente id',
    ]
    const CANAL_KEYS = [
      'canal',
      'nome do canal',
      'nome canal',
      'nome_canal',
      'canal de vendas',
      'canal vendas',
      'canal curto',
      'parceiro',
    ]
    const CLIENTE_NOME_KEYS = [
      'revenda',
      'revenda oficial',
      'nome do cliente',
      'nome cliente',
      'cliente',
      'nome_cliente',
      'razao social',
      'razao social cliente',
      'cardname',
      'nome razao social',
    ]
    const CONTATO_KEYS = [
      'nome do contato',
      'nome contato',
      'contato',
      'responsavel',
      'pessoa contato',
    ]
    const CARGO_KEYS = ['cargo', 'funcao', 'posicao', 'ocupacao']
    const EMAIL_KEYS = ['e mail', 'email', 'correio', 'e-mail']
    const TELEFONE_KEYS = ['telefone', 'tel', 'celular', 'fone', 'whatsapp', 'whats']

    // Identificação de cabeçalhos presentes para aviso / telemetria
    const firstRow = rows[0] || {}
    const originalHeaders = Object.keys(firstRow)
    const normalizedHeaders = originalHeaders.map(normalizeKey)

    const hasCanalHeader = normalizedHeaders.some(
      (nh) =>
        ['canal', 'nome do canal', 'nome canal', 'canais'].includes(nh) || nh.includes('canal'),
    )

    // Forward-fill para células mescladas na planilha (efeito Excel)
    let lastKnownCanal = ''
    let lastKnownRevenda = ''
    let lastKnownCod = ''
    let lastKnownSegmento = ''
    let lastKnownInside = ''
    let lastKnownDeploy = ''
    let lastKnownStatus = ''
    let lastKnownSerie = ''
    let lastKnownEhCanal = false

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

      let status = getRowVal(normRow, STATUS_KEYS)
      let serie = getRowVal(normRow, SERIE_KEYS)
      const ehCanalRaw = getRowVal(normRow, EH_CANAL_KEYS)
      let ehCanal = ehCanalRaw ? parseBool(ehCanalRaw) : null
      let deployRaw = getRowVal(normRow, DEPLOY_KEYS)
      let deploy = deployRaw ? normalizeDeploy(deployRaw) : ''
      let segmento = getRowVal(normRow, SEGMENTO_KEYS)
      let inside = getRowVal(normRow, INSIDE_KEYS)
      let codigoCliente = getRowVal(normRow, CLIENTE_COD_KEYS)
      let nomeCanal = getRowVal(normRow, CANAL_KEYS)
      let nomeCliente = getRowVal(normRow, CLIENTE_NOME_KEYS)
      const contato = getRowVal(normRow, CONTATO_KEYS)
      const cargo = getRowVal(normRow, CARGO_KEYS)
      const email = getRowVal(normRow, EMAIL_KEYS)
      const telefone = getRowVal(normRow, TELEFONE_KEYS)

      // Se temos um novo grupo (com código ou canal ou revenda definidos):
      if (codigoCliente || nomeCanal || nomeCliente) {
        if (nomeCanal) lastKnownCanal = nomeCanal
        else if (lastKnownCanal && codigoCliente) nomeCanal = lastKnownCanal

        if (nomeCliente) lastKnownRevenda = nomeCliente
        else if (lastKnownRevenda && codigoCliente) nomeCliente = lastKnownRevenda

        if (codigoCliente) lastKnownCod = codigoCliente
        else if (lastKnownCod && nomeCliente) codigoCliente = lastKnownCod

        if (segmento) lastKnownSegmento = segmento
        else segmento = lastKnownSegmento

        if (inside) lastKnownInside = inside
        else inside = lastKnownInside

        if (deployRaw) lastKnownDeploy = deploy
        else deploy = lastKnownDeploy

        if (status) lastKnownStatus = status
        else status = lastKnownStatus

        if (serie) lastKnownSerie = serie
        else serie = lastKnownSerie

        if (ehCanal !== null) lastKnownEhCanal = ehCanal
        else ehCanal = lastKnownEhCanal
      } else {
        // Linha secundária de contato pertencente ao cliente/canal anterior (célula mesclada)
        if (lastKnownCod || lastKnownCanal || lastKnownRevenda) {
          codigoCliente = lastKnownCod
          nomeCanal = lastKnownCanal
          nomeCliente = lastKnownRevenda
          segmento = lastKnownSegmento
          inside = lastKnownInside
          deploy = lastKnownDeploy
          status = lastKnownStatus
          serie = lastKnownSerie
          ehCanal = lastKnownEhCanal
        }
      }

      if (ehCanal === null) {
        ehCanal = false
      }

      // Validação mínima da linha
      if (!codigoCliente && !nomeCanal && !nomeCliente && !contato && !email) {
        ignorados++
        erros.push(`Linha ${lineNum}: linha vazia ou sem identificador.`)
        continue
      }

      try {
        let isUpdate = false
        let record = null

        // Chave de busca para upsert:
        // Prioridade 1: codigo_cliente + nome_canal + (contato ou email)
        // Se a linha tem contato ou email específico:
        if (codigoCliente && (contato || email)) {
          try {
            const checkRows = arrayOf(new DynamicModel({ id: '' }))
            if (contato && email) {
              $app
                .db()
                .newQuery(
                  'SELECT id FROM canais_clientes WHERE codigo_cliente = {:cod} AND contato = {:contato} AND email = {:email} LIMIT 1',
                )
                .bind({ cod: codigoCliente, contato: contato, email: email })
                .all(checkRows)
            } else if (contato) {
              $app
                .db()
                .newQuery(
                  'SELECT id FROM canais_clientes WHERE codigo_cliente = {:cod} AND contato = {:contato} LIMIT 1',
                )
                .bind({ cod: codigoCliente, contato: contato })
                .all(checkRows)
            } else {
              $app
                .db()
                .newQuery(
                  'SELECT id FROM canais_clientes WHERE codigo_cliente = {:cod} AND email = {:email} LIMIT 1',
                )
                .bind({ cod: codigoCliente, email: email })
                .all(checkRows)
            }
            if (checkRows.length > 0 && checkRows[0].id) {
              record = $app.findRecordById('canais_clientes', checkRows[0].id)
              isUpdate = true
            }
          } catch (_) {}
        }

        // Prioridade 2: Se não localizou por contato específico, busca por codigo_cliente + nome_canal
        // (especialmente para clientes sem contato informado ou registros únicos)
        if (!record && codigoCliente && nomeCanal) {
          try {
            const checkRows = arrayOf(new DynamicModel({ id: '' }))
            $app
              .db()
              .newQuery(
                "SELECT id FROM canais_clientes WHERE codigo_cliente = {:cod} AND nome_canal = {:canal} AND (contato IS NULL OR contato = '' OR contato = {:contato}) LIMIT 1",
              )
              .bind({ cod: codigoCliente, canal: nomeCanal, contato: contato || '' })
              .all(checkRows)
            if (checkRows.length > 0 && checkRows[0].id) {
              record = $app.findRecordById('canais_clientes', checkRows[0].id)
              isUpdate = true
            }
          } catch (_) {}
        }

        // Prioridade 3: Se não achou e só temos codigo_cliente sem contato na base
        if (!record && codigoCliente) {
          try {
            const checkRows = arrayOf(new DynamicModel({ id: '' }))
            $app
              .db()
              .newQuery(
                "SELECT id FROM canais_clientes WHERE codigo_cliente = {:cod} AND (contato IS NULL OR contato = '') LIMIT 1",
              )
              .bind({ cod: codigoCliente })
              .all(checkRows)
            if (checkRows.length > 0 && checkRows[0].id) {
              record = $app.findRecordById('canais_clientes', checkRows[0].id)
              isUpdate = true
            }
          } catch (_) {}
        }

        if (!record) {
          record = new Record(canaisCol)
        }

        record.set('eh_canal', !!ehCanal)
        record.set('deploy', deploy)
        record.set('nome_canal', nomeCanal)
        record.set('nome_cliente', nomeCliente)
        record.set('status', status)
        record.set('serie', serie)
        record.set('codigo_cliente', codigoCliente)
        record.set('segmento', segmento)
        record.set('inside', inside)
        record.set('contato', contato)
        record.set('cargo', cargo)
        record.set('email', email)
        record.set('telefone', telefone)
        record.set('origem', 'Base Única de Canais')
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
          `Linha ${lineNum} (${codigoCliente || nomeCanal || nomeCliente}): erro ao salvar: ${err.message || String(err)}`,
        )
      }
    }

    const avisos = []
    if (!hasCanalHeader) {
      avisos.push(
        `Nenhuma coluna de Canal reconhecida nos cabeçalhos recebidos: [${originalHeaders.join(', ')}]. Cabeçalhos esperados: CANAL, CANAIS, COD, REVENDA, etc.`,
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
