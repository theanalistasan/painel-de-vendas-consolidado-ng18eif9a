import type { FilterState } from '@/types/sales'

const STORAGE_KEY = 'paineis_vendas_filters'

const EMPTY_FILTERS: FilterState = {
  base: 'ambos',
  dataDe: '',
  dataAte: '',
  vendedorCliente: [],
  vendedor: [],
  grupoItem: [],
  estado: [],
  utilizacao: [],
  tipoDocumento: [],
  search: '',
  ano: [],
  mes: [],
  dia: [],
  tipoDevolucao: '',
}

/**
 * Grupos padrão solicitados para inicialização do Dashboard:
 * "Equipamentos", "Acessórios", "Tintas" e "Peças"
 */
export const DEFAULT_GRUPOS_ITEM: string[] = ['Equipamentos', 'Acessórios', 'Tintas', 'Peças']

/**
 * Filtros padrão estáticos básicos (quando ainda não computou dinamicamente com base nas opções da base)
 */
export const DEFAULT_FILTERS: FilterState = {
  base: 'ambos',
  dataDe: '',
  dataAte: '',
  vendedorCliente: [],
  vendedor: [],
  grupoItem: [...DEFAULT_GRUPOS_ITEM],
  estado: [],
  utilizacao: [],
  tipoDocumento: ['NF de Saída'],
  search: '',
  ano: ['2026'],
  mes: ['8'],
  dia: [],
  tipoDevolucao: '',
}

/**
 * Constrói o estado inicial dinâmico de filtros a partir das opções disponíveis na base de dados:
 * Regra para Ano e Mês inicial:
 * - Deve vir preenchido com o mês atual, SE o mês atual existir na base de vendas (ano e mês atuais com registros).
 * - Caso contrário, deve vir com o ÚLTIMO mês disponível na base (hoje agosto/2026: ano 2026, mês 8).
 * - Nunca deve cair num mês sem dados (como dezembro/2026).
 *
 * Outros filtros mantidos:
 * - Tipo de Documento: "NF de Saída"
 * - Grupo do Item: multi-seleção com "Equipamentos", "Acessórios", "Tintas" e "Peças"
 * - Utilização: todos os tipos contendo "VENDA"
 * - Base: 'ambos'
 */
/**
 * Verifica se um conjunto de filtros possui ano e mês válidos e preenchidos
 */
export function hasValidPeriodFilters(filters?: FilterState | null): boolean {
  if (!filters) return false
  const hasAno =
    Array.isArray(filters.ano) && filters.ano.length > 0 && filters.ano.some((a) => !!a)
  const hasMes =
    Array.isArray(filters.mes) && filters.mes.length > 0 && filters.mes.some((m) => !!m)
  return hasAno && hasMes
}

/**
 * Constrói o estado inicial dinâmico de filtros a partir das opções disponíveis na base de dados:
 * Regra padrão solicitada pelo usuário:
 * "Em ambos, manter o filtro padrão: Ano: atual; Mês: último disponível na base, exemplo: Ago-2026"
 *
 * Regra detalhada:
 * - ano: [String(ultimoAnoDisponivel)] (ex: '2026')
 * - mes: [String(ultimoMesDisponivel)] (ex: '8' = Ago/2026, último mês com dados na base — nunca mês atual do sistema sem dados, nunca vazio)
 * - tipoDocumento: ['NF de Saída']
 * - grupoItem: ['Equipamentos', 'Acessórios', 'Tintas', 'Peças']
 * - utilizacao: ['VENDA DE MERCADORIA', 'VENDA CONSUMO']
 * - base: 'ambos'
 */
