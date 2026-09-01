// pocketbase/hooks/update_base_flags.js
// Atualiza retroativamente os marcadores `tem_racnew` e `tem_netsales` na coleção `vendas`.
// Executa fora do contexto de transação de migration para evitar timeout com alto volume de dados (~126k registros).

// 1. Execução automática no evento onBootstrap (com e.next() para rodar após inicialização)
onBootstrap((e) => {
  e.next()

  try {
    if (!$app.hasTable('vendas')) {
      console.log('[update_base_flags] Tabela vendas não existe. Pulando atualização.')
      return
    }

    const rows = arrayOf(new DynamicModel({ a: '', b: '', c: '', d: '' }))
    $app
      .db()
      .newQuery(
        "SELECT COALESCE(SUM(total_linha),0) as a, COUNT(*) as b, COALESCE(SUM(CASE WHEN total_linha > 0 THEN total_linha ELSE 0 END),0) as c, COALESCE(SUM(CASE WHEN total_linha < 0 THEN total_linha ELSE 0 END),0) as d FROM vendas WHERE data_lancamento >= '2026-08-01' AND data_lancamento <= '2026-08-31'",
      )
      .all(rows)

    const rows3 = arrayOf(new DynamicModel({ a: '', b: '', c: '', d: '' }))
    $app
      .db()
      .newQuery(
        "SELECT COALESCE(SUM(total_linha),0) as a, COUNT(*) as b FROM vendas WHERE data_lancamento >= '2026-08-01' AND data_lancamento <= '2026-08-31' AND utilizacao = 'VENDA DE MERCADORIA'",
      )
      .all(rows3)

    const rows4 = arrayOf(new DynamicModel({ a: '', b: '', c: '', d: '' }))
    $app
      .db()
      .newQuery(
        "SELECT COALESCE(SUM(total_linha),0) as a, COUNT(*) as b FROM racnew WHERE data_lancamento >= '2026-08-01' AND data_lancamento <= '2026-08-31'",
      )
      .all(rows4)

    const rows5 = arrayOf(new DynamicModel({ a: '', b: '', c: '', d: '' }))
    $app
      .db()
      .newQuery(
        "SELECT COALESCE(SUM(valor_mercadoria),0) as a, COALESCE(SUM(total_nf_novo),0) as b, COALESCE(SUM(total_nf_sem_frete),0) as c, COALESCE(SUM(valor_liquido),0) as d FROM netsales WHERE docdate >= '2026-08-01' AND docdate <= '2026-08-31'",
      )
      .all(rows5)

    // Let's test combinations against target 4747242.03
    const findExact = arrayOf(new DynamicModel({ a: '', b: '', c: '' }))
    $app
      .db()
      .newQuery(`
      SELECT 'test' as a,
        CAST(SUM(CASE WHEN tipo_documento != 'Entrega' THEN total_linha ELSE 0 END) AS TEXT) as b,
        CAST(SUM(CASE WHEN tipo_documento != 'NF de Saída' THEN total_linha ELSE 0 END) AS TEXT) as c
      FROM vendas WHERE data_lancamento >= '2026-08-01' AND data_lancamento <= '2026-08-31'
    `)
      .all(findExact)
    if (findExact.length > 0) {
      console.log(
        '[FIND_EXACT] without_Entrega=' +
          findExact[0].b +
          ' | without_NF_de_Saida=' +
          findExact[0].c,
      )
    }

    // Also check what other columns might be filtered
    // E.g. conta? filial? mercado? nf_entrega_futura?
    const findMore = arrayOf(new DynamicModel({ a: '', b: '', c: '', d: '' }))
    $app
      .db()
      .newQuery(`
      SELECT 
        CAST(SUM(CASE WHEN nf_entrega_futura IS NOT NULL AND nf_entrega_futura != '' THEN total_linha ELSE 0 END) AS TEXT) as a,
        CAST(SUM(CASE WHEN nf_entrega_futura IS NULL OR nf_entrega_futura = '' THEN total_linha ELSE 0 END) AS TEXT) as b,
        CAST(SUM(CASE WHEN tipo_documento IN ('NF de Saída', 'Entrega') THEN total_linha ELSE 0 END) AS TEXT) as c,
        CAST(SUM(CASE WHEN tipo_documento IN ('NF de Saída', 'Entrega') AND nf_entrega_futura = '' THEN total_linha ELSE 0 END) AS TEXT) as d
      FROM vendas WHERE data_lancamento >= '2026-08-01' AND data_lancamento <= '2026-08-31'
    `)
      .all(findMore)
    if (findMore.length > 0) {
      console.log(
        '[FIND_MORE] with_futura=' +
          findMore[0].a +
          ' | without_futura=' +
          findMore[0].b +
          ' | saida_entrega=' +
          findMore[0].c +
          ' | saida_entrega_no_futura=' +
          findMore[0].d,
      )
    }

    // Let's check grouping by conta or utilizacao or docto_origem_destino
    const findGroups = arrayOf(new DynamicModel({ a: '', b: '', c: '' }))
    $app
      .db()
      .newQuery(`
      SELECT conta as a, CAST(SUM(total_linha) AS TEXT) as b, COUNT(*) as c
      FROM vendas WHERE data_lancamento >= '2026-08-01' AND data_lancamento <= '2026-08-31'
      GROUP BY conta
    `)
      .all(findGroups)
    for (let i = 0; i < findGroups.length; i++) {
      console.log(
        '[CONTA_GROUP] conta=' +
          findGroups[i].a +
          ' | sum=' +
          findGroups[i].b +
          ' | count=' +
          findGroups[i].c,
      )
    }

    console.log(
      '[DEBUG_AUGUST] Vendas Total: sum=' +
        (rows.length > 0 ? rows[0].a : '') +
        ' count=' +
        (rows.length > 0 ? rows[0].b : '') +
        ' pos=' +
        (rows.length > 0 ? rows[0].c : '') +
        ' neg=' +
        (rows.length > 0 ? rows[0].d : ''),
    )
    console.log(
      '[DEBUG_AUGUST] Vendas Venda Mercadoria: sum=' +
        (rows3.length > 0 ? rows3[0].a : '') +
        ' count=' +
        (rows3.length > 0 ? rows3[0].b : ''),
    )
    console.log(
      '[DEBUG_AUGUST] RacNew Total: sum=' +
        (rows4.length > 0 ? rows4[0].a : '') +
        ' count=' +
        (rows4.length > 0 ? rows4[0].b : ''),
    )
    console.log(
      '[DEBUG_AUGUST] NetSales: valor_mercadoria=' +
        (rows5.length > 0 ? rows5[0].a : '') +
        ' total_nf_novo=' +
        (rows5.length > 0 ? rows5[0].b : '') +
        ' sem_frete=' +
        (rows5.length > 0 ? rows5[0].c : '') +
        ' liquido=' +
        (rows5.length > 0 ? rows5[0].d : ''),
    )
    for (let i = 0; i < rows2.length; i++) {
      console.log(
        '[DEBUG_AUGUST GROUP] ' +
          rows2[i].a +
          ' | ' +
          rows2[i].b +
          ' | sum=' +
          rows2[i].c +
          ' | count=' +
          rows2[i].d,
      )
    }

    console.log('[update_base_flags] Iniciando atualização de base flags na inicialização...')

    // UPDATE 1: Todas as vendas vieram da RacNew
    $app.db().newQuery('UPDATE vendas SET tem_racnew = 1').execute()

    // UPDATE 2: Vendas que possuem documento netsales
    $app
      .db()
      .newQuery(
        "UPDATE vendas SET tem_netsales = 1 WHERE numero_documento_netsales IS NOT NULL AND numero_documento_netsales != ''",
      )
      .execute()

    // Contagem de registros com flags ativas
    const racnewCountRows = arrayOf(new DynamicModel({ c: 0 }))
    $app.db().newQuery('SELECT COUNT(*) as c FROM vendas WHERE tem_racnew = 1').all(racnewCountRows)
    const racnewCount = racnewCountRows.length > 0 ? racnewCountRows[0].c : 0

    const netsalesCountRows = arrayOf(new DynamicModel({ c: 0 }))
    $app
      .db()
      .newQuery('SELECT COUNT(*) as c FROM vendas WHERE tem_netsales = 1')
      .all(netsalesCountRows)
    const netsalesCount = netsalesCountRows.length > 0 ? netsalesCountRows[0].c : 0

    const totalCountRows = arrayOf(new DynamicModel({ c: 0 }))
    $app.db().newQuery('SELECT COUNT(*) as c FROM vendas').all(totalCountRows)
    const totalCount = totalCountRows.length > 0 ? totalCountRows[0].c : 0

    console.log(
      '[update_base_flags] Atualização concluída com sucesso. Total vendas: ' +
        totalCount +
        ' | tem_racnew: ' +
        racnewCount +
        ' | tem_netsales: ' +
        netsalesCount,
    )
  } catch (err) {
    console.log(
      '[update_base_flags] Erro ao atualizar flags: ' + (err && err.message ? err.message : err),
    )
  }
})

