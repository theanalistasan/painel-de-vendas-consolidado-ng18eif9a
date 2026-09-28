// Endpoint: POST /backend/v1/import/canais-clientes
// Importação ou substituição da planilha "Base Única de Canais" na coleção `canais_clientes`.
//
// Regras de blindagem contra duplicatas e semelhantes (Silvio Mattos / Roland DG):
// 1. Normalização estrita das chaves de comparação:
//    trim, colapsar espaços internos múltiplos em um só espaço, uppercase e remoção completa de acentos (NFD).
// 2. Deduplicação intra-arquivo:
//    Dentro da própria planilha importada, linhas que normalizadas resultem na mesma chave
//    (codigo_cliente + nome_canal) são mescladas na memória antes do banco. A linha subsequente preenche
//    campos vazios das anteriores e atualiza contatos/telefones, sem gerar múltiplos registros.
// 3. Deduplicação contra a base existente (upsert ampliado):
//    Antes de criar um novo registro, verifica:
//      a) Chave exata normalizada (codigo_cliente_norm + nome_canal_norm)
//      b) Mesma razão social normalizada dentro do mesmo canal normalizado (nome_cliente_norm + nome_canal_norm)
//      c) Mesmo código normalizado dentro do mesmo canal normalizado (codigo_cliente_norm + nome_canal_norm)
//    Nessas situações, atualiza o registro existente em vez de criar um duplicado.
// 4. Contadores transparentes no retorno:
//    - importados (novos)
//    - atualizados (já existentes na base)
//    - mesclados (linhas do próprio arquivo agregadas/deduplicadas por semelhança)
//    - ignorados (linhas sem identificação ou com erro)
// 5. Avisos gerados para o usuário quando houver linhas mescladas/deduplicadas.