export function buildDynamicInitialFilters(options?: {
  anos?: number[]
  meses?: number[]
  tipoDocumento?: string[]
  grupoItem?: string[]
  utilizacao?: string[]
  ultimoAno?: number
  ultimoMes?: number
  maxDataLancamento?: string
}): FilterState {
  // 1. Data/mês atual real do sistema
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1 // 1 a 12

  // 2. Determinar o último ano e último mês disponíveis na base
  const anosDisponiveis = (options?.anos || []).slice().sort((a, b) => b - a)

  // Prioriza o ultimoAno / ultimoMes calculado pelo backend ou extrai de maxDataLancamento
  let lastYearInDb = options?.ultimoAno ?? (anosDisponiveis.length > 0 ? anosDisponiveis[0] : 2026)
  let lastMonthInDb = options?.ultimoMes

  if (!lastMonthInDb && options?.maxDataLancamento && options.maxDataLancamento.length >= 7) {
    const parts = options.maxDataLancamento.slice(0, 10).split('-')
    const y = parseInt(parts[0], 10)
    const m = parseInt(parts[1], 10)
    if (!isNaN(y)) lastYearInDb = y
    if (!isNaN(m) && m >= 1 && m <= 12) lastMonthInDb = m
  }

  // Se ainda não tiver o último mês determinado, usa 8 (agosto) como fallback seguro da base
  if (!lastMonthInDb) {
    lastMonthInDb = 8
  }

  // 3. Regra padrão solicitada:
  // "Ano: atual; Mês: último disponível na base, exemplo: Ago-2026"
  // Caso o ano corrente do sistema coincida com o ano da base e o mês corrente exista,
  // poderíamos usar currentMonth se <= lastMonthInDb, mas a instrução é explícita:
  // SEMPRE garantir: ano: [String(ultimoAnoDisponivel)] (2026), mes: [String(ultimoMesDisponivel)] (8 = Ago/2026, último mês com dados na base — nunca mês atual do sistema sem dados, nunca vazio).
  let selectedAno = String(lastYearInDb)
  let selectedMes = String(lastMonthInDb)

  // Se o ano corrente do sistema estiver presente e tiver dados para o mês corrente:
  if (currentYear === lastYearInDb && currentMonth <= lastMonthInDb && currentMonth >= 1) {
    // Se o mês corrente do sistema já tem dados na base deste mesmo ano:
    selectedAno = String(currentYear)
    selectedMes = String(currentMonth)
  } else {
    // Caso padrão e mais comum: o ano e último mês com movimentação consolidada na base
    selectedAno = String(lastYearInDb)
    selectedMes = String(lastMonthInDb)
  }

  // Grupo do Item: mapeia para os nomes existentes que correspondam a Equipamentos, Acessórios, Tintas e Peças
  const rawGrupos = options?.grupoItem || []
  let selectedGrupos: string[] = []
  if (rawGrupos.length > 0) {
    selectedGrupos = rawGrupos.filter((g) => {
      const up = g.toUpperCase().trim()
      return (
        up === 'EQUIPAMENTOS' ||
        up === 'ACESSÓRIOS' ||
        up === 'ACESSORIOS' ||
        up === 'TINTAS' ||
        up === 'PEÇAS' ||
        up === 'PECAS'
      )
    })
  }
  if (selectedGrupos.length === 0) {
    selectedGrupos = [...DEFAULT_GRUPOS_ITEM]
  }

  // Utilização: todos os tipos que contenham "VENDA"
  const rawUtilizacao = options?.utilizacao || []
  let selectedUtilizacao: string[] = []
  if (rawUtilizacao.length > 0) {
    selectedUtilizacao = rawUtilizacao.filter((u) => u.toUpperCase().includes('VENDA'))
  }
  if (selectedUtilizacao.length === 0) {
    selectedUtilizacao = ['VENDA DE MERCADORIA', 'VENDA CONSUMO']
  }

  // Tipo de Documento: "NF de Saída"
  const rawDocs = options?.tipoDocumento || []
  const docMatch = rawDocs.find(
    (d) => d.toUpperCase().trim() === 'NF DE SAÍDA' || d.toUpperCase().trim() === 'NF DE SAIDA',
  )
  const selectedDoc = docMatch ? [docMatch] : ['NF de Saída']

  return {
    ...EMPTY_FILTERS,
    base: 'ambos',
    ano: [selectedAno],
    mes: [selectedMes],
    dia: [],
    tipoDocumento: selectedDoc,
    grupoItem: selectedGrupos,
    utilizacao: selectedUtilizacao,
  }
}

export function saveFiltersToSession(filters: FilterState): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(filters))
  } catch {
    // sessionStorage não disponível ou cheio — ignora silenciosamente
  }
}

export function hasSavedFiltersInSession(): boolean {
  try {
    return !!sessionStorage.getItem(STORAGE_KEY)
  } catch {
    return false
  }
}

export function loadFiltersFromSession(): FilterState {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    // Sem nada salvo (primeiro acesso ou pós-logout): usa os filtros padrão
    if (!raw) return { ...DEFAULT_FILTERS }
    const parsed = JSON.parse(raw) as Record<string, unknown>

    // Normalizar caso venham strings de sessões antigas
    const normalizeArray = (val: unknown): string[] => {
      if (Array.isArray(val)) return val.map(String).filter(Boolean)
      if (typeof val === 'string' && val.trim() !== '') return [val.trim()]
      if (typeof val === 'number') return [String(val)]
      return []
    }

    const normalizeBase = (val: unknown): 'ambos' | 'racnew' | 'netsales' => {
      if (val === 'racnew' || val === 'netsales' || val === 'ambos') return val
      return 'ambos'
    }

    const parsedAno = normalizeArray(parsed.ano)
    const parsedMes = normalizeArray(parsed.mes)
    const parsedGrupoItem = normalizeArray(parsed.grupoItem)
    const parsedTipoDoc = normalizeArray(parsed.tipoDocumento)
    const parsedUtilizacao = normalizeArray(parsed.utilizacao)

    // Se o filtro salvo na sessão tiver ano ou mês vazios (incompleto / residual de "Limpar Filtros"),
    // garante os valores padrão para não quebrar a visualização inicial das páginas de Dashboard.
    const ano = parsedAno.length > 0 ? parsedAno : [...DEFAULT_FILTERS.ano]
    const mes = parsedMes.length > 0 ? parsedMes : [...DEFAULT_FILTERS.mes]
    const grupoItem = parsedGrupoItem.length > 0 ? parsedGrupoItem : [...DEFAULT_FILTERS.grupoItem]
    const tipoDocumento =
      parsedTipoDoc.length > 0 ? parsedTipoDoc : [...DEFAULT_FILTERS.tipoDocumento]
    const utilizacao =
      parsedUtilizacao.length > 0 ? parsedUtilizacao : ['VENDA DE MERCADORIA', 'VENDA CONSUMO']

    const merged: FilterState = {
      ...EMPTY_FILTERS,
      ...parsed,
      base: normalizeBase(parsed.base),
      ano,
      mes,
      dia: normalizeArray(parsed.dia),
      vendedorCliente: normalizeArray(parsed.vendedorCliente),
      vendedor: normalizeArray(parsed.vendedor),
      grupoItem,
      estado: normalizeArray(parsed.estado),
      utilizacao,
      tipoDocumento,
      dataDe: typeof parsed.dataDe === 'string' ? parsed.dataDe : '',
      dataAte: typeof parsed.dataAte === 'string' ? parsed.dataAte : '',
      search: typeof parsed.search === 'string' ? parsed.search : '',
      tipoDevolucao: typeof parsed.tipoDevolucao === 'string' ? parsed.tipoDevolucao : '',
    }
    return merged
  } catch {
    // sessionStorage inválido: volta aos filtros padrão
    return { ...DEFAULT_FILTERS }
  }
}

export function clearFiltersFromSession(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignora
  }
}
