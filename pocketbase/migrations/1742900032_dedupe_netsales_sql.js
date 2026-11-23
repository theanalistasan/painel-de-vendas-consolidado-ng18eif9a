// 1742900032: NO-OP (neutralizada em 2026-11-23).
//
// Esta migração nasceu para remover as linhas duplicadas que a reimportação de
// 18/11 + 23/11 deixou em `netsales`. Ela fazia o dedupe em uma única instrução
// SQL, mas NUNCA aplicou: ficou presa em `pending` na fila do Skip Cloud e, por
// isso, bloqueou o deploy de TODOS os hooks novos (dashboard_stats e
// cron_reconcile_summaries não subiam).
//
// O trabalho dela já foi feito por outro caminho, em 2026-11-23:
//   1. Purga controlada de 2026 em `netsales` (19.046 linhas removidas)
//   2. Reimportação do ano pelo /importar, já com o dedupe CORRIGIDO (0.0.420:
//      `numero_linha` passou a casar com os cabeçalhos reais do Excel)
//   3. Consolidação + reconstrução dos resumos
// Resultado validado: o período 01/11–23/11/2026 bate com a planilha do SAP
// dentro de R$ 1.409,19 — e essa diferença é uma devolução que a PLANILHA conta
// duas vezes (NF 2952/Serial 88013), não o painel.
//
// Rodar o DELETE agora seria, na melhor das hipóteses, inócuo (a base está
// limpa); na pior, apagaria uma repetição legítima dentro da mesma carga.
// Por isso o corpo é vazio de propósito: mantém o histórico do que houve sem
// tocar em dado nenhum.
migrate(
  (app) => {
    console.log('[1742900032] no-op: dedupe já concluído por purga + reimportação em 2026-11-23')
  },
  (app) => {
    // Sem rollback.
  },
)
