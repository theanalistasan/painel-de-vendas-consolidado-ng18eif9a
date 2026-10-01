// Endpoints para Pedidos em Aberto:
// 1. POST /backend/v1/pedidos-abertos/list - Listagem paginada com filtros, busca e ordenação
// 2. POST /backend/v1/pedidos-abertos/stats - KPIs e Ranking de clientes com ritmo de compra vs vendas realizadas

routerAdd(
  'POST',
  '/backend/v1/pedidos-abertos/list',
  (e) => {
    const body = e.requestInfo().body || {}
    const page = Math.max(1, parseInt(body.page, 10) || 1)
    const perPage = Math.min(200, Math.max(1, parseInt(body.perPage, 10) || 20))
    const offset = (page - 1) * perPage

    const sortField = body.sortField || 'data_pedido'
    const sortDir = body.sortDirection === 'asc' ? 'ASC' : 'DESC'
    const f = body.filters || {}

    const sqlEsc = (s) => String(s).replace(/'/g, "''")

    // Cláusulas WHERE
    const whereClauses = []

    // 1. Filtros de Canal (Canal, Clientes do Canal, Deploy, Inside)
    const canaisFilter = Array.isArray(f.canal) ? f.canal : f.canal ? [f.canal] : []
    const canalClientesFilter = Array.isArray(f.canalClientes)
      ? f.canalClientes
      : f.canalClientes
        ? [f.canalClientes]
        : []
    const deployFilter = Array.isArray(f.deploy) ? f.deploy : f.deploy ? [f.deploy] : []
    const insideFilter = Array.isArray(f.inside) ? f.inside : f.inside ? [f.inside] : []

    const hasCanalFilter = canaisFilter.length > 0
    const hasCanalClientesFilter = canalClientesFilter.length > 0
    const hasDeployFilter = deployFilter.length > 0 && !deployFilter.includes('TODOS')
    const hasInsideFilter = insideFilter.length > 0

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

    // Totalizadores
    let totalItems = 0
    let totalValor = 0
    let totalQtd = 0
    try {
      const countRows = arrayOf(
        new DynamicModel({
          c: 0,
          v: 0.0,
          q: 0.0,
        }),
      )
      $app
        .db()
        .newQuery(
          'SELECT COUNT(*) AS c, CAST(COALESCE(SUM(valor_em_aberto),0.0) AS REAL) AS v, CAST(COALESCE(SUM(qtd_aberto),0.0) AS REAL) AS q FROM pedidos_abertos' +
            whereSql,
        )
        .all(countRows)
      if (countRows.length > 0) {
        totalItems = Number(countRows[0].c) || 0
        totalValor = Number(countRows[0].v) || 0
        totalQtd = Number(countRows[0].q) || 0
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
        'CAST(COALESCE(qtd_solicitada, 0.0) AS REAL) AS qtd_solicitada, status_linha, ' +
        'CAST(COALESCE(qtd_aberto, 0.0) AS REAL) AS qtd_aberto, ' +
        'CAST(COALESCE(em_estoque, 0.0) AS REAL) AS em_estoque, ' +
        'CAST(COALESCE(em_transito, 0.0) AS REAL) AS em_transito, ' +
        'deposito, ' +
        'CAST(COALESCE(preco_unitario, 0.0) AS REAL) AS preco_unitario, ' +
        'CAST(COALESCE(desconto_percentual, 0.0) AS REAL) AS desconto_percentual, ' +
        'CAST(COALESCE(preco_apos_desconto, 0.0) AS REAL) AS preco_apos_desconto, ' +
        'status, ' +
        'CAST(COALESCE(valor_em_aberto, 0.0) AS REAL) AS valor_em_aberto, ' +
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
          linha: 0,
          codigo_item: '',
          descricao_item: '',
          grupo_item: '',
          qtd_solicitada: 0.0,
          status_linha: '',
          qtd_aberto: 0.0,
          em_estoque: 0.0,
          em_transito: 0.0,
          deposito: '',
          preco_unitario: 0.0,
          desconto_percentual: 0.0,
          preco_apos_desconto: 0.0,
          status: '',
          valor_em_aberto: 0.0,
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
          linha: Number(r.linha) || 1,
          codigo_item: r.codigo_item || '',
          descricao_item: r.descricao_item || '',
          grupo_item: r.grupo_item || '',
          qtd_solicitada: Number(r.qtd_solicitada) || 0,
          status_linha: r.status_linha || 'Aberta',
          qtd_aberto: Number(r.qtd_aberto) || 0,
          em_estoque: Number(r.em_estoque) || 0,
          em_transito: Number(r.em_transito) || 0,
          deposito: r.deposito || '',
          preco_unitario: Number(r.preco_unitario) || 0,
          desconto_percentual: Number(r.desconto_percentual) || 0,
          preco_apos_desconto: Number(r.preco_apos_desconto) || 0,
          status: r.status || '',
          valor_em_aberto: Number(r.valor_em_aberto) || 0,
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

    // 1. Filtros de Canal
    const canaisFilter = Array.isArray(f.canal) ? f.canal : f.canal ? [f.canal] : []
    const canalClientesFilter = Array.isArray(f.canalClientes)
      ? f.canalClientes
      : f.canalClientes
        ? [f.canalClientes]
        : []
    const deployFilter = Array.isArray(f.deploy) ? f.deploy : f.deploy ? [f.deploy] : []
    const insideFilter = Array.isArray(f.inside) ? f.inside : f.inside ? [f.inside] : []

    const hasCanalFilter = canaisFilter.length > 0
    const hasCanalClientesFilter = canalClientesFilter.length > 0
    const hasDeployFilter = deployFilter.length > 0 && !deployFilter.includes('TODOS')
    const hasInsideFilter = insideFilter.length > 0

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

    // 1. KPIs de pedidos abertos
    let valorTotalAberto = 0
    let pedidosDistintos = 0
    let itensPendentes = 0
    let clientesDistintos = 0

    try {
      const kpiRows = arrayOf(
        new DynamicModel({
          v: 0.0,
          p: 0,
          i: 0.0,
          c: 0,
        }),
      )
      $app
        .db()
        .newQuery(
          'SELECT CAST(COALESCE(SUM(valor_em_aberto), 0.0) AS REAL) AS v, ' +
            'COUNT(DISTINCT numero_pedido) AS p, ' +
            'CAST(COALESCE(SUM(qtd_aberto), 0.0) AS REAL) AS i, ' +
            "COUNT(DISTINCT COALESCE(NULLIF(codigo_cliente, ''), nome_cliente)) AS c " +
            'FROM pedidos_abertos' +
            paWhereSql,
        )
        .all(kpiRows)
      if (kpiRows.length > 0) {
        valorTotalAberto = Number(kpiRows[0].v) || 0
        pedidosDistintos = Number(kpiRows[0].p) || 0
        itensPendentes = Number(kpiRows[0].i) || 0
        clientesDistintos = Number(kpiRows[0].c) || 0
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
        'CAST(COALESCE(SUM(valor_em_aberto), 0.0) AS REAL) AS val_aberto, ' +
        'COUNT(DISTINCT numero_pedido) AS qtd_pedidos, ' +
        'CAST(COALESCE(SUM(qtd_aberto), 0.0) AS REAL) AS qtd_itens ' +
        'FROM pedidos_abertos' +
        paWhereSql +
        " GROUP BY COALESCE(codigo_cliente, ''), COALESCE(nome_cliente, 'Sem identificação') " +
        'ORDER BY val_aberto DESC LIMIT 50'

      const rRows = arrayOf(
        new DynamicModel({
          cod: '',
          nom: '',
          canal: '',
          deploy: '',
          inside: '',
          val_aberto: 0.0,
          qtd_pedidos: 0,
          qtd_itens: 0.0,
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
          valor_em_aberto: Number(item.val_aberto) || 0,
          qtd_pedidos: Number(item.qtd_pedidos) || 0,
          qtd_itens: Number(item.qtd_itens) || 0,
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
        'CAST(COALESCE(SUM(total_linha), 0.0) AS REAL) AS venda_realizada ' +
        'FROM resumo_vendas_mensal' +
        vendasWhereSql +
        " GROUP BY COALESCE(codigo_cliente, ''), COALESCE(nome_cliente, '')"

      const vRows = arrayOf(
        new DynamicModel({
          cod: '',
          nom: '',
          venda_realizada: 0.0,
        }),
      )
      $app.db().newQuery(vSql).all(vRows)

      for (let i = 0; i < vRows.length; i++) {
        const row = vRows[i]
        const cod = (row.cod || '').trim()
        const nom = (row.nom || '').trim()
        const venda = Number(row.venda_realizada) || 0

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