routerAdd(
  'POST',
  '/backend/v1/import/canais-clientes',
  (e) => {
    const body = e.requestInfo().body || {}
    const rawRows = Array.isArray(body.rows) ? body.rows : Array.isArray(body) ? body : []

    // Opção de limpeza prévia (truncate/delete)
    if (body.clearBefore === true || body.replace === true) {
      try {
        $app.db().newQuery('DELETE FROM canais_clientes').execute()
      } catch (delErr) {
        console.warn('Erro ao limpar canais_clientes antes de importar:', delErr)
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

    const canaisCol = $app.findCollectionByNameOrId('canais_clientes')
    const nowIso = new Date().toISOString()

    let importados = 0
    let atualizados = 0
    let mesclados = 0
    let ignorados = 0
    const erros = []
    const avisos = []

    const parseBool = (val) => {
      if (typeof val === 'boolean') return val
      if (!val) return false
      const s = String(val).trim().toUpperCase()
      return s === 'SIM' || s === 'S' || s === 'TRUE' || s === '1' || s === 'YES' || s === 'Y'
    }

    // Normalização estrita de texto: trim, colapso de espaços, maiúsculas e sem acentos
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

    // Normalização de chaves de coluna para tolerar variações de cabeçalhos
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
      const upper = normalizeStrict(val)
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
    const SERIE_KEYS = ['serie', 'serial', 'n serie', 'numero serie', 'tipo serie']
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
    const firstRow = rawRows[0] || {}
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

    // PASSO 1: Leitura, forward-fill e normalização inicial das linhas
    const parsedRows = []

    for (let i = 0; i < rawRows.length; i++) {
      const rawRow = rawRows[i]
      const lineNum = i + 1

      const normRow = {}
      const keys = Object.keys(rawRow)
      for (let k = 0; k < keys.length; k++) {
        normRow[normalizeKey(keys[k])] = rawRow[keys[k]]
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

      // Forward-fill caso seja linha de cabeçalho mesclado
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

      parsedRows.push({
        lineNum: lineNum,
        codigo_cliente: (codigoCliente || '').trim(),
        nome_canal: (nomeCanal || '').trim(),
        nome_cliente: (nomeCliente || '').trim(),
        status: (status || '').trim(),
        serie: (serie || '').trim(),
        eh_canal: !!ehCanal,
        deploy: deploy,
        segmento: (segmento || '').trim(),
        inside: (inside || '').trim(),
        contato: (contato || '').trim(),
        cargo: (cargo || '').trim(),
        email: (email || '').trim(),
        telefone: (telefone || '').trim(),
        // Chaves normalizadas para matching estrito
        codNorm: normalizeStrict(codigoCliente),
        canalNorm: normalizeStrict(nomeCanal),
        nomeNorm: normalizeStrict(nomeCliente),
      })
    }

    // PASSO 2: Deduplicação intra-arquivo
    // Mescla linhas do mesmo arquivo que resultem na mesma chave (codigo_cliente + nome_canal)
    // ou mesmo cliente (nome_cliente_norm + nome_canal_norm).
    // A linha mais recente completa campos vazios das anteriores.
    const intraDeduplicated = []
    const intraMapByKey = {}
    let mescladosNoArquivo = 0

    for (let i = 0; i < parsedRows.length; i++) {
      const row = parsedRows[i]
      // Chave primária intra-arquivo: codNorm + '::' + canalNorm
      // Se não tiver código, usa nomeNorm + '::' + canalNorm
      const keyPrimary =
        row.codNorm && row.canalNorm
          ? row.codNorm + '::' + row.canalNorm
          : row.nomeNorm && row.canalNorm
            ? 'NAME::' + row.nomeNorm + '::' + row.canalNorm
            : ''

      if (keyPrimary && intraMapByKey[keyPrimary] !== undefined) {
        const existingIdx = intraMapByKey[keyPrimary]
        const existing = intraDeduplicated[existingIdx]
        mescladosNoArquivo++

        // Mescla: preenche campos vazios do existing ou atualiza com dados mais ricos
        if (!existing.nome_cliente && row.nome_cliente) existing.nome_cliente = row.nome_cliente
        if (!existing.codigo_cliente && row.codigo_cliente)
          existing.codigo_cliente = row.codigo_cliente
        if (!existing.deploy && row.deploy) existing.deploy = row.deploy
        if (!existing.segmento && row.segmento) existing.segmento = row.segmento
        if (!existing.inside && row.inside) existing.inside = row.inside
        if (!existing.status && row.status) existing.status = row.status
        if (!existing.serie && row.serie) existing.serie = row.serie
        if (!existing.eh_canal && row.eh_canal) existing.eh_canal = true

        // Contatos: se existing não tem contato e row tem, preenche
        if (!existing.contato && row.contato) existing.contato = row.contato
        if (!existing.cargo && row.cargo) existing.cargo = row.cargo
        if (!existing.email && row.email) existing.email = row.email
        if (!existing.telefone && row.telefone) existing.telefone = row.telefone

        // Se ambos têm contato mas são diferentes, concatena ou preserva o mais recente
        if (
          row.contato &&
          existing.contato &&
          row.contato.toUpperCase() !== existing.contato.toUpperCase()
        ) {
          if (!existing.contato.includes(row.contato)) {
            existing.contato = existing.contato + ' / ' + row.contato
          }
        }
        if (
          row.email &&
          existing.email &&
          row.email.toLowerCase() !== existing.email.toLowerCase()
        ) {
          if (!existing.email.includes(row.email)) {
            existing.email = existing.email + '; ' + row.email
          }
        }
        if (row.telefone && existing.telefone && row.telefone !== existing.telefone) {
          if (!existing.telefone.includes(row.telefone)) {
            existing.telefone = existing.telefone + ' / ' + row.telefone
          }
        }
      } else {
        const newIdx = intraDeduplicated.length
        if (keyPrimary) {
          intraMapByKey[keyPrimary] = newIdx
        }
        intraDeduplicated.push(row)
      }
    }

    mesclados += mescladosNoArquivo

    // PASSO 3: Carrega índices em memória dos registros já existentes na coleção canais_clientes
    // para viabilizar deduplicação rápida e precisa por:
    // a) id por codNorm + '::' + canalNorm
    // b) id por nomeNorm + '::' + canalNorm
    // c) id por codNorm sozinho (quando canal não informado)
    const existingDbRows = arrayOf(
      new DynamicModel({
        id: '',
        codigo_cliente: '',
        nome_cliente: '',
        nome_canal: '',
        contato: '',
        email: '',
      }),
    )
    try {
      $app
        .db()
        .newQuery(
          'SELECT id, codigo_cliente, nome_cliente, nome_canal, contato, email FROM canais_clientes',
        )
        .all(existingDbRows)
    } catch (loadErr) {
      console.warn('Aviso ao carregar registros existentes de canais_clientes:', loadErr)
    }

    const dbMapByCodCanal = {}
    const dbMapByNomeCanal = {}
    const dbMapByCod = {}

    for (let k = 0; k < existingDbRows.length; k++) {
      const rec = existingDbRows[k]
      const cNorm = normalizeStrict(rec.codigo_cliente)
      const chNorm = normalizeStrict(rec.nome_canal)
      const nNorm = normalizeStrict(rec.nome_cliente)

      if (cNorm && chNorm) {
        dbMapByCodCanal[cNorm + '::' + chNorm] = rec.id
      }
      if (nNorm && chNorm) {
        dbMapByNomeCanal[nNorm + '::' + chNorm] = rec.id
      }
      if (cNorm && !dbMapByCod[cNorm]) {
        dbMapByCod[cNorm] = rec.id
      }
    }

    // PASSO 4: Upsert ampliado contra a base existente
    for (let j = 0; j < intraDeduplicated.length; j++) {
      const item = intraDeduplicated[j]
      const lineNum = item.lineNum

      try {
        let matchedId = null
        let matchReason = ''

        // 1. Procura por codigo_cliente normalizado + nome_canal normalizado
        if (item.codNorm && item.canalNorm) {
          const directKey = item.codNorm + '::' + item.canalNorm
          if (dbMapByCodCanal[directKey]) {
            matchedId = dbMapByCodCanal[directKey]
            matchReason = 'mesmo código e canal'
          }
        }

        // 2. Procura por nome_cliente normalizado + nome_canal normalizado (mesma razão social no canal)
        if (!matchedId && item.nomeNorm && item.canalNorm) {
          const nameKey = item.nomeNorm + '::' + item.canalNorm
          if (dbMapByNomeCanal[nameKey]) {
            matchedId = dbMapByNomeCanal[nameKey]
            matchReason = 'mesma razão social no canal'
          }
        }

        // 3. Procura por codigo_cliente normalizado único
        if (!matchedId && item.codNorm && dbMapByCod[item.codNorm]) {
          matchedId = dbMapByCod[item.codNorm]
          matchReason = 'mesmo código de cliente'
        }

        let isUpdate = false
        let record = null

        if (matchedId) {
          try {
            record = $app.findRecordById('canais_clientes', matchedId)
            isUpdate = true
          } catch (_) {
            record = null
          }
        }

        if (!record) {
          record = new Record(canaisCol)
        }

        // Preenchimento de dados garantindo integridade
        record.set('eh_canal', !!item.eh_canal)
        if (item.deploy) record.set('deploy', item.deploy)
        if (item.nome_canal) record.set('nome_canal', item.nome_canal)
        if (item.nome_cliente) record.set('nome_cliente', item.nome_cliente)
        if (item.status) record.set('status', item.status)
        if (item.serie) record.set('serie', item.serie)
        if (item.codigo_cliente) record.set('codigo_cliente', item.codigo_cliente)
        if (item.segmento) record.set('segmento', item.segmento)
        if (item.inside) record.set('inside', item.inside)
        if (item.contato) record.set('contato', item.contato)
        if (item.cargo) record.set('cargo', item.cargo)
        if (item.email) record.set('email', item.email)
        if (item.telefone) record.set('telefone', item.telefone)
        record.set('origem', 'Base Única de Canais')
        record.set('data_carga', nowIso)

        $app.save(record)

        // Atualiza índices em memória para próximas iterações
        const newId = record.id
        if (item.codNorm && item.canalNorm) {
          dbMapByCodCanal[item.codNorm + '::' + item.canalNorm] = newId
        }
        if (item.nomeNorm && item.canalNorm) {
          dbMapByNomeCanal[item.nomeNorm + '::' + item.canalNorm] = newId
        }
        if (item.codNorm) {
          dbMapByCod[item.codNorm] = newId
        }

        if (isUpdate) {
          atualizados++
        } else {
          importados++
        }
      } catch (err) {
        ignorados++
        erros.push(
          `Linha ${lineNum} (${item.codigo_cliente || item.nome_canal || item.nome_cliente}): erro ao salvar: ${err.message || String(err)}`,
        )
      }
    }

    if (!hasCanalHeader) {
      avisos.push(
        `Nenhuma coluna de Canal reconhecida nos cabeçalhos recebidos: [${originalHeaders.join(', ')}]. Cabeçalhos esperados: CANAL, CANAIS, COD, REVENDA, etc.`,
      )
    }

    if (mescladosNoArquivo > 0) {
      avisos.push(
        `Blindagem de duplicatas: ${mescladosNoArquivo} linha(s) repetida(s) ou semelhantes na própria planilha foram mescladas automaticamente sem gerar registros duplicados.`,
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
      headersRecebidos: originalHeaders,
      data_carga: nowIso,
    })
  },
  $apis.requireAuth(),
)
