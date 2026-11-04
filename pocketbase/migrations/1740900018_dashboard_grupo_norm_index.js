// Migration 1740900018 — Índice de expressão para o filtro/agrupamento por grupo do item
//
// O painel Visão Geral filtra e agrega sempre com UPPER(TRIM(grupo_item)) (o resumo é
// gravado já normalizado, mas o hook mantém a normalização por segurança). Funções por
// linha impedem o uso dos índices simples e forçam varredura completa do resumo em
// quase todas as queries de dashboard_stats.js. Um índice de EXPRESSão idêntico à
// expressão usada nas queries permite que o SQLite satisfaça esses termos pelo índice.
//
// Idempotente (IF NOT EXISTS). Não altera valores nem regras de negócio.

migrate(
  (app) => {
    const ddl = [
      'CREATE INDEX IF NOT EXISTS idx_rvm_grupo_norm ON resumo_vendas_mensal (UPPER(TRIM(grupo_item)), ano_mes)',
    ]

    for (let i = 0; i < ddl.length; i++) {
      try {
        app.db().newQuery(ddl[i]).execute()
      } catch (err) {
        console.warn('migration 1740900018: falha ao criar índice:', ddl[i], err)
      }
    }
  },
  (app) => {},
)
