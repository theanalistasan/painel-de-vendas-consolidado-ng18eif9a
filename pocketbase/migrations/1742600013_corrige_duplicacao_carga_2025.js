// 1742600013 — EXECUTA a correção da duplicação da carga 2025 (0.0.365 criou a
// infraestrutura; esta migration aplica a correção aos DADOS):
//   1. DEDUPE da bruta `netsales` pela chave
//      chave_documento + serial + docdate + codigo_cliente + codigo_item,
//      mantendo a cópia com data_carga mais recente (tiebreak: maior id).
//   2. RECONSOLIDAÇÃO de 2025: apaga em `vendas` as linhas de 2025
//      (origem 'Consolidado') e regrava a partir da bruta corrigida, com o
//      MESMO SELECT do consolidador (join produtos/tipos_cliente). Anos
//      diferentes de 2025 em `vendas` NÃO são tocados.
//   3. REGENERA os resumos (resumo_vendas_mensal, resumo_clientes_ativos,
//      resumo_vendas_uf_regiao) com o mesmo SQL do cron reconcile_sales_summaries.
// Todos os números (antes/depois) vão para o console do backend.
// IDEMPOTENTE: sobre base vazia/limpa, cada passo é no-op ou regrava 1:1.
migrate(
  (app) => {
    var TAG = '[1742600013]'
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
    var countOf = function (appDb, sql) {
      const rows = arrayOf(new DynamicModel({ c: '' }))
      appDb.newQuery(sql).all(rows)
      return rows.length > 0 ? toInt(rows[0].c) : 0
    }
    // SUM mensal de total_nf_novo de 2025 em vendas (CAST TEXT p/ evitar
    // "Scan error float64" no Goja — padrão: inicializar como '' e converter em JS)
    var mensal2025 = function (appDb) {
      const rows = arrayOf(new DynamicModel({ ym: '', tot: '' }))
      q(
        'SELECT substr(data_lancamento,1,7) AS ym, ' +
          'CAST(ROUND(COALESCE(SUM(total_nf_novo),0),2) AS TEXT) AS tot ' +
          "FROM vendas WHERE substr(data_lancamento,1,4)='2025' " +
          'GROUP BY substr(data_lancamento,1,7) ORDER BY ym',
      ).all(rows)
      const mapa = {}
      for (let i = 0; i < rows.length; i++) mapa[rows[i].ym] = toNum(rows[i].tot)
      return mapa
    }

    // ---------- ANTES ----------
    const totalBruta = countOf(app, 'SELECT COUNT(*) AS c FROM netsales')
    const chavesUnicas = countOf(
      app,
      "SELECT COUNT(DISTINCT COALESCE(chave_documento,'')||'|'||COALESCE(serial,'')||'|'||" +
        "COALESCE(docdate,'')||'|'||COALESCE(codigo_cliente,'')||'|'||COALESCE(codigo_item,'')) AS c FROM netsales",
    )
    const dupBruta = totalBruta - chavesUnicas
    const totalVendas2025Antes = countOf(
      app,
      "SELECT COUNT(*) AS c FROM vendas WHERE substr(data_lancamento,1,4)='2025'",
    )
    const mensalAntes = mensal2025(app)
    console.log(
      TAG +
        ' ANTES: netsales total=' +
        totalBruta +
        ' chaves_unicas=' +
        chavesUnicas +
        ' linhas_duplicadas=' +
        dupBruta +
        ' | vendas 2025 linhas=' +
        totalVendas2025Antes,
    )
    console.log(
      TAG + ' ANTES vendas 2025 SUM(total_nf_novo) mensal: ' + JSON.stringify(mensalAntes),
    )

    // amostra de prova (NF reportada no diagnóstico)
    const nf77004 = countOf(
      app,
      "SELECT COUNT(*) AS c FROM netsales WHERE serial='77004' OR chave_documento='77004'",
    )
    console.log(TAG + ' ANTES: linhas da NF 77004 na bruta = ' + nf77004)

    app.runInTransaction(function (txApp) {
      const tq = function (sql) {
        return txApp.db().newQuery(sql)
      }

      // ---------- 1. DEDUPE da bruta ----------
      tq(
        'DELETE FROM netsales WHERE id IN (' +
          'SELECT a.id FROM netsales a JOIN netsales b ON ' +
          "COALESCE(a.chave_documento,'')=COALESCE(b.chave_documento,'') AND " +
          "COALESCE(a.serial,'')=COALESCE(b.serial,'') AND " +
          "COALESCE(a.docdate,'')=COALESCE(b.docdate,'') AND " +
          "COALESCE(a.codigo_cliente,'')=COALESCE(b.codigo_cliente,'') AND " +
          "COALESCE(a.codigo_item,'')=COALESCE(b.codigo_item,'') AND " +
          "(COALESCE(a.data_carga,'') < COALESCE(b.data_carga,'') OR " +
          "(COALESCE(a.data_carga,'') = COALESCE(b.data_carga,'') AND a.id < b.id))" +
          ')',
      ).execute()

      const depTotal = countOf(txApp, 'SELECT COUNT(*) AS c FROM netsales')
      const depUnicas = countOf(
        txApp,
        "SELECT COUNT(DISTINCT COALESCE(chave_documento,'')||'|'||COALESCE(serial,'')||'|'||" +
          "COALESCE(docdate,'')||'|'||COALESCE(codigo_cliente,'')||'|'||COALESCE(codigo_item,'')) AS c FROM netsales",
      )
      console.log(
        TAG +
          ' DEDUPE: bruta depois total=' +
          depTotal +
          ' chaves_unicas=' +
          depUnicas +
          ' removidas=' +
          (totalBruta - depTotal) +
          ' (esperado=' +
          dupBruta +
          ')',
      )

      // ---------- 2. RECONSOLIDAÇÃO de 2025 ----------
      const antesApagar2025 = countOf(
        txApp,
        "SELECT COUNT(*) AS c FROM vendas WHERE substr(data_lancamento,1,4)='2025' AND origem='Consolidado'",
      )
      tq(
        "DELETE FROM vendas WHERE substr(data_lancamento,1,4)='2025' AND origem='Consolidado'",
      ).execute()
      const apagadas2025 = antesApagar2025

      const nowIso = new Date().toISOString()
      // Mesmo SELECT do consolidador (consolidar_vendas.js), restrito a 2025:
      tq(
        'INSERT INTO vendas (' +
          'id, tipo_documento, nf_entrega_futura, numero_sap, numero_nfe, ' +
          'data_lancamento, ultima_data_vencimento, docto_origem_destino, ' +
          'data_origem_destino, condicao_pagamento, codigo_cliente, ' +
          'nome_cliente, numero_linha, codigo_item, descricao_item, ' +
          'quantidade, qty_kg_lt, preco_item, desconto_linha, icms, pis, ' +
          'cofins, ipi, icms_partilha, total_linha, utilizacao, ' +
          'nome_vendedor, custo_item, nome_filial, conta, estado, cidade, ' +
          'grupo_cliente, mercado, usuario_emissor_pedido, itms_grp_nam, ' +
          'numero_documento_netsales, preco_unitario, total_nf_sem_frete, ' +
          'total_nf_novo, valor_liquido, custo_total, classificacao, ' +
          'vendedor_revenda, grupo_item, vendedor_cliente, origem, ' +
          'tem_netsales, status_cadastro, tipo_pn, tipo_cliente, ' +
          'data_carga, created, updated' +
          ') SELECT ' +
          "('r' || substr(hex(randomblob(7)), 1, 14)) AS id, " +
          "COALESCE(NULLIF(TRIM(n.tipo), ''), 'NF') AS tipo_documento, " +
          "'' AS nf_entrega_futura, " +
          'n.chave_documento AS numero_sap, n.serial AS numero_nfe, ' +
          'n.docdate AS data_lancamento, ' +
          "'' AS ultima_data_vencimento, '' AS docto_origem_destino, '' AS data_origem_destino, " +
          "'' AS condicao_pagamento, n.codigo_cliente, n.nome_cliente, " +
          "0.0 AS numero_linha, n.codigo_item, COALESCE(n.descrip, '') AS descricao_item, " +
          'COALESCE(n.quantidade, 0.0) AS quantidade, 0.0 AS qty_kg_lt, 0.0 AS preco_item, ' +
          '0.0 AS desconto_linha, 0.0 AS icms, 0.0 AS pis, ' +
          '0.0 AS cofins, 0.0 AS ipi, 0.0 AS icms_partilha, ' +
          "COALESCE(n.valor_mercadoria, 0.0) AS total_linha, COALESCE(n.usage, '') AS utilizacao, " +
          "COALESCE(NULLIF(TRIM(n.revenda), ''), n.nome_cliente) AS nome_vendedor, " +
          '0.0 AS custo_item, ' +
          "'' AS nome_filial, '' AS conta, " +
          "COALESCE(n.estado, '') AS estado, COALESCE(n.municipio, '') AS cidade, " +
          "COALESCE(n.grupo_cliente, '') AS grupo_cliente, COALESCE(n.mercado, '') AS mercado, " +
          "COALESCE(n.usuario_emissor, '') AS usuario_emissor_pedido, COALESCE(n.itms_grp_nam, '') AS itms_grp_nam, " +
          "COALESCE(n.numero_documento, '') AS numero_documento_netsales, COALESCE(n.preco_unitario, 0.0) AS preco_unitario, " +
          'COALESCE(n.total_nf_sem_frete, 0.0) AS total_nf_sem_frete, COALESCE(n.total_nf_novo, 0.0) AS total_nf_novo, ' +
          'COALESCE(n.valor_liquido, 0.0) AS valor_liquido, COALESCE(n.custo_total, 0.0) AS custo_total, ' +
          "COALESCE(n.classificacao, '') AS classificacao, COALESCE(n.vendedor_revenda, '') AS vendedor_revenda, " +
          "COALESCE(NULLIF(p.grupo_item, ''), NULLIF(n.itms_grp_nam, ''), 'Não Categorizado') AS grupo_item, " +
          "(COALESCE(NULLIF(TRIM(n.revenda), ''), n.nome_cliente) || ' > ' || n.nome_cliente) AS vendedor_cliente, " +
          "'Consolidado' AS origem, " +
          '1 AS tem_netsales, ' +
          "COALESCE(NULLIF(tc.status_cadastro, ''), NULLIF(n.status_cadastro, ''), '') AS status_cadastro, " +
          "COALESCE(NULLIF(tc.tipo_pn, ''), NULLIF(n.tipo_pn, ''), '') AS tipo_pn, " +
          "COALESCE(NULLIF(tc.tipo_cliente, ''), NULLIF(n.tipo_cliente, ''), '') AS tipo_cliente, " +
          '{:now} AS data_carga, {:now} AS created, {:now} AS updated ' +
          'FROM netsales n ' +
          'LEFT JOIN produtos p ON p.codigo_item = n.codigo_item ' +
          'LEFT JOIN tipos_cliente tc ON UPPER(TRIM(tc.codigo_pn)) = UPPER(TRIM(n.codigo_cliente)) ' +
          "WHERE substr(n.docdate,1,4)='2025' " +
          "AND UPPER(TRIM(COALESCE(n.codigo_item, ''))) != 'SERVICOS'",
      )
        .bind({ now: nowIso })
        .execute()

      const bruta2025 = countOf(
        txApp,
        "SELECT COUNT(*) AS c FROM netsales WHERE substr(docdate,1,4)='2025' " +
          "AND UPPER(TRIM(COALESCE(codigo_item,''))) != 'SERVICOS'",
      )
      const vendas2025Depois = countOf(
        txApp,
        "SELECT COUNT(*) AS c FROM vendas WHERE substr(data_lancamento,1,4)='2025'",
      )
      console.log(
        TAG +
          ' RECONSOLIDACAO 2025: bruta elegivel=' +
          bruta2025 +
          ' vendas2025 antes=' +
          totalVendas2025Antes +
          ' depois=' +
          vendas2025Depois +
          ' (linhas Consolidado apagadas=' +
          apagadas2025 +
          ')',
      )

      // ---------- 3. REGENERA RESUMOS (mesmo SQL do cron reconcile) ----------
      tq('DELETE FROM resumo_vendas_mensal').execute()
      tq(
        'INSERT INTO resumo_vendas_mensal (' +
          'ano_mes, ano, mes, tem_netsales, grupo_item, estado, ' +
          'nome_vendedor, vendedor_cliente, codigo_cliente, nome_cliente, ' +
          'tipo_documento, utilizacao, total_linha, valor_liquido, ' +
          'quantidade, total_devolucao, qtd_documentos, qtd_itens, ' +
          'created, updated' +
          ') SELECT ' +
          'substr(data_lancamento, 1, 7) AS ano_mes, ' +
          'CAST(substr(data_lancamento, 1, 4) AS INTEGER) AS ano, ' +
          'CAST(substr(data_lancamento, 6, 2) AS INTEGER) AS mes, ' +
          '(CASE WHEN tem_netsales = 1 THEN 1 ELSE 0 END) AS tem_netsales, ' +
          "COALESCE(NULLIF(grupo_item, ''), 'Sem informação') AS grupo_item, " +
          "COALESCE(NULLIF(estado, ''), 'Sem informação') AS estado, " +
          "COALESCE(NULLIF(nome_vendedor, ''), 'Sem informação') AS nome_vendedor, " +
          "COALESCE(NULLIF(vendedor_cliente, ''), 'Sem informação') AS vendedor_cliente, " +
          "COALESCE(NULLIF(codigo_cliente, ''), '') AS codigo_cliente, " +
          "COALESCE(NULLIF(nome_cliente, ''), 'Sem informação') AS nome_cliente, " +
          "COALESCE(NULLIF(tipo_documento, ''), 'Sem informação') AS tipo_documento, " +
          "COALESCE(NULLIF(utilizacao, ''), 'Sem informação') AS utilizacao, " +
          'COALESCE(SUM(total_linha), 0.0) AS total_linha, ' +
          'COALESCE(SUM(valor_liquido), 0.0) AS valor_liquido, ' +
          'COALESCE(SUM(quantidade), 0.0) AS quantidade, ' +
          "COALESCE(SUM(CASE WHEN tipo_documento IN ('Dev. Entrega','Dev. NF','DEVNF') THEN total_linha ELSE 0 END), 0.0) AS total_devolucao, " +
          'COUNT(DISTINCT numero_nfe) AS qtd_documentos, ' +
          'COUNT(*) AS qtd_itens, ' +
          '{:now} AS created, {:now} AS updated ' +
          'FROM vendas ' +
          "WHERE data_lancamento IS NOT NULL AND data_lancamento != '' AND data_lancamento >= '2015-01-01' " +
          "AND UPPER(TRIM(COALESCE(codigo_item, ''))) != 'SERVICOS' " +
          'GROUP BY substr(data_lancamento, 1, 7), CAST(substr(data_lancamento, 1, 4) AS INTEGER), ' +
          'CAST(substr(data_lancamento, 6, 2) AS INTEGER), (CASE WHEN tem_netsales = 1 THEN 1 ELSE 0 END), ' +
          "COALESCE(NULLIF(grupo_item, ''), 'Sem informação'), COALESCE(NULLIF(estado, ''), 'Sem informação'), " +
          "COALESCE(NULLIF(nome_vendedor, ''), 'Sem informação'), COALESCE(NULLIF(vendedor_cliente, ''), 'Sem informação'), " +
          "COALESCE(NULLIF(codigo_cliente, ''), ''), COALESCE(NULLIF(nome_cliente, ''), 'Sem informação'), " +
          "COALESCE(NULLIF(tipo_documento, ''), 'Sem informação'), COALESCE(NULLIF(utilizacao, ''), 'Sem informação')",
      )
        .bind({ now: nowIso })
        .execute()

      tq('DELETE FROM resumo_clientes_ativos').execute()
      tq(
        'INSERT INTO resumo_clientes_ativos (' +
          'ano_mes, ano, mes, tem_netsales, grupo_categoria, codigo_cliente, created, updated' +
          ') SELECT ' +
          'substr(data_lancamento, 1, 7) AS ano_mes, ' +
          'CAST(substr(data_lancamento, 1, 4) AS INTEGER) AS ano, ' +
          'CAST(substr(data_lancamento, 6, 2) AS INTEGER) AS mes, ' +
          '(CASE WHEN tem_netsales = 1 THEN 1 ELSE 0 END) AS tem_netsales, ' +
          "(CASE WHEN UPPER(TRIM(grupo_item)) = 'EQUIPAMENTOS' THEN 'EQUIPAMENTOS' " +
          "WHEN UPPER(TRIM(grupo_item)) IN ('PEÇAS', 'PECAS', 'TINTAS', 'ACESSÓRIOS', 'ACESSORIOS') THEN 'INSUMOS' " +
          "ELSE 'OUTROS' END) AS grupo_categoria, " +
          'codigo_cliente, {:now} AS created, {:now} AS updated ' +
          'FROM vendas ' +
          "WHERE data_lancamento IS NOT NULL AND data_lancamento != '' AND data_lancamento >= '2015-01-01' " +
          "AND codigo_cliente IS NOT NULL AND codigo_cliente != '' " +
          "AND UPPER(TRIM(grupo_item)) IN ('EQUIPAMENTOS', 'PEÇAS', 'PECAS', 'TINTAS', 'ACESSÓRIOS', 'ACESSORIOS') " +
          "AND UPPER(TRIM(COALESCE(codigo_item, ''))) != 'SERVICOS' " +
          'GROUP BY substr(data_lancamento, 1, 7), CAST(substr(data_lancamento, 1, 4) AS INTEGER), ' +
          'CAST(substr(data_lancamento, 6, 2) AS INTEGER), (CASE WHEN tem_netsales = 1 THEN 1 ELSE 0 END), ' +
          "(CASE WHEN UPPER(TRIM(grupo_item)) = 'EQUIPAMENTOS' THEN 'EQUIPAMENTOS' " +
          "WHEN UPPER(TRIM(grupo_item)) IN ('PEÇAS', 'PECAS', 'TINTAS', 'ACESSÓRIOS', 'ACESSORIOS') THEN 'INSUMOS' " +
          "ELSE 'OUTROS' END), codigo_cliente",
      )
        .bind({ now: nowIso })
        .execute()

      tq('DELETE FROM resumo_vendas_uf_regiao').execute()
      tq(
        'INSERT INTO resumo_vendas_uf_regiao (' +
          'ano, mes, ano_mes, uf, regiao, tem_netsales, total_linha, qtd_documentos, qtd_itens, created, updated' +
          ') SELECT ' +
          'CAST(substr(data_lancamento, 1, 4) AS INTEGER) AS ano, ' +
          'CAST(substr(data_lancamento, 6, 2) AS INTEGER) AS mes, ' +
          'substr(data_lancamento, 1, 7) AS ano_mes, ' +
          "COALESCE(NULLIF(estado, ''), 'Sem informação') AS uf, " +
          "(CASE WHEN estado IN ('SP', 'RJ', 'MG', 'ES') THEN 'Sudeste' " +
          "WHEN estado IN ('PR', 'RS', 'SC') THEN 'Sul' " +
          "WHEN estado IN ('BA', 'PE', 'CE', 'MA', 'PB', 'RN', 'AL', 'SE', 'PI') THEN 'Nordeste' " +
          "WHEN estado IN ('GO', 'MT', 'MS', 'DF') THEN 'Centro-Oeste' " +
          "WHEN estado IN ('AM', 'PA', 'RO', 'TO', 'AC', 'AP', 'RR') THEN 'Norte' " +
          "ELSE 'Outros' END) AS regiao, " +
          '(CASE WHEN tem_netsales = 1 THEN 1 ELSE 0 END) AS tem_netsales, ' +
          'COALESCE(SUM(total_linha), 0.0) AS total_linha, ' +
          'COUNT(DISTINCT numero_nfe) AS qtd_documentos, ' +
          'COUNT(*) AS qtd_itens, ' +
          '{:now} AS created, {:now} AS updated ' +
          'FROM vendas ' +
          "WHERE data_lancamento IS NOT NULL AND data_lancamento != '' AND data_lancamento >= '2015-01-01' " +
          "AND UPPER(TRIM(COALESCE(codigo_item, ''))) != 'SERVICOS' " +
          'GROUP BY CAST(substr(data_lancamento, 1, 4) AS INTEGER), CAST(substr(data_lancamento, 6, 2) AS INTEGER), ' +
          "substr(data_lancamento, 1, 7), COALESCE(NULLIF(estado, ''), 'Sem informação'), " +
          '(CASE WHEN tem_netsales = 1 THEN 1 ELSE 0 END)',
      )
        .bind({ now: nowIso })
        .execute()
    })

    // ---------- DEPOIS ----------
    const mensalDepois = mensal2025(app)
    console.log(
      TAG + ' DEPOIS vendas 2025 SUM(total_nf_novo) mensal: ' + JSON.stringify(mensalDepois),
    )
    const nf77004Depois = countOf(
      app,
      "SELECT COUNT(*) AS c FROM netsales WHERE serial='77004' OR chave_documento='77004'",
    )
    console.log(TAG + ' DEPOIS: linhas da NF 77004 na bruta = ' + nf77004Depois)

    // Invalida caches em memória (dashboard 5 min / opções de filtros 30 min)
    try {
      // cron reconcile: o reconcile_sales_summaries roda a cada 2h e mantém os
      // resumos alinhados; aqui garantimos estado correto imediato.
      if (typeof globalThis !== 'undefined' && globalThis.__skipDashboardCache) {
        globalThis.__skipDashboardCache.clear()
      }
      if (typeof globalThis !== 'undefined' && globalThis.__skipFilterOptionsCache) {
        globalThis.__skipFilterOptionsCache = new Map()
      }
      console.log(TAG + ' caches invalidados (__skipDashboardCache/__skipFilterOptionsCache)')
    } catch (_) {}
  },
  (app) => {
    // down: no-op — correção de dados não é reversível; reaplicável (idempotente).
  },
)