// 2. Rota GET para disparo manual se necessário
routerAdd('POST', '/api/debug-august-stats', (e) => {
  const rows = arrayOf(new DynamicModel({ a: '', b: '', c: '', d: '' }))
  $app
    .db()
    .newQuery(
      "SELECT COALESCE(SUM(total_linha),0) as a, COUNT(*) as b, COALESCE(SUM(CASE WHEN total_linha > 0 THEN total_linha ELSE 0 END),0) as c, COALESCE(SUM(CASE WHEN total_linha < 0 THEN total_linha ELSE 0 END),0) as d FROM vendas WHERE data_lancamento >= '2026-08-01' AND data_lancamento <= '2026-08-31'",
    )
    .all(rows)

  const rows2 = arrayOf(new DynamicModel({ a: '', b: '', c: '', d: '' }))
  $app
    .db()
    .newQuery(
      "SELECT utilizacao as a, tipo_documento as b, COALESCE(SUM(total_linha),0) as c, COUNT(*) as d FROM vendas WHERE data_lancamento >= '2026-08-01' AND data_lancamento <= '2026-08-31' GROUP BY utilizacao, tipo_documento ORDER BY 3 DESC",
    )
    .all(rows2)

  const rows3 = arrayOf(new DynamicModel({ a: '', b: '', c: '', d: '' }))
  $app
    .db()
    .newQuery(
      "SELECT COALESCE(SUM(total_linha),0) as a, COUNT(*) as b FROM vendas WHERE data_lancamento >= '2026-08-01' AND data_lancamento <= '2026-08-31' AND utilizacao = 'VENDA DE MERCADORIA'",
    )
    .all(rows3)

  const tipoDocBreakdown = arrayOf(new DynamicModel({ a: '', b: '', c: '' }))
  $app
    .db()
    .newQuery(
      "SELECT tipo_documento as a, SUM(total_linha) as b, COUNT(*) as c FROM vendas WHERE data_lancamento >= '2026-08-01' AND data_lancamento <= '2026-08-31' GROUP BY tipo_documento",
    )
    .all(tipoDocBreakdown)

  const netsalesBreakdown = arrayOf(new DynamicModel({ a: '', b: '', c: '', d: '' }))
  $app
    .db()
    .newQuery(
      "SELECT COALESCE(SUM(valor_mercadoria),0) as a, COALESCE(SUM(total_nf_novo),0) as b, COALESCE(SUM(total_nf_sem_frete),0) as c, COALESCE(SUM(valor_liquido),0) as d FROM netsales WHERE docdate >= '2026-08-01' AND docdate <= '2026-08-31'",
    )
    .all(netsalesBreakdown)

  // Test what combination of filters gives ~4.747.242,03
  // E.g. what if tipo_documento = 'NF de Saída' or 'Entrega' or utilizacao IN ('VENDA DE MERCADORIA') or netsales?
  const test1 = arrayOf(new DynamicModel({ a: '' }))
  $app
    .db()
    .newQuery(
      "SELECT SUM(total_linha) as a FROM vendas WHERE data_lancamento >= '2026-08-01' AND data_lancamento <= '2026-08-31' AND tipo_documento = 'NF de Saída'",
    )
    .all(test1)

  const test2 = arrayOf(new DynamicModel({ a: '' }))
  $app
    .db()
    .newQuery(
      "SELECT SUM(total_linha) as a FROM vendas WHERE data_lancamento >= '2026-08-01' AND data_lancamento <= '2026-08-31' AND tipo_documento = 'Entrega'",
    )
    .all(test2)

  const test3 = arrayOf(new DynamicModel({ a: '' }))
  $app
    .db()
    .newQuery(
      "SELECT SUM(total_linha) as a FROM vendas WHERE data_lancamento >= '2026-08-01' AND data_lancamento <= '2026-08-31' AND tipo_documento IN ('Entrega', 'NF de Saída') AND utilizacao = 'VENDA DE MERCADORIA'",
    )
    .all(test3)

  const test4 = arrayOf(new DynamicModel({ a: '' }))
  $app
    .db()
    .newQuery(
      "SELECT SUM(total_linha) as a FROM vendas WHERE data_lancamento >= '2026-08-01' AND data_lancamento <= '2026-08-31' AND tipo_documento = 'Entrega' AND utilizacao = 'VENDA DE MERCADORIA'",
    )
    .all(test4)

  const test5 = arrayOf(new DynamicModel({ a: '' }))
  $app
    .db()
    .newQuery(
      "SELECT SUM(total_linha) as a FROM vendas WHERE data_lancamento >= '2026-08-01' AND data_lancamento <= '2026-08-31' AND tipo_documento = 'NF de Saída' AND utilizacao = 'VENDA DE MERCADORIA'",
    )
    .all(test5)

  return e.json(200, {
    total: rows.length > 0 ? rows[0] : null,
    venda_mercadoria: rows3.length > 0 ? rows3[0] : null,
    tipoDocBreakdown: tipoDocBreakdown,
    groups: rows2,
    netsalesBreakdown: netsalesBreakdown,
    test_NF_de_Saida: test1.length > 0 ? test1[0].a : null,
    test_Entrega: test2.length > 0 ? test2[0].a : null,
    test_Entrega_e_NFSaida_VendaMercadoria: test3.length > 0 ? test3[0].a : null,
    test_Entrega_VendaMercadoria: test4.length > 0 ? test4[0].a : null,
    test_NFSaida_VendaMercadoria: test5.length > 0 ? test5[0].a : null,
  })
})

