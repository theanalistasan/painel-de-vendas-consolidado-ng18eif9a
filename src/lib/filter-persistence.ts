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
 * - Ano: mais recente disponível (ex: 2026)
 * - Mês: último mês disponível na base (ex: 8 / Agosto)
 * - Tipo de Documento: "NF de Saída"
 * - Grupo do Item: multi-seleção com "Equipamentos", "Acessórios", "Tintas" e "Peças"
 * - Utilização: todos os tipos que contenham "VENDA" (ex.: "VENDA DE MERCADORIA", "VENDA CONSUMO", etc.)
 * - Base: 'ambos'
 */
export function buildDynamicInitialFilters(options?: {
  anos?: number[]
  meses?: number[]
  tipoDocumento?: string[]
  grupoItem?: string[]
  utilizacao?: string[]
}): FilterState {
  // Ano mais recente disponível na base
  const anosDisponiveis = (options?.anos || []).slice().sort((a, b) => b - a)
  const anoRecente = anosDisponiveis.length > 0 ? String(anosDisponiveis[0]) : '2026'

  // Mês mais recente disponível na base (se disponível)
  const mesesDisponiveis = (options?.meses || []).slice().sort((a, b) => b - a)
  const mesRecente = mesesDisponiveis.length > 0 ? String(mesesDisponiveis[0]) : '8'

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
    ano: [anoRecente],
    mes: [mesRecente],
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
      if (Array.isArray(val)) return val.map(String)
      if (typeof val === 'string' && val.trim() !== '') return [val.trim()]
      if (typeof val === 'number') return [String(val)]
      return []
    }

    const normalizeBase = (val: unknown): 'ambos' | 'racnew' | 'netsales' => {
      if (val === 'racnew' || val === 'netsales' || val === 'ambos') return val
      return 'ambos'
    }

    const merged: FilterState = {
      ...EMPTY_FILTERS,
      ...parsed,
      base: normalizeBase(parsed.base),
      ano: normalizeArray(parsed.ano),
      mes: normalizeArray(parsed.mes),
      dia: normalizeArray(parsed.dia),
      vendedorCliente: normalizeArray(parsed.vendedorCliente),
      vendedor: normalizeArray(parsed.vendedor),
      grupoItem: normalizeArray(parsed.grupoItem),
      estado: normalizeArray(parsed.estado),
      utilizacao: normalizeArray(parsed.utilizacao),
      tipoDocumento: normalizeArray(parsed.tipoDocumento),
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
