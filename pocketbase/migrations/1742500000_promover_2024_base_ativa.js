/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    // Promoção dos dados de 2024 de vendas_historico para as coleções de origem (racnew e netsales)
    // Enriquecimento de grupo_item / itms_grp_nam via tabela produtos
    // Inserção em vendas e atualização do resumo_vendas_mensal para que 2024 apareça nos Filtros Globais
    //
    // Idempotente: pode ser executada múltiplas vezes sem duplicar registros.
    const nowIso = new Date().toISOString()

    const toInt = (v) => {
      if (v === undefined || v === null || v === '') return 0
      const n = parseInt(v, 10)
      return isNaN(n) ? 0 : n
    }

    const toNum = (v) => {
      if (v === undefined || v === null || v === '') return 0
      const n = parseFloat(v)
      return isNaN(n) ? 0 : n
    }

    // 1. Promoção de RacNew de 2024 (origem = 'RacNew' ou sem origem com tem_racnew = 1)
    // Garante que não duplica se já existir em racnew
    app
      .db()
      .newQuery(
        `
        INSERT INTO racnew (
          id, tipo_documento, nf_entrega_futura, numero_sap, numero_nfe,
          data_lancamento, ultima_data_vencimento, docto_origem_destino,
          data_origem_destino, condicao_pagamento, codigo_cliente,
          nome_cliente, numero_linha, codigo_item, descricao_item,
          quantidade, qty_kg_lt, preco_item, desconto_linha, icms, pis,
          cofins, ipi, icms_partilha, total_linha, utilizacao,
          nome_vendedor, custo_item, nome_filial, conta, estado, cidade,
          origem, data_carga, status_cadastro, tipo_pn, tipo_cliente,
          created, updated
        )
        SELECT
          vh.id,
          COALESCE(vh.tipo_documento, ''),
          COALESCE(vh.nf_entrega_futura, ''),
          COALESCE(vh.numero_sap, ''),
          COALESCE(vh.numero_nfe, ''),
          vh.data_lancamento,
          COALESCE(vh.ultima_data_vencimento, ''),
          COALESCE(vh.docto_origem_destino, ''),
          COALESCE(vh.data_origem_destino, ''),
          COALESCE(vh.condicao_pagamento, ''),
          COALESCE(vh.codigo_cliente, ''),
          COALESCE(vh.nome_cliente, ''),
          COALESCE(vh.numero_linha, 1),
          COALESCE(vh.codigo_item, ''),
          COALESCE(vh.descricao_item, ''),
          COALESCE(vh.quantidade, 0.0),
          COALESCE(vh.qty_kg_lt, 0.0),
          COALESCE(vh.preco_item, 0.0),
          COALESCE(vh.desconto_linha, 0.0),
          COALESCE(vh.icms, 0.0),
          COALESCE(vh.pis, 0.0),
          COALESCE(vh.cofins, 0.0),
          COALESCE(vh.ipi, 0.0),
          COALESCE(vh.icms_partilha, 0.0),
          COALESCE(vh.total_linha, 0.0),
          COALESCE(vh.utilizacao, ''),
          COALESCE(vh.nome_vendedor, ''),
          COALESCE(vh.custo_item, 0.0),
          COALESCE(vh.nome_filial, ''),
          COALESCE(vh.conta, ''),
          COALESCE(vh.estado, ''),
          COALESCE(vh.cidade, ''),
          'RacNew' AS origem,
          COALESCE(NULLIF(vh.data_carga, ''), {:now}) AS data_carga,
          COALESCE(vh.status_cadastro, ''),
          COALESCE(vh.tipo_pn, ''),
          COALESCE(vh.tipo_cliente, ''),
          COALESCE(NULLIF(vh.created, ''), {:now}) AS created,
          COALESCE(NULLIF(vh.updated, ''), {:now}) AS updated
        FROM vendas_historico vh
        WHERE vh.data_lancamento >= '2024-01-01' AND vh.data_lancamento <= '2024-12-31'
          AND (vh.origem = 'RacNew' OR (vh.tem_racnew = 1 AND (vh.origem IS NULL OR vh.origem = '' OR vh.origem = 'Consolidado')))
          AND NOT EXISTS (
            SELECT 1 FROM racnew r
            WHERE r.numero_sap = vh.numero_sap
              AND r.numero_nfe = vh.numero_nfe
              AND r.data_lancamento = vh.data_lancamento
              AND r.codigo_cliente = vh.codigo_cliente
              AND r.codigo_item = vh.codigo_item
          )
      `,
      )
      .bind({ now: nowIso })
      .execute()

    // 2. Promoção de NetSales de 2024 (origem = 'NetSales' ou sem origem com tem_netsales = 1)
    // Garante que não duplica se já existir em netsales
    app
      .db()
      .newQuery(
        `
        INSERT INTO netsales (
          id, tipo, codigo_cliente, nome_cliente, grupo_cliente, mercado,
          usuario_emissor, docdate, chave_documento, descrip, itms_grp_nam,
          codigo_item, numero_documento, quantidade, preco_unitario,
          valor_mercadoria, total_nf_sem_frete, total_nf_novo, valor_liquido,
          serial, custo_total, usage, classificacao, revenda, vendedor_revenda,
          municipio, estado, origem, data_carga, status_cadastro, tipo_pn,
          tipo_cliente, created, updated
        )
        SELECT
          vh.id,
          COALESCE(NULLIF(vh.tipo_documento, ''), 'NF'),
          COALESCE(vh.codigo_cliente, ''),
          COALESCE(vh.nome_cliente, ''),
          COALESCE(vh.grupo_cliente, ''),
          COALESCE(vh.mercado, ''),
          COALESCE(vh.usuario_emissor_pedido, ''),
          vh.data_lancamento AS docdate,
          COALESCE(NULLIF(vh.numero_documento_netsales, ''), vh.numero_sap, ''),
          COALESCE(vh.descricao_item, ''),
          COALESCE(NULLIF(vh.itms_grp_nam, ''), p.grupo_item, ''),
          COALESCE(vh.codigo_item, ''),
          COALESCE(NULLIF(vh.numero_documento_netsales, ''), vh.numero_sap, ''),
          COALESCE(vh.quantidade, 0.0),
          COALESCE(vh.preco_unitario, 0.0),
          COALESCE(vh.total_linha, 0.0) AS valor_mercadoria,
          COALESCE(vh.total_nf_sem_frete, 0.0),
          COALESCE(vh.total_nf_novo, 0.0),
          COALESCE(vh.valor_liquido, 0.0),
          COALESCE(vh.numero_nfe, '') AS serial,
          COALESCE(vh.custo_total, 0.0),
          COALESCE(vh.utilizacao, '') AS usage,
          COALESCE(vh.classificacao, ''),
          '' AS revenda,
          COALESCE(vh.vendedor_revenda, ''),
          COALESCE(vh.cidade, '') AS municipio,
          COALESCE(vh.estado, ''),
          'NetSales' AS origem,
          COALESCE(NULLIF(vh.data_carga, ''), {:now}) AS data_carga,
          COALESCE(vh.status_cadastro, ''),
          COALESCE(vh.tipo_pn, ''),
          COALESCE(vh.tipo_cliente, ''),
          COALESCE(NULLIF(vh.created, ''), {:now}) AS created,
          COALESCE(NULLIF(vh.updated, ''), {:now}) AS updated
        FROM vendas_historico vh
        LEFT JOIN produtos p ON p.codigo_item = vh.codigo_item
        WHERE vh.data_lancamento >= '2024-01-01' AND vh.data_lancamento <= '2024-12-31'
          AND (vh.origem = 'NetSales' OR (vh.tem_netsales = 1 AND (vh.origem IS NULL OR vh.origem = '' OR vh.origem = 'Consolidado')))
          AND NOT EXISTS (
            SELECT 1 FROM netsales n
            WHERE n.chave_documento = COALESCE(NULLIF(vh.numero_documento_netsales, ''), vh.numero_sap, '')
              AND n.serial = vh.numero_nfe
              AND n.docdate = vh.data_lancamento
              AND n.codigo_cliente = vh.codigo_cliente
              AND n.codigo_item = vh.codigo_item
          )
      `,
      )
      .bind({ now: nowIso })
      .execute()

    // 3. Remover de vendas_historico os registros de 2024 promovidos
    app
      .db()
      .newQuery(
        `
        DELETE FROM vendas_historico
        WHERE data_lancamento >= '2024-01-01' AND data_lancamento <= '2024-12-31'
          AND (
            id IN (SELECT id FROM racnew WHERE data_lancamento >= '2024-01-01' AND data_lancamento <= '2024-12-31')
            OR id IN (SELECT id FROM netsales WHERE docdate >= '2024-01-01' AND docdate <= '2024-12-31')
          )
      `,
      )
      .execute()

    // 4. Consolidar os dados de 2024 de racnew / netsales para a coleção `vendas`
    // Cruzando com `produtos` para enriquecer `grupo_item` e `tipos_cliente`
    app
      .db()
      .newQuery(
        `
        INSERT INTO vendas (
          id, tipo_documento, nf_entrega_futura, numero_sap, numero_nfe,
          data_lancamento, ultima_data_vencimento, docto_origem_destino,
          data_origem_destino, condicao_pagamento, codigo_cliente,
          nome_cliente, numero_linha, codigo_item, descricao_item,
          quantidade, qty_kg_lt, preco_item, desconto_linha, icms, pis,
          cofins, ipi, icms_partilha, total_linha, utilizacao,
          nome_vendedor, custo_item, nome_filial, conta, estado, cidade,
          grupo_cliente, mercado, usuario_emissor_pedido, itms_grp_nam,
          numero_documento_netsales, preco_unitario, total_nf_sem_frete,
          total_nf_novo, valor_liquido, custo_total, classificacao,
          vendedor_revenda, grupo_item, vendedor_cliente, origem,
          tem_racnew, tem_netsales, status_cadastro, tipo_pn, tipo_cliente,
          data_carga, created, updated
        )
        SELECT
          r.id,
          r.tipo_documento,
          r.nf_entrega_futura,
          r.numero_sap,
          r.numero_nfe,
          r.data_lancamento,
          r.ultima_data_vencimento,
          r.docto_origem_destino,
          r.data_origem_destino,
          r.condicao_pagamento,
          r.codigo_cliente,
          r.nome_cliente,
          COALESCE(r.numero_linha, 1),
          r.codigo_item,
          r.descricao_item,
          COALESCE(r.quantidade, 0.0),
          COALESCE(r.qty_kg_lt, 0.0),
          COALESCE(r.preco_item, 0.0),
          COALESCE(r.desconto_linha, 0.0),
          COALESCE(r.icms, 0.0),
          COALESCE(r.pis, 0.0),
          COALESCE(r.cofins, 0.0),
          COALESCE(r.ipi, 0.0),
          COALESCE(r.icms_partilha, 0.0),
          COALESCE(r.total_linha, 0.0),
          r.utilizacao,
          r.nome_vendedor,
          COALESCE(r.custo_item, 0.0),
          r.nome_filial,
          r.conta,
          r.estado,
          r.cidade,
          COALESCE(n.grupo_cliente, ''),
          COALESCE(n.mercado, ''),
          COALESCE(n.usuario_emissor, ''),
          COALESCE(NULLIF(n.itms_grp_nam, ''), p.grupo_item, ''),
          COALESCE(n.numero_documento, ''),
          COALESCE(n.preco_unitario, 0.0),
          COALESCE(n.total_nf_sem_frete, 0.0),
          COALESCE(n.total_nf_novo, 0.0),
          COALESCE(n.valor_liquido, 0.0),
          COALESCE(n.custo_total, 0.0),
          COALESCE(n.classificacao, ''),
          COALESCE(n.vendedor_revenda, ''),
          COALESCE(NULLIF(p.grupo_item, ''), 'Não Categorizado') AS grupo_item,
          (r.nome_vendedor || ' > ' || r.nome_cliente) AS vendedor_cliente,
          'Consolidado' AS origem,
          1 AS tem_racnew,
          (CASE WHEN n.chave_documento IS NOT NULL AND n.chave_documento != '' THEN 1 ELSE 0 END) AS tem_netsales,
          COALESCE(NULLIF(tc.status_cadastro, ''), NULLIF(r.status_cadastro, ''), NULLIF(n.status_cadastro, ''), '') AS status_cadastro,
          COALESCE(NULLIF(tc.tipo_pn, ''), NULLIF(r.tipo_pn, ''), NULLIF(n.tipo_pn, ''), '') AS tipo_pn,
          COALESCE(NULLIF(tc.tipo_cliente, ''), NULLIF(r.tipo_cliente, ''), NULLIF(n.tipo_cliente, ''), '') AS tipo_cliente,
          {:now} AS data_carga,
          COALESCE(NULLIF(r.created, ''), {:now}) AS created,
          COALESCE(NULLIF(r.updated, ''), {:now}) AS updated
        FROM racnew r
        LEFT JOIN netsales n
          ON n.chave_documento = r.numero_sap
          AND n.serial = r.numero_nfe
          AND n.docdate = r.data_lancamento
          AND n.codigo_cliente = r.codigo_cliente
          AND n.codigo_item = r.codigo_item
        LEFT JOIN produtos p
          ON p.codigo_item = r.codigo_item
        LEFT JOIN tipos_cliente tc
          ON UPPER(TRIM(tc.codigo_pn)) = UPPER(TRIM(r.codigo_cliente))
        WHERE r.data_lancamento >= '2024-01-01' AND r.data_lancamento <= '2024-12-31'
          AND UPPER(TRIM(COALESCE(r.codigo_item, ''))) != 'SERVICOS'
          AND NOT EXISTS (
            SELECT 1 FROM vendas v WHERE v.id = r.id
          )
      `,
      )
      .bind({ now: nowIso })
      .execute()

    // 5. Atualizar resumo_vendas_mensal para incluir o ano de 2024
    app
      .db()
      .newQuery(
        `
        CREATE TABLE IF NOT EXISTS resumo_vendas_mensal (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          ano_mes TEXT NOT NULL,
          ano INTEGER NOT NULL,
          mes INTEGER NOT NULL,
          tem_netsales INTEGER DEFAULT 0,
          grupo_item TEXT,
          estado TEXT,
          nome_vendedor TEXT,
          vendedor_cliente TEXT,
          codigo_cliente TEXT,
          nome_cliente TEXT,
          tipo_documento TEXT,
          utilizacao TEXT,
          total_linha REAL DEFAULT 0,
          valor_liquido REAL DEFAULT 0,
          quantidade REAL DEFAULT 0,
          total_devolucao REAL DEFAULT 0,
          qtd_documentos INTEGER DEFAULT 0,
          qtd_itens INTEGER DEFAULT 0,
          created TEXT,
          updated TEXT
        );
      `,
      )
      .execute()

    app.db().newQuery('DELETE FROM resumo_vendas_mensal WHERE ano = 2024').execute()

    app
      .db()
      .newQuery(
        `
        INSERT INTO resumo_vendas_mensal (
          ano_mes, ano, mes, tem_netsales, grupo_item, estado,
          nome_vendedor, vendedor_cliente, codigo_cliente, nome_cliente,
          tipo_documento, utilizacao, total_linha, valor_liquido,
          quantidade, total_devolucao, qtd_documentos, qtd_itens,
          created, updated
        )
        SELECT
          substr(data_lancamento, 1, 7) AS ano_mes,
          CAST(substr(data_lancamento, 1, 4) AS INTEGER) AS ano,
          CAST(substr(data_lancamento, 6, 2) AS INTEGER) AS mes,
          (CASE WHEN tem_netsales = 1 THEN 1 ELSE 0 END) AS tem_netsales,
          COALESCE(NULLIF(grupo_item, ''), 'Sem informação') AS grupo_item,
          COALESCE(NULLIF(estado, ''), 'Sem informação') AS estado,
          COALESCE(NULLIF(nome_vendedor, ''), 'Sem informação') AS nome_vendedor,
          COALESCE(NULLIF(vendedor_cliente, ''), 'Sem informação') AS vendedor_cliente,
          COALESCE(NULLIF(codigo_cliente, ''), '') AS codigo_cliente,
          COALESCE(NULLIF(nome_cliente, ''), 'Sem informação') AS nome_cliente,
          COALESCE(NULLIF(tipo_documento, ''), 'Sem informação') AS tipo_documento,
          COALESCE(NULLIF(utilizacao, ''), 'Sem informação') AS utilizacao,
          COALESCE(SUM(total_linha), 0.0) AS total_linha,
          COALESCE(SUM(valor_liquido), 0.0) AS valor_liquido,
          COALESCE(SUM(quantidade), 0.0) AS quantidade,
          COALESCE(SUM(CASE WHEN tipo_documento IN ('Dev. Entrega','Dev. NF','DEVNF') THEN total_linha ELSE 0 END), 0.0) AS total_devolucao,
          COUNT(DISTINCT numero_nfe) AS qtd_documentos,
          COUNT(*) AS qtd_itens,
          {:now} AS created,
          {:now} AS updated
        FROM vendas
        WHERE data_lancamento >= '2024-01-01' AND data_lancamento <= '2024-12-31'
          AND UPPER(TRIM(COALESCE(codigo_item, ''))) != 'SERVICOS'
        GROUP BY
          substr(data_lancamento, 1, 7),
          CAST(substr(data_lancamento, 1, 4) AS INTEGER),
          CAST(substr(data_lancamento, 6, 2) AS INTEGER),
          (CASE WHEN tem_netsales = 1 THEN 1 ELSE 0 END),
          COALESCE(NULLIF(grupo_item, ''), 'Sem informação'),
          COALESCE(NULLIF(estado, ''), 'Sem informação'),
          COALESCE(NULLIF(nome_vendedor, ''), 'Sem informação'),
          COALESCE(NULLIF(vendedor_cliente, ''), 'Sem informação'),
          COALESCE(NULLIF(codigo_cliente, ''), ''),
          COALESCE(NULLIF(nome_cliente, ''), 'Sem informação'),
          COALESCE(NULLIF(tipo_documento, ''), 'Sem informação'),
          COALESCE(NULLIF(utilizacao, ''), 'Sem informação')
      `,
      )
      .bind({ now: nowIso })
      .execute()

    // 6. Atualizar resumo_clientes_ativos para 2024
    app
      .db()
      .newQuery(
        `
        CREATE TABLE IF NOT EXISTS resumo_clientes_ativos (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          ano_mes TEXT NOT NULL,
          ano INTEGER NOT NULL,
          mes INTEGER NOT NULL,
          tem_netsales INTEGER DEFAULT 0,
          grupo_categoria TEXT NOT NULL,
          codigo_cliente TEXT NOT NULL,
          created TEXT,
          updated TEXT
        );
      `,
      )
      .execute()

    app.db().newQuery('DELETE FROM resumo_clientes_ativos WHERE ano = 2024').execute()

    app
      .db()
      .newQuery(
        `
        INSERT INTO resumo_clientes_ativos (
          ano_mes, ano, mes, tem_netsales, grupo_categoria, codigo_cliente, created, updated
        )
        SELECT
          substr(data_lancamento, 1, 7) AS ano_mes,
          CAST(substr(data_lancamento, 1, 4) AS INTEGER) AS ano,
          CAST(substr(data_lancamento, 6, 2) AS INTEGER) AS mes,
          (CASE WHEN tem_netsales = 1 THEN 1 ELSE 0 END) AS tem_netsales,
          (CASE
            WHEN UPPER(TRIM(grupo_item)) = 'EQUIPAMENTOS' THEN 'EQUIPAMENTOS'
            WHEN UPPER(TRIM(grupo_item)) IN ('PEÇAS', 'PECAS', 'TINTAS', 'ACESSÓRIOS', 'ACESSORIOS') THEN 'INSUMOS'
            ELSE 'OUTROS'
          END) AS grupo_categoria,
          codigo_cliente,
          {:now} AS created,
          {:now} AS updated
        FROM vendas
        WHERE data_lancamento >= '2024-01-01' AND data_lancamento <= '2024-12-31'
          AND codigo_cliente IS NOT NULL AND codigo_cliente != ''
          AND UPPER(TRIM(grupo_item)) IN ('EQUIPAMENTOS', 'PEÇAS', 'PECAS', 'TINTAS', 'ACESSÓRIOS', 'ACESSORIOS')
          AND UPPER(TRIM(COALESCE(codigo_item, ''))) != 'SERVICOS'
        GROUP BY
          substr(data_lancamento, 1, 7),
          CAST(substr(data_lancamento, 1, 4) AS INTEGER),
          CAST(substr(data_lancamento, 6, 2) AS INTEGER),
          (CASE WHEN tem_netsales = 1 THEN 1 ELSE 0 END),
          (CASE
            WHEN UPPER(TRIM(grupo_item)) = 'EQUIPAMENTOS' THEN 'EQUIPAMENTOS'
            WHEN UPPER(TRIM(grupo_item)) IN ('PEÇAS', 'PECAS', 'TINTAS', 'ACESSÓRIOS', 'ACESSORIOS') THEN 'INSUMOS'
            ELSE 'OUTROS'
          END),
          codigo_cliente
      `,
      )
      .bind({ now: nowIso })
      .execute()

    // 7. Atualizar resumo_vendas_uf_regiao para 2024
    app
      .db()
      .newQuery(
        `
        CREATE TABLE IF NOT EXISTS resumo_vendas_uf_regiao (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          ano INTEGER NOT NULL,
          mes INTEGER NOT NULL,
          ano_mes TEXT NOT NULL,
          uf TEXT NOT NULL,
          regiao TEXT NOT NULL,
          tem_netsales INTEGER DEFAULT 0,
          total_linha REAL DEFAULT 0,
          qtd_documentos INTEGER DEFAULT 0,
          qtd_itens INTEGER DEFAULT 0,
          created TEXT,
          updated TEXT
        );
      `,
      )
      .execute()

    app.db().newQuery('DELETE FROM resumo_vendas_uf_regiao WHERE ano = 2024').execute()

    app
      .db()
      .newQuery(
        `
        INSERT INTO resumo_vendas_uf_regiao (
          ano, mes, ano_mes, uf, regiao, tem_netsales, total_linha, qtd_documentos, qtd_itens, created, updated
        )
        SELECT
          CAST(substr(data_lancamento, 1, 4) AS INTEGER) AS ano,
          CAST(substr(data_lancamento, 6, 2) AS INTEGER) AS mes,
          substr(data_lancamento, 1, 7) AS ano_mes,
          COALESCE(NULLIF(estado, ''), 'Sem informação') AS uf,
          (CASE
            WHEN estado IN ('SP', 'RJ', 'MG', 'ES') THEN 'Sudeste'
            WHEN estado IN ('PR', 'RS', 'SC') THEN 'Sul'
            WHEN estado IN ('BA', 'PE', 'CE', 'MA', 'PB', 'RN', 'AL', 'SE', 'PI') THEN 'Nordeste'
            WHEN estado IN ('GO', 'MT', 'MS', 'DF') THEN 'Centro-Oeste'
            WHEN estado IN ('AM', 'PA', 'RO', 'TO', 'AC', 'AP', 'RR') THEN 'Norte'
            ELSE 'Outros'
          END) AS regiao,
          (CASE WHEN tem_netsales = 1 THEN 1 ELSE 0 END) AS tem_netsales,
          COALESCE(SUM(total_linha), 0.0) AS total_linha,
          COUNT(DISTINCT numero_nfe) AS qtd_documentos,
          COUNT(*) AS qtd_itens,
          {:now} AS created,
          {:now} AS updated
        FROM vendas
        WHERE data_lancamento >= '2024-01-01' AND data_lancamento <= '2024-12-31'
          AND UPPER(TRIM(COALESCE(codigo_item, ''))) != 'SERVICOS'
        GROUP BY
          CAST(substr(data_lancamento, 1, 4) AS INTEGER),
          CAST(substr(data_lancamento, 6, 2) AS INTEGER),
          substr(data_lancamento, 1, 7),
          COALESCE(NULLIF(estado, ''), 'Sem informação'),
          (CASE WHEN tem_netsales = 1 THEN 1 ELSE 0 END)
      `,
      )
      .bind({ now: nowIso })
      .execute()

    // 8. Invalidar cache de filterOptions se globalThis existir
    if (typeof globalThis !== 'undefined' && globalThis.__skipFilterOptionsCache) {
      globalThis.__skipFilterOptionsCache = new Map()
    }
    if (typeof globalThis !== 'undefined' && globalThis.__skipDashboardCache) {
      globalThis.__skipDashboardCache = new Map()
    }
  },
  (app) => {
    // Reversão não necessária / no-op idempotente
  },
)
