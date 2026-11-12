// 1742600003: adiciona campo derivado grupo_item_derivado em pedidos_abertos
// (Tintas/Acessórios/Peças/Equipamentos/Outros) para alimentar o filtro
// "Grupo do Item" de Pedidos em Aberto; backfill por UPDATE CASE em SQL puro.
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('pedidos_abertos')

    if (!col.fields.getByName('grupo_item_derivado')) {
      col.fields.add(new TextField({ name: 'grupo_item_derivado', type: 'text' }))
    }
    app.save(col)

    // Backfill: mesma regra de src/lib/grupo-categoria.ts (case-insensitive;
    // ignora acentos comparando com e sem acento; vazio → Outros).
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

    // Índice de filtro (criado por DDL direto: addIndex exigiria novo save)
    app
      .db()
      .newQuery(
        'CREATE INDEX IF NOT EXISTS idx_pa_grupo_item_derivado ON pedidos_abertos (grupo_item_derivado)',
      )
      .execute()
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('pedidos_abertos')
      col.removeIndex('idx_pa_grupo_item_derivado')
      const f = col.fields.getByName('grupo_item_derivado')
      if (f) col.fields.remove(f)
      app.save(col)
    } catch (_) {}
  },
)
