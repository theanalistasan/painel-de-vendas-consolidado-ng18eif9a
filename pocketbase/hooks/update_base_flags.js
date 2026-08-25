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
