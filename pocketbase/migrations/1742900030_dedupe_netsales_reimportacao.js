// 1742900030: remove as linhas DUPLICADAS deixadas por reimportações em `netsales`.
//
// BUG (2026-11-23): o relatório "Net Sales v4 - Equipamentos" de 01/11 a 23/11
// foi importado duas vezes (18/11 e 23/11). O arquivo do Excel traz cabeçalhos
// com espaço e acento ("Chave Documento", "Código do item", "Nº de Serie do
// Item"), mas o cálculo de `numero_linha` em Importar.tsx comparava os nomes das
// colunas com aliases em snake_case ('chave_documento', 'codigo_item'), sem
// normalizar. O casamento falhava para documento e item, então a chave de
// dedupe virava `|serial|data|` — igual para TODAS as linhas da mesma NF — e a
// contagem de ocorrência corria entre itens diferentes (1,2,3,4,5,6...).
// Resultado: na segunda carga, cada linha recebeu um `numero_linha` diferente da
// primeira (que gravara tudo como 1) e o dedupe do importador não reconheceu a
// linha como existente: ela foi INSERIDA em vez de substituída.
//
// Impacto medido no período: 1.037 linhas duplicadas em `netsales`
// (R$ 1.969.406,19 de Valor Mercadoria) e os totais do painel 1,71x acima da
// planilha — o que aparecia como divergência nos valores semanais do JP-Class.
//
// Critério desta limpeza: para linhas idênticas em documento + NF + item +
// quantidade + valor de mercadoria, mantém a de CARGA MAIS ANTIGA e apaga as
// demais — mas SÓ quando o grupo abrange mais de uma data de carga. Isso
// preserva repetições legítimas dentro do mesmo arquivo (ex.: NF 39615 tem o
// mesmo item duas vezes no mesmo lote) e remove apenas o que veio de reimportação.
migrate(
  (app) => {
    let antes = 0
    let depois = 0
    try {
      const cnt = arrayOf(new DynamicModel({ c: 0 }))
      app.db().newQuery('SELECT COUNT(*) AS c FROM netsales').all(cnt)
      antes = cnt.length > 0 ? Number(cnt[0].c) || 0 : 0
    } catch (e) {
      console.error('[1742900030] contagem inicial falhou:', e)
    }

    try {
      app
        .db()
        .newQuery(`
        DELETE FROM netsales
        WHERE id IN (
          SELECT id FROM (
            SELECT
              id,
              ROW_NUMBER() OVER (
                PARTITION BY chave_documento, serial, codigo_item, quantidade, valor_mercadoria
                ORDER BY data_carga ASC, created ASC
              ) AS rn,
              COUNT(DISTINCT substr(COALESCE(data_carga, ''), 1, 10)) OVER (
                PARTITION BY chave_documento, serial, codigo_item, quantidade, valor_mercadoria
              ) AS cargas
            FROM netsales
          )
          WHERE rn > 1 AND cargas > 1
        )
      `)
        .execute()
    } catch (err) {
      console.error('[1742900030] limpeza de duplicatas falhou:', err)
    }

    try {
      const cnt = arrayOf(new DynamicModel({ c: 0 }))
      app.db().newQuery('SELECT COUNT(*) AS c FROM netsales').all(cnt)
      depois = cnt.length > 0 ? Number(cnt[0].c) || 0 : 0
      console.log(
        '[1742900030] netsales: ' +
          antes +
          ' -> ' +
          depois +
          ' (' +
          (antes - depois) +
          ' duplicata(s) removida(s))',
      )
    } catch (e) {
      console.error('[1742900030] contagem final falhou:', e)
    }
  },
  (app) => {
    // Sem rollback: as linhas removidas eram duplicatas de reimportação.
    // Para repor, basta reimportar o arquivo pelo /importar (após o fix do
    // cálculo de numero_linha, que não gera mais duplicatas).
  },
)
