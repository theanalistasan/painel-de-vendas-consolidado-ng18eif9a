// 1742800001: backfill de `numero_linha` (ocorrência da linha) nos registros
// que já existem em `netsales` e `vendas`.
//
// POR QUE ISTO É NECESSÁRIO ANTES DE QUALQUER REIMPORTAÇÃO:
// a correção da chave de dedupe (1742800000) passou a comparar
//   ... AND COALESCE(numero_linha, 0) = {:ln}
// Os registros já gravados têm numero_linha nulo (0). Uma nova importação chega
// com ocorrência 1, 2, 3... e NÃO casaria com o 0, então inseriria tudo de novo
// — duplicando a base inteira em vez de corrigi-la.
//
// Atribuindo a ocorrência 1..n aos registros existentes (por id, dentro de cada
// grupo da chave), a próxima importação do mesmo arquivo passa a CASAR:
//   - 1ª ocorrência do arquivo  -> atualiza o registro de numero_linha = 1
//   - 2ª ocorrência do arquivo  -> não existia, é inserida (o que faltava!)
// Resultado: reimportar deixa a base idêntica à planilha, sem duplicar.
//
// Idempotente: recalcula sempre a partir do ROW_NUMBER, então rodar duas vezes
// resulta no mesmo estado.

migrate(
  (app) => {
    const alvos = [
      {
        tabela: 'netsales',
        doc: 'chave_documento',
        ser: 'serial',
        dt: 'docdate',
      },
      {
        tabela: 'vendas',
        doc: 'numero_sap',
        ser: 'numero_nfe',
        dt: 'data_lancamento',
      },
      {
        tabela: 'vendas_historico',
        doc: 'numero_sap',
        ser: 'numero_nfe',
        dt: 'data_lancamento',
      },
    ]

    for (let i = 0; i < alvos.length; i++) {
      const t = alvos[i]
      // Atribui 1,2,3... dentro de cada grupo da chave, ordenado por id (ordem
      // de inserção = ordem em que o arquivo foi lido).
      const sql =
        'UPDATE ' +
        t.tabela +
        ' SET numero_linha = (' +
        '  SELECT COUNT(*) FROM ' +
        t.tabela +
        ' AS x' +
        '  WHERE x.' +
        t.doc +
        ' = ' +
        t.tabela +
        '.' +
        t.doc +
        '    AND x.' +
        t.ser +
        ' = ' +
        t.tabela +
        '.' +
        t.ser +
        '    AND x.' +
        t.dt +
        ' = ' +
        t.tabela +
        '.' +
        t.dt +
        "    AND COALESCE(x.codigo_cliente, '') = COALESCE(" +
        t.tabela +
        ".codigo_cliente, '')" +
        "    AND COALESCE(x.codigo_item, '') = COALESCE(" +
        t.tabela +
        ".codigo_item, '')" +
        '    AND x.id <= ' +
        t.tabela +
        '.id' +
        ')'

      try {
        app.db().newQuery(sql).execute()
        console.log('[1742800001] numero_linha atribuído em ' + t.tabela)
      } catch (err) {
        console.warn('[1742800001] falha em ' + t.tabela + ': ' + err)
      }
    }
  },
  (app) => {
    // down: zera a ocorrência (volta ao estado anterior, todos iguais)
    const tabelas = ['netsales', 'vendas', 'vendas_historico']
    for (let i = 0; i < tabelas.length; i++) {
      try {
        app
          .db()
          .newQuery('UPDATE ' + tabelas[i] + ' SET numero_linha = 0')
          .execute()
      } catch (_) {}
    }
  },
)
