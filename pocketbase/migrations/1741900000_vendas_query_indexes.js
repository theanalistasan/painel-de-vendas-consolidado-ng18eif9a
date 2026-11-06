// Migration: índices de consulta na base `vendas` (~310 mil registros) para
// eliminar TIMEOUT_EXCEEDED na Visão Geral, Visão Canais e Filtros Globais.
//
// Padrão do projeto: idempotente (CREATE INDEX IF NOT EXISTS), seguro em
// reexecução e em bases que já possuem índices de versões anteriores
// (ex.: 1740900017_dashboard_performance_indexes).
//
// Campo "canal": a base `vendas` NÃO tem coluna de canal — o canal é resolvido
// em JS pelo mapa de canais_clientes (código/nome do cliente). Por isso os
// índices de "canal" aqui são os índices das chaves de junção do cliente.
//
// Campos numéricos não são criados aqui: todos os índices são de colunas de
// texto/data usados em WHERE/GROUP BY/DISTINCT dos hooks do painel.

migrate(
  (app) => {
    const stmts = [
      // Faixa de datas (mês corrente / janela dinâmica) — substitui varreduras por substr
      'CREATE INDEX IF NOT EXISTS idx_vnd_data_lancamento ON vendas (data_lancamento)',
      'CREATE INDEX IF NOT EXISTS idx_vnd_data_vendedor ON vendas (data_lancamento, nome_vendedor)',

      // Vendedor (filtro e top vendedores)
      'CREATE INDEX IF NOT EXISTS idx_vnd_vendedor ON vendas (nome_vendedor)',
      'CREATE INDEX IF NOT EXISTS idx_vnd_vendedor_cliente ON vendas (vendedor_cliente)',

      // Cliente (código e nome) — chaves de junção com canais_clientes ("canal")
      'CREATE INDEX IF NOT EXISTS idx_vnd_cliente_cod ON vendas (codigo_cliente)',
      'CREATE INDEX IF NOT EXISTS idx_vnd_cliente_nome ON vendas (nome_cliente)',

      // Grupo do item (gráficos por grupo, JP-Class, opções dinâmicas)
      'CREATE INDEX IF NOT EXISTS idx_vnd_grupo_item ON vendas (grupo_item)',

      // UF (Vendas por Estado)
      'CREATE INDEX IF NOT EXISTS idx_vnd_estado ON vendas (estado)',

      // Resumo mensal: cobre DISTINCT de opções dinâmicas e agrupamentos por mês
      'CREATE INDEX IF NOT EXISTS idx_rvm_cliente_nome ON resumo_vendas_mensal (nome_cliente)',
      'CREATE INDEX IF NOT EXISTS idx_rvm_anomes_grupo ON resumo_vendas_mensal (ano_mes, grupo_item)',
      'CREATE INDEX IF NOT EXISTS idx_rvm_anomes_cliente ON resumo_vendas_mensal (ano_mes, codigo_cliente)',
    ]

    for (let i = 0; i < stmts.length; i++) {
      app.db().newQuery(stmts[i]).execute()
    }
  },
  (app) => {
    const drops = [
      'DROP INDEX IF EXISTS idx_vnd_data_lancamento',
      'DROP INDEX IF EXISTS idx_vnd_data_vendedor',
      'DROP INDEX IF EXISTS idx_vnd_vendedor',
      'DROP INDEX IF EXISTS idx_vnd_vendedor_cliente',
      'DROP INDEX IF EXISTS idx_vnd_cliente_cod',
      'DROP INDEX IF EXISTS idx_vnd_cliente_nome',
      'DROP INDEX IF EXISTS idx_vnd_grupo_item',
      'DROP INDEX IF EXISTS idx_vnd_estado',
      'DROP INDEX IF EXISTS idx_rvm_cliente_nome',
      'DROP INDEX IF EXISTS idx_rvm_anomes_grupo',
      'DROP INDEX IF EXISTS idx_rvm_anomes_cliente',
    ]

    for (let i = 0; i < drops.length; i++) {
      app.db().newQuery(drops[i]).execute()
    }
  },
)
