// Endpoint: POST /backend/v1/vendas/list
// Lista paginada server-side da coleção `vendas` com filtros opcionais.
// Evita carregar 125k+ registros de uma vez no frontend.
//
// Body:
//   page      (number, default 1)
//   perPage   (number, default 20, max 200)
//   sort      (string, default "-data_lancamento") — campo + "-" para desc
//   filters   (object, opcional):
//     dataDe, dataAte         (yyyy-mm-dd)
//     ano, mes, dia           (string)
//     vendedorCliente[]       (string[])
//     vendedor[]              (string[])
//     grupoItem[]             (string[])
//     estado[]                (string[])
//     utilizacao[]            (string[])
//     search                  (string)
//
// Retorna: { items, page, perPage, totalItems, totalPages }
routerAdd('POST', '/backend/v1/vendas/list', (e) => {
  const body = e.requestInfo().body || {}
  const page = Math.max(1, parseInt(body.page, 10) || 1)
  const perPage = Math.min(200, Math.max(1, parseInt(body.perPage, 10) || 20))
  let sort = (body.sort || '-data_lancamento').toString().trim()
  if (!sort) sort = '-data_lancamento'

  const f = body.filters || {}

  // ---- Escape SQL (aspas simples duplicadas) ----
  const sqlEsc = (s) => String(s).replace(/'/g, "''")

  // ---- Constrói DUAS cláusulas em paralelo ----
  // sqlWhere: sintaxe SQL (IN, AND, LIKE) — usada nas queries COUNT e dados.
  // pbFilter: sintaxe PocketBase (=, &&, ~) — usada apenas como fallback
  //   quando NÃO há filtros multi-valor (PB não suporta o operador IN).
  const sqlParts = []
  const pbParts = []

  if (f.dataDe) {
    sqlParts.push("data_lancamento >= '" + sqlEsc(f.dataDe) + " 00:00:00'")
    pbParts.push('data_lancamento >= "' + f.dataDe + ' 00:00:00"')
  }
  if (f.dataAte) {
    sqlParts.push("data_lancamento <= '" + sqlEsc(f.dataAte) + " 23:59:59'")
    pbParts.push('data_lancamento <= "' + f.dataAte + ' 23:59:59"')
  }
  if (f.ano) {
    sqlParts.push("data_lancamento LIKE '" + sqlEsc(f.ano) + "-%'")
    pbParts.push('data_lancamento ~ "' + f.ano + '-"')
  }
  if (f.mes) {
    const mm = String(f.mes).padStart(2, '0')
    sqlParts.push("data_lancamento LIKE '%-" + mm + "-%'")
    pbParts.push('data_lancamento ~ "-' + mm + '-"')
  }
  if (f.dia) {
    const dd = String(f.dia).padStart(2, '0')
    sqlParts.push("data_lancamento LIKE '%-" + dd + " %'")
    pbParts.push('data_lancamento ~ "-' + dd + ' "')
  }
  if (Array.isArray(f.vendedorCliente) && f.vendedorCliente.length > 0) {
    const sqlArr = f.vendedorCliente.map((v) => "'" + sqlEsc(v) + "'").join(',')
    sqlParts.push('vendedor_cliente IN (' + sqlArr + ')')
    // PB não suporta IN — multi-valor só roda via SQL.
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
  // Filtro Tipo de Documento (multi-valor) — campo `tipo_documento`.
  if (Array.isArray(f.tipoDocumento) && f.tipoDocumento.length > 0) {
    const sqlArr = f.tipoDocumento.map((v) => "'" + sqlEsc(v) + "'").join(',')
    sqlParts.push('tipo_documento IN (' + sqlArr + ')')
  }
  if (f.tipoDevolucao) {
    sqlParts.push("tipo_documento = '" + sqlEsc(f.tipoDevolucao) + "'")
    pbParts.push('tipo_documento = "' + f.tipoDevolucao + '"')
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
    const pbq = f.search.toString().replace(/"/g, '\\"')
    const term = '"' + pbq + '"'
    pbParts.push(
      '(nome_cliente ~ ' +
        term +
        ' || codigo_cliente ~ ' +
        term +
        ' || codigo_item ~ ' +
        term +
        ' || descricao_item ~ ' +
        term +
        ' || numero_nfe ~ ' +
        term +
        ' || numero_sap ~ ' +
        term +
        ' || vendedor_cliente ~ ' +
        term +
        ' || cidade ~ ' +
        term +
        ' || mercado ~ ' +
        term +
        ')',
    )
  }

  const sqlWhere = sqlParts.length > 0 ? sqlParts.join(' AND ') : '1=1'
  const pbFilter = pbParts.length > 0 ? pbParts.join(' && ') : "id != ''"

  // Sanitiza sort: permite apenas campos conhecidos
  const allowedSorts = [
    'data_lancamento',
    '-data_lancamento',
    'numero_nfe',
    '-numero_nfe',
    'numero_sap',
    '-numero_sap',
    'nome_cliente',
    '-nome_cliente',
    'nome_vendedor',
    '-nome_vendedor',
    'codigo_item',
    '-codigo_item',
    'total_linha',
    '-total_linha',
    'quantidade',
    '-quantidade',
    'preco_item',
    '-preco_item',
    'estado',
    '-estado',
    'created',
    '-created',
    'updated',
    '-updated',
  ]
  if (allowedSorts.indexOf(sort) === -1) sort = '-data_lancamento'

  // ---- Query de dados (SQL puro) ----
  // findRecordsByFilter não aceita o operador IN multi-valor, então usamos
  // SQL direto com DynamicModel. O padrão anti-mismatch é mantido: todos os
  // campos do modelo são declarados como STRING e parseados no JS (parseInt
  // para inteiros, parseFloat para decimais), já que o JSVM devolve float64
  // para colunas numéricas e o scan de um DynamicModel inteiro falha.
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
      data_carga: '',
      created: '',
      updated: '',
    }),
  )
  $app
    .db()
    .newQuery(
      'SELECT id, tipo_documento, nf_entrega_futura, numero_sap, numero_nfe, data_lancamento, ultima_data_vencimento, docto_origem_destino, data_origem_destino, condicao_pagamento, codigo_cliente, nome_cliente, numero_linha, codigo_item, descricao_item, quantidade, qty_kg_lt, preco_item, desconto_linha, icms, pis, cofins, ipi, icms_partilha, total_linha, utilizacao, nome_vendedor, custo_item, nome_filial, conta, estado, cidade, grupo_cliente, mercado, usuario_emissor_pedido, itms_grp_nam, numero_documento_netsales, preco_unitario, total_nf_sem_frete, total_nf_novo, valor_liquido, custo_total, classificacao, vendedor_revenda, grupo_item, vendedor_cliente, origem, data_carga, created, updated ' +
        'FROM vendas WHERE ' +
        sqlWhere +
        ' ORDER BY ' +
        sort +
        ' LIMIT ' +
        perPage +
        ' OFFSET ' +
        (page - 1) * perPage,
    )
    .all(dataRows)

  // Conta total com o filtro aplicado para calcular a paginação correta.
  // Usa sqlWhere (sintaxe SQL) — nunca filterStr/pbFilter, que usam `&&`/`~`/`in`
  // e são rejeitados pelo parser SQL.
  //
  // BUG EVITADO: o JSVM devolve float64 para COUNT(*) e o scan de
  // DynamicModel inicializado como inteiro (`0`) falha silenciosamente —
  // totalItems caía no catch e ficava como dataRows.length. Aqui o
  // campo é declarado como STRING e parseado com parseInt, à prova de
  // mismatch de tipo.
  let totalItems = 0
  try {
    const countRows = arrayOf(new DynamicModel({ total: '' }))
    $app
      .db()
      .newQuery('SELECT COUNT(*) as total FROM vendas WHERE ' + sqlWhere)
      .all(countRows)
    if (countRows.length > 0) {
      const n = parseInt(countRows[0].total, 10)
      if (!isNaN(n)) totalItems = n
    }
  } catch (err) {
    console.error('vendas_list: COUNT falhou:', err)
    totalItems = dataRows.length
  }

  // Serializa manualmente apenas os campos necessários
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
    totalPages: Math.max(1, Math.ceil(totalItems / perPage)),
  })
})
