/**
 * Janela dinâmica compartilhada (base ativa).
 *
 * Regra: a base ativa cobre sempre DOIS anos — o ano anterior ao ano corrente
 * e o ano corrente. Início = 1º/jan do ano anterior; fim = 31/dez do ano atual.
 * Desliza sozinho: em 2026 cobre jan/2025–dez/2026; em 2027 cobre jan/2026–dez/2027.
 *
 * Usado por import_racnew.js, import_netsales.js, consolidar_vendas.js e
 * import_historico.js. Calculado na hora da chamada (nunca cacheado).
 */

function isDateInRange(value, inicioISO, fimISO) {
  if (!value || typeof value !== 'string') return false
  const s = value.trim()
  if (s.length < 10) return false
  const d = s.slice(0, 10) // YYYY-MM-DD (ISO ou prefixo ISO)
  return d >= inicioISO && d <= fimISO
}

/**
 * Devolve a janela dinâmica corrente.
 * @returns {{inicioISO: string, fimISO: string, anoInicio: number, anoFim: number}}
 */
function getJanelaDinamica() {
  const anoFim = new Date().getFullYear()
  const anoInicio = anoFim - 1
  return {
    anoInicio,
    anoFim,
    inicioISO: `${anoInicio}-01-01`,
    fimISO: `${anoFim}-12-31`,
  }
}

module.exports = { getJanelaDinamica, isDateInRange }
