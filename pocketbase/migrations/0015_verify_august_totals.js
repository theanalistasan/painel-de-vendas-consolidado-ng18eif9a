migrate(
  (app) => {
    const rows = arrayOf(new DynamicModel({ a: '', b: '', c: '', d: '' }))
    app
      .db()
      .newQuery(
        "SELECT COALESCE(SUM(total_linha),0) as a, COUNT(*) as b, COALESCE(SUM(CASE WHEN total_linha > 0 THEN total_linha ELSE 0 END),0) as c, COALESCE(SUM(CASE WHEN total_linha < 0 THEN total_linha ELSE 0 END),0) as d FROM vendas WHERE data_lancamento >= '2026-08-01' AND data_lancamento <= '2026-08-31'",
      )
      .all(rows)
    if (rows.length > 0) {
      console.log(
        'AUGUST 2026 STATS: sum=' +
          rows[0].a +
          ' count=' +
          rows[0].b +
          ' sum_pos=' +
          rows[0].c +
          ' sum_neg=' +
          rows[0].d,
      )
    }

    const rows2 = arrayOf(new DynamicModel({ a: '', b: '', c: '', d: '' }))
    app
      .db()
      .newQuery(
        "SELECT utilizacao as a, tipo_documento as b, COALESCE(SUM(total_linha),0) as c, COUNT(*) as d FROM vendas WHERE data_lancamento >= '2026-08-01' AND data_lancamento <= '2026-08-31' GROUP BY utilizacao, tipo_documento",
      )
      .all(rows2)
    for (let i = 0; i < rows2.length; i++) {
      console.log(
        'GROUP: ' + rows2[i].a + ' | ' + rows2[i].b + ' | ' + rows2[i].c + ' | count=' + rows2[i].d,
      )
    }
  },
  (app) => {},
)
