// 1742600001: Índices de junção da consolidação NetSales_v4 (consolidar_vendas.js)
//
// Joins reais do consolidador (lote de 10.000 registros de `netsales`):
//   1. produtos p ON p.codigo_item = n.codigo_item                      -> coberto por
//      idx_produtos_codigo_item (unique) e idx_netsales_codigo_item (já existem).
//   2. tipos_cliente tc ON UPPER(TRIM(tc.codigo_pn)) = UPPER(TRIM(n.codigo_cliente))
//      -> índice de coluna simples NÃO é usado pelo SQLite aqui, porque o join
//      aplica UPPER(TRIM(...)) na coluna. Sem índice de expressão, cada lote faz
//      varredura completa de tipos_cliente por linha (lotes de 84-125s).
//      Correção: índice de EXPRESSÃO UPPER(TRIM(codigo_pn)) em tipos_cliente.
//   3. Rotas fora da janela dinâmica: findRecordsByFilter em vendas_historico por
//      numero_sap, numero_nfe, codigo_item e codigo_cliente -> índice composto.
//
// Migration idempotente: os CREATE INDEX usam IF NOT EXISTS; se já aplicada, é no-op.
migrate(
  (app) => {
    // 1. tipos_cliente: índice de expressão exatamente como o join usa
    app
      .db()
      .newQuery(
        'CREATE INDEX IF NOT EXISTS idx_tipos_cliente_codigo_pn_norm ON tipos_cliente (UPPER(TRIM(codigo_pn)))',
      )
      .execute()

    // 2. vendas_historico: chaves do filtro de roteamento fora-da-janela
    app
      .db()
      .newQuery(
        'CREATE INDEX IF NOT EXISTS idx_vh_routing_keys ON vendas_historico (numero_sap, numero_nfe, codigo_item, codigo_cliente)',
      )
      .execute()

    // 3. Confirmação defensiva dos índices mínimos já esperados (no-op se existirem)
    app
      .db()
      .newQuery('CREATE INDEX IF NOT EXISTS idx_netsales_codigo_item ON netsales (codigo_item)')
      .execute()
    app
      .db()
      .newQuery(
        'CREATE INDEX IF NOT EXISTS idx_netsales_codigo_cliente ON netsales (codigo_cliente)',
      )
      .execute()
    app.db().newQuery('CREATE INDEX IF NOT EXISTS idx_netsales_id ON netsales (id)').execute()
    app
      .db()
      .newQuery(
        'CREATE INDEX IF NOT EXISTS idx_produtos_codigo_item_join ON produtos (codigo_item)',
      )
      .execute()
  },
  (app) => {
    try {
      app.db().newQuery('DROP INDEX IF EXISTS idx_tipos_cliente_codigo_pn_norm').execute()
    } catch (_) {}
    try {
      app.db().newQuery('DROP INDEX IF EXISTS idx_vh_routing_keys').execute()
    } catch (_) {}
  },
)
