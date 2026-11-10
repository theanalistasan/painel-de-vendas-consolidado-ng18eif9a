/// <reference path="../pb_data/types.d.ts" />

// Regra de negócio (Silvio) — campo concatenado "Vendedor > Cliente":
//   vendedor_cliente = campo REVENDA + ' > ' + NOME DO CLIENTE  (base NetSales_v4)
// Exemplos:
//   "Roland DG Brasil > DIAMANTE COMERCIO DE TINTAS LTDA"
//   "DIAMANTE COMERCIO DE TINTAS LTDA > DIAMANTE COMERCIO DE TINTAS LTDA"
//   "DIAMANTE COMERCIO DE TINTAS LTDA > MITSUCO IWANO HATTANDA"
//
// Backfill IDEMPOTENTE: registros já consolidados com a composição antiga
// (prefixo = nome_vendedor) são recalculados a partir de netsales.revenda,
// reencontrando a linha de origem pela chave composta de dedup
// (numero_sap + numero_nfe + codigo_item + codigo_cliente).
// - Se a linha não for reencontrada no netsales, nada é alterado (NULL não casa).
// - Se o valor já estiver correto, o UPDATE não altera nada (no-op).
// - Em base vazia, é um no-op puro.
//
// IMPORTANTE: esta migration NÃO altera a classificação de Não Comissionados
// (revenda = vendedor por código e nome cliente = nome vendedor permanecem
// comparados como antes, em src/lib/comissao.ts e comissao_helper.js).

migrate(
  (app) => {
    var tables = ['vendas', 'vendas_historico']

    for (var t = 0; t < tables.length; t++) {
      var table = tables[t]
      var subSel =
        "SELECT COALESCE(NULLIF(TRIM(ns.revenda), ''), " +
        table +
        ".nome_cliente) || ' > ' || " +
        table +
        '.nome_cliente ' +
        'FROM netsales ns ' +
        'WHERE ns.numero_sap = ' +
        table +
        '.numero_sap ' +
        'AND ns.numero_nfe = ' +
        table +
        '.numero_nfe ' +
        'AND ns.codigo_item = ' +
        table +
        '.codigo_item ' +
        'AND ns.codigo_cliente = ' +
        table +
        '.codigo_cliente ' +
        'LIMIT 1'

      try {
        app
          .db()
          .newQuery(
            'UPDATE ' +
              table +
              ' SET vendedor_cliente = (' +
              subSel +
              ') ' +
              "WHERE vendedor_cliente IS NULL OR vendedor_cliente = '' OR vendedor_cliente != (" +
              subSel +
              ')',
          )
          .execute()
      } catch (err) {
        // Tabela pode não existir em instâncias novas — segue para a próxima.
        console.warn('[backfill_vendedor_cliente] ' + table + ': ' + err)
      }
    }
  },
  (app) => {
    // Rollback: não é possível restaurar a composição antiga com segurança;
    // a recarga/consolidação refaz o campo com a fórmula nova.
  },
)
