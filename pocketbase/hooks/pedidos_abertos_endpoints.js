// Endpoints para Pedidos em Aberto:
// 1. POST /backend/v1/pedidos-abertos/list - Listagem paginada com filtros, busca e ordenação
// 2. POST /backend/v1/pedidos-abertos/stats - KPIs e Ranking de clientes com ritmo de compra vs vendas realizadas

routerAdd(
  'POST',
  '/backend/v1/pedidos-abertos/list',
  (e) => {
    const body = e.requestInfo().body || {}
    const page = Math.max(1, parseInt(body.page, 10) || 1)
    const perPage = Math.min(2000, Math.max(1, parseInt(body.perPage, 10) || 20))
    const offset = (page - 1) * perPage

    const sortField = body.sortField || 'data_pedido'
    const sortDir = body.sortDirection === 'asc' ? 'ASC' : 'DESC'
    const f = body.filters || {}

    const sqlEsc = (s) => String(s).replace(/'/g, "''")

    // Cláusulas WHERE
    const whereClauses = []

    // 1. Filtros de Canal (Canal, Clientes do Canal, Deploy, Inside, É Canal)
    const canaisFilter = Array.isArray(f.canal) ? f.canal : f.canal ? [f.canal] : []
    const canalClientesFilter = Array.isArray(f.canalClientes)
      ? f.canalClientes
      : f.canalClientes
        ? [f.canalClientes]
        : []
    const deployFilter = Array.isArray(f.deploy) ? f.deploy : f.deploy ? [f.deploy] : []
    const insideFilter = Array.isArray(f.inside) ? f.inside : f.inside ? [f.inside] : []
    const ehCanalFilter =
      f.ehCanal !== undefined && f.ehCanal !== null ? String(f.ehCanal).trim() : ''

    const hasCanalFilter = canaisFilter.length > 0
    const hasCanalClientesFilter = canalClientesFilter.length > 0
    const hasDeployFilter = deployFilter.length > 0 && !deployFilter.includes('TODOS')
    const hasInsideFilter = insideFilter.length > 0

    // Filtro "É Canal": 'sim' | 'nao' | '' (ou 'todos')
    if (ehCanalFilter === 'sim' || ehCanalFilter === 'true' || ehCanalFilter === 'SIM') {
      try {
        const canaisCodRows = arrayOf(new DynamicModel({ cc: '', nc: '' }))
        $app
          .db()
          .newQuery(
            "SELECT DISTINCT codigo_cliente AS cc, nome_cliente AS nc FROM canais_clientes WHERE (eh_canal = 1 OR eh_canal = 'true' OR eh_canal = 'SIM' OR eh_canal = 'Sim' OR eh_canal = 's')",
          )
          .all(canaisCodRows)
        const simCods = []
        const simNomes = []
        for (let sc = 0; sc < canaisCodRows.length; sc++) {
          const cod = (canaisCodRows[sc].cc || '').trim().toUpperCase()
          const nom = (canaisCodRows[sc].nc || '').trim()
          if (cod && cod !== '-') simCods.push(cod)
          if (nom) simNomes.push(nom)
        }
        if (simCods.length > 0 || simNomes.length > 0) {
          const sub = []
          if (simCods.length > 0) {
            sub.push(
              'UPPER(TRIM(codigo_cliente)) IN (' +
                simCods.map((c) => "'" + sqlEsc(c) + "'").join(',') +
                ')',
            )
          }
          if (simNomes.length > 0) {
            sub.push(
              'nome_cliente IN (' + simNomes.map((n) => "'" + sqlEsc(n) + "'").join(',') + ')',
            )
          }
          // Também aceita se nome_canal já estiver preenchido no pedido
          sub.push("(nome_canal IS NOT NULL AND TRIM(nome_canal) != '')")
          whereClauses.push('(' + sub.join(' OR ') + ')')
        } else {
          whereClauses.push("(nome_canal IS NOT NULL AND TRIM(nome_canal) != '')")
        }
      } catch (ecErr) {
        console.warn('pedidos_abertos list: filtro ehCanal sim warning:', ecErr)
      }
    } else if (
      ehCanalFilter === 'nao' ||
      ehCanalFilter === 'false' ||
      ehCanalFilter === 'NAO' ||
      ehCanalFilter === 'Não'
    ) {
      try {
        const canaisCodRows = arrayOf(new DynamicModel({ cc: '', nc: '' }))
        $app
          .db()
          .newQuery(
            "SELECT DISTINCT codigo_cliente AS cc, nome_cliente AS nc FROM canais_clientes WHERE (eh_canal = 1 OR eh_canal = 'true' OR eh_canal = 'SIM' OR eh_canal = 'Sim' OR eh_canal = 's')",
          )
          .all(canaisCodRows)
        const simCods = []
        const simNomes = []
        for (let sc = 0; sc < canaisCodRows.length; sc++) {
          const cod = (canaisCodRows[sc].cc || '').trim().toUpperCase()
          const nom = (canaisCodRows[sc].nc || '').trim()
          if (cod && cod !== '-') simCods.push(cod)
          if (nom) simNomes.push(nom)
        }
        const notSub = []
        if (simCods.length > 0) {
          notSub.push(
            'UPPER(TRIM(codigo_cliente)) NOT IN (' +
              simCods.map((c) => "'" + sqlEsc(c) + "'").join(',') +
              ')',
          )
        }
        if (simNomes.length > 0) {
          notSub.push(
            'nome_cliente NOT IN (' + simNomes.map((n) => "'" + sqlEsc(n) + "'").join(',') + ')',
          )
        }
        notSub.push("(nome_canal IS NULL OR TRIM(nome_canal) = '')")
        whereClauses.push('(' + notSub.join(' AND ') + ')')
      } catch (ecErr) {
        console.warn('pedidos_abertos list: filtro ehCanal nao warning:', ecErr)
      }
    }

    if (hasCanalFilter || hasCanalClientesFilter || hasDeployFilter || hasInsideFilter) {
      try {
        const ccWhere = [
          "(eh_canal = 1 OR eh_canal = 'true' OR eh_canal = 'SIM' OR eh_canal = 'Sim' OR eh_canal = 's')",
        ]

        if (hasCanalFilter) {
          const list = canaisFilter.map((c) => "'" + sqlEsc(c) + "'").join(',')
          ccWhere.push('nome_canal IN (' + list + ')')
        }
        if (hasCanalClientesFilter) {
          const list = canalClientesFilter.map((c) => "'" + sqlEsc(c) + "'").join(',')
          ccWhere.push('nome_cliente IN (' + list + ')')
        }
        if (hasDeployFilter) {
          const depConds = []
          for (let d = 0; d < deployFilter.length; d++) {
            const rawDep = String(deployFilter[d]).trim().toUpperCase()
            if (rawDep.indexOf('AGIS') >= 0) depConds.push("UPPER(deploy) LIKE '%AGIS%'")
            else if (rawDep.indexOf('ROLAND') >= 0) depConds.push("UPPER(deploy) LIKE '%ROLAND%'")
            else if (rawDep === 'NENHUM' || rawDep === 'SEM DEPLOY')
              depConds.push("(deploy IS NULL OR deploy = '' OR UPPER(deploy) = 'NENHUM')")
          }
          if (depConds.length > 0) ccWhere.push('(' + depConds.join(' OR ') + ')')
        }
        if (hasInsideFilter) {
          const list = insideFilter
            .map((ins) => "'" + sqlEsc(String(ins).trim().toUpperCase()) + "'")
            .join(',')
          ccWhere.push("UPPER(TRIM(COALESCE(inside, ''))) IN (" + list + ')')
        }

        const ccQuery =
          'SELECT DISTINCT codigo_cliente AS cc, nome_cliente AS nc FROM canais_clientes WHERE ' +
          ccWhere.join(' AND ')
        const ccRows = arrayOf(new DynamicModel({ cc: '', nc: '' }))
        $app.db().newQuery(ccQuery).all(ccRows)

        const matchedCodigos = []
        const matchedNomes = []
        for (let k = 0; k < ccRows.length; k++) {
          const cod = (ccRows[k].cc || '').trim().toUpperCase()
          const nom = (ccRows[k].nc || '').trim()
          if (cod && cod !== '-') matchedCodigos.push(cod)
          if (nom) matchedNomes.push(nom)
        }

        if (matchedCodigos.length > 0 || matchedNomes.length > 0) {
          const sub = []
          if (matchedCodigos.length > 0) {
            // Tolerante a maiúsculas e espaços no código do cliente
            sub.push(
              'UPPER(TRIM(codigo_cliente)) IN (' +
                matchedCodigos.map((c) => "'" + sqlEsc(c) + "'").join(',') +
                ')',
            )
          }
          if (matchedNomes.length > 0) {
            sub.push(
              'nome_cliente IN (' + matchedNomes.map((n) => "'" + sqlEsc(n) + "'").join(',') + ')',
            )
          }
          whereClauses.push('(' + sub.join(' OR ') + ')')
        } else {
          whereClauses.push('1=0')
        }
      } catch (err) {
        console.warn('pedidos_abertos list: filtro canal warning:', err)
      }
    }

    // 2. Filtro temporal por data_pedido quando aplicável
    if (f.dataDe) {
      whereClauses.push("data_pedido >= '" + sqlEsc(f.dataDe) + "'")
    }
    if (f.dataAte) {
      whereClauses.push("data_pedido <= '" + sqlEsc(f.dataAte) + "'")
    }
    if (Array.isArray(f.ano) && f.ano.length > 0) {
      const anosSql = f.ano.map((a) => "'" + sqlEsc(a) + "'").join(',')
      whereClauses.push('substr(data_pedido, 1, 4) IN (' + anosSql + ')')
    }
    if (Array.isArray(f.mes) && f.mes.length > 0) {
      const mesesSql = f.mes.map((m) => "'" + String(m).padStart(2, '0') + "'").join(',')
      whereClauses.push('substr(data_pedido, 6, 2) IN (' + mesesSql + ')')
    }

    // 3. Filtro por grupo do item
    if (Array.isArray(f.grupoItem) && f.grupoItem.length > 0) {
      const gruposSql = f.grupoItem.map((g) => "'" + sqlEsc(g) + "'").join(',')
      whereClauses.push('grupo_item IN (' + gruposSql + ')')
    }

    // 4. Busca textual (busca rápida em pedido, cliente, item)
    const search = (body.search || f.search || '').trim()
    if (search) {
      const sEsc = sqlEsc(search)
      whereClauses.push(
        "(numero_pedido LIKE '%" +
          sEsc +
          "%' OR nome_cliente LIKE '%" +
          sEsc +
          "%' OR codigo_cliente LIKE '%" +
          sEsc +
          "%' OR codigo_item LIKE '%" +
          sEsc +
          "%' OR descricao_item LIKE '%" +
          sEsc +
          "%')",
      )
    }

    const whereSql = whereClauses.length > 0 ? ' WHERE ' + whereClauses.join(' AND ') : ''

    // Mapeamento seguro de campos para ordenação
    const allowedSortCols = {
      numero_pedido: 'numero_pedido',
      data_pedido: 'data_pedido',
      nome_cliente: 'nome_cliente',
      codigo_cliente: 'codigo_cliente',
      nome_canal: 'nome_canal',
      codigo_item: 'codigo_item',
      descricao_item: 'descricao_item',
      grupo_item: 'grupo_item',
      qtd_aberto: 'qtd_aberto',
      preco_apos_desconto: 'preco_apos_desconto',
      valor_em_aberto: 'valor_em_aberto',
      status_linha: 'status_linha',
      linha: 'linha',
    }
    const safeSortCol = allowedSortCols[sortField] || 'data_pedido'
    const orderSql = ' ORDER BY ' + safeSortCol + ' ' + sortDir + ', id ASC'

    const toNum = (v) => {
      const n = parseFloat(v)
      return isNaN(n) ? 0 : n
    }
    const toInt = (v) => {
      const n = parseInt(v, 10)
      return isNaN(n) ? 0 : n
    }

    // Totalizadores
    let totalItems = 0
    let totalValor = 0
    let totalQtd = 0
    try {
      // Usamos string vazia para todos os campos numéricos no DynamicModel
      // porque o Go PocketBase converte qualquer float64 para string de forma 100% segura sem tentar int64 scan!
      const countRows = arrayOf(
        new DynamicModel({
          c: '',
          v: '',
          q: '',
        }),
      )
      $app
        .db()
        .newQuery(
          'SELECT COUNT(*) AS c, COALESCE(SUM(valor_em_aberto), 0) AS v, COALESCE(SUM(qtd_aberto), 0) AS q FROM pedidos_abertos' +
            whereSql,
        )
        .all(countRows)
      if (countRows.length > 0) {
        totalItems = toInt(countRows[0].c)
        totalValor = toNum(countRows[0].v)
        totalQtd = toNum(countRows[0].q)
      }
    } catch (cErr) {
      console.warn('pedidos_abertos list: count err:', cErr)
    }

    // Itens paginados
    const items = []
    try {
      const querySql =
        'SELECT id, numero_pedido, data_pedido, codigo_cliente, nome_cliente, usuario_emitente, ' +
        'linha, codigo_item, descricao_item, grupo_item, ' +
        'COALESCE(qtd_solicitada, 0) AS qtd_solicitada, status_linha, ' +
        'COALESCE(qtd_aberto, 0) AS qtd_aberto, ' +
        'COALESCE(em_estoque, 0) AS em_estoque, ' +
        'COALESCE(em_transito, 0) AS em_transito, ' +
        'deposito, ' +
        'COALESCE(preco_unitario, 0) AS preco_unitario, ' +
        'COALESCE(desconto_percentual, 0) AS desconto_percentual, ' +
        'COALESCE(preco_apos_desconto, 0) AS preco_apos_desconto, ' +
        'status, ' +
        'COALESCE(valor_em_aberto, 0) AS valor_em_aberto, ' +
        'nome_canal, deploy, inside, origem, data_carga ' +
        'FROM pedidos_abertos' +
        whereSql +
        orderSql +
        ' LIMIT ' +
        perPage +
        ' OFFSET ' +
        offset

      const rows = arrayOf(
        new DynamicModel({
          id: '',
          numero_pedido: '',
          data_pedido: '',
          codigo_cliente: '',
          nome_cliente: '',
          usuario_emitente: '',
          linha: '',
          codigo_item: '',
          descricao_item: '',
          grupo_item: '',
          qtd_solicitada: '',
          status_linha: '',
          qtd_aberto: '',
          em_estoque: '',
          em_transito: '',
          deposito: '',
          preco_unitario: '',
          desconto_percentual: '',
          preco_apos_desconto: '',
          status: '',
          valor_em_aberto: '',
          nome_canal: '',
          deploy: '',
          inside: '',
          origem: '',
          data_carga: '',
        }),
      )
      $app.db().newQuery(querySql).all(rows)

      for (let i = 0; i < rows.length; i++) {
        const r = rows[i]
        items.push({
          id: r.id || '',
          numero_pedido: r.numero_pedido || '',
          data_pedido: r.data_pedido || '',
          codigo_cliente: r.codigo_cliente || '',
          nome_cliente: r.nome_cliente || '',
          usuario_emitente: r.usuario_emitente || '',
          linha: toInt(r.linha) || 1,
          codigo_item: r.codigo_item || '',
          descricao_item: r.descricao_item || '',
          grupo_item: r.grupo_item || '',
          qtd_solicitada: toNum(r.qtd_solicitada),
          status_linha: r.status_linha || 'Aberta',
          qtd_aberto: toNum(r.qtd_aberto),
          em_estoque: toNum(r.em_estoque),
          em_transito: toNum(r.em_transito),
          deposito: r.deposito || '',
          preco_unitario: toNum(r.preco_unitario),
          desconto_percentual: toNum(r.desconto_percentual),
          preco_apos_desconto: toNum(r.preco_apos_desconto),
          status: r.status || '',
          valor_em_aberto: toNum(r.valor_em_aberto),
          nome_canal: r.nome_canal || '',
          deploy: r.deploy || '',
          inside: r.inside || '',
          origem: r.origem || '',
          data_carga: r.data_carga || '',
        })
      }
    } catch (qErr) {
      console.error('pedidos_abertos list error:', qErr)
      return e.json(500, { error: 'Erro ao listar pedidos em aberto' })
    }

    const totalPages = Math.ceil(totalItems / perPage) || 1

    return e.json(200, {
      items,
      page,
      perPage,
      totalItems,
      totalPages,
      totalValor,
      totalQtd,
    })
  },
  $apis.requireAuth(),
)

// Endpoint: POST /backend/v1/pedidos-abertos/stats
// KPIs de Pedidos em Aberto e ranking de clientes cruzado com a venda realizada no mesmo recorte
routerAdd(
  'POST',
  '/backend/v1/pedidos-abertos/stats',
  (e) => {
    const body = e.requestInfo().body || {}
    const f = body.filters || {}
    const sqlEsc = (s) => String(s).replace(/'/g, "''")

    // Cláusulas para pedidos_abertos
    const paWhereClauses = []
    // Cláusulas para resumo_vendas_mensal (ou vendas) para o mesmo recorte
    const vendasWhereClauses = []

    // 1. Filtros de Canal (incluindo É Canal)
    const canaisFilter = Array.isArray(f.canal) ? f.canal : f.canal ? [f.canal] : []
    const canalClientesFilter = Array.isArray(f.canalClientes)
      ? f.canalClientes
      : f.canalClientes
        ? [f.canalClientes]
        : []
    const deployFilter = Array.isArray(f.deploy) ? f.deploy : f.deploy ? [f.deploy] : []
    const insideFilter = Array.isArray(f.inside) ? f.inside : f.inside ? [f.inside] : []
    const ehCanalFilter =
      f.ehCanal !== undefined && f.ehCanal !== null ? String(f.ehCanal).trim() : ''

    const hasCanalFilter = canaisFilter.length > 0
    const hasCanalClientesFilter = canalClientesFilter.length > 0
    const hasDeployFilter = deployFilter.length > 0 && !deployFilter.includes('TODOS')
    const hasInsideFilter = insideFilter.length > 0

    // Filtro "É Canal": 'sim' | 'nao' | ''
    if (ehCanalFilter === 'sim' || ehCanalFilter === 'true' || ehCanalFilter === 'SIM') {
      try {
        const canaisCodRows = arrayOf(new DynamicModel({ cc: '', nc: '' }))
        $app
          .db()
          .newQuery(
            "SELECT DISTINCT codigo_cliente AS cc, nome_cliente AS nc FROM canais_clientes WHERE (eh_canal = 1 OR eh_canal = 'true' OR eh_canal = 'SIM' OR eh_canal = 'Sim' OR eh_canal = 's')",
          )
          .all(canaisCodRows)
        const simCods = []
        const simNomes = []
        for (let sc = 0; sc < canaisCodRows.length; sc++) {
          const cod = (canaisCodRows[sc].cc || '').trim().toUpperCase()
          const nom = (canaisCodRows[sc].nc || '').trim()
          if (cod && cod !== '-') simCods.push(cod)
          if (nom) simNomes.push(nom)
        }
        if (simCods.length > 0 || simNomes.length > 0) {
          const sub = []
          if (simCods.length > 0) {
            sub.push(
              'UPPER(TRIM(codigo_cliente)) IN (' +
                simCods.map((c) => "'" + sqlEsc(c) + "'").join(',') +
                ')',
            )
          }
          if (simNomes.length > 0) {
            sub.push(
              'nome_cliente IN (' + simNomes.map((n) => "'" + sqlEsc(n) + "'").join(',') + ')',
            )
          }
          const paSub = [...sub, "(nome_canal IS NOT NULL AND TRIM(nome_canal) != '')"]
          paWhereClauses.push('(' + paSub.join(' OR ') + ')')
          vendasWhereClauses.push('(' + sub.join(' OR ') + ')')
        } else {
          paWhereClauses.push("(nome_canal IS NOT NULL AND TRIM(nome_canal) != '')")
        }
      } catch (ecErr) {
        console.warn('pedidos_abertos stats: filtro ehCanal sim warning:', ecErr)
      }
    } else if (
      ehCanalFilter === 'nao' ||
      ehCanalFilter === 'false' ||
      ehCanalFilter === 'NAO' ||
      ehCanalFilter === 'Não'
    ) {
      try {
        const canaisCodRows = arrayOf(new DynamicModel({ cc: '', nc: '' }))
        $app
          .db()
          .newQuery(
            "SELECT DISTINCT codigo_cliente AS cc, nome_cliente AS nc FROM canais_clientes WHERE (eh_canal = 1 OR eh_canal = 'true' OR eh_canal = 'SIM' OR eh_canal = 'Sim' OR eh_canal = 's')",
          )
          .all(canaisCodRows)
        const simCods = []
        const simNomes = []
        for (let sc = 0; sc < canaisCodRows.length; sc++) {
          const cod = (canaisCodRows[sc].cc || '').trim().toUpperCase()
          const nom = (canaisCodRows[sc].nc || '').trim()
          if (cod && cod !== '-') simCods.push(cod)
          if (nom) simNomes.push(nom)
        }
        const notSub = []
        if (simCods.length > 0) {
          notSub.push(
            'UPPER(TRIM(codigo_cliente)) NOT IN (' +
              simCods.map((c) => "'" + sqlEsc(c) + "'").join(',') +
              ')',
          )
        }
        if (simNomes.length > 0) {
          notSub.push(
            'nome_cliente NOT IN (' + simNomes.map((n) => "'" + sqlEsc(n) + "'").join(',') + ')',
          )
        }
        const paNotSub = [...notSub, "(nome_canal IS NULL OR TRIM(nome_canal) = '')"]
        paWhereClauses.push('(' + paNotSub.join(' AND ') + ')')
        if (notSub.length > 0) {
          vendasWhereClauses.push('(' + notSub.join(' AND ') + ')')
        }
      } catch (ecErr) {
        console.warn('pedidos_abertos stats: filtro ehCanal nao warning:', ecErr)
      }
    }

    if (hasCanalFilter || hasCanalClientesFilter || hasDeployFilter || hasInsideFilter) {
      try {
        const ccWhere = [
          "(eh_canal = 1 OR eh_canal = 'true' OR eh_canal = 'SIM' OR eh_canal = 'Sim' OR eh_canal = 's')",
        ]

        if (hasCanalFilter) {
          const list = canaisFilter.map((c) => "'" + sqlEsc(c) + "'").join(',')
          ccWhere.push('nome_canal IN (' + list + ')')
        }
        if (hasCanalClientesFilter) {
          const list = canalClientesFilter.map((c) => "'" + sqlEsc(c) + "'").join(',')
          ccWhere.push('nome_cliente IN (' + list + ')')
        }
        if (hasDeployFilter) {
          const depConds = []
          for (let d = 0; d < deployFilter.length; d++) {
            const rawDep = String(deployFilter[d]).trim().toUpperCase()
            if (rawDep.indexOf('AGIS') >= 0) depConds.push("UPPER(deploy) LIKE '%AGIS%'")
            else if (rawDep.indexOf('ROLAND') >= 0) depConds.push("UPPER(deploy) LIKE '%ROLAND%'")
            else if (rawDep === 'NENHUM' || rawDep === 'SEM DEPLOY')
              depConds.push("(deploy IS NULL OR deploy = '' OR UPPER(deploy) = 'NENHUM')")
          }
          if (depConds.length > 0) ccWhere.push('(' + depConds.join(' OR ') + ')')
        }
        if (hasInsideFilter) {
          const list = insideFilter
            .map((ins) => "'" + sqlEsc(String(ins).trim().toUpperCase()) + "'")
            .join(',')
          ccWhere.push("UPPER(TRIM(COALESCE(inside, ''))) IN (" + list + ')')
        }

        const ccQuery =
          'SELECT DISTINCT codigo_cliente AS cc, nome_cliente AS nc FROM canais_clientes WHERE ' +
          ccWhere.join(' AND ')
        const ccRows = arrayOf(new DynamicModel({ cc: '', nc: '' }))
        $app.db().newQuery(ccQuery).all(ccRows)

        const matchedCodigos = []
        const matchedNomes = []
        for (let k = 0; k < ccRows.length; k++) {
          const cod = (ccRows[k].cc || '').trim().toUpperCase()
          const nom = (ccRows[k].nc || '').trim()
          if (cod && cod !== '-') matchedCodigos.push(cod)
          if (nom) matchedNomes.push(nom)
        }

        if (matchedCodigos.length > 0 || matchedNomes.length > 0) {
          const sub = []
          if (matchedCodigos.length > 0) {
            sub.push(
              'UPPER(TRIM(codigo_cliente)) IN (' +
                matchedCodigos.map((c) => "'" + sqlEsc(c) + "'").join(',') +
                ')',
            )
          }
          if (matchedNomes.length > 0) {
            sub.push(
              'nome_cliente IN (' + matchedNomes.map((n) => "'" + sqlEsc(n) + "'").join(',') + ')',
            )
          }
          const finalClause = '(' + sub.join(' OR ') + ')'
          paWhereClauses.push(finalClause)
          vendasWhereClauses.push(finalClause)
        } else {
          paWhereClauses.push('1=0')
          vendasWhereClauses.push('1=0')
        }
      } catch (err) {
        console.warn('pedidos_abertos stats: filtro canal warning:', err)
      }
    }

    // 2. Filtros temporais
    if (f.dataDe) {
      paWhereClauses.push("data_pedido >= '" + sqlEsc(f.dataDe) + "'")
      vendasWhereClauses.push("ano_mes >= '" + sqlEsc(f.dataDe.slice(0, 7)) + "'")
    }
    if (f.dataAte) {
      paWhereClauses.push("data_pedido <= '" + sqlEsc(f.dataAte) + "'")
      vendasWhereClauses.push("ano_mes <= '" + sqlEsc(f.dataAte.slice(0, 7)) + "'")
    }
    if (Array.isArray(f.ano) && f.ano.length > 0) {
      const anosSql = f.ano.map((a) => "'" + sqlEsc(a) + "'").join(',')
      paWhereClauses.push('substr(data_pedido, 1, 4) IN (' + anosSql + ')')
      vendasWhereClauses.push('CAST(ano AS TEXT) IN (' + anosSql + ')')
    }
    if (Array.isArray(f.mes) && f.mes.length > 0) {
      const mesesSql = f.mes.map((m) => "'" + String(m).padStart(2, '0') + "'").join(',')
      paWhereClauses.push('substr(data_pedido, 6, 2) IN (' + mesesSql + ')')
      vendasWhereClauses.push('CAST(mes AS TEXT) IN (' + f.mes.join(',') + ')')
    }

    // 3. Grupo de item
    if (Array.isArray(f.grupoItem) && f.grupoItem.length > 0) {
      const gruposSql = f.grupoItem.map((g) => "'" + sqlEsc(g) + "'").join(',')
      paWhereClauses.push('grupo_item IN (' + gruposSql + ')')
      vendasWhereClauses.push('grupo_item IN (' + gruposSql + ')')
    }

    // Busca
    if (f.search && String(f.search).trim()) {
      const sEsc = sqlEsc(String(f.search).trim())
      paWhereClauses.push(
        "(numero_pedido LIKE '%" +
          sEsc +
          "%' OR nome_cliente LIKE '%" +
          sEsc +
          "%' OR codigo_cliente LIKE '%" +
          sEsc +
          "%' OR codigo_item LIKE '%" +
          sEsc +
          "%')",
      )
      vendasWhereClauses.push(
        "(nome_cliente LIKE '%" + sEsc + "%' OR codigo_cliente LIKE '%" + sEsc + "%')",
      )
    }

    const paWhereSql = paWhereClauses.length > 0 ? ' WHERE ' + paWhereClauses.join(' AND ') : ''
    const vendasWhereSql =
      vendasWhereClauses.length > 0 ? ' WHERE ' + vendasWhereClauses.join(' AND ') : ''

    const toNum = (v) => {
      const n = parseFloat(v)
      return isNaN(n) ? 0 : n
    }
    const toInt = (v) => {
      const n = parseInt(v, 10)
      return isNaN(n) ? 0 : n
    }

    // 1. KPIs de pedidos abertos
    let valorTotalAberto = 0
    let pedidosDistintos = 0
    let itensPendentes = 0
    let clientesDistintos = 0

    try {
      // Usamos string vazia em todos os campos numéricos do DynamicModel para scan 100% seguro em Go
      const kpiRows = arrayOf(
        new DynamicModel({
          v: '',
          p: '',
          i: '',
          c: '',
        }),
      )
      $app
        .db()
        .newQuery(
          'SELECT COALESCE(SUM(valor_em_aberto), 0) AS v, ' +
            'COUNT(DISTINCT numero_pedido) AS p, ' +
            'COALESCE(SUM(qtd_aberto), 0) AS i, ' +
            "COUNT(DISTINCT COALESCE(NULLIF(codigo_cliente, ''), nome_cliente)) AS c " +
            'FROM pedidos_abertos' +
            paWhereSql,
        )
        .all(kpiRows)
      if (kpiRows.length > 0) {
        valorTotalAberto = toNum(kpiRows[0].v)
        pedidosDistintos = toInt(kpiRows[0].p)
        itensPendentes = toNum(kpiRows[0].i)
        clientesDistintos = toInt(kpiRows[0].c)
      }
    } catch (kErr) {
      console.warn('pedidos_abertos stats: kpi err:', kErr)
    }

    // 2. Ranking de clientes com pedidos em aberto
    const clientMap = {}
    try {
      const rankingSql =
        "SELECT COALESCE(codigo_cliente, '') AS cod, " +
        "COALESCE(nome_cliente, 'Sem identificação') AS nom, " +
        "COALESCE(nome_canal, '') AS canal, " +
        "COALESCE(deploy, '') AS deploy, " +
        "COALESCE(inside, '') AS inside, " +
        'COALESCE(SUM(valor_em_aberto), 0) AS val_aberto, ' +
        'COUNT(DISTINCT numero_pedido) AS qtd_pedidos, ' +
        'COALESCE(SUM(qtd_aberto), 0) AS qtd_itens ' +
        'FROM pedidos_abertos' +
        paWhereSql +
        " GROUP BY COALESCE(codigo_cliente, ''), COALESCE(nome_cliente, 'Sem identificação') " +
        'ORDER BY COALESCE(SUM(valor_em_aberto), 0) DESC LIMIT 50'

      const rRows = arrayOf(
        new DynamicModel({
          cod: '',
          nom: '',
          canal: '',
          deploy: '',
          inside: '',
          val_aberto: '',
          qtd_pedidos: '',
          qtd_itens: '',
        }),
      )
      $app.db().newQuery(rankingSql).all(rRows)

      for (let i = 0; i < rRows.length; i++) {
        const item = rRows[i]
        const key = item.cod || item.nom
        clientMap[key] = {
          codigo_cliente: item.cod,
          nome_cliente: item.nom,
          nome_canal: item.canal,
          deploy: item.deploy,
          inside: item.inside,
          valor_em_aberto: toNum(item.val_aberto),
          qtd_pedidos: toInt(item.qtd_pedidos),
          qtd_itens: toNum(item.qtd_itens),
          venda_realizada: 0,
          total_potencial: 0,
          taxa_em_aberto: 0,
        }
      }
    } catch (rErr) {
      console.warn('pedidos_abertos stats: ranking err:', rErr)
    }

    // 3. Cruzar com a venda realizada do cliente no mesmo recorte a partir de resumo_vendas_mensal
    try {
      const vSql =
        "SELECT COALESCE(codigo_cliente, '') AS cod, " +
        "COALESCE(nome_cliente, '') AS nom, " +
        'COALESCE(SUM(total_linha), 0) AS venda_realizada ' +
        'FROM resumo_vendas_mensal' +
        vendasWhereSql +
        " GROUP BY COALESCE(codigo_cliente, ''), COALESCE(nome_cliente, '')"

      const vRows = arrayOf(
        new DynamicModel({
          cod: '',
          nom: '',
          venda_realizada: '',
        }),
      )
      $app.db().newQuery(vSql).all(vRows)

      for (let i = 0; i < vRows.length; i++) {
        const row = vRows[i]
        const cod = (row.cod || '').trim()
        const nom = (row.nom || '').trim()
        const venda = toNum(row.venda_realizada)

        // Procura no clientMap por código ou nome
        if (cod && clientMap[cod]) {
          clientMap[cod].venda_realizada += venda
        } else if (nom && clientMap[nom]) {
          clientMap[nom].venda_realizada += venda
        }
      }
    } catch (vErr) {
      console.warn('pedidos_abertos stats: vendas cruzadas err:', vErr)
    }

    // Monta ranking final ordenado por valor_em_aberto DESC (SEM object spread {...c})
    const rankingClientes = Object.values(clientMap).map((c) => {
      const totalPotencial = c.valor_em_aberto + c.venda_realizada
      const taxa = totalPotencial > 0 ? Math.round((c.valor_em_aberto / totalPotencial) * 100) : 0
      return {
        codigo_cliente: c.codigo_cliente,
        nome_cliente: c.nome_cliente,
        nome_canal: c.nome_canal,
        deploy: c.deploy,
        inside: c.inside,
        valor_em_aberto: c.valor_em_aberto,
        qtd_pedidos: c.qtd_pedidos,
        qtd_itens: c.qtd_itens,
        venda_realizada: c.venda_realizada,
        total_potencial: totalPotencial,
        taxa_em_aberto: taxa,
      }
    })
    rankingClientes.sort((a, b) => b.valor_em_aberto - a.valor_em_aberto)

    // 4. Opções de filtro de canais para carregar instantaneamente sem depender do dashboard de vendas
    let canaisOptions = []
    let canaisClientesOptions = []
    let insideOptions = []
    try {
      const canalRows = arrayOf(
        new DynamicModel({
          nome_canal: '',
          deploy: '',
        }),
      )
      $app
        .db()
        .newQuery(
          "SELECT nome_canal, MAX(deploy) AS deploy FROM canais_clientes WHERE (eh_canal = 1 OR eh_canal = 'true' OR eh_canal = 'SIM' OR eh_canal = 'Sim' OR eh_canal = 's') AND nome_canal IS NOT NULL AND nome_canal != '' GROUP BY nome_canal ORDER BY nome_canal ASC",
        )
        .all(canalRows)

      for (let i = 0; i < canalRows.length; i++) {
        const nc = (canalRows[i].nome_canal || '').trim()
        if (nc) {
          canaisOptions.push({
            nome: nc,
            deploy: (canalRows[i].deploy || '').trim().toUpperCase(),
          })
        }
      }

      const cliCanalRows = arrayOf(
        new DynamicModel({
          nome_canal: '',
          nome_cliente: '',
          codigo_cliente: '',
          deploy: '',
        }),
      )
      $app
        .db()
        .newQuery(
          "SELECT DISTINCT nome_canal, nome_cliente, codigo_cliente, deploy FROM canais_clientes WHERE (eh_canal = 1 OR eh_canal = 'true' OR eh_canal = 'SIM' OR eh_canal = 'Sim' OR eh_canal = 's') AND nome_cliente IS NOT NULL AND nome_cliente != '' ORDER BY nome_cliente ASC",
        )
        .all(cliCanalRows)

      for (let i = 0; i < cliCanalRows.length; i++) {
        const ncli = (cliCanalRows[i].nome_cliente || '').trim()
        if (ncli) {
          canaisClientesOptions.push({
            nome_canal: (cliCanalRows[i].nome_canal || '').trim(),
            nome_cliente: ncli,
            codigo_cliente: (cliCanalRows[i].codigo_cliente || '').trim(),
            deploy: (cliCanalRows[i].deploy || '').trim().toUpperCase(),
          })
        }
      }

      const insideRows = arrayOf(
        new DynamicModel({
          inside_val: '',
        }),
      )
      $app
        .db()
        .newQuery(
          "SELECT DISTINCT UPPER(TRIM(inside)) AS inside_val FROM canais_clientes WHERE (eh_canal = 1 OR eh_canal = 'true' OR eh_canal = 'SIM' OR eh_canal = 'Sim' OR eh_canal = 's') AND inside IS NOT NULL AND TRIM(inside) != '' ORDER BY 1 ASC",
        )
        .all(insideRows)

      const insideSet = new Set()
      for (let i = 0; i < insideRows.length; i++) {
        const ins = (insideRows[i].inside_val || '').trim()
        if (ins && !insideSet.has(ins)) {
          insideSet.add(ins)
          insideOptions.push(ins)
        }
      }
    } catch (canalErr) {
      console.warn('pedidos_abertos stats: canais filter options err:', canalErr)
    }

    return e.json(200, {
      kpis: {
        valorTotalAberto,
        pedidosDistintos,
        itensPendentes,
        clientesDistintos,
      },
      rankingClientes: rankingClientes.slice(0, 30),
      filterOptions: {
        canais: canaisOptions,
        canaisClientes: canaisClientesOptions,
        inside: insideOptions,
      },
    })
  },
  $apis.requireAuth(),
)