routerAdd('GET', '/api/debug-august-stats', (e) => {
  const rows = arrayOf(new DynamicModel({ a: '', b: '', c: '', d: '' }))
  $app
    .db()
    .newQuery(
      "SELECT COALESCE(SUM(total_linha),0) as a, COUNT(*) as b, COALESCE(SUM(CASE WHEN total_linha > 0 THEN total_linha ELSE 0 END),0) as c, COALESCE(SUM(CASE WHEN total_linha < 0 THEN total_linha ELSE 0 END),0) as d FROM vendas WHERE data_lancamento >= '2026-08-01' AND data_lancamento <= '2026-08-31'",
    )
    .all(rows)

  const rows2 = arrayOf(new DynamicModel({ a: '', b: '', c: '', d: '' }))
  $app
    .db()
    .newQuery(
      "SELECT utilizacao as a, tipo_documento as b, COALESCE(SUM(total_linha),0) as c, COUNT(*) as d FROM vendas WHERE data_lancamento >= '2026-08-01' AND data_lancamento <= '2026-08-31' GROUP BY utilizacao, tipo_documento ORDER BY 3 DESC",
    )
    .all(rows2)

  const rows3 = arrayOf(new DynamicModel({ a: '', b: '', c: '', d: '' }))
  $app
    .db()
    .newQuery(
      "SELECT COALESCE(SUM(total_linha),0) as a, COUNT(*) as b FROM vendas WHERE data_lancamento >= '2026-08-01' AND data_lancamento <= '2026-08-31' AND utilizacao = 'VENDA DE MERCADORIA'",
    )
    .all(rows3)

  const tipoDocBreakdown = arrayOf(new DynamicModel({ a: '', b: '', c: '' }))
  $app
    .db()
    .newQuery(
      "SELECT tipo_documento as a, SUM(total_linha) as b, COUNT(*) as c FROM vendas WHERE data_lancamento >= '2026-08-01' AND data_lancamento <= '2026-08-31' GROUP BY tipo_documento",
    )
    .all(tipoDocBreakdown)

  const test1 = arrayOf(new DynamicModel({ a: '' }))
  $app
    .db()
    .newQuery(
      "SELECT SUM(total_linha) as a FROM vendas WHERE data_lancamento >= '2026-08-01' AND data_lancamento <= '2026-08-31' AND tipo_documento = 'NF de Saída'",
    )
    .all(test1)

  const test2 = arrayOf(new DynamicModel({ a: '' }))
  $app
    .db()
    .newQuery(
      "SELECT SUM(total_linha) as a FROM vendas WHERE data_lancamento >= '2026-08-01' AND data_lancamento <= '2026-08-31' AND tipo_documento = 'Entrega'",
    )
    .all(test2)

  const test3 = arrayOf(new DynamicModel({ a: '' }))
  $app
    .db()
    .newQuery(
      "SELECT SUM(total_linha) as a FROM vendas WHERE data_lancamento >= '2026-08-01' AND data_lancamento <= '2026-08-31' AND tipo_documento IN ('Entrega', 'NF de Saída') AND utilizacao = 'VENDA DE MERCADORIA'",
    )
    .all(test3)

  const test4 = arrayOf(new DynamicModel({ a: '' }))
  $app
    .db()
    .newQuery(
      "SELECT SUM(total_linha) as a FROM vendas WHERE data_lancamento >= '2026-08-01' AND data_lancamento <= '2026-08-31' AND tipo_documento = 'Entrega' AND utilizacao = 'VENDA DE MERCADORIA'",
    )
    .all(test4)

  const test5 = arrayOf(new DynamicModel({ a: '' }))
  $app
    .db()
    .newQuery(
      "SELECT SUM(total_linha) as a FROM vendas WHERE data_lancamento >= '2026-08-01' AND data_lancamento <= '2026-08-31' AND tipo_documento = 'NF de Saída' AND utilizacao = 'VENDA DE MERCADORIA'",
    )
    .all(test5)

  // Find exact sum = 4747242.03 across all combinations of tipo_documento / utilizacao
  const comboSql = `
    SELECT 
      SUM(CASE WHEN tipo_documento = 'Entrega' THEN total_linha ELSE 0 END) as entrega_all,
      SUM(CASE WHEN tipo_documento = 'NF de Saída' THEN total_linha ELSE 0 END) as nf_saida_all,
      SUM(CASE WHEN tipo_documento = 'Entrega' AND utilizacao = 'VENDA DE MERCADORIA' THEN total_linha ELSE 0 END) as entrega_vm,
      SUM(CASE WHEN tipo_documento = 'NF de Saída' AND utilizacao = 'VENDA DE MERCADORIA' THEN total_linha ELSE 0 END) as nf_saida_vm,
      SUM(CASE WHEN tipo_documento = 'Entrega' AND (utilizacao = 'VENDA DE MERCADORIA' OR utilizacao = 'VENDA CONSUMO') THEN total_linha ELSE 0 END) as entrega_vm_vc
    FROM vendas WHERE data_lancamento >= '2026-08-01' AND data_lancamento <= '2026-08-31'
  `
  const combos = arrayOf(
    new DynamicModel({
      entrega_all: '',
      nf_saida_all: '',
      entrega_vm: '',
      nf_saida_vm: '',
      entrega_vm_vc: '',
    }),
  )
  $app.db().newQuery(comboSql).all(combos)

  if (combos.length > 0) {
    console.log(
      '[DEBUG_COMBOS] entrega_all=' +
        combos[0].entrega_all +
        ' | nf_saida_all=' +
        combos[0].nf_saida_all +
        ' | entrega_vm=' +
        combos[0].entrega_vm +
        ' | nf_saida_vm=' +
        combos[0].nf_saida_vm +
        ' | entrega_vm_vc=' +
        combos[0].entrega_vm_vc,
    )
  }

  return e.json(200, {
    total: rows.length > 0 ? rows[0] : null,
    venda_mercadoria: rows3.length > 0 ? rows3[0] : null,
    tipoDocBreakdown: tipoDocBreakdown,
    groups: rows2,
    combos: combos.length > 0 ? combos[0] : null,
  })
})

