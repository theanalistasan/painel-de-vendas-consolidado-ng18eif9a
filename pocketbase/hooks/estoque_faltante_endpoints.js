// Endpoints para Estoque Faltante & MRP:
// 1. POST /backend/v1/estoque-faltante/list
//    - Relatório dos itens com Em Estoque = 0 e Qtd Aberto > 0
//    - Filtros de Canais (Canal, Clientes, Deploy, Inside, É Canal, busca, etc.)
//    - Enriquecido com Média de Venda Mensal dos últimos 6 meses (base Vendas consolidada)
// 2. POST /backend/v1/estoque-faltante/stats
//    - KPIs: itens distintos faltantes, valor demanda pendente, pedidos impactados,
//      divisão entre sem estoque mas com trânsito vs faltante total
//    - Top 20 itens mais solicitados sem estoque (por Qtd e por Valor)
// 3. POST /backend/v1/estoque-faltante/mrp
//    - Top 20 itens mais vendidos nos últimos 6 meses (base Vendas)
//    - Posição atual de estoque e trânsito (estoque_sap, última importação)
//    - Cobertura em meses e status de reposição (Repor < 1m, Atenção 1-2m, Normal > 2m)

routerAdd(
  'POST',
  '/backend/v1/estoque-faltante/list',
  (e) => {
    const body = e.requestInfo().body || {}
    const page = Math.max(1, parseInt(body.page, 10) || 1)
    const perPage = Math.min(2000, Math.max(1, parseInt(body.perPage, 10) || 20))
    const offset = (page - 1) * perPage

    const sortField = body.sortField || 'valor_em_aberto'
    const sortDir = body.sortDirection === 'asc' ? 'ASC' : 'DESC'
    const f = body.filters || {}
    const statusTransito = body.statusTransito || f.statusTransito || '' // 'com_transito' | 'sem_transito' | ''

    const sqlEsc = (s) => String(s).replace(/'/g, "''")
    const toNum = (v) => {
      const n = parseFloat(v)
      return isNaN(n) ? 0 : n
    }
    const toInt = (v) => {
      const n = parseInt(v, 10)
      return isNaN(n) ? 0 : n
    }

    // Regra base de itens faltantes:
    // Linhas de pedidos em aberto com Em Estoque = 0 e Qtd Aberto > 0
    const whereClauses = [
      "(em_estoque = 0 OR em_estoque IS NULL OR em_estoque = '')",
      'qtd_aberto > 0',
    ]

    // Filtro por trânsito se especificado
    if (statusTransito === 'com_transito') {
      whereClauses.push('em_transito > 0')
    } else if (statusTransito === 'sem_transito') {
      whereClauses.push('(em_transito = 0 OR em_transito IS NULL OR em_transito <= 0)')
    }

    // Filtros de Canais (Canal, Clientes do Canal, Deploy, Inside, É Canal)
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
          sub.push("(nome_canal IS NOT NULL AND TRIM(nome_canal) != '')")
          whereClauses.push('(' + sub.join(' OR ') + ')')
        } else {
          whereClauses.push("(nome_canal IS NOT NULL AND TRIM(nome_canal) != '')")
        }
      } catch (ecErr) {
        console.warn('estoque_faltante list: filtro ehCanal sim warning:', ecErr)
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
        console.warn('estoque_faltante list: filtro ehCanal nao warning:', ecErr)
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
          whereClauses.push('(' + sub.join(' OR ') + ')')
        } else {
          whereClauses.push('1=0')
        }
      } catch (err) {
        console.warn('estoque_faltante list: filtro canal warning:', err)
      }
    }

    // Busca textual
    const search = (body.search || f.search || '').trim()
    if (search) {
      const sEsc = sqlEsc(search)
      whereClauses.push(
        "(codigo_item LIKE '%" +
          sEsc +
          "%' OR descricao_item LIKE '%" +
          sEsc +
          "%' OR grupo_item LIKE '%" +
          sEsc +
          "%' OR nome_canal LIKE '%" +
          sEsc +
          "%' OR nome_cliente LIKE '%" +
          sEsc +
          "%' OR numero_pedido LIKE '%" +
          sEsc +
          "%')",
      )
    }

    const whereSql = ' WHERE ' + whereClauses.join(' AND ')

    // Consulta agregada por canal + item:
    // "relatório das linhas com Em Estoque = 0 (item, descrição, grupo, canal, clientes, qtd aberta, valor em aberto, nº de pedidos)"
    // Agrupamento por COALESCE(nome_canal, 'Sem Canal') e codigo_item
    const countSql =
      'SELECT COUNT(*) AS c, ' +
      'CAST(COALESCE(SUM(sub.valor_em_aberto), 0.0) AS REAL) AS total_val, ' +
      'CAST(COALESCE(SUM(sub.qtd_aberto), 0.0) AS REAL) AS total_qtd ' +
      'FROM (' +
      "SELECT COALESCE(NULLIF(TRIM(nome_canal), ''), 'Sem Canal') AS canal, " +
      'codigo_item, ' +
      'CAST(COALESCE(SUM(valor_em_aberto), 0.0) AS REAL) AS valor_em_aberto, ' +
      'CAST(COALESCE(SUM(qtd_aberto), 0.0) AS REAL) AS qtd_aberto ' +
      'FROM pedidos_abertos' +
      whereSql +
      " GROUP BY COALESCE(NULLIF(TRIM(nome_canal), ''), 'Sem Canal'), codigo_item" +
      ') sub'

    let totalItems = 0
    let totalValor = 0
    let totalQtd = 0
    try {
      const cRows = arrayOf(new DynamicModel({ c: '', total_val: '', total_qtd: '' }))
      $app.db().newQuery(countSql).all(cRows)
      if (cRows.length > 0) {
        totalItems = toInt(cRows[0].c)
        totalValor = toNum(cRows[0].total_val)
        totalQtd = toNum(cRows[0].total_qtd)
      }
    } catch (cErr) {
      console.warn('estoque_faltante list count err:', cErr)
    }

    // Ordenação segura
    const allowedSortCols = {
      canal: 'canal',
      codigo_item: 'codigo_item',
      descricao_item: 'descricao_item',
      grupo_item: 'grupo_item',
      qtd_aberto: 'qtd_aberto',
      valor_em_aberto: 'valor_em_aberto',
      pedidos_qtd: 'pedidos_qtd',
      clientes_qtd: 'clientes_qtd',
      em_transito: 'em_transito',
      media_mensal_vendas: 'media_mensal_vendas',
    }
    const safeSort = allowedSortCols[sortField] || 'valor_em_aberto'
    const orderSql = ' ORDER BY ' + safeSort + ' ' + sortDir

    const querySql =
      'SELECT ' +
      "COALESCE(NULLIF(TRIM(nome_canal), ''), 'Sem Canal') AS canal, " +
      'codigo_item, ' +
      'MAX(descricao_item) AS descricao_item, ' +
      'MAX(grupo_item) AS grupo_item, ' +
      'CAST(COALESCE(SUM(qtd_aberto), 0.0) AS REAL) AS qtd_aberto, ' +
      'CAST(COALESCE(SUM(valor_em_aberto), 0.0) AS REAL) AS valor_em_aberto, ' +
      'COUNT(DISTINCT numero_pedido) AS pedidos_qtd, ' +
      'COUNT(DISTINCT nome_cliente) AS clientes_qtd, ' +
      'GROUP_CONCAT(DISTINCT nome_cliente) AS clientes_nomes, ' +
      'CAST(COALESCE(MAX(em_transito), 0.0) AS REAL) AS em_transito ' +
      'FROM pedidos_abertos' +
      whereSql +
      " GROUP BY COALESCE(NULLIF(TRIM(nome_canal), ''), 'Sem Canal'), codigo_item" +
      orderSql +
      ' LIMIT ' +
      perPage +
      ' OFFSET ' +
      offset

    const items = []
    const distinctCodigos = []

    try {
      const rows = arrayOf(
        new DynamicModel({
          canal: '',
          codigo_item: '',
          descricao_item: '',
          grupo_item: '',
          qtd_aberto: '',
          valor_em_aberto: '',
          pedidos_qtd: '',
          clientes_qtd: '',
          clientes_nomes: '',
          em_transito: '',
        }),
      )
      $app.db().newQuery(querySql).all(rows)

      for (let i = 0; i < rows.length; i++) {
        const r = rows[i]
        const cod = (r.codigo_item || '').trim()
        if (cod && !distinctCodigos.includes(cod)) {
          distinctCodigos.push(cod)
        }
        items.push({
          id: (r.canal || '') + '::' + cod,
          canal: r.canal || 'Sem Canal',
          codigo_item: cod,
          descricao_item: r.descricao_item || '',
          grupo_item: r.grupo_item || '',
          qtd_aberto: toNum(r.qtd_aberto),
          valor_em_aberto: toNum(r.valor_em_aberto),
          pedidos_qtd: toInt(r.pedidos_qtd),
          clientes_qtd: toInt(r.clientes_qtd),
          clientes_nomes: r.clientes_nomes || '',
          em_transito: toNum(r.em_transito),
          media_mensal_vendas: 0,
          qtd_vendida_6m: 0,
        })
      }
    } catch (qErr) {
      console.error('estoque_faltante list error:', qErr)
      return e.json(500, { error: 'Erro ao listar estoque faltante: ' + String(qErr) })
    }

    // Enriquecimento: Média de venda mensal dos últimos 6 meses (base Vendas consolidada) por código de item
    // Determina a data limite (últimos 6 meses baseados na última venda da base ou data atual)
    if (distinctCodigos.length > 0) {
      try {
        let maxData = '2026-09-30'
        const maxRows = arrayOf(new DynamicModel({ max_d: '' }))
        $app
          .db()
          .newQuery(
            'SELECT MAX(data_lancamento) AS max_d FROM vendas WHERE data_lancamento IS NOT NULL',
          )
          .all(maxRows)
        if (maxRows.length > 0 && maxRows[0].max_d) {
          maxData = maxRows[0].max_d.slice(0, 10)
        }

        // Calcula data de 6 meses atrás
        const maxYear = parseInt(maxData.slice(0, 4), 10) || 2026
        const maxMonth = parseInt(maxData.slice(5, 7), 10) || 9
        let minYear = maxYear
        let minMonth = maxMonth - 5
        if (minMonth <= 0) {
          minMonth += 12
          minYear -= 1
        }
        const dataLimite = minYear + '-' + String(minMonth).padStart(2, '0') + '-01'

        const codInSql = distinctCodigos.map((c) => "'" + sqlEsc(c) + "'").join(',')
        const vSql =
          'SELECT codigo_item, ' +
          'CAST(COALESCE(SUM(quantidade), 0.0) AS REAL) AS qtd_vendida ' +
          'FROM vendas ' +
          'WHERE codigo_item IN (' +
          codInSql +
          ") AND data_lancamento >= '" +
          dataLimite +
          "' AND (tipo_documento != 'NF de Entrada' OR tipo_documento IS NULL) " +
          'GROUP BY codigo_item'

        const vRows = arrayOf(new DynamicModel({ codigo_item: '', qtd_vendida: '' }))
        $app.db().newQuery(vSql).all(vRows)

        const salesMap = {}
        for (let v = 0; v < vRows.length; v++) {
          const c = (vRows[v].codigo_item || '').trim()
          const q = toNum(vRows[v].qtd_vendida)
          salesMap[c] = q
        }

        for (let i = 0; i < items.length; i++) {
          const c = items[i].codigo_item
          const totalVendida = salesMap[c] || 0
          items[i].qtd_vendida_6m = totalVendida
          items[i].media_mensal_vendas = parseFloat((totalVendida / 6).toFixed(2))
        }
      } catch (vErr) {
        console.warn('estoque_faltante list vendas enrichment err:', vErr)
      }
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

// Endpoint: POST /backend/v1/estoque-faltante/stats
// KPIs de itens faltantes + Top 20 por Qtd e por Valor
routerAdd(
  'POST',
  '/backend/v1/estoque-faltante/stats',
  (e) => {
    const body = e.requestInfo().body || {}
    const f = body.filters || {}
    const sqlEsc = (s) => String(s).replace(/'/g, "''")
    const toNum = (v) => {
      const n = parseFloat(v)
      return isNaN(n) ? 0 : n
    }
    const toInt = (v) => {
      const n = parseInt(v, 10)
      return isNaN(n) ? 0 : n
    }

    const whereClauses = [
      "(em_estoque = 0 OR em_estoque IS NULL OR em_estoque = '')",
      'qtd_aberto > 0',
    ]

    // Filtros de Canais
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
          sub.push("(nome_canal IS NOT NULL AND TRIM(nome_canal) != '')")
          whereClauses.push('(' + sub.join(' OR ') + ')')
        } else {
          whereClauses.push("(nome_canal IS NOT NULL AND TRIM(nome_canal) != '')")
        }
      } catch (ecErr) {
        console.warn('estoque_faltante stats: filtro ehCanal sim warning:', ecErr)
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
        console.warn('estoque_faltante stats: filtro ehCanal nao warning:', ecErr)
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
          whereClauses.push('(' + sub.join(' OR ') + ')')
        } else {
          whereClauses.push('1=0')
        }
      } catch (err) {
        console.warn('estoque_faltante stats: filtro canal warning:', err)
      }
    }

    if (f.search && String(f.search).trim()) {
      const sEsc = sqlEsc(String(f.search).trim())
      whereClauses.push(
        "(codigo_item LIKE '%" +
          sEsc +
          "%' OR descricao_item LIKE '%" +
          sEsc +
          "%' OR grupo_item LIKE '%" +
          sEsc +
          "%' OR nome_canal LIKE '%" +
          sEsc +
          "%' OR nome_cliente LIKE '%" +
          sEsc +
          "%' OR numero_pedido LIKE '%" +
          sEsc +
          "%')",
      )
    }

    const whereSql = ' WHERE ' + whereClauses.join(' AND ')

    // KPIs gerais e distinção:
    // (a) sem estoque mas COM trânsito (em_transito > 0)
    // (b) sem estoque E sem trânsito (em_transito <= 0 ou null)
    let totalItensDistintos = 0
    let valorDemandaPendente = 0
    let pedidosImpactados = 0
    let qtdTotalAberto = 0

    let comTransitoItens = 0
    let comTransitoValor = 0
    let comTransitoPedidos = 0
    let comTransitoQtd = 0

    let semTransitoItens = 0
    let semTransitoValor = 0
    let semTransitoPedidos = 0
    let semTransitoQtd = 0

    try {
      const kpiSql =
        'SELECT ' +
        'COUNT(DISTINCT codigo_item) AS tot_itens, ' +
        'COUNT(DISTINCT numero_pedido) AS tot_pedidos, ' +
        'CAST(COALESCE(SUM(valor_em_aberto), 0.0) AS REAL) AS tot_valor, ' +
        'CAST(COALESCE(SUM(qtd_aberto), 0.0) AS REAL) AS tot_qtd, ' +
        'COUNT(DISTINCT CASE WHEN em_transito > 0 THEN codigo_item END) AS com_tr_itens, ' +
        'COUNT(DISTINCT CASE WHEN em_transito > 0 THEN numero_pedido END) AS com_tr_pedidos, ' +
        'CAST(COALESCE(SUM(CASE WHEN em_transito > 0 THEN valor_em_aberto ELSE 0.0 END), 0.0) AS REAL) AS com_tr_valor, ' +
        'CAST(COALESCE(SUM(CASE WHEN em_transito > 0 THEN qtd_aberto ELSE 0.0 END), 0.0) AS REAL) AS com_tr_qtd, ' +
        'COUNT(DISTINCT CASE WHEN (em_transito IS NULL OR em_transito <= 0) THEN codigo_item END) AS sem_tr_itens, ' +
        'COUNT(DISTINCT CASE WHEN (em_transito IS NULL OR em_transito <= 0) THEN numero_pedido END) AS sem_tr_pedidos, ' +
        'CAST(COALESCE(SUM(CASE WHEN (em_transito IS NULL OR em_transito <= 0) THEN valor_em_aberto ELSE 0.0 END), 0.0) AS REAL) AS sem_tr_valor, ' +
        'CAST(COALESCE(SUM(CASE WHEN (em_transito IS NULL OR em_transito <= 0) THEN qtd_aberto ELSE 0.0 END), 0.0) AS REAL) AS sem_tr_qtd ' +
        'FROM pedidos_abertos' +
        whereSql

      const kpiRows = arrayOf(
        new DynamicModel({
          tot_itens: '',
          tot_pedidos: '',
          tot_valor: '',
          tot_qtd: '',
          com_tr_itens: '',
          com_tr_pedidos: '',
          com_tr_valor: '',
          com_tr_qtd: '',
          sem_tr_itens: '',
          sem_tr_pedidos: '',
          sem_tr_valor: '',
          sem_tr_qtd: '',
        }),
      )
      $app.db().newQuery(kpiSql).all(kpiRows)

      if (kpiRows.length > 0) {
        const k = kpiRows[0]
        totalItensDistintos = toInt(k.tot_itens)
        pedidosImpactados = toInt(k.tot_pedidos)
        valorDemandaPendente = toNum(k.tot_valor)
        qtdTotalAberto = toNum(k.tot_qtd)

        comTransitoItens = toInt(k.com_tr_itens)
        comTransitoPedidos = toInt(k.com_tr_pedidos)
        comTransitoValor = toNum(k.com_tr_valor)
        comTransitoQtd = toNum(k.com_tr_qtd)

        semTransitoItens = toInt(k.sem_tr_itens)
        semTransitoPedidos = toInt(k.sem_tr_pedidos)
        semTransitoValor = toNum(k.sem_tr_valor)
        semTransitoQtd = toNum(k.sem_tr_qtd)
      }
    } catch (kErr) {
      console.warn('estoque_faltante stats: kpi err:', kErr)
    }

    // Top 20 por Quantidade Aberta
    const top20Qtd = []
    try {
      const topQtdSql =
        'SELECT codigo_item, ' +
        'MAX(descricao_item) AS descricao_item, ' +
        'MAX(grupo_item) AS grupo_item, ' +
        'CAST(COALESCE(SUM(qtd_aberto), 0.0) AS REAL) AS qtd_aberto, ' +
        'CAST(COALESCE(SUM(valor_em_aberto), 0.0) AS REAL) AS valor_em_aberto, ' +
        'COUNT(DISTINCT numero_pedido) AS pedidos_qtd, ' +
        'CAST(COALESCE(MAX(em_transito), 0.0) AS REAL) AS em_transito ' +
        'FROM pedidos_abertos' +
        whereSql +
        ' GROUP BY codigo_item ' +
        'ORDER BY COALESCE(SUM(qtd_aberto), 0) DESC LIMIT 20'

      const rowsQ = arrayOf(
        new DynamicModel({
          codigo_item: '',
          descricao_item: '',
          grupo_item: '',
          qtd_aberto: '',
          valor_em_aberto: '',
          pedidos_qtd: '',
          em_transito: '',
        }),
      )
      $app.db().newQuery(topQtdSql).all(rowsQ)

      for (let i = 0; i < rowsQ.length; i++) {
        const r = rowsQ[i]
        top20Qtd.push({
          codigo_item: (r.codigo_item || '').trim(),
          descricao_item: r.descricao_item || '',
          grupo_item: r.grupo_item || '',
          qtd_aberto: toNum(r.qtd_aberto),
          valor_em_aberto: toNum(r.valor_em_aberto),
          pedidos_qtd: toInt(r.pedidos_qtd),
          em_transito: toNum(r.em_transito),
          tem_transito: toNum(r.em_transito) > 0,
        })
      }
    } catch (tqErr) {
      console.warn('estoque_faltante stats: top20 qtd err:', tqErr)
    }

    // Top 20 por Valor em Aberto
    const top20Valor = []
    try {
      const topValSql =
        'SELECT codigo_item, ' +
        'MAX(descricao_item) AS descricao_item, ' +
        'MAX(grupo_item) AS grupo_item, ' +
        'CAST(COALESCE(SUM(qtd_aberto), 0.0) AS REAL) AS qtd_aberto, ' +
        'CAST(COALESCE(SUM(valor_em_aberto), 0.0) AS REAL) AS valor_em_aberto, ' +
        'COUNT(DISTINCT numero_pedido) AS pedidos_qtd, ' +
        'CAST(COALESCE(MAX(em_transito), 0.0) AS REAL) AS em_transito ' +
        'FROM pedidos_abertos' +
        whereSql +
        ' GROUP BY codigo_item ' +
        'ORDER BY COALESCE(SUM(valor_em_aberto), 0) DESC LIMIT 20'

      const rowsV = arrayOf(
        new DynamicModel({
          codigo_item: '',
          descricao_item: '',
          grupo_item: '',
          qtd_aberto: '',
          valor_em_aberto: '',
          pedidos_qtd: '',
          em_transito: '',
        }),
      )
      $app.db().newQuery(topValSql).all(rowsV)

      for (let i = 0; i < rowsV.length; i++) {
        const r = rowsV[i]
        top20Valor.push({
          codigo_item: (r.codigo_item || '').trim(),
          descricao_item: r.descricao_item || '',
          grupo_item: r.grupo_item || '',
          qtd_aberto: toNum(r.qtd_aberto),
          valor_em_aberto: toNum(r.valor_em_aberto),
          pedidos_qtd: toInt(r.pedidos_qtd),
          em_transito: toNum(r.em_transito),
          tem_transito: toNum(r.em_transito) > 0,
        })
      }
    } catch (tvErr) {
      console.warn('estoque_faltante stats: top20 valor err:', tvErr)
    }

    return e.json(200, {
      kpis: {
        totalItensDistintos,
        valorDemandaPendente,
        pedidosImpactados,
        qtdTotalAberto,
        comTransito: {
          itens: comTransitoItens,
          valor: comTransitoValor,
          pedidos: comTransitoPedidos,
          qtd: comTransitoQtd,
        },
        semTransito: {
          itens: semTransitoItens,
          valor: semTransitoValor,
          pedidos: semTransitoPedidos,
          qtd: semTransitoQtd,
        },
      },
      top20Qtd,
      top20Valor,
    })
  },
  $apis.requireAuth(),
)

