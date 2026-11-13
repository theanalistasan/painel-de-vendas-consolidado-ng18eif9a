// 1742600016 — AUDITORIA legível (parte 2) do ciclo de correção da duplicação
// 2025. Recalcula as medidas e grava cada grupo de números como linha em
// audit_logs (action = 'dedupe_2025_auditoria'), para leitura via API/consulta
// — os console.log de migration não aparecem no stream de logs do backend.
// NÃO altera dados de vendas/netsales/resumos. Idempotente de leitura: cada
// apply cria um novo registro carimbado com o horário da execução.
migrate(
  (app) => {
    const TAG = '[1742600016]'
    const toInt = function (v) {
      const n = parseInt(v, 10)
      return isNaN(n) ? 0 : n
    }
    const toNum = function (v) {
      const n = parseFloat(v)
      return isNaN(n) ? 0.0 : n
    }
    const rowsOf = function (sql, model) {
      const rows = arrayOf(new DynamicModel(model))
      app.db().newQuery(sql).all(rows)
      return rows
    }
    const nowIso = new Date().toISOString().replace('T', ' ').replace('Z', '') + '.000Z'
    const newId = function () {
      return 'r' + $security.randomString(13)
    }
    const audit = function (details) {
      app
        .db()
        .newQuery(
          'INSERT INTO audit_logs (id, user_id, user_email, user_name, action, details, ip, created, updated) ' +
            "VALUES ({:id}, '', '', 'Migration', 'dedupe_2025_auditoria', {:d}, '', {:t}, {:t})",
        )
        .bind({ id: newId(), d: details, t: nowIso })
        .execute()
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
    audit(
      TAG +
        ' BRUTA netsales: total=' +
        totalBruta +
        ' chaves_unicas=' +
        chavesUnicas +
        ' duplicatas_extras=' +
        (totalBruta - chavesUnicas),
    )

    // ---------- 2. Vendas 2025: mensal SUM(total_nf_novo) ----------
    const mensal = rowsOf(
      'SELECT substr(data_lancamento,1,7) AS ym, ' +
        'CAST(ROUND(COALESCE(SUM(total_nf_novo),0),2) AS TEXT) AS tot, ' +
        'CAST(COUNT(*) AS TEXT) AS n, MIN(data_carga) AS mn, MAX(data_carga) AS mx ' +
        "FROM vendas WHERE substr(data_lancamento,1,4)='2025' " +
        'GROUP BY substr(data_lancamento,1,7) ORDER BY ym',
      { ym: '', tot: '', n: '', mn: '', mx: '' },
    )
    audit(TAG + ' VENDAS 2025 por mês (linhas | SUM(total_nf_novo) | data_carga min~max):')
    let total2025 = 0
    let linhas2025 = 0
    for (let i = 0; i < mensal.length; i++) {
      total2025 += toNum(mensal[i].tot)
      linhas2025 += toInt(mensal[i].n)
      audit(
        TAG +
          ' 2025-' +
          mensal[i].ym.slice(5, 7) +
          ': linhas=' +
          toInt(mensal[i].n) +
          ' SUM=' +
          toNum(mensal[i].tot) +
          ' carga=' +
          mensal[i].mn +
          ' ~ ' +
          mensal[i].mx,
      )
    }
    audit(TAG + ' VENDAS 2025 TOTAL: linhas=' + linhas2025 + ' SUM(total_nf_novo)=' + total2025)

    // ---------- 3. Chaves repetidas em vendas 2025 ----------
    const repetidas = rowsOf(
      "SELECT COUNT(*) AS n FROM (SELECT 1 FROM vendas WHERE substr(data_lancamento,1,4)='2025' AND origem='Consolidado' " +
        'GROUP BY numero_sap, numero_nfe, substr(data_lancamento,1,10), codigo_cliente, codigo_item HAVING COUNT(*) > 1)',
      { n: '' },
    )
    audit(
      TAG +
        ' VENDAS 2025 chaves com >1 linha (NF+serial+data+cliente+item): ' +
        toInt(repetidas[0].n),
    )

    // ---------- 4. NF 82812 ----------
    const nf1 = rowsOf(
      'SELECT CAST(COUNT(*) AS TEXT) AS n, CAST(COUNT(DISTINCT codigo_item) AS TEXT) AS i ' +
        "FROM vendas WHERE numero_nfe='82812' OR numero_sap='82812'",
      { n: '', i: '' },
    )
    const nf2 = rowsOf(
      'SELECT CAST(COUNT(*) AS TEXT) AS n, CAST(COUNT(DISTINCT codigo_item) AS TEXT) AS i ' +
        "FROM netsales WHERE serial='82812' OR chave_documento='82812'",
      { n: '', i: '' },
    )
    audit(
      TAG +
        ' NF 82812 vendas: linhas=' +
        toInt(nf1[0].n) +
        ' itens_distintos=' +
        toInt(nf1[0].i) +
        ' | bruta: linhas=' +
        toInt(nf2[0].n) +
        ' itens_distintos=' +
        toInt(nf2[0].i),
    )

    // ---------- 5. Outros anos preservados ----------
    const a24 = rowsOf(
      "SELECT CAST(COUNT(*) AS TEXT) AS c FROM vendas WHERE substr(data_lancamento,1,4)='2024'",
      { c: '' },
    )
    const a26 = rowsOf(
      "SELECT CAST(COUNT(*) AS TEXT) AS c FROM vendas WHERE substr(data_lancamento,1,4)='2026'",
      { c: '' },
    )
    audit(
      TAG + ' PRESERVADOS: 2024 linhas=' + toInt(a24[0].c) + ' | 2026 linhas=' + toInt(a26[0].c),
    )

    // ---------- 6. Resumos ----------
    const r1 = rowsOf(
      'SELECT CAST(COUNT(*) AS TEXT) AS c, MAX(updated) AS mx FROM resumo_vendas_mensal',
      { c: '', mx: '' },
    )
    const r2 = rowsOf(
      'SELECT CAST(COUNT(*) AS TEXT) AS c, MAX(updated) AS mx FROM resumo_clientes_ativos',
      { c: '', mx: '' },
    )
    const r3 = rowsOf(
      'SELECT CAST(COUNT(*) AS TEXT) AS c, MAX(updated) AS mx FROM resumo_vendas_uf_regiao',
      { c: '', mx: '' },
    )
    audit(
      TAG +
        ' RESUMOS: mensal linhas=' +
        toInt(r1[0].c) +
        ' updated=' +
        r1[0].mx +
        ' | clientes_ativos linhas=' +
        toInt(r2[0].c) +
        ' updated=' +
        r2[0].mx +
        ' | uf_regiao linhas=' +
        toInt(r3[0].c) +
        ' updated=' +
        r3[0].mx,
    )
  },
  (app) => {
    // down: no-op — auditoria não altera dados.
  },
)
