/**
 * Calendário de semanas de vendas
 *
 * Regra do usuário:
 * "a semana será consolidada com dias que iniciam na primeira segunda-feira do mês e irá até o domingo
 * e assim por diante. Se a última semana do mês for incompleta, não deve ser considerada."
 *
 * Especificação:
 * - Semana 1 começa na PRIMEIRA segunda-feira do mês;
 * - Os dias anteriores a ela ficam FORA da contagem;
 * - Cada semana tem exatamente 7 dias (seg–dom) e pode transbordar para o mês seguinte (ex: 26/10 a 01/11);
 * - Uma semana só entra se INICIAR dentro do mês.
 */

export interface SemanaMes {
  numero: number // 1, 2, 3, 4, 5
  nome: string // "Semana 1"
  inicioStr: string // "YYYY-MM-DD"
  fimStr: string // "YYYY-MM-DD"
  inicioFormatado: string // "DD/MM"
  fimFormatado: string // "DD/MM"
  label: string // "Semana 1: 05/10 a 11/10"
  dias: number // 7
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function toDateStr(d: Date): string {
  const y = d.getUTCFullYear()
  const m = pad2(d.getUTCMonth() + 1)
  const day = pad2(d.getUTCDate())
  return `${y}-${m}-${day}`
}

function toShortDateStr(d: Date): string {
  const m = pad2(d.getUTCMonth() + 1)
  const day = pad2(d.getUTCDate())
  return `${day}/${m}`
}

function addDaysUTC(date: Date, days: number): Date {
  const result = new Date(date.getTime())
  result.setUTCDate(result.getUTCDate() + days)
  return result
}

/**
 * Calcula a lista de semanas de um determinado mês e ano.
 * @param ano Ano com 4 dígitos (ex: 2026)
 * @param mes Mês de 1 a 12 (ex: 10 para Outubro)
 */
export function getSemanasDoMes(ano: number, mes: number): SemanaMes[] {
  if (!ano || !mes || mes < 1 || mes > 12) {
    return []
  }

  // Primeiro dia do mês em UTC
  const primeiroDia = new Date(Date.UTC(ano, mes - 1, 1))
  const dayOfWeek = primeiroDia.getUTCDay() // 0 = Domingo, 1 = Segunda, ..., 6 = Sábado

  // Deslocamento até a primeira segunda-feira
  // Se dia 1 for segunda (1): offset = 0
  // Se dia 1 for terça (2): offset = 6 (vai para dia 7)
  // Se dia 1 for domingo (0): offset = 1 (vai para dia 2)
  const offset = (1 - dayOfWeek + 7) % 7
  let segAtual = addDaysUTC(primeiroDia, offset)

  const semanas: SemanaMes[] = []
  let numero = 1

  // Uma semana só entra se INICIAR dentro do mês
  while (segAtual.getUTCMonth() === mes - 1 && segAtual.getUTCFullYear() === ano) {
    const domAtual = addDaysUTC(segAtual, 6)
    const inicioStr = toDateStr(segAtual)
    const fimStr = toDateStr(domAtual)
    const inicioFormatado = toShortDateStr(segAtual)
    const fimFormatado = toShortDateStr(domAtual)

    semanas.push({
      numero,
      nome: `Semana ${numero}`,
      inicioStr,
      fimStr,
      inicioFormatado,
      fimFormatado,
      label: `Semana ${numero} (${inicioFormatado} a ${fimFormatado})`,
      dias: 7,
    })

    numero++
    segAtual = addDaysUTC(segAtual, 7)
  }

  return semanas
}

/**
 * Extrai apenas o prefixo YYYY-MM-DD da data de lançamento ou string de data.
 */
export function extrairDataISO(dataRaw: string | null | undefined): string | null {
  if (!dataRaw) return null
  const str = String(dataRaw).trim()
  const match = str.match(/^(\d{4}-\d{2}-\d{2})/)
  return match ? match[1] : null
}

/**
 * Identifica a qual semana pertence uma data (pela data_lancamento).
 * Dias fora das semanas calculadas (ex.: anteriores à Semana 1) retornam null.
 */
export function encontrarSemanaDaData(
  dataRaw: string | null | undefined,
  semanas: SemanaMes[],
): SemanaMes | null {
  const dataIso = extrairDataISO(dataRaw)
  if (!dataIso || !semanas || semanas.length === 0) {
    return null
  }

  for (const semana of semanas) {
    if (dataIso >= semana.inicioStr && dataIso <= semana.fimStr) {
      return semana
    }
  }

  return null
}
