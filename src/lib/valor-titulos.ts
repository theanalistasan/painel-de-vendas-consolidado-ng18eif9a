/**
 * Mapeamento oficial das legendas dos valores consolidados (planilha NetSales v4).
 * Fonte: pedido do Silvio — os títulos devem aparecer EXATAMENTE assim e nesta
 * ordem em todas as telas (KPIs, cards, tabelas, relatórios, exports CSV):
 *
 * Faixa Comercial:
 *   1. Total NF Novo   → "Valor Total (Bruto)"
 *   2. Valor Líquido   → "Valor Líquido (NET)"
 *
 * Faixa Contábil:
 *   3. Total NF sem Frete → "Valor Total (Sem Frete)"
 *   4. Total da Linha     → "Valor Mercadoria"
 *   5. Custo Total        → "Custo Total"
 *
 * Ordem de exibição dos 5 indicadores: Valor Total (Bruto) → Valor Líquido (NET)
 * → Valor Total (Sem Frete) → Valor Mercadoria → Custo Total.
 */

export const TITULO_VALOR_TOTAL_BRUTO = 'Valor Total (Bruto)'
export const TITULO_VALOR_LIQUIDO_NET = 'Valor Líquido (NET)'
export const TITULO_VALOR_TOTAL_SEM_FRETE = 'Valor Total (Sem Frete)'
export const TITULO_VALOR_MERCADORIA = 'Valor Mercadoria'
export const TITULO_CUSTO_TOTAL = 'Custo Total'

/** Faixas para os blocos do quadro do JP-Class */
export const FAIXA_COMERCIAL_LABEL = 'Visão Comercial'
export const FAIXA_CONTABIL_LABEL = 'Visão Contábil'

/** Rótulos antigos que NÃO devem mais aparecer nas legendas de valores consolidados */
export const TITULOS_VALORES_ANTIGOS = [
  'Valor Total de Mercadorias',
  'Valor Total Mercadoria',
  'Valor Líquido Total',
  'Valor Total NF sem frete',
  'Valor Total NF Sem Frete',
  'Valor Total da NF',
  'Total NF sem Frete',
  'Total da Linha',
  'Total de Vendas',
  'Faturamento Total',
  'Total NF Novo',
  'Valor Total de Mercadorias (R$)',
  'Total da Linha (R$)',
  'Valor Líquido (R$)',
]
