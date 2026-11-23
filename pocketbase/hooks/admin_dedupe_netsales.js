// admin_dedupe_netsales.js — Remove linhas DUPLICADAS de reimportação em `netsales`.
//
// Endpoint: POST /backend/v1/admin/dedupe-netsales
// Header:   X-Dedupe-Key: <segredo DEDUPE_KEY>
// Body:     { "dry_run": true }
//
// POR QUE EXISTE (2026-11-23): o arquivo "Net Sales v4 - Equipamentos" de
// 01/11 a 23/11 foi importado duas vezes (18/11 e 23/11). O cálculo do
// `numero_linha` em Importar.tsx comparava os cabeçalhos do Excel ("Chave
// Documento", "Código do item") com aliases em snake_case por IGUALDADE EXATA,
// então documento e item nunca casavam: a chave de dedupe degenerava para
// `|serial|data|`, igual para todas as linhas da nota. Na segunda carga cada
// linha recebeu um numero_linha diferente e o dedupe do importador não a
// reconheceu como existente — ela foi INSERIDA em vez de substituída.
// Resultado: 1.037 linhas extras e os valores do JP-Class 1,71x acima da planilha.
//
// As migrations 1742900030/1742900031 tentaram a mesma limpeza e não removeram
// nada em produção (nenhum erro registrado, zero linhas afetadas). Esta rota faz
// o trabalho de forma explícita e auditável, com contagens devolvidas.
//
// REGRA (segura para repetição legítima):
//   agrupa por (chave_documento, serial, codigo_item, quantidade, valor_mercadoria)
//   e, SOMENTE quando o grupo aparece em mais de uma data_carga distinta
//   (= veio de arquivos diferentes), mantém a linha mais antiga e apaga as demais.
//   Linhas repetidas no MESMO arquivo continuam intactas (ex.: NF 39615 tem o
//   mesmo item duas vezes na mesma carga, e isso é legítimo).
//
// IMPORTANTE: cada callback do Skip Cloud roda em VM separada — toda a lógica
// vai inline aqui, sem helper top-level.
routerAdd('POST', '/backend/v1/admin/dedupe-netsales', (e) => {
  // $secrets cobre os segredos do painel; $os.getenv cobre as variáveis de
  // ambiente do projeto (foi como DEDUPE_KEY foi gravada). Ler as duas, como
  // sync_canais.js faz com CANAIS_*.
  const expected = $secrets.get('DEDUPE_KEY') || $os.getenv('DEDUPE_KEY') || ''
  const provided = String(e.request.header.get('X-Dedupe-Key') || '').trim()
  if (!expected) {
    return e.json(503, { error: 'Dedupe não configurado neste ambiente.' })
  }
  if (provided !== String(expected).trim()) {
    return e.json(401, { error: 'Credencial inválida para dedupe.' })
  }

  const body = e.requestInfo().body || {}
  const dryRun = body.dry_run !== false

  const contar = () => {
    const r = arrayOf(new DynamicModel({ c: 0 }))
    $app.db().newQuery('SELECT COUNT(*) AS c FROM netsales').all(r)
    return r.length > 0 ? Number(r[0].c) || 0 : 0
  }

  try {
    const antes = contar()

    // 1) grupos que vieram de mais de uma carga
    const rows = arrayOf(
      new DynamicModel({
        chave_documento: '',
        serial: '',
        codigo_item: '',
        quantidade: 0,
        valor_mercadoria: 0,
        cargas: 0,
        linhas: 0,
      }),
    )
    $app
      .db()
      .newQuery(
        'SELECT chave_documento, serial, codigo_item, quantidade, valor_mercadoria, ' +
          "COUNT(DISTINCT substr(COALESCE(data_carga, ''), 1, 10)) AS cargas, " +
          'COUNT(*) AS linhas ' +
          'FROM netsales ' +
          'GROUP BY chave_documento, serial, codigo_item, quantidade, valor_mercadoria ' +
          "HAVING COUNT(DISTINCT substr(COALESCE(data_carga, ''), 1, 10)) > 1",
      )
      .all(rows)

    const grupos = []
    let removiveis = 0
    for (let i = 0; i < rows.length; i++) {
      const n = Number(rows[i].linhas) || 0
      grupos.push({
        cd: String(rows[i].chave_documento || ''),
        sr: String(rows[i].serial || ''),
        ci: String(rows[i].codigo_item || ''),
        qt: Number(rows[i].quantidade) || 0,
        vm: Number(rows[i].valor_mercadoria) || 0,
        cargas: Number(rows[i].cargas) || 0,
        linhas: n,
      })
      // mantém uma por carga distinta
      removiveis += Math.max(0, n - (Number(rows[i].cargas) || 1))
    }

    // amostra para conferência humana
    const amostra = grupos.slice(0, 10).map((g) => ({
      documento: g.cd,
      nf: g.sr,
      item: g.ci,
      cargas: g.cargas,
      linhas: g.linhas,
    }))

    if (dryRun) {
      return e.json(200, {
        success: true,
        dry_run: true,
        netsales_antes: antes,
        grupos_com_multiplas_cargas: grupos.length,
        linhas_seriam_removidas: removiveis,
        amostra: amostra,
        mensagem:
          'Simulação: ' +
          removiveis +
          ' linha(s) duplicada(s) seriam removidas de ' +
          grupos.length +
          ' grupo(s). Nada foi apagado.',
      })
    }

    // 2) apaga: em cada grupo, mantém a de MENOR id e remove as repetidas
    let removidas = 0
    const erros = []
    for (let i = 0; i < grupos.length; i++) {
      const g = grupos[i]
      try {
        const cond =
          'chave_documento = {:cd} AND serial = {:sr} AND codigo_item = {:ci} ' +
          'AND COALESCE(quantidade, 0) = {:qt} AND COALESCE(valor_mercadoria, 0) = {:vm}'
        const bind = { cd: g.cd, sr: g.sr, ci: g.ci, qt: g.qt, vm: g.vm }

        // ids ordenados: mantém o primeiro (mais antigo)
        const ids = arrayOf(new DynamicModel({ id: '' }))
        $app
          .db()
          .newQuery('SELECT id FROM netsales WHERE ' + cond + ' ORDER BY id ASC')
          .bind(bind)
          .all(ids)

        for (let k = 1; k < ids.length; k++) {
          $app
            .db()
            .newQuery('DELETE FROM netsales WHERE id = {:id}')
            .bind({ id: ids[k].id })
            .execute()
          removidas++
        }
      } catch (errGrupo) {
        if (erros.length < 20) erros.push('grupo ' + i + ': ' + String(errGrupo))
      }
    }

    const depois = contar()

    // Auditoria best-effort
    try {
      const logsCol = $app.findCollectionByNameOrId('audit_logs')
      const rec = new Record(logsCol)
      rec.set('action', 'dedupe_netsales')
      rec.set(
        'details',
        'Dedupe de reimportação em netsales: ' +
          removidas +
          ' linha(s) removida(s) de ' +
          grupos.length +
          ' grupo(s). Total ' +
          antes +
          ' -> ' +
          depois +
          '.' +
          (erros.length ? ' | erros: ' + erros.slice(0, 5).join('; ') : ''),
      )
      $app.save(rec)
    } catch (errAudit) {
      console.warn('[dedupe-netsales] auditoria falhou:', errAudit)
    }

    console.log(
      '[dedupe-netsales] removidas=' +
        removidas +
        ' grupos=' +
        grupos.length +
        ' antes=' +
        antes +
        ' depois=' +
        depois,
    )

    return e.json(200, {
      success: erros.length === 0,
      dry_run: false,
      netsales_antes: antes,
      netsales_depois: depois,
      linhas_removidas: removidas,
      grupos_limpos: grupos.length,
      erros: erros,
      mensagem:
        'Removidas ' +
        removidas +
        ' linha(s) duplicada(s). netsales: ' +
        antes +
        ' -> ' +
        depois +
        '. Rode a consolidação para refletir em vendas.',
    })
  } catch (err) {
    console.error('[dedupe-netsales] erro:', err)
    return e.json(500, { error: 'Erro interno no dedupe: ' + String(err) })
  }
})
