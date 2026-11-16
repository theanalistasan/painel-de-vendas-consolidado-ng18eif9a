// 1742700000: índices para os filtros de dimensão da Visão Canais e dos gráficos
// históricos, após a carga de 2024 (base `vendas` cresceu de 38.814 para 61 mil
// linhas, +57%, e as consultas de cache frio do dashboard_stats passaram a levar
// 10-14s, estourando o teto de 25s e devolvendo 504 para o usuário).
//
// Índices criados:
// 1. (vendedor_cliente, data_lancamento) — filtro "Vendedor > Cliente" da Visão
//    Canais combinado com a janela de 6 meses / período. Sem ele o SQLite escolhe
//    um dos índices simples e ainda precisa ordenar/filtrar por data.
// 2. (grupo_item, data_lancamento) — gráficos históricos de Equipamentos e
//    Insumos, que filtram grupo do item + faixa de data desde 2015.
// 3. (data_lancamento, codigo_item) — relatório consolidado por Código de Item.
// 4. (data_lancamento, numero_nfe) já existe (0024); nada a fazer.
//
// Idempotente via IF NOT EXISTS. Nenhuma regra de negócio é alterada.

migrate(
  (app) => {
    const ddl = [
      'CREATE INDEX IF NOT EXISTS idx_vnd_vendcli_data ON vendas (vendedor_cliente, data_lancamento)',
      'CREATE INDEX IF NOT EXISTS idx_vnd_grupo_data ON vendas (grupo_item, data_lancamento)',
      'CREATE INDEX IF NOT EXISTS idx_vnd_data_item ON vendas (data_lancamento, codigo_item)',
      'CREATE INDEX IF NOT EXISTS idx_vh_data_lancamento ON vendas_historico (data_lancamento)',
    ]

    for (let i = 0; i < ddl.length; i++) {
      try {
        app.db().newQuery(ddl[i]).execute()
      } catch (err) {
        // Não aborta a migration por um índice: loga e segue.
        console.warn('migration 1742700000: falha ao criar índice:', ddl[i], err)
      }
    }
  },
  (app) => {
    const drops = [
      'DROP INDEX IF EXISTS idx_vnd_vendcli_data',
      'DROP INDEX IF EXISTS idx_vnd_grupo_data',
      'DROP INDEX IF EXISTS idx_vnd_data_item',
      'DROP INDEX IF EXISTS idx_vh_data_lancamento',
    ]
    for (let i = 0; i < drops.length; i++) {
      try {
        app.db().newQuery(drops[i]).execute()
      } catch (_) {}
    }
  },
)
