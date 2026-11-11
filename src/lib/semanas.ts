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
  const dataIso = normalizarParaDataISO(dataRaw)
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

export interface SemanaValores {
  semana: SemanaMes
  valorTotalMercadoria: number
  valorLiquidoTotal: number
  valorTotalNfSemFrete: number
  custoTotal: number
  linhas: number
}

/**
 * Agrega os valores monetários de vendas por semana do calendário do mês.
 * Soma (a) Valor Mercadoria (campo Valor Mercadoria, gravado como total_linha),
 * (b) Valor Líquido Total (valor_liquido), (c) Valor Total NF sem frete
 * (total_nf_sem_frete) e (d) Custo Total (custo_total), classificando cada
 * registro na semana pela data de lançamento (regra seg–dom já implementada).
 * Registros fora do calendário (ex.: anteriores à Semana 1) são ignorados.
 *
 * IMPORTANTE: total_nf_sem_frete é um valor POR NF, repetido em cada linha de
 * item da base `vendas`. Somar linha a linha multiplica o valor pelo nº de
 * itens da NF (mesma causa do bug do card "Valores Consolidados", corrigido no
 * dashboard_stats.js). Aqui o valor é agregado UMA VEZ POR NF: MAX por
 * numero_nfe dentro da semana e soma dos máximos no fim — idêntico à lógica do
 * card (SUM sobre MAX agrupado por numero_nfe). NF sem número cai num único
 * grupo "vazio" por semana, como no backend. Os demais campos (total_linha,
 * valor_liquido, custo_total) são por item e continuam somando por linha.
 */
export function agregarValoresPorSemana<T extends Record<string, unknown>>(
  vendas: T[],
  semanas: SemanaMes[],
  campoData: keyof T & string = 'data_lancamento' as keyof T & string,
): SemanaValores[] {
  const porSemana = new Map<number, SemanaValores>()
  for (const semana of semanas) {
    porSemana.set(semana.numero, {
      semana,
      valorTotalMercadoria: 0,
      valorLiquidoTotal: 0,
      valorTotalNfSemFrete: 0,
      custoTotal: 0,
      linhas: 0,
    })
  }

  // MAX de total_nf_sem_frete por numero_nfe, dentro de cada semana
  const maxNfSemFretePorSemana = new Map<number, Map<string, number>>()

  for (const venda of vendas) {
    const sem = encontrarSemanaDaData(venda[campoData] as string | null | undefined, semanas)
    if (!sem) continue
    const acc = porSemana.get(sem.numero)
    if (!acc) continue
    acc.valorTotalMercadoria += Number(venda.total_linha) || 0
    acc.valorLiquidoTotal += Number(venda.valor_liquido) || 0
    acc.custoTotal += Number(venda.custo_total) || 0
    acc.linhas += 1

    const nfKey = String(venda.numero_nfe ?? '').trim()
    let maxPorNf = maxNfSemFretePorSemana.get(sem.numero)
    if (!maxPorNf) {
      maxPorNf = new Map<string, number>()
      maxNfSemFretePorSemana.set(sem.numero, maxPorNf)
    }
    const valorNf = Number(venda.total_nf_sem_frete) || 0
    maxPorNf.set(nfKey, Math.max(maxPorNf.get(nfKey) ?? 0, valorNf))
  }

  // Valor Total NF sem frete da semana = soma dos MAX por NF
  for (const [numero, maxPorNf] of maxNfSemFretePorSemana) {
    const acc = porSemana.get(numero)
    if (!acc) continue
    let total = 0
    for (const valor of maxPorNf.values()) total += valor
    acc.valorTotalNfSemFrete = total
  }

  return semanas.map((semana) => porSemana.get(semana.numero) as SemanaValores)
}

/**
 * Normaliza qualquer formato de data (ISO 'YYYY-MM-DD...' ou BR 'DD/MM/YYYY...') para 'YYYY-MM-DD'
 */
export function normalizarParaDataISO(dataRaw: string | null | undefined): string | null {
  if (!dataRaw) return null
  const str = String(dataRaw).trim()
  if (!str) return null
  // Já é ISO (começa com 4 dígitos)
  const matchIso = str.match(/^(\d{4})[-/](\d{2})[-/](\d{2})/)
  if (matchIso) {
    return `${matchIso[1]}-${matchIso[2]}-${matchIso[3]}`
  }
  // Formato brasileiro DD/MM/YYYY
  const matchBr = str.match(/^(\d{2})[/\-.](\d{2})[/\-.](\d{4})/)
  if (matchBr) {
    return `${matchBr[3]}-${matchBr[2]}-${matchBr[1]}`
  }
  // Fallback via Date
  const d = new Date(str)
  if (!isNaN(d.getTime())) {
    const y = d.getUTCFullYear()
    const m = String(d.getUTCMonth() + 1).padStart(2, '0')
    const day = String(d.getUTCDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }
  return null
}
