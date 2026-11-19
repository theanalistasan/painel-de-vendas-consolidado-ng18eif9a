migrate(
  (app) => {
    // JANELA AMPLIADA (decisão do Silvio, 2026-11-19): as bases de 2019 a 2022
    // passam a integrar a base ATIVA (netsales -> vendas) para aparecerem nos
    // dashboards. Antes, tudo anterior a 2023 era roteado para
    // `vendas_historico`, que nenhuma tela lê — a carga "dava sucesso" e ficava
    // invisível.
    //
    // Esta migração é DELIBERADAMENTE conservadora: NÃO move registros entre
    // bases. O corte da janela vive nos hooks (import_netsales_v4.js e
    // consolidar_vendas.js), que já leem tudo o que está em `netsales`; logo,
    // basta a próxima consolidação rodar para 2019-2022 aparecerem. Mover dados
    // aqui, a cada deploy, arriscaria duplicar linhas entre `netsales` e
    // `vendas_historico`, que não compartilham chave.
    //
    // O que faz: índices de data para os filtros por ano não varrerem a base.

    const queries = [
      // Base ativa: filtro por ano (dashboards e relatórios).
      'CREATE INDEX IF NOT EXISTS idx_netsales_docdate_ano ON netsales (docdate)',
      // Consolidada: mesmo filtro, onde os dashboards realmente leem.
      'CREATE INDEX IF NOT EXISTS idx_vendas_data_lancamento ON vendas (data_lancamento)',
      // Histórico: mantém o filtro barato caso alguma consulta futura o use.
      'CREATE INDEX IF NOT EXISTS idx_vh_data_lancamento ON vendas_historico (data_lancamento)',
    ]

    for (let i = 0; i < queries.length; i++) {
      try {
        app.db().newQuery(queries[i]).execute()
      } catch (errIdx) {
        console.warn('1742900010: índice ignorado (' + queries[i] + '):', errIdx)
      }
    }
  },
  (app) => {
    // Os índices são aditivos e baratos; remove-os no rollback.
    const drops = [
      'DROP INDEX IF EXISTS idx_netsales_docdate_ano',
      'DROP INDEX IF EXISTS idx_vendas_data_lancamento',
      'DROP INDEX IF EXISTS idx_vh_data_lancamento',
    ]
    for (let i = 0; i < drops.length; i++) {
      try {
        app.db().newQuery(drops[i]).execute()
      } catch (_) {}
    }
  },
)
