// 1742600004: backfill idempotente de grupo_item_derivado em pedidos_abertos.
// A migration 1742600003 já criou a coluna, o índice e um backfill; esta cobre
// QUALQUER linha que ficou para trás (ex.: importada entre a criação da coluna
// e o backfill, ou com grupo_item alterado depois). Segura para rodar sempre:
// só toca em linhas com grupo_item_derivado vazio/NULL (a regra não tem caso
// "vazio" — grupo_item vazio deriva 'Outros').
migrate(
  (app) => {
    app
      .db()
      .newQuery(
        'UPDATE pedidos_abertos SET grupo_item_derivado = CASE ' +
          "WHEN UPPER(COALESCE(grupo_item, '')) LIKE '%TINTA%' THEN 'Tintas' " +
          "WHEN UPPER(COALESCE(grupo_item, '')) LIKE '%ACESSOR%' THEN 'Acessórios' " +
          "WHEN UPPER(COALESCE(grupo_item, '')) LIKE '%PECA%' OR UPPER(COALESCE(grupo_item, '')) LIKE '%PEÇA%' THEN 'Peças' " +
          "WHEN UPPER(COALESCE(grupo_item, '')) LIKE '%EQUIP%' THEN 'Equipamentos' " +
          "ELSE 'Outros' END " +
          "WHERE grupo_item_derivado IS NULL OR grupo_item_derivado = ''",
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
    // Down: não remove a coluna (dono é 1742600003) nem os dados — no-op seguro.
  },
)
