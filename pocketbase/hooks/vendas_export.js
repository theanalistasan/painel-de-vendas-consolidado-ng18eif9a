// Endpoint: POST /backend/v1/vendas/export
// Retorna TODOS os registros de vendas que atendem aos filtros ativos (sem paginação),
// ordenados para exportação completa em CSV.
//
// Body:
//   sort          (string, opcional, ex: "-data_lancamento")
//   sortField     (string, opcional, ex: "total_linha")
//   sortDirection (string, opcional: "asc" | "desc")
//   filters       (object, opcional):
//     base                    ('ambos' | 'racnew' | 'netsales')
//     dataDe, dataAte         (yyyy-mm-dd)
//     ano, mes, dia           (string / string[])
//     vendedorCliente[]       (string[])
//     vendedor[]              (string[])
//     grupoItem[]             (string[])
//     estado[]                (string[])
//     utilizacao[]            (string[])
//     tipoDocumento[]         (string[])
//     tipoDevolucao           (string)
//     search                  (string)
//
// Retorna: { items, totalItems }
routerAdd('POST', '/backend/v1/vendas/export', (e) => {
  const startTime = Date.now()
  const MAX_EXEC_TIME_MS = 35000 // Teto de 35s (abaixo do timeout de 45s do cliente)

  try {
    let body = {}
    try {
      body = e.requestInfo().body || {}
    } catch (_) {
      body = {}
    }

    const validSortFields = {
      data_lancamento: 'data_lancamento',
      numero_nfe: 'numero_nfe',
      numero_sap: 'numero_sap',
      codigo_cliente: 'codigo_cliente',
      nome_cliente: 'nome_cliente',
      vendedor_cliente: 'vendedor_cliente',
      nome_vendedor: 'nome_vendedor',
      codigo_item: 'codigo_item',
      descricao_item: 'descricao_item',
      grupo_item: 'grupo_item',
      quantidade: 'quantidade',
      preco_item: 'preco_item',
      preco_unitario: 'preco_unitario',
      total_linha: 'total_linha',
      total_nf_sem_frete: 'total_nf_sem_frete',
      valor_liquido: 'valor_liquido',
      custo_total: 'custo_total',
      utilizacao: 'utilizacao',
      estado: 'estado',
      cidade: 'cidade',
      classificacao: 'classificacao',
      grupo_cliente: 'grupo_cliente',
      mercado: 'mercado',
      usuario_emissor_pedido: 'usuario_emissor_pedido',
      tem_racnew: 'tem_racnew',
      tem_netsales: 'tem_netsales',
      created: 'created',
      updated: 'updated',
    }

    let sortClause = 'data_lancamento DESC'

    if (body.sortField && validSortFields[body.sortField]) {
      const col = validSortFields[body.sortField]
      const dir = String(body.sortDirection || 'asc').toLowerCase() === 'desc' ? 'DESC' : 'ASC'
      sortClause = col + ' ' + dir
    } else if (body.sort) {
      const s = String(body.sort).trim()
      if (s.startsWith('-')) {
        const field = s.substring(1)
        if (validSortFields[field]) {
          sortClause = validSortFields[field] + ' DESC'
        }
      } else if (s.startsWith('+')) {
        const field = s.substring(1)
        if (validSortFields[field]) {
          sortClause = validSortFields[field] + ' ASC'
        }
      } else if (validSortFields[s]) {
        sortClause = validSortFields[s] + ' ASC'
      }
    }

    const f = body.filters || {}

    const sqlEsc = (s) => String(s).replace(/'/g, "''")

    const sqlParts = []

    // Bloco de filtros "Canais":
    // 1. Nome do Canal (f.canal)
    // 2. Clientes do Canal (f.canalClientes)
    // 3. Deploy (f.deploy: 'AGIS' | 'Roland' | 'Nenhum' | '' | array)
    // 4. Inside (f.inside: string[])
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
        const ccWhereClauses = [
          "(eh_canal = 1 OR eh_canal = 'true' OR eh_canal = 'SIM' OR eh_canal = 'Sim' OR eh_canal = 's')",
        ]

        if (hasCanalFilter) {
          const canaisSqlList = canaisFilter.map((c) => "'" + sqlEsc(c) + "'").join(',')
          ccWhereClauses.push('nome_canal IN (' + canaisSqlList + ')')
        }

        if (hasCanalClientesFilter) {
          const clisSqlList = canalClientesFilter.map((c) => "'" + sqlEsc(c) + "'").join(',')
          ccWhereClauses.push('nome_cliente IN (' + clisSqlList + ')')
        }

        if (hasDeployFilter) {
          const depConditions = []
          for (let d = 0; d < deployFilter.length; d++) {
            const rawDep = String(deployFilter[d]).trim()
            const depUpper = rawDep.toUpperCase()
            if (depUpper === 'AGIS' || depUpper.indexOf('AGIS') >= 0) {
              depConditions.push("UPPER(deploy) LIKE '%AGIS%'")
            } else if (depUpper === 'ROLAND' || depUpper.indexOf('ROLAND') >= 0) {
              depConditions.push("UPPER(deploy) LIKE '%ROLAND%'")
            } else if (depUpper === 'NENHUM' || depUpper === 'SEM DEPLOY' || depUpper === 'VAZIO') {
              depConditions.push(
                "(deploy IS NULL OR deploy = '' OR UPPER(deploy) = 'NENHUM' OR UPPER(deploy) = 'SEM DEPLOY')",
              )
            }
          }
          if (depConditions.length > 0) {
            ccWhereClauses.push('(' + depConditions.join(' OR ') + ')')
          }
        }

        if (hasInsideFilter) {
          const insideSqlList = insideFilter
            .map((ins) => "'" + sqlEsc(String(ins).trim().toUpperCase()) + "'")
            .join(',')
          ccWhereClauses.push("UPPER(TRIM(COALESCE(inside, ''))) IN (" + insideSqlList + ')')
        }

        const ccQuerySql =
          'SELECT DISTINCT codigo_cliente AS cc, nome_cliente AS nc FROM canais_clientes WHERE ' +
          ccWhereClauses.join(' AND ')

        const ccRows = arrayOf(new DynamicModel({ cc: '', nc: '' }))
        $app.db().newQuery(ccQuerySql).all(ccRows)

        const matchedCodigos = []
        const matchedNomes = []
        for (let k = 0; k < ccRows.length; k++) {
          const cod = (ccRows[k].cc || '').trim()
          const nom = (ccRows[k].nc || '').trim()
          if (cod && cod !== '-') matchedCodigos.push(cod)
          if (nom) matchedNomes.push(nom)
        }

        if (matchedCodigos.length > 0 || matchedNomes.length > 0) {
          const subClauses = []
          if (matchedCodigos.length > 0) {
            const codSqlIn = matchedCodigos.map((c) => "'" + sqlEsc(c) + "'").join(',')
            subClauses.push('codigo_cliente IN (' + codSqlIn + ')')
          }
          if (matchedNomes.length > 0) {
            const nomSqlIn = matchedNomes.map((n) => "'" + sqlEsc(n) + "'").join(',')
            subClauses.push('nome_cliente IN (' + nomSqlIn + ')')
          }
          sqlParts.push('(' + subClauses.join(' OR ') + ')')
        } else {
          sqlParts.push('1=0')
        }
      } catch (canalErr) {
        console.warn('vendas_export: expansao canais/deploy warning:', canalErr)
      }
    }

    // Filtro de BASE (Seleção de Bases: ambos | racnew | netsales)
    if (f.base === 'racnew') {
      sqlParts.push('(tem_netsales = 0 OR tem_netsales IS NULL)')
    } else if (f.base === 'netsales') {
      sqlParts.push('tem_netsales = 1')
    }

    if (f.dataDe) {
      sqlParts.push("data_lancamento >= '" + sqlEsc(f.dataDe) + " 00:00:00'")
    }
    if (f.dataAte) {
      sqlParts.push("data_lancamento <= '" + sqlEsc(f.dataAte) + " 23:59:59'")
    }
    const anosFilter = Array.isArray(f.ano) ? f.ano : f.ano ? [f.ano] : []
    if (anosFilter.length > 0) {
      const anos = anosFilter
        .map((a) => "data_lancamento LIKE '" + sqlEsc(String(a)) + "-%'")
        .join(' OR ')
      sqlParts.push('(' + anos + ')')
    }
    const mesesFilter = Array.isArray(f.mes) ? f.mes : f.mes ? [f.mes] : []
    if (mesesFilter.length > 0) {
      const meses = mesesFilter
        .map((m) => "data_lancamento LIKE '%-" + String(m).padStart(2, '0') + "-%'")
        .join(' OR ')
      sqlParts.push('(' + meses + ')')
    }
    const diasFilter = Array.isArray(f.dia) ? f.dia : f.dia ? [f.dia] : []
    if (diasFilter.length > 0) {
      const dias = diasFilter
        .map((d) => "data_lancamento LIKE '%-" + String(d).padStart(2, '0') + " %'")
        .join(' OR ')
      sqlParts.push('(' + dias + ')')
    }
    if (Array.isArray(f.vendedorCliente) && f.vendedorCliente.length > 0) {
      const sqlArr = f.vendedorCliente.map((v) => "'" + sqlEsc(v) + "'").join(',')
      sqlParts.push('vendedor_cliente IN (' + sqlArr + ')')
    }
    if (Array.isArray(f.vendedor) && f.vendedor.length > 0) {
      const sqlArr = f.vendedor.map((v) => "'" + sqlEsc(v) + "'").join(',')
      sqlParts.push('nome_vendedor IN (' + sqlArr + ')')
    }
    if (Array.isArray(f.grupoItem) && f.grupoItem.length > 0) {
      const sqlArr = f.grupoItem
        .map((v) => "'" + sqlEsc(String(v).toUpperCase().trim()) + "'")
        .join(',')
      sqlParts.push('UPPER(TRIM(grupo_item)) IN (' + sqlArr + ')')
    }
    if (Array.isArray(f.estado) && f.estado.length > 0) {
      const sqlArr = f.estado.map((v) => "'" + sqlEsc(v) + "'").join(',')
      sqlParts.push('estado IN (' + sqlArr + ')')
    }
    if (Array.isArray(f.utilizacao) && f.utilizacao.length > 0) {
      const sqlArr = f.utilizacao.map((v) => "'" + sqlEsc(v) + "'").join(',')
      sqlParts.push('utilizacao IN (' + sqlArr + ')')
    }
    if (Array.isArray(f.tipoDocumento) && f.tipoDocumento.length > 0) {
      const sqlArr = f.tipoDocumento.map((v) => "'" + sqlEsc(v) + "'").join(',')
      sqlParts.push('tipo_documento IN (' + sqlArr + ')')
    }
    if (f.tipoDevolucao) {
      sqlParts.push("tipo_documento = '" + sqlEsc(f.tipoDevolucao) + "'")
    }
    if (f.search) {
      const q = sqlEsc(f.search)
      const like = " LIKE '%" + q + "%'"
      sqlParts.push(
        '(nome_cliente' +
          like +
          ' OR codigo_cliente' +
          like +
          ' OR codigo_item' +
          like +
          ' OR descricao_item' +
          like +
          ' OR numero_nfe' +
          like +
          ' OR numero_sap' +
          like +
          ' OR vendedor_cliente' +
          like +
          ' OR cidade' +
          like +
          ' OR mercado' +
          like +
          ')',
      )
    }

    const sqlWhere = sqlParts.length > 0 ? sqlParts.join(' AND ') : '1=1'

    const toNum = (v) => {
      const n = parseFloat(v)
      return isNaN(n) ? 0 : n
    }
    const toInt = (v) => {
      const n = parseInt(v, 10)
      return isNaN(n) ? 0 : n
    }

    const dataRows = arrayOf(
      new DynamicModel({
        id: '',
        tipo_documento: '',
        nf_entrega_futura: '',
        numero_sap: '',
        numero_nfe: '',
        data_lancamento: '',
        ultima_data_vencimento: '',
        docto_origem_destino: '',
        data_origem_destino: '',
        condicao_pagamento: '',
        codigo_cliente: '',
        nome_cliente: '',
        numero_linha: '',
        codigo_item: '',
        descricao_item: '',
        quantidade: '',
        qty_kg_lt: '',
        preco_item: '',
        desconto_linha: '',
        icms: '',
        pis: '',
        cofins: '',
        ipi: '',
        icms_partilha: '',
        total_linha: '',
        utilizacao: '',
        nome_vendedor: '',
        custo_item: '',
        nome_filial: '',
        conta: '',
        estado: '',
        cidade: '',
        grupo_cliente: '',
        mercado: '',
        usuario_emissor_pedido: '',
        itms_grp_nam: '',
        numero_documento_netsales: '',
        preco_unitario: '',
        total_nf_sem_frete: '',
        total_nf_novo: '',
        valor_liquido: '',
        custo_total: '',
        classificacao: '',
        vendedor_revenda: '',
        grupo_item: '',
        vendedor_cliente: '',
        origem: '',
        tem_racnew: '',
        tem_netsales: '',
        data_carga: '',
        created: '',
        updated: '',
      }),
    )

    // Modo colapsado / agrupado por NFe: se groupByNfe === true ou collapsed === true
    const isGroupByNfe = !!(body.groupByNfe || body.collapsed)

    if (isGroupByNfe) {
      // Query agrupada por Nota Fiscal (numero_nfe) para consolidar em 1 linha por NF
      const groupedRows = arrayOf(
        new DynamicModel({
          numero_nfe: '',
          data_lancamento: '',
          numero_sap: '',
          tipo_documento: '',
          codigo_cliente: '',
          nome_cliente: '',
          vendedor_cliente: '',
          nome_vendedor: '',
          grupo_item: '',
          itens_qtd: '',
          quantidade: '',
          total_linha: '',
          total_nf_sem_frete: '',
          valor_liquido: '',
          custo_total: '',
          utilizacao: '',
          estado: '',
          cidade: '',
          classificacao: '',
          grupo_cliente: '',
          mercado: '',
          usuario_emissor_pedido: '',
          origem: '',
          tem_netsales: '',
          tem_racnew: '',
        }),
      )

      $app
        .db()
        .newQuery(
          'SELECT ' +
            "COALESCE(NULLIF(numero_nfe,''), '(Sem NFe)') AS numero_nfe, " +
            'MAX(data_lancamento) AS data_lancamento, ' +
            "COALESCE(MAX(numero_sap),'') AS numero_sap, " +
            "COALESCE(MAX(tipo_documento),'') AS tipo_documento, " +
            "COALESCE(MAX(codigo_cliente),'') AS codigo_cliente, " +
            "COALESCE(MAX(nome_cliente),'') AS nome_cliente, " +
            "COALESCE(MAX(vendedor_cliente),'') AS vendedor_cliente, " +
            "COALESCE(MAX(nome_vendedor),'') AS nome_vendedor, " +
            "COALESCE(MAX(grupo_item),'') AS grupo_item, " +
            'COUNT(*) AS itens_qtd, ' +
            'COALESCE(SUM(quantidade),0) AS quantidade, ' +
            'COALESCE(SUM(total_linha),0) AS total_linha, ' +
            'COALESCE(MAX(total_nf_sem_frete), SUM(total_linha), 0) AS total_nf_sem_frete, ' +
            'COALESCE(SUM(valor_liquido),0) AS valor_liquido, ' +
            'COALESCE(SUM(custo_total),0) AS custo_total, ' +
            "COALESCE(MAX(utilizacao),'') AS utilizacao, " +
            "COALESCE(MAX(estado),'') AS estado, " +
            "COALESCE(MAX(cidade),'') AS cidade, " +
            "COALESCE(MAX(classificacao),'') AS classificacao, " +
            "COALESCE(MAX(grupo_cliente),'') AS grupo_cliente, " +
            "COALESCE(MAX(mercado),'') AS mercado, " +
            "COALESCE(MAX(usuario_emissor_pedido),'') AS usuario_emissor_pedido, " +
            'MAX(CASE WHEN tem_netsales = 1 THEN 1 ELSE 0 END) AS tem_netsales, ' +
            'MAX(CASE WHEN tem_racnew = 1 THEN 1 ELSE 0 END) AS tem_racnew ' +
            'FROM vendas WHERE ' +
            sqlWhere +
            " GROUP BY COALESCE(NULLIF(numero_nfe,''), '(Sem NFe)') " +
            ' ORDER BY ' +
            sortClause +
            ' LIMIT 100000',
        )
        .all(groupedRows)

      if (Date.now() - startTime > MAX_EXEC_TIME_MS) {
        throw new Error('TIMEOUT_EXCEEDED')
      }

      const items = []
      for (let i = 0; i < groupedRows.length; i++) {
        const r = groupedRows[i]
        const hasNetsales =
          r.tem_netsales === '1' ||
          r.tem_netsales === 1 ||
          r.tem_netsales === 'true' ||
          r.tem_netsales === true
        const hasRacnew =
          r.tem_racnew === '1' ||
          r.tem_racnew === 1 ||
          r.tem_racnew === 'true' ||
          r.tem_racnew === true
        const qtdItens = toInt(r.itens_qtd)

        items.push({
          id: 'nfe_' + String(r.numero_nfe),
          numero_nfe: r.numero_nfe,
          data_lancamento: r.data_lancamento,
          numero_sap: r.numero_sap,
          tipo_documento: r.tipo_documento,
          codigo_cliente: r.codigo_cliente,
          nome_cliente: r.nome_cliente,
          vendedor_cliente: r.vendedor_cliente,
          nome_vendedor: r.nome_vendedor,
          codigo_item: qtdItens > 1 ? `(${qtdItens} itens)` : '',
          descricao_item: qtdItens > 1 ? `Agrupamento de ${qtdItens} itens na NF` : '',
          grupo_item: r.grupo_item,
          quantidade: toNum(r.quantidade),
          preco_item: 0,
          preco_unitario: 0,
          total_linha: toNum(r.total_linha),
          total_nf_sem_frete: toNum(r.total_nf_sem_frete),
          valor_liquido: toNum(r.valor_liquido),
          custo_total: toNum(r.custo_total),
          utilizacao: r.utilizacao,
          estado: r.estado,
          cidade: r.cidade,
          classificacao: r.classificacao,
          grupo_cliente: r.grupo_cliente,
          mercado: r.mercado,
          usuario_emissor_pedido: r.usuario_emissor_pedido,
          itens_qtd: qtdItens,
          tem_netsales: hasNetsales,
          tem_racnew: hasRacnew,
          origem: hasNetsales && hasRacnew ? 'Consolidado' : hasNetsales ? 'NetSales' : 'RacNew',
        })
      }

      return e.json(200, {
        items: items,
        totalItems: items.length,
        isGrouped: true,
      })
    }

    // Teto de segurança para exportação detalhada: limite máximo de 100.000 linhas
    $app
      .db()
      .newQuery(
        'SELECT id, tipo_documento, nf_entrega_futura, numero_sap, numero_nfe, data_lancamento, ultima_data_vencimento, docto_origem_destino, data_origem_destino, condicao_pagamento, codigo_cliente, nome_cliente, ' +
          'CAST(COALESCE(numero_linha, 0) AS INTEGER) AS numero_linha, codigo_item, descricao_item, ' +
          'CAST(COALESCE(quantidade, 0.0) AS REAL) AS quantidade, ' +
          'CAST(COALESCE(qty_kg_lt, 0.0) AS REAL) AS qty_kg_lt, ' +
          'CAST(COALESCE(preco_item, 0.0) AS REAL) AS preco_item, ' +
          'CAST(COALESCE(desconto_linha, 0.0) AS REAL) AS desconto_linha, ' +
          'CAST(COALESCE(icms, 0.0) AS REAL) AS icms, ' +
          'CAST(COALESCE(pis, 0.0) AS REAL) AS pis, ' +
          'CAST(COALESCE(cofins, 0.0) AS REAL) AS cofins, ' +
          'CAST(COALESCE(ipi, 0.0) AS REAL) AS ipi, ' +
          'CAST(COALESCE(icms_partilha, 0.0) AS REAL) AS icms_partilha, ' +
          'CAST(COALESCE(total_linha, 0.0) AS REAL) AS total_linha, ' +
          'utilizacao, nome_vendedor, ' +
          'CAST(COALESCE(custo_item, 0.0) AS REAL) AS custo_item, ' +
          'nome_filial, conta, estado, cidade, grupo_cliente, mercado, usuario_emissor_pedido, itms_grp_nam, numero_documento_netsales, ' +
          'CAST(COALESCE(preco_unitario, 0.0) AS REAL) AS preco_unitario, ' +
          'CAST(COALESCE(total_nf_sem_frete, 0.0) AS REAL) AS total_nf_sem_frete, ' +
          'CAST(COALESCE(total_nf_novo, 0.0) AS REAL) AS total_nf_novo, ' +
          'CAST(COALESCE(valor_liquido, 0.0) AS REAL) AS valor_liquido, ' +
          'CAST(COALESCE(custo_total, 0.0) AS REAL) AS custo_total, ' +
          'classificacao, vendedor_revenda, grupo_item, vendedor_cliente, origem, ' +
          'CAST(COALESCE(tem_racnew, 0) AS INTEGER) AS tem_racnew, ' +
          'CAST(COALESCE(tem_netsales, 0) AS INTEGER) AS tem_netsales, ' +
          'data_carga, created, updated ' +
          'FROM vendas WHERE ' +
          sqlWhere +
          ' ORDER BY ' +
          sortClause +
          ' LIMIT 100000',
      )
      .all(dataRows)
    if (Date.now() - startTime > MAX_EXEC_TIME_MS) {
      throw new Error('TIMEOUT_EXCEEDED')
    }

    const items = []
    for (let i = 0; i < dataRows.length; i++) {
      const r = dataRows[i]
      items.push({
        id: r.id,
        tipo_documento: r.tipo_documento,
        nf_entrega_futura: r.nf_entrega_futura,
        numero_sap: r.numero_sap,
        numero_nfe: r.numero_nfe,
        data_lancamento: r.data_lancamento,
        ultima_data_vencimento: r.ultima_data_vencimento,
        docto_origem_destino: r.docto_origem_destino,
        data_origem_destino: r.data_origem_destino,
        condicao_pagamento: r.condicao_pagamento,
        codigo_cliente: r.codigo_cliente,
        nome_cliente: r.nome_cliente,
        numero_linha: toInt(r.numero_linha),
        codigo_item: r.codigo_item,
        descricao_item: r.descricao_item,
        quantidade: toNum(r.quantidade),
        qty_kg_lt: toNum(r.qty_kg_lt),
        preco_item: toNum(r.preco_item),
        desconto_linha: toNum(r.desconto_linha),
        icms: toNum(r.icms),
        pis: toNum(r.pis),
        cofins: toNum(r.cofins),
        ipi: toNum(r.ipi),
        icms_partilha: toNum(r.icms_partilha),
        total_linha: toNum(r.total_linha),
        utilizacao: r.utilizacao,
        nome_vendedor: r.nome_vendedor,
        custo_item: toNum(r.custo_item),
        nome_filial: r.nome_filial,
        conta: r.conta,
        estado: r.estado,
        cidade: r.cidade,
        grupo_cliente: r.grupo_cliente,
        mercado: r.mercado,
        usuario_emissor_pedido: r.usuario_emissor_pedido,
        itms_grp_nam: r.itms_grp_nam,
        numero_documento_netsales: r.numero_documento_netsales,
        preco_unitario: toNum(r.preco_unitario),
        total_nf_sem_frete: toNum(r.total_nf_sem_frete),
        total_nf_novo: toNum(r.total_nf_novo),
        valor_liquido: toNum(r.valor_liquido),
        custo_total: toNum(r.custo_total),
        classificacao: r.classificacao,
        vendedor_revenda: r.vendedor_revenda,
        grupo_item: r.grupo_item,
        vendedor_cliente: r.vendedor_cliente,
        origem: r.origem,
        tem_racnew:
          r.tem_racnew === '1' ||
          r.tem_racnew === 1 ||
          r.tem_racnew === 'true' ||
          r.tem_racnew === true,
        tem_netsales:
          r.tem_netsales === '1' ||
          r.tem_netsales === 1 ||
          r.tem_netsales === 'true' ||
          r.tem_netsales === true,
        data_carga: r.data_carga,
        created: r.created,
        updated: r.updated,
      })
    }

    return e.json(200, {
      items: items,
      totalItems: items.length,
      isGrouped: false,
    })
  } catch (err) {
    if (err && String(err.message).indexOf('TIMEOUT_EXCEEDED') >= 0) {
      return e.json(504, {
        error:
          'A consulta demorou mais do que o esperado. Por favor, refine os filtros selecionados.',
      })
    }
    console.error('vendas_export fatal error:', err)
    return e.json(500, {
      error: 'Erro interno ao exportar vendas: ' + String(err),
    })
  }
})