// Endpoint: POST /backend/v1/estoque-faltante/mrp
// Visão MRP: Top 20 itens mais vendidos nos últimos 6 meses (base Vendas consolidada)
// Cruzado com a posição atual de estoque de cada um (estoque_sap) e cálculo de cobertura em meses
routerAdd(
  'POST',
  '/backend/v1/estoque-faltante/mrp',
  (e) => {
    const toNum = (v) => {
      const n = parseFloat(v)
      return isNaN(n) ? 0 : n
    }

    // Determina a data máxima na base Vendas para definir os 6 meses mais recentes
    let maxData = '2026-09-30'
    try {
      const maxRows = arrayOf(new DynamicModel({ max_d: '' }))
      $app
        .db()
        .newQuery(
          'SELECT MAX(data_lancamento) AS max_d FROM vendas WHERE data_lancamento IS NOT NULL',
        )
        .all(maxRows)
      if (maxRows.length > 0 && maxRows[0].max_d) {
        maxData = maxRows[0].max_d.slice(0, 10)
      }
    } catch (_) {}

    const maxYear = parseInt(maxData.slice(0, 4), 10) || 2026
    const maxMonth = parseInt(maxData.slice(5, 7), 10) || 9
    let minYear = maxYear
    let minMonth = maxMonth - 5
    if (minMonth <= 0) {
      minMonth += 12
      minYear -= 1
    }
    const dataLimite = minYear + '-' + String(minMonth).padStart(2, '0') + '-01'

    // 1. Busca os Top 20 itens mais vendidos nos últimos 6 meses (excluindo código '1' / saldo inicial se houver)
    const top20Vendidos = []
    try {
      const vSql =
        'SELECT codigo_item, ' +
        'MAX(descricao_item) AS descricao_item, ' +
        'MAX(grupo_item) AS grupo_item, ' +
        'CAST(COALESCE(SUM(quantidade), 0.0) AS REAL) AS qtd_total, ' +
        'CAST(COALESCE(SUM(total_linha), 0.0) AS REAL) AS valor_total ' +
        'FROM vendas ' +
        "WHERE data_lancamento >= '" +
        dataLimite +
        "' " +
        "AND (tipo_documento != 'NF de Entrada' OR tipo_documento IS NULL) " +
        "AND codigo_item IS NOT NULL AND TRIM(codigo_item) != '' AND codigo_item != '1' " +
        'GROUP BY codigo_item ' +
        'ORDER BY COALESCE(SUM(quantidade), 0) DESC LIMIT 20'

      const vRows = arrayOf(
        new DynamicModel({
          codigo_item: '',
          descricao_item: '',
          grupo_item: '',
          qtd_total: '',
          valor_total: '',
        }),
      )
      $app.db().newQuery(vSql).all(vRows)

      for (let i = 0; i < vRows.length; i++) {
        const r = vRows[i]
        const cod = (r.codigo_item || '').trim()
        const qtd = toNum(r.qtd_total)
        const val = toNum(r.valor_total)
        const media = parseFloat((qtd / 6).toFixed(2))

        top20Vendidos.push({
          codigo_item: cod,
          descricao_item: (r.descricao_item || '').trim(),
          grupo_item: (r.grupo_item || '').trim(),
          qtd_total_6m: qtd,
          media_mensal: media,
          valor_total_6m: val,
          estoque_atual: null, // null = sem posição importada
          em_transito: null,
          tem_posicao_estoque: false,
          cobertura_meses: null,
          status_reposicao: 'sem_posicao', // 'repor' | 'atencao' | 'normal' | 'sem_posicao'
          data_carga_estoque: null,
        })
      }
    } catch (vErr) {
      console.error('estoque_faltante mrp vendas err:', vErr)
      return e.json(500, { error: 'Erro ao calcular Top 20 vendas para MRP: ' + String(vErr) })
    }

    // 2. Consulta a coleção estoque_sap para cruzar a posição atual
    let totalEstoqueSapCount = 0
    let ultimaCargaEstoque = ''
    try {
      totalEstoqueSapCount = $app.countRecords('estoque_sap')
    } catch (_) {}

    if (top20Vendidos.length > 0 && totalEstoqueSapCount > 0) {
      try {
        const cods = top20Vendidos.map((t) => "'" + String(t.codigo_item).replace(/'/g, "''") + "'")
        const eSql =
          'SELECT codigo_item, ' +
          'CAST(COALESCE(quantidade_estoque, 0.0) AS REAL) AS qtd_est, ' +
          'CAST(COALESCE(em_transito, 0.0) AS REAL) AS em_tr, ' +
          'data_carga ' +
          'FROM estoque_sap WHERE codigo_item IN (' +
          cods.join(',') +
          ')'

        const eRows = arrayOf(
          new DynamicModel({
            codigo_item: '',
            qtd_est: '',
            em_tr: '',
            data_carga: '',
          }),
        )
        $app.db().newQuery(eSql).all(eRows)

        const estMap = {}
        for (let j = 0; j < eRows.length; j++) {
          const c = (eRows[j].codigo_item || '').trim()
          estMap[c] = {
            estoque: toNum(eRows[j].qtd_est),
            transito: toNum(eRows[j].em_tr),
            data_carga: eRows[j].data_carga || '',
          }
          if (!ultimaCargaEstoque && eRows[j].data_carga) {
            ultimaCargaEstoque = eRows[j].data_carga
          }
        }

        for (let i = 0; i < top20Vendidos.length; i++) {
          const item = top20Vendidos[i]
          const c = item.codigo_item
          if (estMap[c]) {
            const pos = estMap[c]
            item.estoque_atual = pos.estoque
            item.em_transito = pos.transito
            item.tem_posicao_estoque = true
            item.data_carga_estoque = pos.data_carga

            if (item.media_mensal > 0) {
              const cob = pos.estoque / item.media_mensal
              item.cobertura_meses = parseFloat(cob.toFixed(2))
              if (cob < 1) {
                item.status_reposicao = 'repor' // < 1 mês
              } else if (cob <= 2) {
                item.status_reposicao = 'atencao' // 1 a 2 meses
              } else {
                item.status_reposicao = 'normal' // > 2 meses
              }
            } else {
              item.cobertura_meses = 999
              item.status_reposicao = 'normal'
            }
          }
        }
      } catch (estErr) {
        console.warn('estoque_faltante mrp estoque_sap err:', estErr)
      }
    }

    return e.json(200, {
      top20Vendidos,
      periodo: {
        de: dataLimite,
        ate: maxData,
        meses: 6,
      },
      estoqueSapInfo: {
        totalRegistros: totalEstoqueSapCount,
        ultimaCarga: ultimaCargaEstoque,
        temRegistros: totalEstoqueSapCount > 0,
      },
    })
  },
  $apis.requireAuth(),
)
