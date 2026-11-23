// 1742900032: conclui o dedupe de reimportação em `netsales`.
//
// Contexto: o arquivo "Net Sales v4 - Equipamentos" (01/11 a 23/11/2026) foi
// importado duas vezes (18/11 e 23/11). O cálculo de `numero_linha` em
// Importar.tsx comparava cabeçalhos do Excel ("Chave Documento", "Código do
// item") com aliases snake_case por igualdade EXATA — nunca casava, a chave de
// dedupe degenerava para `|serial|data|` e a 2ª carga INSERIU 1.037 linhas em
// vez de substituir. Isso deixou os valores do JP-Class 1,71x acima da planilha.
//
// A rota /backend/v1/admin/dedupe-netsales começou a limpeza (removendo linha a
// linha com $app.delete) mas estourou o gateway em 1030 grupos. Esta migração
// conclui o trabalho em UMA instrução SQL.
//
// REGRA: para cada (chave_documento, serial, codigo_item), apaga a linha quando
// existe outra do MESMO grupo com `data_carga` mais antiga. Ou seja: preserva a
// carga mais antiga e remove as que vieram nas reimportações posteriores.
// Repetições legítimas dentro do MESMO arquivo (mesma data_carga) continuam,
// porque entre elas não existe data mais antiga — é o caso da NF 39615, que tem
// o mesmo item duas vezes na mesma carga.
migrate(
  (app) => {
    const contar = () => {
      try {
        const r = arrayOf(new DynamicModel({ c: 0 }))
        app.db().newQuery('SELECT COUNT(*) AS c FROM netsales').all(r)
        return r.length > 0 ? Number(r[0].c) || 0 : 0
      } catch (e) {
        return -1
      }
    }

    const antes = contar()

    try {
      app
        .db()
        .newQuery(
          'DELETE FROM netsales WHERE id IN (' +
            '  SELECT n1.id FROM netsales n1' +
            '  WHERE EXISTS (' +
            '    SELECT 1 FROM netsales n2' +
            "    WHERE COALESCE(n2.chave_documento, '') = COALESCE(n1.chave_documento, '')" +
            "      AND COALESCE(n2.serial, '') = COALESCE(n1.serial, '')" +
            "      AND COALESCE(n2.codigo_item, '') = COALESCE(n1.codigo_item, '')" +
            "      AND substr(COALESCE(n2.data_carga, ''), 1, 10) < substr(COALESCE(n1.data_carga, ''), 1, 10)" +
            '  )' +
            ')',
        )
        .execute()
    } catch (err) {
      console.error('[1742900032] DELETE falhou:', err)
    }

    const depois = contar()
    console.log(
      '[1742900032] netsales: ' + antes + ' -> ' + depois + ' (' + (antes - depois) + ' removidas)',
    )
  },
  (app) => {
    // Sem rollback: as linhas removidas eram cópias de reimportação.
  },
)
