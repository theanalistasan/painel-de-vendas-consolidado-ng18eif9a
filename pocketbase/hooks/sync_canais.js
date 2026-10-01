// Hook: POST /backend/v1/canais/sync e GET /backend/v1/canais/sync/status
// Sincronização unidirecional (LEITURA) da base "Gestão de Canais de Vendas" para a coleção `canais_clientes`.

routerAdd(
  'GET',
  '/backend/v1/canais/sync/status',
  (e) => {
    try {
      let stateRecord = null
      try {
        stateRecord = $app.findFirstRecordByData('canais_sync_state', 'chave', 'gestao_canais')
      } catch (_) {}

      if (!stateRecord) {
        return e.json(200, {
          configured: true,
          ultimo_corte: '',
          ultimo_sucesso: '',
          status: 'nunca_executado',
          detalhes: 'Nenhuma sincronização executada ainda.',
          revendas_lidas: 0,
          revendas_atualizadas: 0,
          contatos_lidos: 0,
          contatos_atualizados: 0,
        })
      }

      return e.json(200, {
        configured: true,
        ultimo_corte: stateRecord.getString('ultimo_corte'),
        ultimo_sucesso: stateRecord.getString('ultimo_sucesso'),
        status: stateRecord.getString('status'),
        detalhes: stateRecord.getString('detalhes'),
        revendas_lidas: stateRecord.getInt('revendas_lidas'),
        revendas_atualizadas: stateRecord.getInt('revendas_atualizadas'),
        contatos_lidos: stateRecord.getInt('contatos_lidos'),
        contatos_atualizados: stateRecord.getInt('contatos_atualizados'),
        updated: stateRecord.getString('updated'),
      })
    } catch (err) {
      return e.json(500, { error: err ? err.toString() : 'Erro ao obter status' })
    }
  },
  $apis.requireAuth(),
)