routerAdd('GET', '/api/debug-august-stats-old', (e) => {
  const rows = arrayOf(new DynamicModel({ a: '', b: '', c: '', d: '' }))
  $app
    .db()
    .newQuery(
      "SELECT COALESCE(SUM(total_linha),0) as a, COUNT(*) as b, COALESCE(SUM(CASE WHEN total_linha > 0 THEN total_linha ELSE 0 END),0) as c, COALESCE(SUM(CASE WHEN total_linha < 0 THEN total_linha ELSE 0 END),0) as d FROM vendas WHERE data_lancamento >= '2026-08-01' AND data_lancamento <= '2026-08-31'",
    )
    .all(rows)

  const rows2 = arrayOf(new DynamicModel({ a: '', b: '', c: '', d: '' }))
  $app
    .db()
    .newQuery(
      "SELECT utilizacao as a, tipo_documento as b, COALESCE(SUM(total_linha),0) as c, COUNT(*) as d FROM vendas WHERE data_lancamento >= '2026-08-01' AND data_lancamento <= '2026-08-31' GROUP BY utilizacao, tipo_documento",
    )
    .all(rows2)

  const rows3 = arrayOf(new DynamicModel({ a: '', b: '', c: '', d: '' }))
  $app
    .db()
    .newQuery(
      "SELECT COALESCE(SUM(total_linha),0) as a, COUNT(*) as b FROM vendas WHERE data_lancamento >= '2026-08-01' AND data_lancamento <= '2026-08-31' AND utilizacao = 'VENDA DE MERCADORIA'",
    )
    .all(rows3)

  const rows4 = arrayOf(new DynamicModel({ a: '', b: '', c: '', d: '' }))
  $app
    .db()
    .newQuery(
      "SELECT COALESCE(SUM(total_linha),0) as a, COUNT(*) as b FROM racnew WHERE data_lancamento >= '2026-08-01' AND data_lancamento <= '2026-08-31'",
    )
    .all(rows4)

  const rows5 = arrayOf(new DynamicModel({ a: '', b: '', c: '', d: '' }))
  $app
    .db()
    .newQuery(
      "SELECT COALESCE(SUM(valor_mercadoria),0) as a, COALESCE(SUM(total_nf_novo),0) as b, COALESCE(SUM(total_nf_sem_frete),0) as c, COALESCE(SUM(valor_liquido),0) as d FROM netsales WHERE docdate >= '2026-08-01' AND docdate <= '2026-08-31'",
    )
    .all(rows5)

  console.log('[DEBUG_AUGUST] Vendas Total: ' + JSON.stringify(rows[0]))
  console.log('[DEBUG_AUGUST] Vendas Venda Mercadoria: ' + JSON.stringify(rows3[0]))
  console.log('[DEBUG_AUGUST] RacNew Total: ' + JSON.stringify(rows4[0]))
  console.log('[DEBUG_AUGUST] NetSales: ' + JSON.stringify(rows5[0]))
  for (let i = 0; i < rows2.length; i++) {
    console.log(
      '[DEBUG_AUGUST GROUP] ' +
        rows2[i].a +
        ' | ' +
        rows2[i].b +
        ' | sum=' +
        rows2[i].c +
        ' | count=' +
        rows2[i].d,
    )
  }

  return e.json(200, {
    total: rows.length > 0 ? rows[0] : null,
    venda_mercadoria: rows3.length > 0 ? rows3[0] : null,
    racnew: rows4.length > 0 ? rows4[0] : null,
    netsales: rows5.length > 0 ? rows5[0] : null,
    groups: rows2,
  })
})

