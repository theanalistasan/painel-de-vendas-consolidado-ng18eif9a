// Endpoint: POST /backend/v1/import/canais-clientes
// Importação ou substituição da planilha "Canais x Clientes" na coleção `canais_clientes`.
//
// Mapeamento aceito para as colunas:
// - CANAIS / eh_canal: booleano (Sim/Não, S/N, True/False, 1/0)
// - DEPLOY: AGIS / ROLAND (ou direto/revenda)
// - Nome do Canal / nome_canal: texto
// - Nome do Cliente / nome_cliente: texto
// - Status / status: texto
// - Serie / Série / serie: texto
// - Código do Cliente / Codigo do Cliente / codigo_cliente: texto (chave de ligação com vendas)
// - Contato / contato: texto
// - E-mail / Email / email: texto
//
// Opção replace: se body.replace === true ou body.mode === 'replace',
// ou na primeira fatia de uma carga se solicitado, limpa a coleção previamente.
// Por padrão, para evitar duplicidades em reimportações sem perder histórico durante lotes,
// faz upsert por combinação (codigo_cliente + nome_canal).
routerAdd(
  'POST',
  '/backend/v1/import/canais-clientes',
  (e) => {
    const body = e.requestInfo().body || {}
    const rows = Array.isArray(body.rows) ? body.rows : Array.isArray(body) ? body : []

    // Opção de limpeza prévia (truncate/delete)
    if (body.clearBefore === true || body.replace === true) {
      try {
        $app.db().newQuery('DELETE FROM canais_clientes').execute()
      } catch (delErr) {
        console.warn('Erro ao limpar canais_clientes antes de importar:', delErr)
      }
    }

    if (rows.length === 0) {
      return e.json(400, {
        message: 'Nenhum registro enviado',
        importados: 0,
        atualizados: 0,
        ignorados: 0,
        erros: ['Nenhum dado encontrado no payload'],
      })
    }

    const canaisCol = $app.findCollectionByNameOrId('canais_clientes')
    const nowIso = new Date().toISOString()

    let importados = 0
    let atualizados = 0
    let ignorados = 0
    const erros = []

    const parseBool = (val) => {
      if (typeof val === 'boolean') return val
      if (!val) return false
      const s = String(val).trim().toUpperCase()
      return s === 'SIM' || s === 'S' || s === 'TRUE' || s === '1' || s === 'YES' || s === 'Y'
    }

    const getVal = (row, candidates) => {
      for (let i = 0; i < candidates.length; i++) {
        const k = candidates[i]
        if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== '') {
          return String(row[k]).trim()
        }
      }
      return ''
    }

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const lineNum = i + 1

      const codigoCliente = getVal(row, [
        'codigo_cliente',
        'Código do Cliente',
        'Codigo do Cliente',
        'Código Cliente',
        'Codigo Cliente',
        'Cód. Cliente',
        'Cod. Cliente',
        'Cliente Código',
        'CardCode',
      ])

      const nomeCanal = getVal(row, ['nome_canal', 'Nome do Canal', 'Nome Canal', 'Canal', 'CANAL'])

      const nomeCliente = getVal(row, [
        'nome_cliente',
        'Nome do Cliente',
        'Nome Cliente',
        'Cliente',
        'CLIENTE',
        'CardName',
      ])

      const deploy = getVal(row, [
        'deploy',
        'DEPLOY',
        'Deploy',
        'Modelo',
        'Tipo Deploy',
      ]).toUpperCase()

      const ehCanalRaw = getVal(row, [
        'eh_canal',
        'CANAIS',
        'Canais',
        'Canal?',
        'É Canal',
        'Eh Canal',
      ])
      const ehCanal = parseBool(ehCanalRaw)

      const status = getVal(row, ['status', 'Status', 'STATUS', 'Situação', 'Situacao'])
      const serie = getVal(row, ['serie', 'Série', 'Serie', 'SERIE', 'Serial'])
      const contato = getVal(row, ['contato', 'Contato', 'CONTATO'])
      const email = getVal(row, ['email', 'Email', 'E-mail', 'EMAIL', 'E-Mail'])

      // Validação: linha precisa ter ao menos código do cliente ou nome do canal ou nome do cliente
      if (!codigoCliente && !nomeCanal && !nomeCliente) {
        ignorados++
        erros.push(
          `Linha ${lineNum}: linha vazia ou sem identificador (código de cliente ou canal).`,
        )
        continue
      }

      try {
        let isUpdate = false
        let record = null

        // Tenta localizar registro existente por codigo_cliente + nome_canal para upsert
        if (codigoCliente && nomeCanal) {
          try {
            const checkRows = arrayOf(new DynamicModel({ id: '' }))
            $app
              .db()
              .newQuery(
                'SELECT id FROM canais_clientes WHERE codigo_cliente = {:cod} AND nome_canal = {:canal} LIMIT 1',
              )
              .bind({ cod: codigoCliente, canal: nomeCanal })
              .all(checkRows)
            if (checkRows.length > 0 && checkRows[0].id) {
              record = $app.findRecordById('canais_clientes', checkRows[0].id)
              isUpdate = true
            }
          } catch (_) {}
        } else if (codigoCliente) {
          try {
            record = $app.findFirstRecordByData('canais_clientes', 'codigo_cliente', codigoCliente)
            isUpdate = true
          } catch (_) {}
        }

        if (!record) {
          record = new Record(canaisCol)
        }

        record.set('eh_canal', ehCanal)
        record.set('deploy', deploy)
        record.set('nome_canal', nomeCanal)
        record.set('nome_cliente', nomeCliente)
        record.set('status', status)
        record.set('serie', serie)
        record.set('codigo_cliente', codigoCliente)
        record.set('contato', contato)
        record.set('email', email)
        record.set('origem', 'Canais x Clientes')
        record.set('data_carga', nowIso)

        $app.save(record)
        if (isUpdate) {
          atualizados++
        } else {
          importados++
        }
      } catch (err) {
        ignorados++
        erros.push(
          `Linha ${lineNum} (${codigoCliente || nomeCanal}): erro ao salvar: ${err.message || String(err)}`,
        )
      }
    }

    return e.json(200, {
      success: true,
      importados,
      atualizados,
      ignorados,
      erros,
      data_carga: nowIso,
    })
  },
  $apis.requireAuth(),
)
