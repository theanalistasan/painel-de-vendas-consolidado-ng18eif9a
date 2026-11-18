// 1742800000: adiciona `numero_linha` à coleção `netsales`.
//
// MOTIVO (bug encontrado em 2026-11-18, caso AGIS out/2026):
// a chave de deduplicação do importador NetSales_v4 era
//   chave_documento + serial + docdate + codigo_cliente + codigo_item
// e NÃO distingue duas linhas legítimas do MESMO item na MESMA nota. A segunda
// linha da planilha era tratada como "chave já existe" e SOBRESCREVIA a
// primeira (variável `substituidos`), com perda silenciosa de faturamento.
//
// Exemplo real (planilha do gerente, NF 87423 / item BF-16):
//   7 linhas na fonte  ->  5 linhas no painel  =  R$ 107.758,96 brutos perdidos.
//
// A planilha NetSales_v4 do SAP NÃO traz coluna de número de linha, então o
// desempate é a OCORRÊNCIA da linha dentro do mesmo grupo da chave: 1ª, 2ª, 3ª...
// O frontend (`Importar.tsx`) calcula esse índice sobre o arquivo INTEIRO (antes
// de fatiar em lotes de 5.000) e envia em cada linha; o importador passa a usar
// `numero_linha` como parte da chave, preservando as repetições.
//
// Idempotente: só adiciona o campo se ele ainda não existir.

migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('netsales')
    let existe = false
    const fields = col.fields || col.schema || []
    for (let i = 0; i < fields.length; i++) {
      if (fields[i] && fields[i].name === 'numero_linha') {
        existe = true
        break
      }
    }
    if (existe) return
    col.fields.add(
      new NumberField({
        name: 'numero_linha',
        required: false,
        onlyInt: true,
      }),
    )
    app.save(col)
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('netsales')
      col.fields.removeByName('numero_linha')
      app.save(col)
    } catch (_) {}
  },
)
