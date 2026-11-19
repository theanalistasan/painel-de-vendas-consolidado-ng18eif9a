// 1742900020: leva o SERIAL DO EQUIPAMENTO para a base `vendas`.
//
// Contexto (2026-11-19): o serial da máquina entrou em `netsales`
// (`serial_equipamento`, ver 1742900000) e a carga foi feita. O Relatório
// Consolidado de Vendas, porém, lê a coleção derivada `vendas`, que não tinha
// essa coluna — então o serial não aparecia no relatório.
//
// Aqui a coluna é criada em `vendas` (e em `vendas_staging`, usada pelo
// consolidador como área de troca). O preenchimento acontece na consolidação
// (consolidar_vendas.js), que passa a copiar `netsales.serial_equipamento`.
// Até a próxima consolidação a coluna fica vazia — por isso esta migração
// também faz um backfill direto, casando as linhas por NF + item + numero_linha,
// para o relatório já mostrar o serial sem exigir reprocessar 142 mil registros.
migrate(
  (app) => {
    // ---------- 1. coluna em vendas ----------
    const vendas = app.findCollectionByNameOrId('vendas')
    if (!vendas.fields.getByName('serial_equipamento')) {
      vendas.fields.add(new TextField({ name: 'serial_equipamento', required: false }))
    }
    vendas.addIndex('idx_vendas_serial_equipamento', false, 'serial_equipamento', '')
    app.save(vendas)

    // ---------- 2. coluna em vendas_staging (se a tabela existir) ----------
    try {
      app.db().newQuery('ALTER TABLE vendas_staging ADD COLUMN serial_equipamento TEXT').execute()
    } catch (_) {
      // Coluna já existe (ou staging não existe neste momento): segue.
    }

    // ---------- 3. backfill a partir de netsales ----------
    // Casa pela identidade da linha na fonte: NF (netsales.serial guarda o
    // NÚMERO DA NF), código do item e a ocorrência da linha. Sem o numero_linha
    // as linhas repetidas da mesma nota receberiam todas o mesmo serial.
    try {
      const rows = arrayOf(new DynamicModel({ total: 0 }))
      app
        .db()
        .newQuery(
          'UPDATE vendas SET serial_equipamento = (' +
            '  SELECT n.serial_equipamento FROM netsales n' +
            '  WHERE n.serial = vendas.numero_nfe' +
            '    AND n.codigo_item = vendas.codigo_item' +
            '    AND COALESCE(n.numero_linha, 0) = COALESCE(vendas.numero_linha, 0)' +
            "    AND TRIM(COALESCE(n.serial_equipamento, '')) != ''" +
            '  LIMIT 1' +
            ') ' +
            'WHERE EXISTS (' +
            '  SELECT 1 FROM netsales n' +
            '  WHERE n.serial = vendas.numero_nfe' +
            '    AND n.codigo_item = vendas.codigo_item' +
            '    AND COALESCE(n.numero_linha, 0) = COALESCE(vendas.numero_linha, 0)' +
            "    AND TRIM(COALESCE(n.serial_equipamento, '')) != ''" +
            ')',
        )
        .execute()

      app
        .db()
        .newQuery(
          "SELECT COUNT(*) AS total FROM vendas WHERE TRIM(COALESCE(serial_equipamento, '')) != ''",
        )
        .all(rows)
      console.log(
        '[1742900020] backfill de serial_equipamento em vendas: ' +
          (rows.length > 0 ? rows[0].total : 0) +
          ' linha(s)',
      )
    } catch (backfillErr) {
      // O backfill é conveniência: se falhar, a próxima consolidação preenche.
      console.error('[1742900020] backfill falhou (a consolidação preenche depois):', backfillErr)
    }
  },
  (app) => {
    try {
      const vendas = app.findCollectionByNameOrId('vendas')
      vendas.removeIndex('idx_vendas_serial_equipamento')
      const f = vendas.fields.getByName('serial_equipamento')
      if (f) vendas.fields.remove(f.id)
      app.save(vendas)
    } catch (_) {}
    try {
      app.db().newQuery('ALTER TABLE vendas_staging DROP COLUMN serial_equipamento').execute()
    } catch (_) {}
  },
)
