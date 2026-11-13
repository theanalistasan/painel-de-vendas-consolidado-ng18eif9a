// admin_dedupe_netsales.js — Manutenção: remove duplicatas da bruta NetSales.
// Endpoint: POST /backend/v1/admin/dedupe-netsales
// Body: { dry_run: true | false } (padrão: true = só mede, não apaga).
//
// Chave de dedupe (mesma do importador import_netsales_v4.js):
//   chave_documento + serial + docdate + codigo_cliente + codigo_item
// Mantém UMA cópia por chave: a de data_carga mais recente (desempate: id maior).
// Só admins (role = 'admin') podem executar.

routerAdd(
  'POST',
  '/backend/v1/admin/dedupe-netsales',
  (e) => {
    const auth = e.auth
    if (!auth || auth.get('role') !== 'admin') {
      return e.json(403, { error: 'Somente administradores podem deduplicar a base.' })
    }

    const body = e.requestInfo().body || {}
    const dryRun = body.dry_run !== false

    const chaveCte = `
      SELECT id, ROW_NUMBER() OVER (
        PARTITION BY chave_documento, serial, docdate, codigo_cliente, codigo_item
        ORDER BY data_carga DESC, id DESC
      ) AS rn
      FROM netsales
    `

    const totalRows = arrayOf(new DynamicModel({ total: '', grupos: '' }))
    $app
      .db()
      .newQuery(
        `SELECT
           (SELECT COUNT(*) FROM netsales) AS total,
           (SELECT COUNT(*) FROM (
              SELECT 1 FROM netsales
              GROUP BY chave_documento, serial, docdate, codigo_cliente, codigo_item
           )) AS grupos`,
      )
      .all(totalRows)
    const total = Number(totalRows[0].total) || 0
    const grupos = Number(totalRows[0].grupos) || 0

    const dupRows = arrayOf(new DynamicModel({ extras: '' }))
    $app.db().newQuery(`SELECT COUNT(*) AS extras FROM (${chaveCte}) WHERE rn > 1`).all(dupRows)
    const extras = Number(dupRows[0].extras) || 0

    let removidos = 0
    if (!dryRun && extras > 0) {
      $app
        .db()
        .newQuery(`DELETE FROM netsales WHERE id IN (SELECT id FROM (${chaveCte}) WHERE rn > 1)`)
        .execute()
      removidos = extras
      try {
        const logsCol = $app.findCollectionByNameOrId('audit_logs')
        const record = new Record(logsCol)
        record.set('action', 'dedupe_netsales')
        record.set('user', auth.get('id'))
        record.set(
          'details',
          'Deduplicação da bruta netsales: ' + removidos + ' duplicata(s) removida(s)',
        )
        $app.save(record)
      } catch (errAudit) {
        console.warn('[dedupe-netsales] auditoria falhou:', errAudit)
      }
    }

    return e.json(200, {
      success: true,
      dry_run: dryRun,
      total_linhas: total,
      chaves_unicas: grupos,
      duplicatas: extras,
      removidas: removidos,
    })
  },
  $apis.requireAuth(),
)
