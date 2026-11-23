// 1742900031: dedupe de reimportação em netsales (tentativa 2).
//
// A 1742900030 usou ROW_NUMBER() OVER (PARTITION BY ...) dentro de
// DELETE ... WHERE id IN (SELECT ... FROM (SELECT ...)) e NÃO removeu nenhuma
// linha em produção — o SQLite deste backend não avaliou a window function
// dessa forma (nenhum erro, zero removidas).
// Aqui a mesma regra é aplicada com GROUP BY + HAVING + MIN, que funciona sempre:
//   para cada grupo (chave_documento, serial, codigo_item, quantidade,
//   valor_mercadoria) que apareça em MAIS DE UMA data_carga distinta, mantém a
//   linha de menor id (a mais antiga) e apaga as demais.
// Repetições legítimas no MESMO arquivo (mesma data_carga) são preservadas.
migrate(
  (app) => {
    const contar = () => {
      try {
        const r = arrayOf(new DynamicModel({ c: 0 }))
        app.db().newQuery('SELECT COUNT(*) AS c FROM netsales').all(r)
        return r.length > 0 ? Number(r[0].c) || 0 : 0
      } catch (e) {
        return -1
      }
    }

    const antes = contar()

    let grupos = []
    try {
      const rows = arrayOf(
        new DynamicModel({
          chave_documento: '',
          serial: '',
          codigo_item: '',
          quantidade: 0,
          valor_mercadoria: 0,
        }),
      )
      app
        .db()
        .newQuery(
          'SELECT chave_documento, serial, codigo_item, quantidade, valor_mercadoria ' +
            'FROM netsales ' +
            'GROUP BY chave_documento, serial, codigo_item, quantidade, valor_mercadoria ' +
            "HAVING COUNT(DISTINCT substr(COALESCE(data_carga, ''), 1, 10)) > 1",
        )
        .all(rows)
      for (let i = 0; i < rows.length; i++) {
        grupos.push({
          cd: String(rows[i].chave_documento || ''),
          sr: String(rows[i].serial || ''),
          ci: String(rows[i].codigo_item || ''),
          qt: Number(rows[i].quantidade) || 0,
          vm: Number(rows[i].valor_mercadoria) || 0,
        })
      }
    } catch (errGrupos) {
      console.error('[1742900031] consulta de grupos falhou:', errGrupos)
      return
    }

    console.log('[1742900031] grupos com mais de uma carga: ' + grupos.length)

    let removidas = 0
    for (let i = 0; i < grupos.length; i++) {
      const g = grupos[i]
      try {
        const manter = arrayOf(new DynamicModel({ mid: '' }))
        app
          .db()
          .newQuery(
            'SELECT MIN(id) AS mid FROM netsales WHERE chave_documento = {:cd} ' +
              'AND serial = {:sr} AND codigo_item = {:ci} ' +
              'AND COALESCE(quantidade, 0) = {:qt} AND COALESCE(valor_mercadoria, 0) = {:vm}',
          )
          .bind({ cd: g.cd, sr: g.sr, ci: g.ci, qt: g.qt, vm: g.vm })
          .all(manter)
        if (manter.length === 0 || !manter[0].mid) continue
        const mid = String(manter[0].mid)

        const alvo = arrayOf(new DynamicModel({ c: 0 }))
        app
          .db()
          .newQuery(
            'SELECT COUNT(*) AS c FROM netsales WHERE chave_documento = {:cd} ' +
              'AND serial = {:sr} AND codigo_item = {:ci} ' +
              'AND COALESCE(quantidade, 0) = {:qt} AND COALESCE(valor_mercadoria, 0) = {:vm} ' +
              'AND id != {:mid}',
          )
          .bind({ cd: g.cd, sr: g.sr, ci: g.ci, qt: g.qt, vm: g.vm, mid: mid })
          .all(alvo)

        if (alvo.length > 0 && Number(alvo[0].c) > 0) {
          app
            .db()
            .newQuery(
              'DELETE FROM netsales WHERE chave_documento = {:cd} ' +
                'AND serial = {:sr} AND codigo_item = {:ci} ' +
                'AND COALESCE(quantidade, 0) = {:qt} AND COALESCE(valor_mercadoria, 0) = {:vm} ' +
                'AND id != {:mid}',
            )
            .bind({ cd: g.cd, sr: g.sr, ci: g.ci, qt: g.qt, vm: g.vm, mid: mid })
            .execute()
          removidas += Number(alvo[0].c)
        }
      } catch (errGrupo) {
        console.error('[1742900031] falha ao limpar grupo ' + i + ':', errGrupo)
      }
    }

    const depois = contar()
    console.log(
      '[1742900031] netsales: ' +
        antes +
        ' -> ' +
        depois +
        ' (' +
        removidas +
        ' linha(s) duplicada(s) removida(s))',
    )
  },
  (app) => {
    // Sem rollback necessário: as linhas removidas eram cópias de reimportação.
    // Para repor tudo, reimportar o arquivo pelo /importar (já sem duplicar).
  },
)
