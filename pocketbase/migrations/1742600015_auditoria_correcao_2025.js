// 1742600015 — AUDITORIA (somente leitura) do ciclo de correção da duplicação
// da carga 2025. NÃO altera dados: recalcula e imprime nos logs do backend os
// números exigidos na prova do conserto:
//   1. Bruta netsales: total de linhas, chaves únicas (chave_documento+serial+
//      docdate+codigo_cliente+codigo_item) e duplicatas (extras).
//   2. Vendas: linhas e SUM(total_nf_novo) mensal de 2025, por data_carga da
//      reconsolidação (para mostrar antes/depois da 1742600014).
//   3. Vendas 2025: contagem por chave de dedupe (deve ser = 1).
//   4. NF 82812: código_item distintos por linha (prova da chave NF+item+valores).
//   5. Outros anos preservados: linhas de 2024 e 2026 em vendas.
//   6. Resumos regenerados: min/max de updated das 3 tabelas de resumo.
// Roda em milissegundos; é no-op em bases futuras (sem dados 2025).
migrate(
  (app) => {
    var TAG = '[1742600015]'
    var toInt = function (v) {
      const n = parseInt(v, 10)
      return isNaN(n) ? 0 : n
    }
    var toNum = function (v) {
      const n = parseFloat(v)
      return isNaN(n) ? 0.0 : n
    }
    var q = function (sql) {
      return app.db().newQuery(sql)
    }
    var rowsOf = function (sql, model) {
      const rows = arrayOf(new DynamicModel(model))
      q(sql).all(rows)
      return rows
    }
    var countOf = function (sql, model) {
      return toInt(rowsOf(sql, model)[0].c)
    }

    // ---------- 1. Bruta netsales ----------
    const totalBruta = toInt(
      rowsOf('SELECT CAST(COUNT(*) AS TEXT) AS c FROM netsales', { c: '' })[0].c,
    )
    const chavesUnicas = toInt(
      rowsOf(
        'SELECT CAST(COUNT(*) AS TEXT) AS c FROM (SELECT 1 FROM netsales GROUP BY chave_documento, serial, docdate, codigo_cliente, codigo_item)',
        { c: '' },
      )[0].c,
    )
    const dupBruta = totalBruta - chavesUnicas
    console.log(
      TAG +
        ' BRUTA netsales: total=' +
        totalBruta +
        ' chaves_unicas=' +
        chavesUnicas +
        ' duplicatas_extras=' +
        dupBruta,
    )

    // ---------- 2. Vendas 2025: mensal SUM(total_nf_novo) e contagem ----------
    const mensal = rowsOf(
      'SELECT substr(data_lancamento,1,7) AS ym, ' +
        'CAST(ROUND(COALESCE(SUM(total_nf_novo),0),2) AS TEXT) AS tot, ' +
        'CAST(COUNT(*) AS TEXT) AS n, MIN(data_carga) AS mn, MAX(data_carga) AS mx ' +
        "FROM vendas WHERE substr(data_lancamento,1,4)='2025' " +
        'GROUP BY substr(data_lancamento,1,7) ORDER BY ym',
      { ym: '', tot: '', n: '', mn: '', mx: '' },
    )
    for (let i = 0; i < mensal.length; i++) {
      console.log(
        TAG +
          ' VENDAS 2025 ' +
          mensal[i].ym +
          ': linhas=' +
          toInt(mensal[i].n) +
          ' SUM(total_nf_novo)=' +
          toNum(mensal[i].tot) +
          ' data_carga(min/max)=' +
          mensal[i].mn +
          ' / ' +
          mensal[i].mx,
      )
    }

    // ---------- 3. Contagem por chave de dedupe em vendas 2025 ----------
    const chavesRepetidas = rowsOf(
      'SELECT chave_dedupe AS k, CAST(COUNT(*) AS TEXT) AS c FROM (' +
        "SELECT COALESCE(numero_sap,'')||'|'||COALESCE(numero_nfe,'')||'|'||" +
        "COALESCE(substr(data_lancamento,1,10),'')||'|'||COALESCE(codigo_cliente,'')||'|'||COALESCE(codigo_item,'') AS chave_dedupe " +
        "FROM vendas WHERE substr(data_lancamento,1,4)='2025' AND origem='Consolidado') " +
        'GROUP BY chave_dedupe HAVING COUNT(*) > 1 ORDER BY COUNT(*) DESC LIMIT 30',
      { k: '', c: '' },
    )
    if (chavesRepetidas.length === 0) {
      console.log(
        TAG +
          ' VENDAS 2025 dedupe (NF+serial+data+cliente+item): nenhuma chave com mais de 1 linha',
      )
    } else {
      for (let i = 0; i < chavesRepetidas.length; i++) {
        console.log(
          TAG +
            ' VENDAS 2025 chave repetida: ' +
            chavesRepetidas[i].k +
            ' x' +
            toInt(chavesRepetidas[i].c),
        )
        if (i >= 29) break
        if (i === chavesRepetidas.length - 1) break
      }
    }

    // ---------- 4. NF 82812: codigo_item distintos por linha ----------
    const nf82812 = rowsOf(
      'SELECT CAST(COUNT(*) AS TEXT) AS n, CAST(COUNT(DISTINCT codigo_item) AS TEXT) AS itens ' +
        "FROM vendas WHERE numero_nfe='82812' OR numero_sap='82812'",
      { n: '', itens: '' },
    )
    console.log(
      TAG +
        ' NF 82812 em vendas: linhas=' +
        toInt(nf82812[0].n) +
        ' codigo_item_distintos=' +
        toInt(nf82812[0].itens),
    )
    const nf82812Bruta = rowsOf(
      'SELECT CAST(COUNT(*) AS TEXT) AS n, CAST(COUNT(DISTINCT codigo_item) AS TEXT) AS itens ' +
        "FROM netsales WHERE serial='82812' OR chave_documento='82812'",
      { n: '', itens: '' },
    )
    console.log(
      TAG +
        ' NF 82812 na bruta: linhas=' +
        toInt(nf82812Bruta[0].n) +
        ' codigo_item_distintos=' +
        toInt(nf82812Bruta[0].itens),
    )

    // ---------- 5. Outros anos preservados ----------
    const outros = rowsOf(
      "SELECT CAST(COUNT(*) AS TEXT) AS n FROM vendas WHERE substr(data_lancamento,1,4)='2024'",
      { n: '' },
    )
    console.log(TAG + ' VENDAS 2024 (preservado): linhas=' + toInt(outros[0].n))
    const outros6 = rowsOf(
      "SELECT CAST(COUNT(*) AS TEXT) AS n FROM vendas WHERE substr(data_lancamento,1,4)='2026'",
      { n: '' },
    )
    console.log(TAG + ' VENDAS 2026 (preservado): linhas=' + toInt(outros6[0].n))

    // ---------- 6. Resumos regenerados ----------
    const resumo = rowsOf(
      'SELECT CAST(COUNT(*) AS TEXT) AS c, MIN(updated) AS mn, MAX(updated) AS mx FROM resumo_vendas_mensal',
      { c: '', mn: '', mx: '' },
    )
    console.log(
      TAG +
        ' RESUMOS resumo_vendas_mensal: linhas=' +
        toInt(resumo[0].c) +
        ' updated(min/max)=' +
        resumo[0].mn +
        ' / ' +
        resumo[0].mx,
    )
    const resumoC = rowsOf(
      'SELECT CAST(COUNT(*) AS TEXT) AS c, MIN(updated) AS mn, MAX(updated) AS mx FROM resumo_clientes_ativos',
      { c: '', mn: '', mx: '' },
    )
    console.log(
      TAG +
        ' RESUMOS resumo_clientes_ativos: linhas=' +
        toInt(resumoC[0].c) +
        ' updated(min/max)=' +
        resumoC[0].mn +
        ' / ' +
        resumoC[0].mx,
    )
    const resumoUF = rowsOf(
      'SELECT CAST(COUNT(*) AS TEXT) AS c, MIN(updated) AS mn, MAX(updated) AS mx FROM resumo_vendas_uf_regiao',
      { c: '', mn: '', mx: '' },
    )
    console.log(
      TAG +
        ' RESUMOS resumo_vendas_uf_regiao: linhas=' +
        toInt(resumoUF[0].c) +
        ' updated(min/max)=' +
        resumoUF[0].mn +
        ' / ' +
        resumoUF[0].mx,
    )
  },
  (app) => {
    // down: no-op — auditoria não altera dados.
  },
)
