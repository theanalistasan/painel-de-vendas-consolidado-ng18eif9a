// Helper global: filtro "Tipo de Cliente" (bug 0.0.372)
//
// O campo tipo_cliente local de vendas / pedidos_abertos NÃO é populado — a
// fonte de verdade é a coleção tipos_cliente (coluna Característica da
// planilha SAP), carregada pelo importador Tipos de Cliente (UPSERT por
// codigo_pn). Filtrar direto pelo campo local zera todos os resultados.
//
// Este helper monta a cláusula SQL que resolve o filtro via subconsulta em
// tipos_cliente, normalizando os dois lados (TRIM + UPPER):
//
//   UPPER(TRIM(codigo_cliente)) IN (
//     SELECT UPPER(TRIM(COALESCE(codigo_pn, ''))) FROM tipos_cliente
//     WHERE UPPER(TRIM(COALESCE(tipo_cliente, ''))) IN ('ATA', 'REVENDA', ...)
//   )
//
// - Subconsulta não correlacionada: o SQLite materializa o resultado uma
//   única vez (com índice efêmero), independentemente do volume de
//   tipos_cliente (milhares de registros) — sem lista gigante de literais.
// - "Sem informação"/"VAZIO"/"SEM TIPO" seleciona clientes SEM tipo
//   cadastrado (código fora de tipos_cliente ou vazio).
// - Filtro ativo sem nenhum tipo válido → "1 = 0" (zero linhas, nunca erro).
// - Em caso de falha na montagem, retorna '' (filtro não aplicado) para não
//   derrubar o endpoint — o comportamento cai para o total geral.
//
// Uso nos handlers (execução em tempo de requisição, após o load de todos
// os arquivos pb_hooks — a ordem alfabética de carga não importa):
//
//   const tcClause = globalThis.__tipoClienteFiltro.buildClause($app, f.tipoCliente)
//   if (tcClause) whereClauses.push(tcClause)

;(function () {
  var norm = function (v) {
    return String(v == null ? '' : v)
      .trim()
      .toUpperCase()
  }
  var esc = function (s) {
    return String(s).replace(/'/g, "''")
  }
  var isSemInfo = function (v) {
    return v === 'SEM INFORMACAO' || v === 'SEM INFORMAÇÃO' || v === 'VAZIO' || v === 'SEM TIPO'
  }

  // Subconsulta de códigos por tipo (usada nas duas variantes da cláusula)
  var codigosSubquery = function (tipos) {
    var inList = []
    for (var i = 0; i < tipos.length; i++) {
      inList.push("'" + esc(tipos[i]) + "'")
    }
    return (
      "SELECT UPPER(TRIM(COALESCE(codigo_pn, ''))) FROM tipos_cliente " +
      "WHERE COALESCE(tipo_cliente, '') != '' " +
      "AND UPPER(TRIM(COALESCE(tipo_cliente, ''))) IN (" +
      inList.join(',') +
      ')'
    )
  }

  // Subconsulta de TODOS os códigos com tipo cadastrado (para "Sem informação")
  var todosComTipoSubquery =
    "SELECT UPPER(TRIM(COALESCE(codigo_pn, ''))) FROM tipos_cliente " +
    "WHERE COALESCE(tipo_cliente, '') != '' " +
    "AND COALESCE(codigo_pn, '') != ''"

  // Monta a cláusula para consultas sobre tabelas com a coluna codigo_cliente
  // (vendas, resumo_vendas_mensal, pedidos_abertos, estoque_sap...).
  // Retorna '' quando o filtro não se aplica.
  var buildClause = function (app, tipoClienteFilter) {
    try {
      var vals = Array.isArray(tipoClienteFilter)
        ? tipoClienteFilter
        : tipoClienteFilter
          ? [tipoClienteFilter]
          : []
      var tipos = []
      var semInfo = false
      for (var i = 0; i < vals.length; i++) {
        var v = norm(vals[i])
        if (!v || v === 'TODOS') continue
        if (isSemInfo(v)) {
          semInfo = true
          continue
        }
        if (tipos.indexOf(v) === -1) tipos.push(v)
      }
      if (tipos.length === 0 && !semInfo) return ''

      var conds = []
      if (tipos.length > 0) {
        conds.push('UPPER(TRIM(codigo_cliente)) IN (' + codigosSubquery(tipos) + ')')
      }
      if (semInfo) {
        conds.push(
          "(codigo_cliente IS NULL OR codigo_cliente = '' OR UPPER(TRIM(codigo_cliente)) NOT IN (" +
            todosComTipoSubquery +
            '))',
        )
      }
      if (conds.length === 0) return '1 = 0'
      return '(' + conds.join(' OR ') + ')'
    } catch (tcfErr) {
      console.warn('tipo_cliente_filtro: falha ao montar cláusula:', tcfErr)
      return ''
    }
  }

  if (typeof globalThis.__tipoClienteFiltro === 'undefined' || !globalThis.__tipoClienteFiltro) {
    globalThis.__tipoClienteFiltro = { buildClause: buildClause }
  }
})()
