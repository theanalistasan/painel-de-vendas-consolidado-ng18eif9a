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
//     canal[]                 (string[])
//     canalClientes[]         (string[])
//     deploy[]                (string[])
//     tipoCliente[]           (string[])
//
// Retorna: { items, totalItems }
var __vendasExportHandler = (e) => {
  const startTime = Date.now()
  const MAX_EXEC_TIME_MS = 35000 // Teto de 35s (abaixo do timeout de 45s do cliente)

  try {
    let body = {}
    try {
      body = e.requestInfo().body || {}
    } catch (_) {
      body = {}
    }
    // Aceita também GET: parâmetros vêm da query string (filters=<JSON>)
    if (!body || typeof body !== 'object' || Object.keys(body).length === 0) {
      try {
        const q = e.requestInfo().query || {}
        if (q.filters) {
          body = { filters: typeof q.filters === 'string' ? JSON.parse(q.filters) : q.filters }
        }
        ;['sort', 'sortField', 'sortDirection', 'groupByNfe', 'groupByPedido', 'collapsed'].forEach(
          (k) => {
            if (q[k] !== undefined && q[k] !== '') body[k] = q[k]
          },
        )
      } catch (qsErr) {
        console.warn('vendas_export: falha ao ler query params:', qsErr)
      }
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
      status_cadastro: 'status_cadastro',
      tipo_pn: 'tipo_pn',
      tipo_cliente: 'tipo_cliente',
      quantidade: 'quantidade',
      preco_item: 'preco_item',
      preco_unitario: 'preco_unitario',
      total_linha: 'total_linha',
      total_nf_sem_frete: 'total_nf_sem_frete',
      valor_liquido: 'valor_liquido',
      total_nf_novo: 'total_nf_novo',
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
          ccWhereClauses.push(
            "(UPPER(TRIM(COALESCE(inside, ''))) IN (" +
              insideSqlList +
              ") OR UPPER(TRIM(COALESCE(responsavel, ''))) IN (" +
              insideSqlList +
              '))',
          )
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
      const deStr = String(f.dataDe).trim()
      const deFormatted = deStr.indexOf(' ') >= 0 ? deStr : deStr + ' 00:00:00'
      sqlParts.push("data_lancamento >= '" + sqlEsc(deFormatted) + "'")
    }
    if (f.dataAte) {
      const ateStr = String(f.dataAte).trim()
      const ateFormatted = ateStr.indexOf(' ') >= 0 ? ateStr : ateStr + ' 23:59:59'
      sqlParts.push("data_lancamento <= '" + sqlEsc(ateFormatted) + "'")
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
    const jpClassFilter = Array.isArray(f.jpClass) ? f.jpClass : f.jpClass ? [f.jpClass] : []
    if (jpClassFilter.length > 0) {
      const hardPatterns = ["'EQUIPAMENTOS'", "'EQUIPAMENTO'", "'HARD'"]
      const inksPatterns = ["'TINTAS'", "'TINTA'", "'INKS'"]

      const conds = []
      for (let j = 0; j < jpClassFilter.length; j++) {
        const val = String(jpClassFilter[j]).trim()
        const upper = val.toUpperCase()
        if (upper === 'HARD') {
          conds.push("UPPER(TRIM(COALESCE(grupo_item, ''))) IN (" + hardPatterns.join(',') + ')')
        } else if (upper === 'INKS') {
          conds.push("UPPER(TRIM(COALESCE(grupo_item, ''))) IN (" + inksPatterns.join(',') + ')')
        } else if (upper === 'OTHERS') {
          // OTHERS: qualquer grupo preenchido que não seja HARD nem INKS
          conds.push(
            "(grupo_item IS NOT NULL AND TRIM(grupo_item) != '' AND UPPER(TRIM(grupo_item)) NOT IN (" +
              hardPatterns.concat(inksPatterns).join(',') +
              '))',
          )
        } else if (
          upper === 'SEM CLASSE' ||
          upper === 'SEM_CLASSE' ||
          upper === 'SEM INFORMACAO' ||
          upper === 'VAZIO'
        ) {
          conds.push(
            "(grupo_item IS NULL OR TRIM(grupo_item) = '' OR UPPER(TRIM(grupo_item)) = 'SEM CLASSE')",
          )
        } else if (val) {
          conds.push("UPPER(TRIM(COALESCE(grupo_item, ''))) = '" + sqlEsc(upper) + "'")
        }
      }
      if (conds.length > 0) {
        sqlParts.push('(' + conds.join(' OR ') + ')')
      }
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
    const tipoClienteFilter = Array.isArray(f.tipoCliente)
      ? f.tipoCliente
      : f.tipoCliente
        ? [f.tipoCliente]
        : []
    if (tipoClienteFilter.length > 0 && !tipoClienteFilter.includes('TODOS')) {
      const tcConds = []
      const tcValues = []
      for (let tcIdx = 0; tcIdx < tipoClienteFilter.length; tcIdx++) {
        const val = String(tipoClienteFilter[tcIdx]).trim()
        if (
          val.toUpperCase() === 'SEM INFORMACAO' ||
          val.toUpperCase() === 'VAZIO' ||
          val.toUpperCase() === 'SEM TIPO'
        ) {
          tcConds.push("(tipo_cliente IS NULL OR tipo_cliente = '')")
        } else if (val) {
          tcValues.push("'" + sqlEsc(val) + "'")
        }
      }
      if (tcValues.length > 0) {
        tcConds.push('tipo_cliente IN (' + tcValues.join(',') + ')')
      }
      if (tcConds.length > 0) {
        sqlParts.push('(' + tcConds.join(' OR ') + ')')
      }
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

    // TAREFA 1: Desabilitar o produto "SERVICOS" em todas as visões
    sqlParts.push("(UPPER(TRIM(COALESCE(codigo_item, ''))) != 'SERVICOS')")

    const sqlWhere = sqlParts.join(' AND ')

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
        status_cadastro: '',
        tipo_pn: '',
        tipo_cliente: '',
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
    // Modo agrupado por Pedido (numero_documento_netsales): agrega por NF primeiro
    const isGroupByPedido = !!(body.groupByPedido || body.groupByMode === 'pedido')

    if (isGroupByNfe && !isGroupByPedido) {
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
          total_nf_novo: '',
          valor_liquido: '',
          custo_total: '',
          utilizacao: '',
          estado: '',
          cidade: '',
          classificacao: '',
          grupo_cliente: '',
          mercado: '',
          usuario_emissor_pedido: '',
          status_cadastro: '',
          tipo_pn: '',
          tipo_cliente: '',
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
            'COALESCE(MAX(total_nf_novo), MAX(total_linha), 0) AS total_nf_novo, ' +
            'COALESCE(SUM(valor_liquido),0) AS valor_liquido, ' +
            'COALESCE(SUM(custo_total),0) AS custo_total, ' +
            "COALESCE(MAX(utilizacao),'') AS utilizacao, " +
            "COALESCE(MAX(estado),'') AS estado, " +
            "COALESCE(MAX(cidade),'') AS cidade, " +
            "COALESCE(MAX(classificacao),'') AS classificacao, " +
            "COALESCE(MAX(grupo_cliente),'') AS grupo_cliente, " +
            "COALESCE(MAX(mercado),'') AS mercado, " +
            "COALESCE(MAX(usuario_emissor_pedido),'') AS usuario_emissor_pedido, " +
            "COALESCE(MAX(status_cadastro),'') AS status_cadastro, " +
            "COALESCE(MAX(tipo_pn),'') AS tipo_pn, " +
            "COALESCE(MAX(tipo_cliente),'') AS tipo_cliente, " +
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

        const itemGrouped = {
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
          total_nf_novo: toNum(r.total_nf_novo),
          valor_liquido: toNum(r.valor_liquido),
          custo_total: toNum(r.custo_total),
          utilizacao: r.utilizacao,
          estado: r.estado,
          cidade: r.cidade,
          classificacao: r.classificacao,
          grupo_cliente: r.grupo_cliente,
          mercado: r.mercado,
          usuario_emissor_pedido: r.usuario_emissor_pedido,
          status_cadastro: r.status_cadastro,
          tipo_pn: r.tipo_pn,
          tipo_cliente: r.tipo_cliente,
          itens_qtd: qtdItens,
          tem_netsales: hasNetsales,
          tem_racnew: hasRacnew,
          origem: hasNetsales && hasRacnew ? 'Consolidado' : hasNetsales ? 'NetSales' : 'RacNew',
        }
        try {
          if (typeof isVendedorNaoComissionadoHook === 'function') {
            itemGrouped.nao_comissionado = isVendedorNaoComissionadoHook(itemGrouped)
          }
        } catch (_) {}
        items.push(itemGrouped)
      }

      return e.json(200, {
        items: items,
        totalItems: items.length,
        isGrouped: true,
      })
    }

    // Modo agrupado por Pedido (numero_documento_netsales): 1 linha por pedido.
    // Agrega por NF primeiro (total_nf_novo / total_nf_sem_frete são valores de NF:
    // MAX por NF, somados 1x por NF no pedido) para não inflar o total.
    if (isGroupByPedido) {
      const pedidoRows = arrayOf(
        new DynamicModel({
          numero_documento_netsales: '',
          nfe_key: '',
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
          nf_sem_frete: '',
          nf_novo: '',
          valor_liquido: '',
          custo_total: '',
          estado: '',
          cidade: '',
          utilizacao: '',
          classificacao: '',
          grupo_cliente: '',
          mercado: '',
          usuario_emissor_pedido: '',
          status_cadastro: '',
          tipo_pn: '',
          tipo_cliente: '',
          tem_netsales: '',
          tem_racnew: '',
        }),
      )

      $app
        .db()
        .newQuery(
          'SELECT ' +
            "COALESCE(NULLIF(numero_documento_netsales,''), '(Sem Pedido)') AS numero_documento_netsales, " +
            "COALESCE(NULLIF(numero_nfe,''), '(Sem NFe)') AS nfe_key, " +
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
            'COALESCE(MAX(total_nf_sem_frete), SUM(total_linha), 0) AS nf_sem_frete, ' +
            'COALESCE(MAX(total_nf_novo), SUM(total_linha), 0) AS nf_novo, ' +
            'COALESCE(SUM(valor_liquido),0) AS valor_liquido, ' +
            'COALESCE(SUM(custo_total),0) AS custo_total, ' +
            "COALESCE(MAX(estado),'') AS estado, " +
            "COALESCE(MAX(cidade),'') AS cidade, " +
            "COALESCE(MAX(utilizacao),'') AS utilizacao, " +
            "COALESCE(MAX(classificacao),'') AS classificacao, " +
            "COALESCE(MAX(grupo_cliente),'') AS grupo_cliente, " +
            "COALESCE(MAX(mercado),'') AS mercado, " +
            "COALESCE(MAX(usuario_emissor_pedido),'') AS usuario_emissor_pedido, " +
            "COALESCE(MAX(status_cadastro),'') AS status_cadastro, " +
            "COALESCE(MAX(tipo_pn),'') AS tipo_pn, " +
            "COALESCE(MAX(tipo_cliente),'') AS tipo_cliente, " +
            'MAX(CASE WHEN tem_netsales = 1 THEN 1 ELSE 0 END) AS tem_netsales, ' +
            'MAX(CASE WHEN tem_racnew = 1 THEN 1 ELSE 0 END) AS tem_racnew ' +
            'FROM vendas WHERE ' +
            sqlWhere +
            " GROUP BY COALESCE(NULLIF(numero_documento_netsales,''), '(Sem Pedido)'), COALESCE(NULLIF(numero_nfe,''), '(Sem NFe)') " +
            ' ORDER BY ' +
            sortClause +
            ' LIMIT 100000',
        )
        .all(pedidoRows)

      if (Date.now() - startTime > MAX_EXEC_TIME_MS) {
        throw new Error('TIMEOUT_EXCEEDED')
      }

      // Redução por Pedido: valores de NF (nf_novo / nf_sem_frete) somados 1x por NF
      const pedidos = {}
      const pedidoOrder = []
      for (let i = 0; i < pedidoRows.length; i++) {
        const r = pedidoRows[i]
        const pedKey = r.numero_documento_netsales || '(Sem Pedido)'
        let acc = pedidos[pedKey]
        if (!acc) {
          acc = {
            key: pedKey,
            data_lancamento: r.data_lancamento,
            numero_sap: r.numero_sap,
            tipo_documento: r.tipo_documento,
            codigo_cliente: r.codigo_cliente,
            nome_cliente: r.nome_cliente,
            vendedor_cliente: r.vendedor_cliente,
            nome_vendedor: r.nome_vendedor,
            grupo_item: r.grupo_item,
            itens_qtd: 0,
            nfs_qtd: 0,
            quantidade: 0,
            total_linha: 0,
            total_nf_sem_frete: 0,
            total_nf_novo: 0,
            valor_liquido: 0,
            custo_total: 0,
            estado: r.estado,
            cidade: r.cidade,
            utilizacao: r.utilizacao,
            classificacao: r.classificacao,
            grupo_cliente: r.grupo_cliente,
            mercado: r.mercado,
            usuario_emissor_pedido: r.usuario_emissor_pedido,
            status_cadastro: r.status_cadastro,
            tipo_pn: r.tipo_pn,
            tipo_cliente: r.tipo_cliente,
            temNetsales: false,
            temRacnew: false,
          }
          pedidos[pedKey] = acc
          pedidoOrder.push(pedKey)
        }
        acc.itens_qtd += toInt(r.itens_qtd)
        acc.nfs_qtd += 1
        acc.quantidade += toNum(r.quantidade)
        acc.total_linha += toNum(r.total_linha)
        acc.total_nf_sem_frete += toNum(r.nf_sem_frete)
        acc.total_nf_novo += toNum(r.nf_novo)
        acc.valor_liquido += toNum(r.valor_liquido)
        acc.custo_total += toNum(r.custo_total)
        if (r.tem_netsales === '1' || r.tem_netsales === 1) acc.temNetsales = true
        if (r.tem_racnew === '1' || r.tem_racnew === 1) acc.temRacnew = true
        if (String(r.data_lancamento) > String(acc.data_lancamento)) {
          acc.data_lancamento = r.data_lancamento
        }
      }

      const pedidoItems = []
      for (let k = 0; k < pedidoOrder.length; k++) {
        const acc = pedidos[pedidoOrder[k]]
        const itemPedido = {
          id: 'ped_' + acc.key,
          numero_documento_netsales: acc.key === '(Sem Pedido)' ? '' : acc.key,
          numero_nfe: '',
          data_lancamento: acc.data_lancamento,
          numero_sap: acc.numero_sap,
          tipo_documento: acc.tipo_documento,
          codigo_cliente: acc.codigo_cliente,
          nome_cliente: acc.nome_cliente,
          vendedor_cliente: acc.vendedor_cliente,
          nome_vendedor: acc.nome_vendedor,
          codigo_item: acc.itens_qtd > 1 ? `(${acc.itens_qtd} itens)` : '',
          descricao_item:
            acc.nfs_qtd > 1
              ? `Agrupamento de ${acc.itens_qtd} itens em ${acc.nfs_qtd} NFs no Pedido`
              : `Agrupamento de ${acc.itens_qtd} itens no Pedido`,
          grupo_item: acc.grupo_item,
          quantidade: acc.quantidade,
          preco_item: 0,
          preco_unitario: 0,
          total_linha: acc.total_linha,
          total_nf_sem_frete: acc.total_nf_sem_frete,
          total_nf_novo: acc.total_nf_novo,
          valor_liquido: acc.valor_liquido,
          custo_total: acc.custo_total,
          utilizacao: acc.utilizacao,
          estado: acc.estado,
          cidade: acc.cidade,
          classificacao: acc.classificacao,
          grupo_cliente: acc.grupo_cliente,
          mercado: acc.mercado,
          usuario_emissor_pedido: acc.usuario_emissor_pedido,
          status_cadastro: acc.status_cadastro,
          tipo_pn: acc.tipo_pn,
          tipo_cliente: acc.tipo_cliente,
          itens_qtd: acc.itens_qtd,
          nfs_qtd: acc.nfs_qtd,
          tem_netsales: acc.temNetsales,
          tem_racnew: acc.temRacnew,
          origem:
            acc.temNetsales && acc.temRacnew
              ? 'Consolidado'
              : acc.temNetsales
                ? 'NetSales'
                : 'RacNew',
        }
        try {
          if (typeof isVendedorNaoComissionadoHook === 'function') {
            itemPedido.nao_comissionado = isVendedorNaoComissionadoHook(itemPedido)
          }
        } catch (_) {}
        pedidoItems.push(itemPedido)
      }

      // Reordena os pedidos pelo campo de ordenação ativo (a SQL ordena por NF)
      const sf =
        body.sortField && validSortFields[body.sortField] ? body.sortField : 'data_lancamento'
      const sdir = sortClause.indexOf('DESC') >= 0 ? -1 : 1
      pedidoItems.sort((a, b) => {
        const va = a[sf]
        const vb = b[sf]
        if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * sdir
        return String(va == null ? '' : va).localeCompare(String(vb == null ? '' : vb)) * sdir
      })

      return e.json(200, {
        items: pedidoItems,
        totalItems: pedidoItems.length,
        isGrouped: true,
        groupedBy: 'pedido',
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
          'classificacao, vendedor_revenda, grupo_item, vendedor_cliente, status_cadastro, tipo_pn, tipo_cliente, origem, ' +
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
      const vendaItem = {
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
        status_cadastro: r.status_cadastro,
        tipo_pn: r.tipo_pn,
        tipo_cliente: r.tipo_cliente,
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
      }
      try {
        if (typeof isVendedorNaoComissionadoHook === 'function') {
          vendaItem.nao_comissionado = isVendedorNaoComissionadoHook(vendaItem)
        }
      } catch (_) {}
      items.push(vendaItem)
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
}

routerAdd('POST', '/backend/v1/vendas/export', __vendasExportHandler)
routerAdd('GET', '/backend/v1/vendas/export', __vendasExportHandler)
