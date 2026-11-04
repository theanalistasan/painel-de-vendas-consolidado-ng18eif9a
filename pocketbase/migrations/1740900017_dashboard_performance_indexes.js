// Migration 1740900017 — Índices de performance do painel Visão Geral (dashboard_stats)
//
// Causa raiz da lentidão relatada (KPIs/gráficos lentos para atualizar):
//   1. `dashboard_stats` executa ~20 agregações por requisição (sem cache), a maioria
//      GROUP BY sobre resumo_vendas_mensal com funções por linha (UPPER/TRIM/COALESCE),
//      repetindo varreduras da mesma tabela dezenas de vezes.
//   2. Filtros de período caem em `ano = X AND mes = Y` (sem índice composto) e os
//      agrupamentos por ano_mes/grupo_item e por cliente não têm índice de suporte.
//   3. COUNT(DISTINCT codigo_cliente) em resumo_clientes_ativos é avaliado por varredura.
//
// Cria apenas índices NOVOS (nomes distintos dos já existentes criados por
// consolidar_vendas.js: idx_rvm_anomes, idx_rvm_ano, idx_rvm_grupo, idx_rvm_estado,
// idx_rvm_netsales, idx_rvm_vendedor, idx_rvm_vend_cli, idx_rvm_tipo_doc, idx_rvm_util,
// idx_rca_anomes_grp, idx_rca_ano_grp, idx_rvu_*). Idempotente via IF NOT EXISTS.
// Nenhuma regra de negócio é alterada: os números vêm das mesmas tabelas/colunas.

migrate(
  (app) => {
    const ddl = [
      // resumo_vendas_mensal: sustenta GROUP BY (ano_mes, grupo_item) do histórico
      'CREATE INDEX IF NOT EXISTS idx_rvm_anomes_grupo ON resumo_vendas_mensal (ano_mes, grupo_item)',
      // resumo_vendas_mensal: filtros de período (ano = X AND mes = Y) sargáveis
      'CREATE INDEX IF NOT EXISTS idx_rvm_ano_mes ON resumo_vendas_mensal (ano, mes)',
      // resumo_vendas_mensal: GROUP BY/agregação por cliente (top clientes, canais)
      'CREATE INDEX IF NOT EXISTS idx_rvm_codigo_nome_cliente ON resumo_vendas_mensal (codigo_cliente, nome_cliente)',
      // resumo_clientes_ativos: COUNT(DISTINCT codigo_cliente) por período/categoria
      'CREATE INDEX IF NOT EXISTS idx_rca_anomes_grp_cli ON resumo_clientes_ativos (ano_mes, grupo_categoria, codigo_cliente)',
    ]

    for (let i = 0; i < ddl.length; i++) {
      try {
        app.db().newQuery(ddl[i]).execute()
      } catch (err) {
        // IF NOT EXISTS cobre o caso comum; loga qualquer falha real sem abortar.
        console.warn('migration 1740900017: falha ao criar índice:', ddl[i], err)
      }
    }
  },
  (app) => {},
)
