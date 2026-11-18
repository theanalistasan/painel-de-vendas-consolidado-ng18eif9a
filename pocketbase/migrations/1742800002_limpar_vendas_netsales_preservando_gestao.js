// 1742800002: limpeza CIRÚRGICA de `netsales` e `vendas` (e das tabelas de
// resumo pré-calculadas), PRESERVANDO pedidos_abertos, estoque_sap e audit_logs.
//
// MOTIVO: a correção da chave de dedupe (1742800000/1742800001) só repõe as
// linhas repetidas perdidas se as bases de vendas forem reimportadas por
// inteiro. O endpoint oficial `/backend/v1/base/zerar` não serve aqui: ele
// apaga SEIS coleções SEM opção de escolha, incluindo a carteira de Pedidos em
// Aberto, a Posição de Estoque SAP e todo o histórico de auditoria — bases que
// o usuário importa separadamente e que não têm backup neste repositório.
//
// Portanto esta migration limpa só o que será reimportado na sequência:
//   - netsales                 (staging da consolidação)
//   - vendas                   (base mestra lida pelas telas)
//   - vendas_staging           (tabela de troca do consolidador)
//   - resumo_vendas_mensal,
//     resumo_clientes_ativos,
//     resumo_vendas_uf_regiao  (resumos, reconstruídos na consolidação)
//
// `vendas_historico` NÃO é tocada nesta etapa: com a janela ampliada para 4
// anos (2023-2026), o 2023 vai para a base ATIVA via importador; o conteúdo
// antigo do histórico será conferido e limpo depois, com validação.
//
// IDEMPOTENTE: DELETE em tabela vazia é no-op.

migrate(
  (app) => {
    const colecoes = ['netsales', 'vendas']

    for (let i = 0; i < colecoes.length; i++) {
      const nome = colecoes[i]
      try {
        const col = app.findCollectionByNameOrId(nome)
        app.truncateCollection(col)
        console.log('[1742800002] ' + nome + ' limpa (truncate).')
      } catch (err) {
        try {
          app
            .db()
            .newQuery('DELETE FROM ' + nome)
            .execute()
          console.log('[1742800002] ' + nome + ' limpa (DELETE).')
        } catch (errDel) {
          console.error('[1742800002] falha ao limpar ' + nome + ': ' + errDel)
          throw errDel
        }
      }
    }

    const tabelas = [
      'vendas_staging',
      'resumo_vendas_mensal',
      'resumo_clientes_ativos',
      'resumo_vendas_uf_regiao',
    ]
    for (let j = 0; j < tabelas.length; j++) {
      try {
        app
          .db()
          .newQuery('DELETE FROM ' + tabelas[j])
          .execute()
      } catch (err) {
        console.warn('[1742800002] ignorado ' + tabelas[j] + ': ' + err)
      }
    }

    // Reinicia o estado das máquinas de consolidação para que a próxima
    // execução comece do zero (sem "retomar" uma carga antiga já concluída).
    try {
      app
        .db()
        .newQuery(
          "UPDATE vendas_consolidacao_status SET status = 'idle', etapa = NULL, " +
            'processados = 0, total = 0',
        )
        .execute()
    } catch (err) {
      console.warn('[1742800002] status da consolidação não reiniciado: ' + err)
    }
  },
  (app) => {
    // down: no-op — limpeza não é reversível (a fonte é a planilha).
  },
)
