// admin_serial_equipamento.js — Gravação CONTROLADA de `serial_equipamento`.
// Endpoint: POST /backend/v1/admin/serial-equipamento
// Header:   X-Serial-Key: <segredo SERIAL_UPDATE_KEY>
// Body:     { "items": [{ "id": "...", "nf": "79410", "item": "DWX-43W",
//                        "serial_equipamento": "KGQ0234" }], "dry_run": true }
//
// POR QUE EXISTE (2026-11-19): o export do SAP passou a trazer a coluna
// "Nr. de Serie do Item" (o serial da máquina, que faltava). Mas:
//   1. `netsales` tem updateRule nulo — só superuser grava, e nenhum token de
//      usuário consegue PATCH (403 "Only superusers").
//   2. O importador /import/netsales_v4 é INSERT puro (sem upsert), então
//      reimportar o arquivo DUPLICARIA as 142.7 mil linhas em vez de atualizar.
// Logo, a única via segura é uma rota que atualize SÓ o campo do serial nas
// linhas existentes, com o superuser interno ($app).
//
// GUARDAS (a rota não confia no cliente):
//   - Cada item traz o `id` do registro E a chave (nf, item) que ele espera
//     encontrar. A rota confere se o registro realmente tem aquela NF e aquele
//     código de item antes de gravar; se não bater, o item vai para `erros` e
//     NADA é alterado naquela linha. Sem isso, um id desalinhado gravaria o
//     serial da máquina errada — e o serial é a chave da garantia.
//   - Só escreve a coluna serial_equipamento. Não mexe em valor, quantidade,
//     data nem em qualquer campo financeiro.
//   - dry_run é o PADRÃO: só grava com dry_run: false explícito.
//   - Idempotente: se o valor já é o mesmo, não regrava (conta em `iguais`).
//
// A base derivada `vendas` NÃO tem coluna de serial (o serial vive só em
// `netsales`, que é a fonte) — a consulta por serial lê `netsales` direto.
//
// IMPORTANTE: cada callback do Skip Cloud roda em VM separada, então TODA a
// lógica vai inline aqui (sem helper top-level).
routerAdd('POST', '/backend/v1/admin/serial-equipamento', (e) => {
  // ATENÇÃO: headers chegam com underscore em requestInfo(); use header.get().
  const expected = $secrets.get('SERIAL_UPDATE_KEY')
  const provided = String(e.request.header.get('X-Serial-Key') || '').trim()
  if (!expected) {
    return e.json(503, { error: 'Gravação de serial não configurada neste ambiente.' })
  }
  if (provided !== String(expected).trim()) {
    return e.json(401, { error: 'Credencial inválida para gravação de serial.' })
  }

  const body = e.requestInfo().body || {}
  const items = Array.isArray(body.items) ? body.items : []
  const dryRun = body.dry_run !== false

  if (items.length === 0) {
    return e.json(400, { error: 'Informe "items": [{id, nf, item, serial_equipamento}].' })
  }
  // Guarda-corpo de lote: o cliente envia em blocos de algumas centenas.
  if (items.length > 1000) {
    return e.json(400, { error: 'Máximo de 1000 itens por chamada.' })
  }

  const norm = (v) => String(v === null || v === undefined ? '' : v).trim()
  const normSerial = (v) => norm(v).toUpperCase().replace(/\s/g, '')

  let atualizados = 0
  let iguais = 0
  let naoEncontrados = 0
  const erros = []

  // Amostra: os primeiros itens, para conferência humana.
  const amostra = []

  for (let i = 0; i < items.length; i++) {
    const it = items[i] || {}
    const id = norm(it.id)
    const nfEsp = norm(it.nf)
    const itemEsp = norm(it.item)
    const novo = normSerial(it.serial_equipamento)

    if (!id || !novo) {
      erros.push('item ' + i + ': id ou serial ausente')
      continue
    }

    let rec
    try {
      rec = $app.findRecordById('netsales', id)
    } catch (_) {
      naoEncontrados++
      erros.push('item ' + i + ' (' + id + '): registro não encontrado')
      continue
    }

    // Trava: o registro tem de ser MESMO a linha esperada.
    // Em `netsales` o campo `serial` guarda o NÚMERO DA NF (não o serial da
    // máquina — o da máquina é `serial_equipamento`). Confundir os dois aqui
    // gravaria o serial na nota errada.
    const nfRec = norm(rec.getString('serial'))
    const itemRec = norm(rec.getString('codigo_item'))
    if (nfEsp && nfRec !== nfEsp) {
      erros.push('item ' + i + ' (' + id + '): NF esperada ' + nfEsp + ', registro tem ' + nfRec)
      continue
    }
    if (itemEsp && itemRec !== itemEsp) {
      erros.push(
        'item ' + i + ' (' + id + '): item esperado ' + itemEsp + ', registro tem ' + itemRec,
      )
      continue
    }

    const atual = normSerial(rec.getString('serial_equipamento'))
    if (atual === novo) {
      iguais++
      continue
    }

    if (dryRun) {
      atualizados++
      if (amostra.length < 15) {
        amostra.push({
          id: id,
          nf: nfRec,
          item: itemRec,
          linha: rec.getInt('numero_linha'),
          de: atual,
          para: novo,
        })
      }
      continue
    }

    try {
      rec.set('serial_equipamento', novo)
      $app.save(rec)
      atualizados++
      if (amostra.length < 15) {
        amostra.push({
          id: id,
          nf: nfRec,
          item: itemRec,
          linha: rec.getInt('numero_linha'),
          de: atual,
          para: novo,
        })
      }
    } catch (errSave) {
      erros.push('item ' + i + ' (' + id + '): erro ao salvar: ' + String(errSave))
    }
  }

  if (dryRun) {
    return e.json(200, {
      success: true,
      dry_run: true,
      recebidos: items.length,
      seriam_atualizados: atualizados,
      ja_corretos: iguais,
      nao_encontrados: naoEncontrados,
      erros: erros.slice(0, 50),
      total_erros: erros.length,
      amostra: amostra,
      mensagem:
        'Simulação: ' +
        atualizados +
        ' linha(s) seriam atualizadas, ' +
        iguais +
        ' já estão corretas. Nada foi gravado.',
    })
  }

  // Auditoria (best-effort: a gravação já aconteceu, um log falho não a desfaz).
  try {
    const logsCol = $app.findCollectionByNameOrId('audit_logs')
    const record = new Record(logsCol)
    record.set('action', 'serial_equipamento')
    record.set(
      'details',
      'Serial de equipamento: ' +
        atualizados +
        ' linha(s) atualizada(s), ' +
        iguais +
        ' sem alteração, ' +
        naoEncontrados +
        ' não encontrada(s), ' +
        erros.length +
        ' erro(s)' +
        (erros.length ? ' | ' + erros.slice(0, 10).join('; ') : ''),
    )
    $app.save(record)
  } catch (errAudit) {
    console.warn('[serial-equipamento] auditoria falhou:', errAudit)
  }

  console.log(
    '[serial-equipamento] atualizados=' +
      atualizados +
      ' iguais=' +
      iguais +
      ' nao_encontrados=' +
      naoEncontrados +
      ' erros=' +
      erros.length,
  )

  return e.json(200, {
    success: erros.length === 0,
    dry_run: false,
    recebidos: items.length,
    atualizados: atualizados,
    ja_corretos: iguais,
    nao_encontrados: naoEncontrados,
    erros: erros.slice(0, 50),
    total_erros: erros.length,
    amostra: amostra,
    mensagem: 'Gravadas ' + atualizados + ' linha(s) de serial_equipamento.',
  })
})