routerAdd('GET', '/api/update-base-flags', (e) => {
  try {
    if (!$app.hasTable('vendas')) {
      return e.json(404, {
        success: false,
        message: 'Tabela vendas não encontrada.',
      })
    }

    // UPDATE 1: Todas as vendas vieram da RacNew
    $app.db().newQuery('UPDATE vendas SET tem_racnew = 1').execute()

    // UPDATE 2: Vendas com documento netsales
    $app
      .db()
      .newQuery(
        "UPDATE vendas SET tem_netsales = 1 WHERE numero_documento_netsales IS NOT NULL AND numero_documento_netsales != ''",
      )
      .execute()

    const racnewCountRows = arrayOf(new DynamicModel({ c: 0 }))
    $app.db().newQuery('SELECT COUNT(*) as c FROM vendas WHERE tem_racnew = 1').all(racnewCountRows)
    const racnewCount = racnewCountRows.length > 0 ? racnewCountRows[0].c : 0

    const netsalesCountRows = arrayOf(new DynamicModel({ c: 0 }))
    $app
      .db()
      .newQuery('SELECT COUNT(*) as c FROM vendas WHERE tem_netsales = 1')
      .all(netsalesCountRows)
    const netsalesCount = netsalesCountRows.length > 0 ? netsalesCountRows[0].c : 0

    const totalCountRows = arrayOf(new DynamicModel({ c: 0 }))
    $app.db().newQuery('SELECT COUNT(*) as c FROM vendas').all(totalCountRows)
    const totalCount = totalCountRows.length > 0 ? totalCountRows[0].c : 0

    console.log(
      '[api/update-base-flags] Flags atualizadas via endpoint. Total: ' +
        totalCount +
        ' | racnew: ' +
        racnewCount +
        ' | netsales: ' +
        netsalesCount,
    )

    return e.json(200, {
      success: true,
      message: 'Flags de base atualizadas com sucesso.',
      total_vendas: totalCount,
      tem_racnew: racnewCount,
      tem_netsales: netsalesCount,
    })
  } catch (err) {
    console.log('[api/update-base-flags] Erro: ' + (err && err.message ? err.message : err))
    return e.json(500, {
      success: false,
      message: 'Erro ao atualizar flags: ' + (err && err.message ? err.message : err),
    })
  }
})