routerAdd(
  'POST',
  '/backend/v1/canais/sync',
  (e) => {
    const startTime = new Date().getTime()
    const nowIso = new Date().toISOString()
    const reqBody = e.requestInfo().body || {}
    const isFullSync = reqBody.full === true || reqBody.forceFull === true

    // 1. Variáveis de ambiente e segredos
    let apiUrl =
      $secrets.get('CANAIS_API_URL') ||
      $os.getenv('CANAIS_API_URL') ||
      'https://gestao-de-canais-de-vendas-afa89.shrd00.internal.goskip.dev'
    if (apiUrl.endsWith('/')) apiUrl = apiUrl.slice(0, -1)
    const identity =
      $secrets.get('CANAIS_SYNC_IDENTITY') ||
      $os.getenv('CANAIS_SYNC_IDENTITY') ||
      'integracao.painel@rolanddg.com.br'
    let password = $secrets.get('CANAIS_SYNC_PASSWORD') || $os.getenv('CANAIS_SYNC_PASSWORD') || ''

    if (!password) {
      password = 'Roland#PainelInt!2026$Sec'
    }

    // Helper sleep compatível com Goja
    const sleepMs = (ms) => {
      const waitTill = new Date(new Date().getTime() + ms)
      while (waitTill > new Date()) {}
    }

    // Helper normalizador de strings estrito
    const norm = (s) => {
      if (s === undefined || s === null) return ''
      return String(s)
        .replace(/^\uFEFF/, '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toUpperCase()
    }

    // Helper deploy: "AGIS - CONFIRMAR", "AGIS" -> "AGIS"; "ROLAND" -> "ROLAND"
    const normalizeDeploy = (val) => {
      if (!val) return ''
      const upper = norm(val)
      if (upper.indexOf('AGIS') >= 0) return 'AGIS'
      if (upper.indexOf('ROLAND') >= 0) return 'ROLAND'
      if (upper === 'NENHUM' || upper === 'SEM DEPLOY' || upper === 'VAZIO' || upper === '-')
        return ''
      return upper
    }

    // Helper estado de sincronização
    let stateRecord = null
    const syncStateCol = $app.findCollectionByNameOrId('canais_sync_state')
    try {
      stateRecord = $app.findFirstRecordByData('canais_sync_state', 'chave', 'gestao_canais')
    } catch (_) {
      stateRecord = new Record(syncStateCol)
      stateRecord.set('chave', 'gestao_canais')
      stateRecord.set('ultimo_corte', '')
      stateRecord.set('status', 'iniciando')
      $app.save(stateRecord)
    }

    let ultimoCorte = ''
    if (!isFullSync && stateRecord) {
      ultimoCorte = stateRecord.getString('ultimo_corte') || ''
    }

    // 2. Autenticação na API de Canais
    let authToken = ''
    try {
      const authRes = $http.send({
        url: apiUrl + '/api/collections/users/auth-with-password',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identity: identity, password: password }),
        timeout: 25,
      })

      if (authRes.statusCode !== 200) {
        const errMsg =
          'Falha ao autenticar na origem (HTTP ' + authRes.statusCode + '): ' + (authRes.raw || '')
        stateRecord.set('status', 'erro_auth')
        stateRecord.set('detalhes', errMsg)
        $app.save(stateRecord)
        return e.json(502, { success: false, message: errMsg })
      }

      const authData = authRes.json || {}
      authToken = authData.token || ''
      if (!authToken) {
        throw new Error('Token ausente na resposta de autenticação')
      }
    } catch (authErr) {
      const msg =
        'Erro de conexão/autenticação com a origem: ' + (authErr.message || String(authErr))
      stateRecord.set('status', 'erro_auth')
      stateRecord.set('detalhes', msg)
      $app.save(stateRecord)
      return e.json(502, { success: false, message: msg })
    }

    // Helper para chamadas GET com tratamento de rate limit
    const getWithRetry = (urlPath) => {
      const fullUrl = apiUrl + urlPath
      for (let attempt = 0; attempt < 3; attempt++) {
        const res = $http.send({
          url: fullUrl,
          method: 'GET',
          headers: {
            Authorization: 'Bearer ' + authToken,
          },
          timeout: 45,
        })

        if (res.statusCode === 200) {
          return res.json || {}
        }

        if (res.statusCode === 429) {
          const retryHeader =
            res.headers && (res.headers['Retry-After'] || res.headers['retry-after'])
          let waitTime = 2000
          if (retryHeader) {
            const parsed = parseInt(Array.isArray(retryHeader) ? retryHeader[0] : retryHeader, 10)
            if (!isNaN(parsed) && parsed > 0) waitTime = (parsed + 1) * 1000
          }
          console.warn(
            'HTTP 429 recebido na origem. Aguardando ' +
              waitTime +
              'ms antes de tentar novamente...',
          )
          sleepMs(waitTime)
          continue
        }

        throw new Error(
          'HTTP ' + res.statusCode + ' ao acessar ' + urlPath + ': ' + (res.raw || ''),
        )
      }
      throw new Error('Rate limit excedido após 3 tentativas em ' + urlPath)
    }

    // 3. Carregar revendas da origem (todas ou incrementais)
    let maiorUpdatedOrigem = ultimoCorte
    const revendasMapById = {}
    const revendasList = []

    let revendasPage = 1
    let revendasTotalPages = 1
    let revendasTotalItems = 0
    let revendasLidas = 0

    // Filtro incremental de revendas
    let revendasFilter = ''
    if (ultimoCorte) {
      revendasFilter = 'updated > "' + ultimoCorte + '"'
    }

    try {
      while (revendasPage <= revendasTotalPages) {
        let q =
          '/api/collections/revendas/records?perPage=500&page=' + revendasPage + '&sort=updated'
        q += '&expand=segmento,status,inside_sales,responsavel,canal_faturamento,estado'
        if (revendasFilter) {
          q += '&filter=' + encodeURIComponent(revendasFilter)
        }

        const data = getWithRetry(q)
        revendasTotalPages = data.totalPages || 1
        revendasTotalItems = data.totalItems || 0
        const items = data.items || []

        for (let i = 0; i < items.length; i++) {
          const r = items[i]
          revendasLidas++
          revendasMapById[r.id] = r
          revendasList.push(r)
          if (r.updated && (!maiorUpdatedOrigem || r.updated > maiorUpdatedOrigem)) {
            maiorUpdatedOrigem = r.updated
          }
        }

        revendasPage++
        if (revendasPage <= revendasTotalPages) {
          sleepMs(450)
        }
      }
    } catch (revErr) {
      const msg = 'Erro ao ler revendas da origem: ' + (revErr.message || String(revErr))
      stateRecord.set('status', 'erro_leitura_revendas')
      stateRecord.set('detalhes', msg)
      $app.save(stateRecord)
      return e.json(502, { success: false, message: msg })
    }

    // 4. Carregar contatos da origem
    let contatosPage = 1
    let contatosTotalPages = 1
    let contatosTotalItems = 0
    let contatosLidos = 0
    const contatosList = []

    let contatosFilter = ''
    if (ultimoCorte) {
      contatosFilter = 'updated > "' + ultimoCorte + '"'
    }

    try {
      while (contatosPage <= contatosTotalPages) {
        let q =
          '/api/collections/contatos/records?perPage=500&page=' + contatosPage + '&sort=updated'
        q +=
          '&expand=revenda,revenda.segmento,revenda.status,revenda.inside_sales,revenda.responsavel,revenda.canal_faturamento,revenda.estado,cargo'
        if (contatosFilter) {
          q += '&filter=' + encodeURIComponent(contatosFilter)
        }

        const data = getWithRetry(q)
        contatosTotalPages = data.totalPages || 1
        contatosTotalItems = data.totalItems || 0
        const items = data.items || []

        for (let i = 0; i < items.length; i++) {
          const c = items[i]
          contatosLidos++
          contatosList.push(c)
          if (c.updated && (!maiorUpdatedOrigem || c.updated > maiorUpdatedOrigem)) {
            maiorUpdatedOrigem = c.updated
          }
        }

        contatosPage++
        if (contatosPage <= contatosTotalPages) {
          sleepMs(450)
        }
      }
    } catch (contErr) {
      const msg = 'Erro ao ler contatos da origem: ' + (contErr.message || String(contErr))
      stateRecord.set('status', 'erro_leitura_contatos')
      stateRecord.set('detalhes', msg)
      $app.save(stateRecord)
      return e.json(502, { success: false, message: msg })
    }

    // Se nenhum registro mudou
    if (revendasLidas === 0 && contatosLidos === 0) {
      stateRecord.set('status', 'sucesso_sem_mudancas')
      stateRecord.set('ultimo_sucesso', nowIso)
      stateRecord.set(
        'detalhes',
        'Sincronização executada. Nenhum registro alterado na origem desde ' +
          (ultimoCorte || 'início') +
          '.',
      )
      stateRecord.set('revendas_lidas', 0)
      stateRecord.set('revendas_atualizadas', 0)
      stateRecord.set('contatos_lidos', 0)
      stateRecord.set('contatos_atualizados', 0)
      $app.save(stateRecord)

      return e.json(200, {
        success: true,
        isFullSync: isFullSync,
        mudancas: false,
        revendasLidas: 0,
        revendasAtualizadas: 0,
        contatosLidos: 0,
        contatosAtualizados: 0,
        totalItemsOrigem: { revendas: revendasTotalItems, contatos: contatosTotalItems },
        ultimoCorte: ultimoCorte,
        novoCorte: ultimoCorte,
        duracaoMs: new Date().getTime() - startTime,
        message: 'Base já sincronizada. Nenhum registro novo ou alterado na origem.',
      })
    }

    // 5. Mapeamento e Upsert na coleção canais_clientes
    // Carregar registros locais em memória para matching rápido
    // Evitar bug Goja: inicializar strings/modelos com ''
    const localDbRows = arrayOf(
      new DynamicModel({
        id: '',
        codigo_cliente: '',
        nome_cliente: '',
        nome_canal: '',
        contato: '',
        email: '',
        telefone: '',
        origem_id_revenda: '',
        origem_id_contato: '',
      }),
    )

    try {
      $app
        .db()
        .newQuery(
          'SELECT id, codigo_cliente, nome_cliente, nome_canal, contato, email, telefone, origem_id_revenda, origem_id_contato FROM canais_clientes',
        )
        .all(localDbRows)
    } catch (loadErr) {
      console.warn('Aviso ao ler canais_clientes locais:', loadErr)
    }

    const localByOrigemContatoId = {}
    const localByOrigemRevendaIdNoContact = {}
    const localByRevendaEmail = {}
    const localByRevendaTelefone = {}
    const localByRevendaNomeContato = {}
    const localByCodCanal = {}
    const localByNomeCanal = {}
    const localByCod = {}

    for (let k = 0; k < localDbRows.length; k++) {
      const row = localDbRows[k]
      const rId = row.id
      const codN = norm(row.codigo_cliente)
      const chN = norm(row.nome_canal)
      const cliN = norm(row.nome_cliente)
      const em = (row.email || '').toLowerCase().trim()
      const tel = norm(row.telefone)
      const ctN = norm(row.contato)

      if (row.origem_id_contato) {
        localByOrigemContatoId[row.origem_id_contato] = rId
      }
      if (row.origem_id_revenda && !row.origem_id_contato && !row.contato && !row.email) {
        localByOrigemRevendaIdNoContact[row.origem_id_revenda] = rId
      }
      if (codN && em) {
        localByRevendaEmail[codN + '::' + em] = rId
      }
      if (codN && tel) {
        localByRevendaTelefone[codN + '::' + tel] = rId
      }
      if (codN && ctN) {
        localByRevendaNomeContato[codN + '::' + ctN] = rId
      }
      if (codN && chN) {
        localByCodCanal[codN + '::' + chN] = rId
      }
      if (cliN && chN) {
        localByNomeCanal[cliN + '::' + chN] = rId
      }
      if (codN && !localByCod[codN]) {
        localByCod[codN] = rId
      }
    }

    const canaisCol = $app.findCollectionByNameOrId('canais_clientes')
    let revendasAtualizadas = 0
    let contatosAtualizados = 0

    // Se a busca de contatos trouxe revendas via expand, certifique-se de que temos os dados da revenda
    for (let i = 0; i < contatosList.length; i++) {
      const c = contatosList[i]
      const exp = c.expand || {}
      if (exp.revenda && exp.revenda.id && !revendasMapById[exp.revenda.id]) {
        revendasMapById[exp.revenda.id] = exp.revenda
      }
    }

    // Processamento de Contatos (cada contato gera/atualiza uma linha em canais_clientes)
    // Chave de contato: (revenda, email); fallback (revenda, telefone) ou (revenda, nome)
    const processedRevendaIdsWithContacts = {}

    for (let i = 0; i < contatosList.length; i++) {
      const c = contatosList[i]
      const cExp = c.expand || {}
      const rev = cExp.revenda || (c.revenda ? revendasMapById[c.revenda] : null) || {}
      const revExp = (rev && rev.expand) || {}

      if (rev.id) {
        processedRevendaIdsWithContacts[rev.id] = true
      }

      const revCodigo = (rev.codigo || '').trim()
      const revNome = (rev.nome || '').trim()
      const revCanal = (rev.canal || '').trim() || revNome
      const revCanaisStr = (rev.canais || 'SIM').toString().trim().toUpperCase()
      const ehCanal = revCanaisStr === 'SIM' || revCanaisStr === 'S' || revCanaisStr === 'TRUE'

      // Expansões da revenda
      const canalFatNome = (revExp.canal_faturamento && revExp.canal_faturamento.nome) || ''
      const deploy = normalizeDeploy(canalFatNome)
      const insideSalesNome = (revExp.inside_sales && revExp.inside_sales.nome) || ''
      const segmentoNome = (revExp.segmento && revExp.segmento.nome) || ''
      const responsavelNome = (revExp.responsavel && revExp.responsavel.nome) || ''
      const statusRevNome = (revExp.status && revExp.status.nome) || 'Ativo'
      const statusRevCor = (revExp.status && revExp.status.cor) || ''
      const estadoUf = (revExp.estado && (revExp.estado.uf || revExp.estado.nome)) || ''
      const cargoNome = (cExp.cargo && cExp.cargo.nome) || ''

      const emailContato = (c.email || c.email_secundario || '').trim().toLowerCase()
      // Preferir telefone, fallback celular/whatsapp
      const telContato = (c.telefone || c.celular || c.whatsapp || '').trim()
      const nomeContato = (c.nome || '').trim()
      // Matching local
      let matchedId = null
      if (c.id && localByOrigemContatoId[c.id]) {
        matchedId = localByOrigemContatoId[c.id]
      }
      const codN = norm(revCodigo)
      if (!matchedId && codN && emailContato && localByRevendaEmail[codN + '::' + emailContato]) {
        matchedId = localByRevendaEmail[codN + '::' + emailContato]
      }
      if (
        !matchedId &&
        codN &&
        telContato &&
        localByRevendaTelefone[codN + '::' + norm(telContato)]
      ) {
        matchedId = localByRevendaTelefone[codN + '::' + norm(telContato)]
      }
      if (
        !matchedId &&
        codN &&
        nomeContato &&
        localByRevendaNomeContato[codN + '::' + norm(nomeContato)]
      ) {
        matchedId = localByRevendaNomeContato[codN + '::' + norm(nomeContato)]
      }

      let rec = null
      if (matchedId) {
        try {
          rec = $app.findRecordById('canais_clientes', matchedId)
        } catch (_) {
          rec = null
        }
      }
      if (!rec) {
        rec = new Record(canaisCol)
      }

      rec.set('eh_canal', ehCanal)
      rec.set('deploy', deploy)
      rec.set('nome_canal', revCanal)
      rec.set('nome_cliente', revNome)
      rec.set('status', statusRevNome || 'Ativo')
      if (rev.serie) rec.set('serie', rev.serie)
      rec.set('codigo_cliente', revCodigo)
      rec.set('contato', nomeContato)
      rec.set('cargo', cargoNome)
      rec.set('email', emailContato)
      rec.set('telefone', telContato)
      rec.set('segmento', segmentoNome)
      rec.set('inside', insideSalesNome)
      rec.set('municipio', rev.cidade || '')
      rec.set('estado', estadoUf)
      rec.set('responsavel', responsavelNome)
      rec.set('observacoes', rev.observacoes || c.observacoes || '')
      rec.set('status_cor', statusRevCor)
      rec.set('contato_principal', c.contato_principal === true)
      rec.set('status_contato', c.status_contato || 'Ativo')
      rec.set('origem_id_revenda', rev.id || '')
      rec.set('origem_id_contato', c.id || '')
      rec.set('origem_updated', c.updated || '')
      rec.set('origem', 'Gestão de Canais de Vendas')
      rec.set('data_carga', nowIso)

      $app.save(rec)
      contatosAtualizados++

      // Atualiza índices
      if (c.id) localByOrigemContatoId[c.id] = rec.id
      if (codN && emailContato) localByRevendaEmail[codN + '::' + emailContato] = rec.id
    }

    // Processamento de Revendas que NÃO possuem contatos vinculados
    // (para garantir que toda revenda cadastrada na origem conste na base local)
    for (let i = 0; i < revendasList.length; i++) {
      const rev = revendasList[i]
      const revExp = rev.expand || {}

      const revCodigo = (rev.codigo || '').trim()
      const revNome = (rev.nome || '').trim()
      const revCanal = (rev.canal || '').trim() || revNome
      const revCanaisStr = (rev.canais || 'SIM').toString().trim().toUpperCase()
      const ehCanal = revCanaisStr === 'SIM' || revCanaisStr === 'S' || revCanaisStr === 'TRUE'

      const canalFatNome = (revExp.canal_faturamento && revExp.canal_faturamento.nome) || ''
      const deploy = normalizeDeploy(canalFatNome)
      const insideSalesNome = (revExp.inside_sales && revExp.inside_sales.nome) || ''
      const segmentoNome = (revExp.segmento && revExp.segmento.nome) || ''
      const responsavelNome = (revExp.responsavel && revExp.responsavel.nome) || ''
      const statusRevNome = (revExp.status && revExp.status.nome) || 'Ativo'
      const statusRevCor = (revExp.status && revExp.status.cor) || ''
      const estadoUf = (revExp.estado && (revExp.estado.uf || revExp.estado.nome)) || ''

      // Se já processamos contatos para esta revenda nesta rodada, apenas atualizamos campos da revenda nas linhas já salvas
      if (processedRevendaIdsWithContacts[rev.id]) {
        revendasAtualizadas++
        continue
      }

      // Procura se já existe registro local desta revenda sem contato
      let matchedId = null
      if (rev.id && localByOrigemRevendaIdNoContact[rev.id]) {
        matchedId = localByOrigemRevendaIdNoContact[rev.id]
      }
      const codN = norm(revCodigo)
      const chN = norm(revCanal)
      const cliN = norm(revNome)

      if (!matchedId && codN && chN && localByCodCanal[codN + '::' + chN]) {
        matchedId = localByCodCanal[codN + '::' + chN]
      }
      if (!matchedId && cliN && chN && localByNomeCanal[cliN + '::' + chN]) {
        matchedId = localByNomeCanal[cliN + '::' + chN]
      }
      if (!matchedId && codN && localByCod[codN]) {
        matchedId = localByCod[codN]
      }

      let rec = null
      if (matchedId) {
        try {
          rec = $app.findRecordById('canais_clientes', matchedId)
        } catch (_) {
          rec = null
        }
      }
      if (!rec) {
        rec = new Record(canaisCol)
      }

      rec.set('eh_canal', ehCanal)
      rec.set('deploy', deploy)
      rec.set('nome_canal', revCanal)
      rec.set('nome_cliente', revNome)
      rec.set('status', statusRevNome || 'Ativo')
      if (rev.serie) rec.set('serie', rev.serie)
      rec.set('codigo_cliente', revCodigo)
      rec.set('segmento', segmentoNome)
      rec.set('inside', insideSalesNome)
      rec.set('municipio', rev.cidade || '')
      rec.set('estado', estadoUf)
      rec.set('responsavel', responsavelNome)
      rec.set('observacoes', rev.observacoes || '')
      rec.set('status_cor', statusRevCor)
      rec.set('origem_id_revenda', rev.id || '')
      rec.set('origem_updated', rev.updated || '')
      rec.set('origem', 'Gestão de Canais de Vendas')
      rec.set('data_carga', nowIso)

      $app.save(rec)
      revendasAtualizadas++
      if (rev.id) localByOrigemRevendaIdNoContact[rev.id] = rec.id
    }

    // 6. Atualizar estado da sincronização
    stateRecord.set('status', 'sucesso')
    stateRecord.set('ultimo_corte', maiorUpdatedOrigem || ultimoCorte || nowIso)
    stateRecord.set('ultimo_sucesso', nowIso)
    stateRecord.set(
      'detalhes',
      'Sincronização concluída com sucesso: ' +
        revendasAtualizadas +
        ' revenda(s) e ' +
        contatosAtualizados +
        ' contato(s) sincronizados.',
    )
    stateRecord.set('revendas_lidas', revendasLidas)
    stateRecord.set('revendas_atualizadas', revendasAtualizadas)
    stateRecord.set('contatos_lidos', contatosLidos)
    stateRecord.set('contatos_atualizados', contatosAtualizados)
    $app.save(stateRecord)

    // 7. Registrar auditoria
    try {
      const auditCol = $app.findCollectionByNameOrId('audit_logs')
      const auditRec = new Record(auditCol)
      const auth = e.auth
      auditRec.set('action', 'SYNC_CANAIS')
      auditRec.set(
        'details',
        'Sincronização de Canais e Contatos: ' +
          revendasAtualizadas +
          ' revendas e ' +
          contatosAtualizados +
          ' contatos atualizados. Corte: ' +
          (maiorUpdatedOrigem || ultimoCorte),
      )
      if (auth && auth.id) auditRec.set('user_id', auth.id)
      if (auth && auth.email) auditRec.set('user_email', auth.email)
      if (auth && auth.name) auditRec.set('user_name', auth.name)
      auditRec.set('ip', e.requestInfo().clientIP || '')
      $app.save(auditRec)
    } catch (auditErr) {
      console.warn('Aviso ao registrar auditoria de sync_canais:', auditErr)
    }

    const duration = new Date().getTime() - startTime

    return e.json(200, {
      success: true,
      isFullSync: isFullSync,
      revendasLidas,
      revendasAtualizadas,
      contatosLidos,
      contatosAtualizados,
      totalItemsOrigem: { revendas: revendasTotalItems, contatos: contatosTotalItems },
      ultimoCorte: ultimoCorte,
      novoCorte: maiorUpdatedOrigem || ultimoCorte,
      duracaoMs: duration,
      data_carga: nowIso,
    })
  },
  $apis.requireAuth(),
)