// Diagnóstico restrito: foto do preenchimento por ano. Serve para acompanhar a
// carga sem abrir a base.
// Caminho: GET /backend/v1/admin/serial-equipamento/status
routerAdd('GET', '/backend/v1/admin/serial-equipamento/status', (e) => {
  const expected = $secrets.get('SERIAL_UPDATE_KEY')
  const provided = String(e.request.header.get('X-Serial-Key') || '').trim()
  if (!expected) {
    return e.json(503, { error: 'Gravação de serial não configurada neste ambiente.' })
  }
  if (provided !== String(expected).trim()) {
    return e.json(401, { error: 'Credencial inválida.' })
  }

  try {
    const rows = arrayOf(new DynamicModel({ ano: '', total: 0, com_serial: 0, com_lista: 0 }))
    $app
      .db()
      .newQuery(
        "SELECT SUBSTR(TRIM(COALESCE(docdate, '')), 1, 4) AS ano, " +
          'COUNT(*) AS total, ' +
          "SUM(CASE WHEN TRIM(COALESCE(serial_equipamento, '')) != '' THEN 1 ELSE 0 END) AS com_serial, " +
          "SUM(CASE WHEN INSTR(COALESCE(serial_equipamento, ''), ',') > 0 THEN 1 ELSE 0 END) AS com_lista " +
          'FROM netsales GROUP BY 1 ORDER BY 1',
      )
      .all(rows)

    const porAno = []
    let total = 0
    let comSerial = 0
    let comLista = 0
    for (let i = 0; i < rows.length; i++) {
      const t = parseInt(rows[i].total, 10) || 0
      const c = parseInt(rows[i].com_serial, 10) || 0
      const l = parseInt(rows[i].com_lista, 10) || 0
      total += t
      comSerial += c
      comLista += l
      porAno.push({ ano: String(rows[i].ano || ''), total: t, com_serial: c, com_lista: l })
    }

    return e.json(200, {
      netsales_total: total,
      com_serial_equipamento: comSerial,
      sem_serial_equipamento: total - comSerial,
      com_lista_de_seriais: comLista,
      cobertura_pct: total > 0 ? Math.round((comSerial / total) * 1000) / 10 : 0,
      por_ano: porAno,
    })
  } catch (err) {
    console.error('Erro no status do serial de equipamento:', err)
    return e.json(500, { error: 'Erro interno ao consultar o status.' })
  }
})
