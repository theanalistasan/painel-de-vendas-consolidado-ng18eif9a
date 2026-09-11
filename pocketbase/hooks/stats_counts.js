// Endpoint: GET /backend/v1/stats/counts
// Retorna a contagem REAL de registros de cada coleção individualmente,
// usando $app.countRecords (contagem autoritativa do banco, sem cache
// nem dependência de paginação do cliente).
routerAdd('GET', '/backend/v1/stats/counts', (e) => {
  const names = ['produtos', 'racnew', 'netsales', 'vendas']
  const counts = {}

  for (let i = 0; i < names.length; i++) {
    const n = names[i]
    try {
      counts[n] = $app.countRecords(n)
    } catch (_) {
      counts[n] = 0
    }
  }

  // Última data de carga das vendas consolidadas
  let ultimaCarga = ''
  try {
    const latest = arrayOf(new DynamicModel({ updated: '' }))
    $app.db().newQuery("SELECT COALESCE(MAX(updated), '') AS updated FROM vendas").all(latest)
    if (latest.length > 0) ultimaCarga = latest[0].updated || ''
  } catch (_) {}

  const result = {
    produtos: counts.produtos || 0,
    racnew: counts.racnew || 0,
    netsales: counts.netsales || 0,
    vendas: counts.vendas || 0,
    ultimaCarga: ultimaCarga,
  }

  return e.json(200, result)
})
