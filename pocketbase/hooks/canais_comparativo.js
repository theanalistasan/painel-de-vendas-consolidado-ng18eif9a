// Hook: POST /backend/v1/canais/comparativo-mes
// Agrega e compara o faturamento por canal de vendas entre o mês selecionado e o mesmo mês do ano anterior.
// Respeita todos os filtros dimensionais da página (canais, clientes, deploy, inside, vendedor, estado, etc.)

routerAdd('POST', '/backend/v1/canais/comparativo-mes', function (e) {
  var startTime = Date.now()

  try {
    var body = {}
    try {
      body = e.requestInfo().body || {}
    } catch (_) {
      body = {}
    }

    var f = body.filters || {}

    function sqlEsc(s) {
      return String(s).replace(/'/g, "''")
    }

    function toNum(v) {
      var n = parseFloat(v)
      return isNaN(n) ? 0 : n
    }

    var monthNames = [
      'Jan',
      'Fev',
      'Mar',
      'Abr',
      'Mai',
      'Jun',
      'Jul',
      'Ago',
      'Set',
      'Out',
      'Nov',
      'Dez',
    ]
    var monthFullNames = [
      'Janeiro',
      'Fevereiro',
      'Março',
      'Abril',
      'Maio',
      'Junho',
      'Julho',
      'Agosto',
      'Setembro',
      'Outubro',
      'Novembro',
      'Dezembro',
    ]

    // 1. Determina Ano e Mês de referência (Mês Atual / Selecionado)
    var anoAtual = null
    var mesAtual = null

    if (body.ano) {
      anoAtual = parseInt(body.ano, 10)
    } else if (f.ano && f.ano.length > 0) {
      anoAtual = parseInt(f.ano[0], 10)
    }

    if (body.mes) {
      mesAtual = parseInt(body.mes, 10)
    } else if (f.mes && f.mes.length > 0) {
      mesAtual = parseInt(f.mes[0], 10)
    }

    // Se não especificado, busca o último ano/mês com dados no resumo
    if (!anoAtual || !mesAtual || isNaN(anoAtual) || isNaN(mesAtual)) {
      try {
        var maxRows = arrayOf(new DynamicModel({ max_ym: '' }))
        $app
          .db()
          .newQuery(
            "SELECT COALESCE(MAX(ano_mes), '2026-08') AS max_ym FROM resumo_vendas_mensal WHERE ano_mes >= '2015-01'",
          )
          .all(maxRows)
        if (maxRows.length > 0 && maxRows[0].max_ym && maxRows[0].max_ym.indexOf('-') >= 0) {
          var ymParts = maxRows[0].max_ym.split('-')
          if (!anoAtual || isNaN(anoAtual)) anoAtual = parseInt(ymParts[0], 10) || 2026
          if (!mesAtual || isNaN(mesAtual)) mesAtual = parseInt(ymParts[1], 10) || 8
        }
      } catch (_) {
        if (!anoAtual || isNaN(anoAtual)) anoAtual = 2026
        if (!mesAtual || isNaN(mesAtual)) mesAtual = 8
      }
    }

    var anoAnterior = anoAtual - 1
    var mesAnterior = mesAtual

    var mesAtualStr = String(mesAtual).padStart(2, '0')
    var ymAtual = anoAtual + '-' + mesAtualStr
    var ymAnterior = anoAnterior + '-' + mesAtualStr

    var mesLabelAtual = monthNames[mesAtual - 1] + '/' + anoAtual
    var mesLabelAnterior = monthNames[mesAnterior - 1] + '/' + anoAnterior
    var mesNomeCompletoAtual = monthFullNames[mesAtual - 1] + ' de ' + anoAtual
    var mesNomeCompletoAnterior = monthFullNames[mesAnterior - 1] + ' de ' + anoAnterior

    // 2. Monta mapa de Canais Oficiais (canais_clientes com eh_canal = true)
    var ccMapRows = arrayOf(
      new DynamicModel({
        codigo_cliente: '',
        nome_cliente: '',
        nome_canal: '',
        deploy: '',
      }),
    )

    $app
      .db()
      .newQuery(
        "SELECT DISTINCT COALESCE(codigo_cliente,'') AS codigo_cliente, " +
          "COALESCE(nome_cliente,'') AS nome_cliente, " +
          "COALESCE(nome_canal,'') AS nome_canal, " +
          "COALESCE(deploy,'') AS deploy " +
          "FROM canais_clientes WHERE (eh_canal = 1 OR eh_canal = 'true' OR eh_canal = 'SIM' OR eh_canal = 'Sim' OR eh_canal = 's') " +
          "AND nome_canal IS NOT NULL AND nome_canal != ''",
      )
      .all(ccMapRows)

    var codToCanalMap = {}
    var nomToCanalMap = {}
    var todosCanaisLista = []
    var canaisVistos = {}

    for (var i = 0; i < ccMapRows.length; i++) {
      var cod = (ccMapRows[i].codigo_cliente || '').trim()
      var nom = (ccMapRows[i].nome_cliente || '').trim().toUpperCase()
      var canal = (ccMapRows[i].nome_canal || '').trim()
      var dep = (ccMapRows[i].deploy || '').trim().toUpperCase()
      if (dep.indexOf('AGIS') >= 0) dep = 'AGIS'
      else if (dep.indexOf('ROLAND') >= 0) dep = 'ROLAND'
      else dep = 'Nenhum'

      if (canal) {
        if (!canaisVistos[canal]) {
          canaisVistos[canal] = true
          todosCanaisLista.push(canal)
        }
        if (cod && cod !== '-') {
          if (!codToCanalMap[cod]) codToCanalMap[cod] = []
          var existsCod = codToCanalMap[cod].some(function (item) {
            return item.canal === canal
          })
          if (!existsCod) codToCanalMap[cod].push({ canal: canal, deploy: dep })
        }
        if (nom) {
          if (!nomToCanalMap[nom]) nomToCanalMap[nom] = []
          var existsNom = nomToCanalMap[nom].some(function (item) {
            return item.canal === canal
          })
          if (!existsNom) nomToCanalMap[nom].push({ canal: canal, deploy: dep })
        }
      }
    }

    // 3. Monta filtros dimensionais para a consulta dos dois meses (ymAtual e ymAnterior)
    var sqlParts = []
    sqlParts.push("ano_mes IN ('" + sqlEsc(ymAtual) + "', '" + sqlEsc(ymAnterior) + "')")

    // Filtros de base
    if (f.base === 'racnew') {
      sqlParts.push('tem_netsales = 0')
    } else if (f.base === 'netsales') {
      sqlParts.push('tem_netsales = 1')
    }

    // Filtros de canais (canal, canalClientes, deploy, inside)
    var canaisFilter = Array.isArray(f.canal) ? f.canal : f.canal ? [f.canal] : []
    var canalClientesFilter = Array.isArray(f.canalClientes)
      ? f.canalClientes
      : f.canalClientes
        ? [f.canalClientes]
        : []
    var deployFilter = Array.isArray(f.deploy) ? f.deploy : f.deploy ? [f.deploy] : []
    var insideFilter = Array.isArray(f.inside) ? f.inside : f.inside ? [f.inside] : []

    var hasCanalFilter = canaisFilter.length > 0
    var hasCanalClientesFilter = canalClientesFilter.length > 0
    var hasDeployFilter = deployFilter.length > 0 && !deployFilter.includes('TODOS')
    var hasInsideFilter = insideFilter.length > 0

    if (hasCanalFilter || hasCanalClientesFilter || hasDeployFilter || hasInsideFilter) {
      var ccWhereClauses = [
        "(eh_canal = 1 OR eh_canal = 'true' OR eh_canal = 'SIM' OR eh_canal = 'Sim' OR eh_canal = 's')",
      ]

      if (hasCanalFilter) {
        var canaisSqlList = canaisFilter
          .map(function (c) {
            return "'" + sqlEsc(c) + "'"
          })
          .join(',')
        ccWhereClauses.push('nome_canal IN (' + canaisSqlList + ')')
      }

      if (hasCanalClientesFilter) {
        var clisSqlList = canalClientesFilter
          .map(function (c) {
            return "'" + sqlEsc(c) + "'"
          })
          .join(',')
        ccWhereClauses.push('nome_cliente IN (' + clisSqlList + ')')
      }

      if (hasDeployFilter) {
        var depConditions = []
        for (var d = 0; d < deployFilter.length; d++) {
          var rawDep = String(deployFilter[d]).trim()
          var depUpper = rawDep.toUpperCase()
          if (depUpper === 'AGIS' || depUpper.indexOf('AGIS') >= 0) {
            depConditions.push("UPPER(deploy) LIKE '%AGIS%'")
          } else if (depUpper === 'ROLAND' || depUpper.indexOf('ROLAND') >= 0) {
            depConditions.push("UPPER(deploy) LIKE '%ROLAND%'")
          } else if (depUpper === 'NENHUM' || depUpper === 'SEM DEPLOY' || depUpper === 'VAZIO') {
            depConditions.push(
              "(deploy IS NULL OR deploy = '' OR UPPER(deploy) = 'NENHUM' OR UPPER(deploy) = 'SEM DEPLOY')",
            )
          }
        }
        if (depConditions.length > 0) {
          ccWhereClauses.push('(' + depConditions.join(' OR ') + ')')
        }
      }

      if (hasInsideFilter) {
        var insideSqlList = insideFilter
          .map(function (ins) {
            return "'" + sqlEsc(String(ins).trim().toUpperCase()) + "'"
          })
          .join(',')
        ccWhereClauses.push("UPPER(TRIM(COALESCE(inside, ''))) IN (" + insideSqlList + ')')
      }

      var ccQuerySql =
        'SELECT DISTINCT codigo_cliente AS cc, nome_cliente AS nc FROM canais_clientes WHERE ' +
        ccWhereClauses.join(' AND ')
      var matchedRows = arrayOf(new DynamicModel({ cc: '', nc: '' }))
      $app.db().newQuery(ccQuerySql).all(matchedRows)

      var matchedCodigos = []
      var matchedNomes = []
      for (var k = 0; k < matchedRows.length; k++) {
        var cCod = (matchedRows[k].cc || '').trim()
        var cNom = (matchedRows[k].nc || '').trim()
        if (cCod && cCod !== '-') matchedCodigos.push(cCod)
        if (cNom) matchedNomes.push(cNom)
      }

      if (matchedCodigos.length > 0 || matchedNomes.length > 0) {
        var subClauses = []
        if (matchedCodigos.length > 0) {
          var codSqlIn = matchedCodigos
            .map(function (c) {
              return "'" + sqlEsc(c) + "'"
            })
            .join(',')
          subClauses.push('codigo_cliente IN (' + codSqlIn + ')')
        }
        if (matchedNomes.length > 0) {
          var nomSqlIn = matchedNomes
            .map(function (n) {
              return "'" + sqlEsc(n) + "'"
            })
            .join(',')
          subClauses.push('nome_cliente IN (' + nomSqlIn + ')')
        }
        sqlParts.push('(' + subClauses.join(' OR ') + ')')
      } else {
        sqlParts.push('1=0')
      }
    }

    // Filtros de dimensões adicionais
    if (Array.isArray(f.vendedorCliente) && f.vendedorCliente.length > 0) {
      var arrVC = f.vendedorCliente
        .map(function (v) {
          return "'" + sqlEsc(v) + "'"
        })
        .join(',')
      sqlParts.push('vendedor_cliente IN (' + arrVC + ')')
    }
    if (Array.isArray(f.vendedor) && f.vendedor.length > 0) {
      var arrV = f.vendedor
        .map(function (v) {
          return "'" + sqlEsc(v) + "'"
        })
        .join(',')
      sqlParts.push('nome_vendedor IN (' + arrV + ')')
    }
    if (Array.isArray(f.grupoItem) && f.grupoItem.length > 0) {
      var arrGI = f.grupoItem
        .map(function (v) {
          return "'" + sqlEsc(String(v).toUpperCase().trim()) + "'"
        })
        .join(',')
      sqlParts.push('UPPER(TRIM(grupo_item)) IN (' + arrGI + ')')
    }
    if (Array.isArray(f.estado) && f.estado.length > 0) {
      var arrUF = f.estado
        .map(function (v) {
          return "'" + sqlEsc(v) + "'"
        })
        .join(',')
      sqlParts.push('estado IN (' + arrUF + ')')
    }
    if (Array.isArray(f.utilizacao) && f.utilizacao.length > 0) {
      var arrUt = f.utilizacao
        .map(function (v) {
          return "'" + sqlEsc(v) + "'"
        })
        .join(',')
      sqlParts.push('utilizacao IN (' + arrUt + ')')
    }
    if (Array.isArray(f.tipoDocumento) && f.tipoDocumento.length > 0) {
      var arrTD = f.tipoDocumento
        .map(function (v) {
          return "'" + sqlEsc(v) + "'"
        })
        .join(',')
      sqlParts.push('tipo_documento IN (' + arrTD + ')')
    }

    // 4. Executa agregação por ano_mes, codigo_cliente, nome_cliente
    var whereClause = sqlParts.join(' AND ')
    var sqlQuery =
      "SELECT ano_mes AS ym, COALESCE(codigo_cliente,'') AS cc, COALESCE(nome_cliente,'') AS nc, " +
      'COALESCE(SUM(total_linha), 0) AS total ' +
      'FROM resumo_vendas_mensal WHERE ' +
      whereClause +
      ' GROUP BY ano_mes, codigo_cliente, nome_cliente'

    var salesRows = arrayOf(
      new DynamicModel({
        ym: '',
        cc: '',
        nc: '',
        total: '',
      }),
    )

    $app.db().newQuery(sqlQuery).all(salesRows)

    // 5. Agrega por Canal para Atual e Anterior
    var canaisData = {}
    var totalAtual = 0
    var totalAnterior = 0

    // Inicializa canais que já atendem o filtro ativo
    for (var ci = 0; ci < todosCanaisLista.length; ci++) {
      var cNome = todosCanaisLista[ci]
      if (hasCanalFilter && !canaisFilter.includes(cNome)) continue
      canaisData[cNome] = {
        canal: cNome,
        faturamentoAtual: 0,
        faturamentoAnterior: 0,
        clientesAtualSet: new Set(),
        clientesAnteriorSet: new Set(),
      }
    }

    for (var s = 0; s < salesRows.length; s++) {
      var ym = salesRows[s].ym
      var sCod = (salesRows[s].cc || '').trim()
      var sNom = (salesRows[s].nc || '').trim().toUpperCase()
      var val = toNum(salesRows[s].total)
      if (val === 0) continue

      var matches = codToCanalMap[sCod]
      if (!matches || matches.length === 0) {
        matches = nomToCanalMap[sNom]
      }

      if (matches && matches.length > 0) {
        var split = matches.length
        for (var m = 0; m < matches.length; m++) {
          var targetCanal = matches[m].canal
          if (hasCanalFilter && !canaisFilter.includes(targetCanal)) continue

          if (!canaisData[targetCanal]) {
            canaisData[targetCanal] = {
              canal: targetCanal,
              faturamentoAtual: 0,
              faturamentoAnterior: 0,
              clientesAtualSet: new Set(),
              clientesAnteriorSet: new Set(),
            }
          }

          var part = val / split
          var clientKey = sCod ? sCod : sNom

          if (ym === ymAtual) {
            canaisData[targetCanal].faturamentoAtual += part
            totalAtual += part
            canaisData[targetCanal].clientesAtualSet.add(clientKey)
          } else if (ym === ymAnterior) {
            canaisData[targetCanal].faturamentoAnterior += part
            totalAnterior += part
            canaisData[targetCanal].clientesAnteriorSet.add(clientKey)
          }
        }
      }
    }

    // 6. Formata a lista de canais ordenada por faturamento do mês atual (decrescente)
    var canaisList = []
    var canaisKeys = Object.keys(canaisData)

    for (var k = 0; k < canaisKeys.length; k++) {
      var cObj = canaisData[canaisKeys[k]]
      var fAtual = cObj.faturamentoAtual
      var fAnterior = cObj.faturamentoAnterior

      // Se ambos forem 0 e não houver filtro específico de canal, pode ignorar os sem nenhuma movimentação
      if (fAtual === 0 && fAnterior === 0 && !hasCanalFilter) {
        continue
      }

      var diff = fAtual - fAnterior
      var pct = null
      if (fAnterior > 0) {
        pct = Math.round(((fAtual - fAnterior) / fAnterior) * 1000) / 10
      } else if (fAnterior === 0 && fAtual > 0) {
        pct = 100.0 // novo faturamento sem base anterior
      } else if (fAnterior < 0 && fAtual > fAnterior) {
        pct = 100.0
      }

      canaisList.push({
        canal: cObj.canal,
        faturamentoAtual: Math.round(fAtual * 100) / 100,
        faturamentoAnterior: Math.round(fAnterior * 100) / 100,
        diff: Math.round(diff * 100) / 100,
        variacaoPercentual: pct,
        clientesAtual: cObj.clientesAtualSet.size,
        clientesAnterior: cObj.clientesAnteriorSet.size,
      })
    }

    // Ordena por faturamento do mês atual decrescente
    canaisList.sort(function (a, b) {
      if (b.faturamentoAtual !== a.faturamentoAtual) {
        return b.faturamentoAtual - a.faturamentoAtual
      }
      return b.faturamentoAnterior - a.faturamentoAnterior
    })

    var diffTotal = totalAtual - totalAnterior
    var variacaoTotal = null
    if (totalAnterior > 0) {
      variacaoTotal = Math.round(((totalAtual - totalAnterior) / totalAnterior) * 1000) / 10
    } else if (totalAnterior === 0 && totalAtual > 0) {
      variacaoTotal = 100.0
    }

    var result = {
      anoAtual: anoAtual,
      mesAtual: mesAtual,
      anoAnterior: anoAnterior,
      mesAnterior: mesAnterior,
      ymAtual: ymAtual,
      ymAnterior: ymAnterior,
      mesLabelAtual: mesLabelAtual,
      mesLabelAnterior: mesLabelAnterior,
      mesNomeCompletoAtual: mesNomeCompletoAtual,
      mesNomeCompletoAnterior: mesNomeCompletoAnterior,
      totalAtual: Math.round(totalAtual * 100) / 100,
      totalAnterior: Math.round(totalAnterior * 100) / 100,
      diffTotal: Math.round(diffTotal * 100) / 100,
      variacaoTotal: variacaoTotal,
      canais: canaisList,
    }

    return e.json(200, result)
  } catch (err) {
    console.error('canais_comparativo fatal error:', err)
    return e.json(500, {
      error: 'Erro interno ao processar comparativo de canais: ' + String(err),
    })
  }
})
