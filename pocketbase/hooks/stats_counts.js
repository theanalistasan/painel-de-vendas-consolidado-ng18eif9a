// Endpoint: GET /backend/v1/stats/counts
// Retorna a contagem REAL de registros de cada coleção individualmente,
// usando $app.countRecords (contagem autoritativa do banco, sem cache
// nem dependência de paginação do cliente).
routerAdd('GET', '/backend/v1/stats/counts', (e) => {
  const names = ['produtos', 'racnew', 'netsales', 'vendas', 'canais_clientes']
  const counts = {}

  for (let i = 0; i < names.length; i++) {
    const n = names[i]
    try {
      counts[n] = $app.countRecords(n)
    } catch (_) {
      counts[n] = 0
    }
  }

  // Última data de carga das vendas consolidadas (busca rápida indexada ou resumo)
  let ultimaCarga = ''
  try {
    const latest = arrayOf(new DynamicModel({ updated: '' }))
    $app
      .db()
      .newQuery(
        "SELECT updated FROM resumo_vendas_mensal WHERE updated IS NOT NULL AND updated != '' ORDER BY id DESC LIMIT 1",
      )
      .all(latest)
    if (latest.length > 0 && latest[0].updated) {
      ultimaCarga = latest[0].updated
    } else {
      $app
        .db()
        .newQuery(
          "SELECT updated FROM vendas WHERE updated IS NOT NULL AND updated != '' ORDER BY id DESC LIMIT 1",
        )
        .all(latest)
      if (latest.length > 0) ultimaCarga = latest[0].updated || ''
    }
  } catch (_) {}

  const result = {
    produtos: counts.produtos || 0,
    racnew: counts.racnew || 0,
    netsales: counts.netsales || 0,
    vendas: counts.vendas || 0,
    canais_clientes: counts.canais_clientes || 0,
    ultimaCarga: ultimaCarga,
  }

  return e.json(200, result)
})
