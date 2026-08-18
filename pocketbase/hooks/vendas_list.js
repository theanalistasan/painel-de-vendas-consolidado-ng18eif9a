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

  // Constrói o filtro PocketBase a partir dos critérios recebidos.
  const parts = []

  if (f.dataDe) {
    parts.push(`data_lancamento >= "${f.dataDe} 00:00:00"`)
  }
  if (f.dataAte) {
    parts.push(`data_lancamento <= "${f.dataAte} 23:59:59"`)
  }
  if (f.ano) {
    // extrair ano: data_lancamento contém "YYYY-..."
    parts.push(`data_lancamento ~ "${f.ano}-"`)
  }
  if (f.mes) {
    const mm = String(f.mes).padStart(2, '0')
    parts.push(`data_lancamento ~ "-${mm}-"`)
  }
  if (f.dia) {
    const dd = String(f.dia).padStart(2, '0')
    parts.push(`data_lancamento ~ "-${dd} "`)
  }
  if (Array.isArray(f.vendedorCliente) && f.vendedorCliente.length > 0) {
    const arr = f.vendedorCliente.map((v) => `"${v}"`).join(',')
    parts.push(`vendedor_cliente in (${arr})`)
  }
  if (Array.isArray(f.vendedor) && f.vendedor.length > 0) {
    const arr = f.vendedor.map((v) => `"${v}"`).join(',')
    parts.push(`nome_vendedor in (${arr})`)
  }
  if (Array.isArray(f.grupoItem) && f.grupoItem.length > 0) {
    const arr = f.grupoItem.map((v) => `"${v}"`).join(',')
    parts.push(`grupo_item in (${arr})`)
  }
  if (Array.isArray(f.estado) && f.estado.length > 0) {
    const arr = f.estado.map((v) => `"${v}"`).join(',')
    parts.push(`estado in (${arr})`)
  }
  if (Array.isArray(f.utilizacao) && f.utilizacao.length > 0) {
    const arr = f.utilizacao.map((v) => `"${v}"`).join(',')
    parts.push(`utilizacao in (${arr})`)
  }
  if (f.search) {
    const q = f.search.toString().replace(/"/g, '\\"')
    const term = `"${q}"`
    parts.push(
      `(nome_cliente ~ ${term} || codigo_cliente ~ ${term} || codigo_item ~ ${term} || descricao_item ~ ${term} || numero_nfe ~ ${term} || numero_sap ~ ${term} || vendedor_cliente ~ ${term} || cidade ~ ${term} || mercado ~ ${term})`,
    )
  }

  const filterStr = parts.length > 0 ? parts.join(' && ') : "id != ''"

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

  const result = $app.findRecordsByFilter('vendas', filterStr, sort, perPage, (page - 1) * perPage)

  // Conta total (sem limite) para calcular paginação
  const totalItems = $app.countRecords('vendas')

  // Serializa manualmente apenas os campos necessários
  const items = []
  for (let i = 0; i < result.length; i++) {
    const r = result[i]
    items.push({
      id: r.getId(),
      tipo_documento: r.getString('tipo_documento'),
      nf_entrega_futura: r.getString('nf_entrega_futura'),
      numero_sap: r.getString('numero_sap'),
      numero_nfe: r.getString('numero_nfe'),
      data_lancamento: r.getString('data_lancamento'),
      ultima_data_vencimento: r.getString('ultima_data_vencimento'),
      docto_origem_destino: r.getString('docto_origem_destino'),
      data_origem_destino: r.getString('data_origem_destino'),
      condicao_pagamento: r.getString('condicao_pagamento'),
      codigo_cliente: r.getString('codigo_cliente'),
      nome_cliente: r.getString('nome_cliente'),
      numero_linha: r.getInt('numero_linha'),
      codigo_item: r.getString('codigo_item'),
      descricao_item: r.getString('descricao_item'),
      quantidade: r.getFloat('quantidade'),
      qty_kg_lt: r.getFloat('qty_kg_lt'),
      preco_item: r.getFloat('preco_item'),
      desconto_linha: r.getFloat('desconto_linha'),
      icms: r.getFloat('icms'),
      pis: r.getFloat('pis'),
      cofins: r.getFloat('cofins'),
      ipi: r.getFloat('ipi'),
      icms_partilha: r.getFloat('icms_partilha'),
      total_linha: r.getFloat('total_linha'),
      utilizacao: r.getString('utilizacao'),
      nome_vendedor: r.getString('nome_vendedor'),
      custo_item: r.getFloat('custo_item'),
      nome_filial: r.getString('nome_filial'),
      conta: r.getString('conta'),
      estado: r.getString('estado'),
      cidade: r.getString('cidade'),
      grupo_cliente: r.getString('grupo_cliente'),
      mercado: r.getString('mercado'),
      usuario_emissor_pedido: r.getString('usuario_emissor_pedido'),
      itms_grp_nam: r.getString('itms_grp_nam'),
      numero_documento_netsales: r.getString('numero_documento_netsales'),
      preco_unitario: r.getFloat('preco_unitario'),
      total_nf_sem_frete: r.getFloat('total_nf_sem_frete'),
      total_nf_novo: r.getFloat('total_nf_novo'),
      valor_liquido: r.getFloat('valor_liquido'),
      custo_total: r.getFloat('custo_total'),
      classificacao: r.getString('classificacao'),
      vendedor_revenda: r.getString('vendedor_revenda'),
      grupo_item: r.getString('grupo_item'),
      vendedor_cliente: r.getString('vendedor_cliente'),
      origem: r.getString('origem'),
      data_carga: r.getString('data_carga'),
      created: r.getString('created'),
      updated: r.getString('updated'),
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
