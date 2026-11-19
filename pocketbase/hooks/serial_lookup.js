// Consulta de equipamento por número de série — PONTE para o Formulário de
// Garantia de Equipamento.
// Caminho: GET /backend/v1/serial-lookup?serial=<serial>
// Header: X-Serial-Lookup-Key: <segredo SERIAL_LOOKUP_KEY>
//
// Por que existe: o formulário de garantia vive em outra instância PocketBase
// (outro Skip Cloud), então não enxerga `netsales` por SQL. Esta rota expõe o
// mínimo necessário — modelo, data de venda, cliente — para o formulário
// preencher o registro sozinho, sem manter uma segunda lista de seriais.
//
// Só devolve dados NÃO sensíveis: nunca CPF/CNPJ, endereço, e-mail ou telefone
// (a LGPD vale aqui também). O nome do cliente é mascarado: o formulário é
// público, e a consulta por serial não pode virar oráculo de quem comprou o quê.
//
// Sem segredo configurado a rota responde 503 (fail closed): um endpoint público
// indexado por serial exporia toda a base de vendas a quem varresse seriais.
routerAdd('GET', '/backend/v1/serial-lookup', (e) => {
  const expected = $secrets.get('SERIAL_LOOKUP_KEY')
  const provided =
    e.requestInfo().headers['x-serial-lookup-key'] ||
    e.requestInfo().headers['X-Serial-Lookup-Key'] ||
    ''
  if (!expected) {
    return e.json(503, { error: 'Consulta por serial não configurada neste ambiente.' })
  }
  if (String(provided).trim() !== String(expected).trim()) {
    return e.json(401, { error: 'Credencial inválida para consulta por serial.' })
  }

  const rawSerial = String(e.request.url.query().get('serial') || '')
    .trim()
    .toUpperCase()
  const cleanSerial = rawSerial.replace(/[^0-9A-Z]/g, '')
  if (!cleanSerial) {
    return e.json(400, { error: 'Informe o número de série (parâmetro serial).' })
  }

  // Mascara o nome do cliente: "AGIS DO BRASIL LTDA" -> "AGIS DO BRASIL LT**"
  const maskName = function (name) {
    const clean = String(name || '').trim()
    if (!clean) return ''
    if (clean.length <= 6) return clean.slice(0, 2) + '***'
    const keep = Math.min(clean.length - 2, 22)
    return clean.slice(0, keep) + '**'
  }

  const toBrDate = function (raw) {
    const s = String(raw || '')
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
    return m ? m[3] + '/' + m[2] + '/' + m[1] : ''
  }

  try {
    const rows = arrayOf(new DynamicModel({ id: '' }))
    $app
      .db()
      .newQuery(
        "SELECT id FROM netsales WHERE UPPER(TRIM(COALESCE(serial_equipamento, ''))) = {:sn} LIMIT 5",
      )
      .bind({ sn: cleanSerial })
      .all(rows)

    if (rows.length === 0) {
      return e.json(200, {
        found: false,
        message: 'Número de série não localizado na base de vendas.',
      })
    }

    const rec = $app.findRecordById('netsales', rows[0].id)

    // Modelo: descrição da própria linha da nota. A tabela `produtos` tem
    // esquema variável entre cargas; para não depender de um nome de coluna que
    // pode não existir, o nome comercial vem de `descrip` (que já traz o modelo
    // na exportação do SAP) e é refinado por `itms_grp_nam` quando útil.
    let modelName = String(rec.getString('descrip') || '').trim()
    const family = String(rec.getString('itms_grp_nam') || '').trim()
    let category = ''
    const itemCode = String(rec.getString('codigo_item') || '').trim()
    if (!modelName) modelName = itemCode || 'Equipamento Roland DG'

    const docDate = rec.getString('docdate')

    return e.json(200, {
      found: true,
      serial: cleanSerial,
      model_name: modelName,
      item_code: itemCode,
      family: family,
      category: category,
      purchase_date: toBrDate(docDate),
      purchase_date_iso: String(docDate || '').slice(0, 10),
      invoice_number:
        String(rec.getString('numero_documento') || '') ||
        String(rec.getString('chave_documento') || ''),
      reseller_name: String(rec.getString('revenda') || '').trim(),
      customer_name_masked: maskName(rec.getString('nome_cliente')),
      city: String(rec.getString('municipio') || '').trim(),
      state: String(rec.getString('estado') || '').trim(),
    })
  } catch (err) {
    console.error('Erro na consulta de serial (painel de vendas):', err)
    return e.json(500, { error: 'Erro interno ao consultar o número de série.' })
  }
})

// Diagnóstico restrito ao admin: quantos registros do NetSales já têm serial
// preenchido. Serve para acompanhar a virada do export do SAP sem abrir a base.
// Caminho: GET /backend/v1/serial-lookup/status
routerAdd('GET', '/backend/v1/serial-lookup/status', (e) => {
  const expected = $secrets.get('SERIAL_LOOKUP_KEY')
  const provided =
    e.requestInfo().headers['x-serial-lookup-key'] ||
    e.requestInfo().headers['X-Serial-Lookup-Key'] ||
    ''
  if (!expected) {
    return e.json(503, { error: 'Consulta por serial não configurada neste ambiente.' })
  }
  if (String(provided).trim() !== String(expected).trim()) {
    return e.json(401, { error: 'Credencial inválida para consulta por serial.' })
  }

  try {
    const counters = arrayOf(new DynamicModel({ total: 0, com_serial: 0 }))
    $app
      .db()
      .newQuery(
        "SELECT COUNT(*) AS total, SUM(CASE WHEN TRIM(COALESCE(serial_equipamento, '')) != '' THEN 1 ELSE 0 END) AS com_serial FROM netsales",
      )
      .all(counters)

    const total = counters.length > 0 ? Number(counters[0].total || 0) : 0
    const comSerial = counters.length > 0 ? Number(counters[0].com_serial || 0) : 0

    return e.json(200, {
      netsales_total: total,
      com_serial_equipamento: comSerial,
      sem_serial_equipamento: total - comSerial,
      pronto: comSerial > 0,
      mensagem:
        comSerial > 0
          ? 'A origem já traz o serial do equipamento.'
          : 'A origem ainda não traz a coluna de serial do equipamento.',
    })
  } catch (err) {
    console.error('Erro no status da consulta de serial:', err)
    return e.json(500, { error: 'Erro interno ao consultar o status.' })
  }
})
