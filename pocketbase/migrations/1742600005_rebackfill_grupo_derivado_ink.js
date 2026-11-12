// 1742600005: re-backfill idempotente de grupo_item_derivado em pedidos_abertos,
// alinhando TODAS as linhas à regra do usuário: Tintas representa tudo o que é
// INK* (grupo do item começando com INK, ex. "INK VERSAOBJECT UV VD").
// O backfill anterior (1742600004) só tocava em linhas com a coluna vazia e
// classificava por '%TINTA%', então linhas "INK ..." gravadas como 'Outros'
// ficaram para trás — o filtro Grupo do Item não encontrava as tintas.
// Recalcula a coluna inteira (regra determinística, mesmo resultado em qualquer
// execução) e garante o índice do filtro derivado.
migrate(
  (app) => {
    app
      .db()
      .newQuery(
        'UPDATE pedidos_abertos SET grupo_item_derivado = CASE ' +
          "WHEN UPPER(COALESCE(grupo_item, '')) LIKE 'INK%' THEN 'Tintas' " +
          "WHEN UPPER(COALESCE(grupo_item, '')) LIKE '%TINTA%' THEN 'Tintas' " +
          "WHEN UPPER(COALESCE(grupo_item, '')) LIKE '%ACESSOR%' OR UPPER(COALESCE(grupo_item, '')) LIKE '%ACCESS%' THEN 'Acessórios' " +
          "WHEN UPPER(COALESCE(grupo_item, '')) LIKE '%PECA%' OR UPPER(COALESCE(grupo_item, '')) LIKE '%PEÇA%' THEN 'Peças' " +
          "WHEN UPPER(COALESCE(grupo_item, '')) LIKE 'EQUIP%' OR UPPER(COALESCE(grupo_item, '')) LIKE '%EQUIPAMENTO%' THEN 'Equipamentos' " +
          "ELSE 'Outros' END",
      )
      .execute()

    // Garantia de índice (idempotente) para o filtro derivado não varrer a tabela.
    app
      .db()
      .newQuery(
        'CREATE INDEX IF NOT EXISTS idx_pa_grupo_item_derivado ON pedidos_abertos (grupo_item_derivado)',
      )
      .execute()
  },
  (app) => {
    // Down: não remove a coluna (dona é 1742600003) nem os dados — no-op seguro.
  },
)
