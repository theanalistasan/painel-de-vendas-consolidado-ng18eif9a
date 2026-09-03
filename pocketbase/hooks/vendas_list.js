// Endpoint: POST /backend/v1/vendas/list
// Lista paginada server-side da coleção `vendas` com filtros opcionais e ordenação dinâmica.
//
// Body:
//   page          (number, default 1)
//   perPage       (number, default 20, max 200)
//   sort          (string, opcional, ex: "-data_lancamento" ou "total_linha")
//   sortField     (string, opcional, ex: "total_linha", "vendedor_cliente")
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
// Retorna: { items, page, perPage, totalItems, totalPages }
routerAdd('POST', '/backend/v1/vendas/list', (e) => {
  const startTime = Date.now()
  const MAX_EXEC_TIME_MS = 25000 // Teto de 25s

  try {
    let body = {}
    try {
      body = e.requestInfo().body || {}
    } catch (_) {
      body = {}
    }
    const page = Math.max(1, parseInt(body.page, 10) || 1)
    const perPage = Math.min(200, Math.max(1, parseInt(body.perPage, 10) || 20))

    // Mapeamento e validação de ordenação server-side
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

    // ---- Escape SQL (aspas simples duplicadas) ----
    const sqlEsc = (s) => String(s).replace(/'/g, "''")

    const sqlParts = []

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
      const sqlArr = f.grupoItem.map((v) => "'" + sqlEsc(v) + "'").join(',')
      sqlParts.push('grupo_item IN (' + sqlArr + ')')
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

    $app
      .db()
      .newQuery(
        'SELECT id, tipo_documento, nf_entrega_futura, numero_sap, numero_nfe, data_lancamento, ultima_data_vencimento, docto_origem_destino, data_origem_destino, condicao_pagamento, codigo_cliente, nome_cliente, numero_linha, codigo_item, descricao_item, quantidade, qty_kg_lt, preco_item, desconto_linha, icms, pis, cofins, ipi, icms_partilha, total_linha, utilizacao, nome_vendedor, custo_item, nome_filial, conta, estado, cidade, grupo_cliente, mercado, usuario_emissor_pedido, itms_grp_nam, numero_documento_netsales, preco_unitario, total_nf_sem_frete, total_nf_novo, valor_liquido, custo_total, classificacao, vendedor_revenda, grupo_item, vendedor_cliente, origem, tem_racnew, tem_netsales, data_carga, created, updated ' +
          'FROM vendas WHERE ' +
          sqlWhere +
          ' ORDER BY ' +
          sortClause +
          ' LIMIT ' +
          perPage +
          ' OFFSET ' +
          (page - 1) * perPage,
      )
      .all(dataRows)

    let totalItems = 0
    let totalNetsales = 0
    let totalRacnew = 0
    try {
      // Se a query sem filtros for 1=1, usa countRecords rápido ou contagem
      if (sqlWhere === '1=1') {
        try {
          totalItems = $app.countRecords('vendas')
        } catch (_) {
          totalItems = 0
        }
      } else {
        const countRows = arrayOf(
          new DynamicModel({
            total: '',
            total_netsales: '',
            total_racnew: '',
          }),
        )
        $app
          .db()
          .newQuery(
            'SELECT ' +
              'COUNT(*) as total, ' +
              'COUNT(CASE WHEN tem_netsales = 1 THEN 1 END) as total_netsales, ' +
              'COUNT(CASE WHEN tem_netsales = 0 OR tem_netsales IS NULL THEN 1 END) as total_racnew ' +
              'FROM vendas WHERE ' +
              sqlWhere,
          )
          .all(countRows)
        if (countRows.length > 0) {
          const n = parseInt(countRows[0].total, 10)
          if (!isNaN(n)) totalItems = n
          const ns = parseInt(countRows[0].total_netsales, 10)
          if (!isNaN(ns)) totalNetsales = ns
          const rn = parseInt(countRows[0].total_racnew, 10)
          if (!isNaN(rn)) totalRacnew = rn
        }
      }
    } catch (err) {
      console.error('vendas_list: COUNT falhou:', err)
      totalItems = dataRows.length
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
      page: page,
      perPage: perPage,
      totalItems: totalItems,
      totalNetsales: totalNetsales,
      totalRacnew: totalRacnew,
      totalPages: Math.max(1, Math.ceil(totalItems / perPage)),
    })
  } catch (err) {
    if (err && String(err.message).indexOf('TIMEOUT_EXCEEDED') >= 0) {
      return e.json(504, {
        error: 'A busca de vendas demorou mais do que o esperado. Por favor, refine os filtros.',
      })
    }
    console.error('vendas_list fatal error:', err)
    return e.json(500, {
      error: 'Erro interno ao consultar lista de vendas: ' + String(err),
    })
  }
})
