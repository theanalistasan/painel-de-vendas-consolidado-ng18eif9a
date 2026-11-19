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
//
// BUSCA POR TOKEN (corrigido em 2026-11-19): `serial_equipamento` pode guardar
// MAIS DE UM serial na mesma linha, separado por vírgula (é o caso de uma nota
// com 2 máquinas lançadas em quantidade 2 numa única linha, ex.: NF 87416
// "KHE1540,KHE1542"). Comparar o campo inteiro por igualdade não achava nenhum
// dos dois. A comparação agora é por TOKEN, não por pedaço de texto: o campo é
// embrulhado em vírgulas e o serial procurado também, então "KHE1540" acha
// exatamente aquele serial e "KHE15" não acha nada (sem falso positivo).
routerAdd('GET', '/backend/v1/serial-lookup', (e) => {
  // ATENÇÃO: `e.requestInfo().headers` entrega as chaves em minúsculas COM
  // UNDERSCORE ('x_serial_lookup_key'), não com hífen — ler com hífen devolvia
  // undefined e a rota recusava toda chamada. `e.request.header.get()` usa o
  // nome HTTP canônico e é o caminho confiável.
  const expected = $secrets.get('SERIAL_LOOKUP_KEY')
  const provided = String(e.request.header.get('X-Serial-Lookup-Key') || '').trim()
  if (!expected) {
    return e.json(503, { error: 'Consulta por serial não configurada neste ambiente.' })
  }
  if (provided !== String(expected).trim()) {
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

  // Na origem o modelo NÃO existe: `descrip` é "EQUIPAMENTOS" em toda a base.
  // Devolver isso fazia o cliente ver "EQUIPAMENTOS" como modelo no formulário.
  // O nome comercial é resolvido no FGE (equipment_items.commercial_name), a
  // partir do item_code — então aqui mandamos vazio em vez do placeholder.
  const isPlaceholderModel = function (name) {
    const s = String(name || '')
      .trim()
      .toUpperCase()
    return s === '' || s === 'EQUIPAMENTOS' || s === 'EQUIPAMENTO' || s === 'OUTROS'
  }

  try {
    const rows = arrayOf(new DynamicModel({ id: '' }))
    $app
      .db()
      .newQuery(
        "SELECT id FROM netsales WHERE INSTR(',' || REPLACE(UPPER(COALESCE(serial_equipamento, '')), ' ', '') || ',', ',' || {:sn} || ',') > 0 LIMIT 5",
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

    const itemCode = String(rec.getString('codigo_item') || '').trim()
    const rawDescrip = String(rec.getString('descrip') || '').trim()
    const modelName = isPlaceholderModel(rawDescrip) ? '' : rawDescrip

    // `itms_grp_nam` é o grupo do item no SAP ("DENTAL", "FORA DE LINHA") e não
    // a família comercial do produto (DGSHAPE, MODELA, DGXPRESS) — vai como
    // `sap_group` só para diagnóstico; a família real vem do FGE.
    const sapGroup = String(rec.getString('itms_grp_nam') || '').trim()

    const docDate = rec.getString('docdate')

    return e.json(200, {
      found: true,
      serial: cleanSerial,
      model_name: modelName,
      item_code: itemCode,
      family: '',
      category: '',
      sap_group: sapGroup,
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
  const provided = String(e.request.header.get('X-Serial-Lookup-Key') || '').trim()
  if (!expected) {
    return e.json(503, { error: 'Consulta por serial não configurada neste ambiente.' })
  }
  if (provided !== String(expected).trim()) {
    return e.json(401, { error: 'Credencial inválida para consulta por serial.' })
  }

  try {
    const counters = arrayOf(new DynamicModel({ total: 0, com_serial: 0, com_lista: 0 }))
    $app
      .db()
      .newQuery(
        'SELECT COUNT(*) AS total, ' +
          "SUM(CASE WHEN TRIM(COALESCE(serial_equipamento, '')) != '' THEN 1 ELSE 0 END) AS com_serial, " +
          "SUM(CASE WHEN INSTR(COALESCE(serial_equipamento, ''), ',') > 0 THEN 1 ELSE 0 END) AS com_lista " +
          'FROM netsales',
      )
      .all(counters)

    const total = counters.length > 0 ? Number(counters[0].total || 0) : 0
    const comSerial = counters.length > 0 ? Number(counters[0].com_serial || 0) : 0
    const comLista = counters.length > 0 ? Number(counters[0].com_lista || 0) : 0

    return e.json(200, {
      netsales_total: total,
      com_serial_equipamento: comSerial,
      sem_serial_equipamento: total - comSerial,
      com_lista_de_seriais: comLista,
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
