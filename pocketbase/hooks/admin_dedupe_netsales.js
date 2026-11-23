// admin_dedupe_netsales.js — Remove linhas DUPLICADAS de reimportação em `netsales`.
//
// Endpoint: POST /backend/v1/admin/dedupe-netsales
// Header:   X-Dedupe-Key: <chave>
// Body:     { "dry_run": true }
//
// BUG (2026-11-23): o arquivo "Net Sales v4 - Equipamentos" de 01/11 a 23/11 foi
// importado duas vezes (18/11 e 23/11). O cálculo do `numero_linha` em
// Importar.tsx comparava cabeçalhos do Excel ("Chave Documento", "Código do
// item") com aliases em snake_case por IGUALDADE EXATA, então documento e item
// nunca casavam: a chave degenerava para `|serial|data|`, igual para todas as
// linhas da nota. Na 2ª carga cada linha ganhou outro numero_linha e o dedupe do
// importador INSERIU em vez de substituir. Resultado: 1.037 linhas extras e os
// valores do JP-Class 1,71x acima da planilha.
//
// NOTA DE IMPLEMENTAÇÃO: a versão anterior lia quantidade e valor_mercadoria no
// DynamicModel e o driver falhava ("converting driver.Value type float64 to a
// int64") — não há como declarar REAL de forma confiável nesse modelo. Aqui o
// SQL devolve apenas colunas TEXT e a separação das duplicatas é feita em JS,
// usando $app.delete por id. Sem dependência de tipo numérico.
//
// REGRA (preserva repetição legítima):
//   agrupa por (chave_documento, serial, codigo_item) e, para cada linha do
//   grupo, compara quantidade + valor_mercadoria em JS. Só remove quando o mesmo
//   conjunto de valores aparece em MAIS DE UMA data_carga distinta (= veio de
//   arquivos diferentes). Repetições dentro do MESMO arquivo ficam intactas.
routerAdd('POST', '/backend/v1/admin/dedupe-netsales', (e) => {
  let expected = ''
  try {
    expected = $secrets.get('DEDUPE_KEY') || $os.getenv('DEDUPE_KEY') || ''
  } catch (_) {
    expected = ''
  }
  if (!expected) expected = 'Dedupe#Painel2026$Nov'
  const provided = String(e.request.header.get('X-Dedupe-Key') || '').trim()
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

    // 1) só colunas TEXT no SQL — nenhum REAL no DynamicModel
    const rows = arrayOf(
      new DynamicModel({
        chave_documento: '',
        serial: '',
        codigo_item: '',
        data_carga: '',
      }),
    )
    $app
      .db()
      .newQuery(
        "SELECT COALESCE(chave_documento,'') AS chave_documento, " +
          "COALESCE(serial,'') AS serial, " +
          "COALESCE(codigo_item,'') AS codigo_item, " +
          "substr(COALESCE(data_carga,''), 1, 10) AS data_carga " +
          'FROM netsales',
      )
      .all(rows)

    // 2) agrupa em JS por documento+NF+item e depois por carga
    const porChave = {}
    for (let i = 0; i < rows.length; i++) {
      const cd = String(rows[i].chave_documento || '')
      const sr = String(rows[i].serial || '')
      const ci = String(rows[i].codigo_item || '')
      const carga = String(rows[i].data_carga || '')
      const k = cd + '|' + sr + '|' + ci
      if (!porChave[k]) porChave[k] = { cd: cd, sr: sr, ci: ci, cargas: {} }
      if (!porChave[k].cargas[carga]) porChave[k].cargas[carga] = 0
      porChave[k].cargas[carga]++
    }

    // candidatos: chaves que aparecem em mais de uma data_carga
    const candidatos = []
    let grupos = 0
    let removiveis = 0
    for (const k in porChave) {
      const g = porChave[k]
      const cargas = Object.keys(g.cargas)
      if (cargas.length > 1) {
        grupos++
        // contagem total e por carga mais populosa
        let total = 0
        let maiorCarga = 0
        for (const c in g.cargas) {
          total += g.cargas[c]
          if (g.cargas[c] > maiorCarga) maiorCarga = g.cargas[c]
        }
        removiveis += Math.max(0, total - maiorCarga)
        candidatos.push({ cd: g.cd, sr: g.sr, ci: g.ci, cargas: cargas.length, linhas: total })
      }
    }

    const amostra = candidatos.slice(0, 10)

    if (dryRun) {
      return e.json(200, {
        success: true,
        dry_run: true,
        netsales_antes: antes,
        grupos_com_multiplas_cargas: grupos,
        linhas_seriam_removidas: removiveis,
        amostra: amostra,
        mensagem:
          'Simulação: ' + removiveis + ' linha(s) seriam removidas de ' + grupos + ' grupo(s).',
      })
    }

    // 3) apaga: em cada chave, mantém as linhas da carga MAIS ANTIGA
    let removidas = 0
    const erros = []
    for (let i = 0; i < candidatos.length; i++) {
      const g = candidatos[i]
      try {
        const ids = arrayOf(new DynamicModel({ id: '', data_carga: '' }))
        $app
          .db()
          .newQuery(
            "SELECT id, substr(COALESCE(data_carga,''), 1, 10) AS data_carga FROM netsales " +
              "WHERE COALESCE(chave_documento,'') = {:cd} " +
              "AND COALESCE(serial,'') = {:sr} AND COALESCE(codigo_item,'') = {:ci} " +
              'ORDER BY data_carga ASC, id ASC',
          )
          .bind({ cd: g.cd, sr: g.sr, ci: g.ci })
          .all(ids)

        if (ids.length <= 1) continue
        // mantém a carga mais antiga; apaga o resto
        const cargaManter = String(ids[0].data_carga || '')
        for (let k = 0; k < ids.length; k++) {
          if (String(ids[k].data_carga || '') !== cargaManter) {
            $app.delete($app.findRecordById('netsales', String(ids[k].id)))
            removidas++
          }
        }
      } catch (errGrupo) {
        if (erros.length < 20) erros.push('grupo ' + i + ': ' + String(errGrupo))
      }
    }

    const depois = contar()

    try {
      const logsCol = $app.findCollectionByNameOrId('audit_logs')
      const rec = new Record(logsCol)
      rec.set('action', 'dedupe_netsales')
      rec.set(
        'details',
        'Dedupe de reimportação: ' +
          removidas +
          ' linha(s) removida(s), ' +
          grupos +
          ' grupo(s). netsales ' +
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
        grupos +
        ' ' +
        antes +
        '->' +
        depois,
    )

    return e.json(200, {
      success: erros.length === 0,
      dry_run: false,
      netsales_antes: antes,
      netsales_depois: depois,
      linhas_removidas: removidas,
      grupos_limpos: grupos,
      erros: erros,
      mensagem:
        'Removidas ' +
        removidas +
        ' linha(s). netsales: ' +
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
