// 1742800002: NEUTRALIZADA (era limpeza cirúrgica de netsales/vendas).
//
// HISTÓRICO E MOTIVO DA NEUTRALIZAÇÃO (2026-11-18):
// esta migration foi criada para apagar `netsales` e `vendas` antes de uma
// reimportação completa das planilhas NetSales. Ela NUNCA aplicou: ficou em
// `pending` e o backend passou a recusar qualquer ciclo de migrations/hooks com
// "the instance is still applying an earlier batch" e depois "the apply ended
// without the instance's answer (This operation was aborted)". Enquanto ela
// fica pendente, o deploy de hooks também é bloqueado (o endpoint
// /admin/limpar-vendas respondia 404).
//
// A limpeza em si continua PENDENTE e é necessária antes de reimportar — mas
// ela deve acontecer de forma CONTROLADA, junto da reimportação, e não como
// efeito colateral de destravar a fila:
//   - endpoint `POST /backend/v1/admin/limpar-vendas` (hook admin_limpar_vendas.js)
//     faz exatamente a mesma limpeza, exige role=admin e confirmação explícita
//     ("confirmar": "LIMPAR"), e devolve contagens antes/depois comprovando que
//     pedidos_abertos, estoque_sap e audit_logs ficaram intactos.
//
// Corpo original preservado abaixo em comentário, para referência:
//   - truncateCollection('netsales')
//   - truncateCollection('vendas')
//   - DELETE em vendas_staging, resumo_vendas_mensal,
//     resumo_clientes_ativos, resumo_vendas_uf_regiao
//   - UPDATE vendas_consolidacao_status -> idle
//
// O corpo abaixo é um NO-OP deliberado: não toca em dado algum. Marcar esta
// migration como applied libera a fila e não apaga nada.

migrate(
  (app) => {
    // Intencionalmente vazio. A limpeza é feita sob demanda pelo endpoint
    // administrativo, com confirmação e contagens de conferência.
    console.log(
      '[1742800002] neutralizada: nenhuma limpeza executada. ' +
        'Use POST /backend/v1/admin/limpar-vendas quando a reimportação for rodar.',
    )
  },
  (app) => {
    // down: no-op (nada foi alterado).
  },
)
