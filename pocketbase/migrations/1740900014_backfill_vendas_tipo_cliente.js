migrate(
  (app) => {
    // 1740900014: Backfill de tipo_cliente, status_cadastro e tipo_pn na tabela de vendas
    // Para todas as vendas com tipo_cliente vazio onde houver correspondência com tipos_cliente
    try {
      app
        .db()
        .newQuery(`
        UPDATE vendas
        SET tipo_cliente = (
          SELECT tc.tipo_cliente
          FROM tipos_cliente tc
          WHERE UPPER(TRIM(tc.codigo_pn)) = UPPER(TRIM(vendas.codigo_cliente))
          LIMIT 1
        ),
        status_cadastro = CASE
          WHEN status_cadastro IS NULL OR TRIM(status_cadastro) = '' THEN (
            SELECT tc.status_cadastro
            FROM tipos_cliente tc
            WHERE UPPER(TRIM(tc.codigo_pn)) = UPPER(TRIM(vendas.codigo_cliente))
            LIMIT 1
          )
          ELSE status_cadastro
        END,
        tipo_pn = CASE
          WHEN tipo_pn IS NULL OR TRIM(tipo_pn) = '' THEN (
            SELECT tc.tipo_pn
            FROM tipos_cliente tc
            WHERE UPPER(TRIM(tc.codigo_pn)) = UPPER(TRIM(vendas.codigo_cliente))
            LIMIT 1
          )
          ELSE tipo_pn
        END
        WHERE (tipo_cliente IS NULL OR TRIM(tipo_cliente) = '')
          AND codigo_cliente IS NOT NULL
          AND TRIM(codigo_cliente) != ''
          AND EXISTS (
            SELECT 1 FROM tipos_cliente tc
            WHERE UPPER(TRIM(tc.codigo_pn)) = UPPER(TRIM(vendas.codigo_cliente))
              AND tc.tipo_cliente IS NOT NULL
              AND TRIM(tc.tipo_cliente) != ''
          )
      `)
        .execute()
      console.log('Migration 1740900014: Backfill de tipo_cliente em vendas executado com sucesso.')
    } catch (err) {
      console.error('Migration 1740900014 erro no backfill:', err)
    }
  },
  (app) => {
    // Reversão não aplicável
  },
)
