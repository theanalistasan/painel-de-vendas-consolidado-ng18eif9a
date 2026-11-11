import type { FilterState } from '@/types/sales'

const STORAGE_KEY = 'paineis_vendas_filters'

const EMPTY_FILTERS: FilterState = {
  dataDe: '',
  dataAte: '',
  vendedorCliente: [],
  vendedor: [],
  grupoItem: [],
  estado: [],
  utilizacao: [],
  tipoDocumento: [],
  canal: [],
  canalClientes: [],
  deploy: [],
  inside: [],
  tipoCliente: [],
  jpClass: [],
  search: '',
  ano: [],
  mes: [],
  dia: [],
  tipoDevolucao: '',
}

/**
 * Grupos padrão solicitados para inicialização do Dashboard:
 * "EQUIPAMENTOS", "ACESSÓRIOS", "TINTAS" e "PEÇAS" (alinhados em maiúsculas com a base de dados)
 */
export const DEFAULT_GRUPOS_ITEM: string[] = ['EQUIPAMENTOS', 'ACESSÓRIOS', 'TINTAS', 'PEÇAS']

/**
 * Filtros padrão estáticos básicos (quando ainda não computou dinamicamente com base nas opções da base)
 */
const _currentDate = new Date()
const _currentYearStr = String(_currentDate.getFullYear())
const _currentMonthStr = String(_currentDate.getMonth() + 1)

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
  canal: [],
  canalClientes: [],
  deploy: [],
  inside: [],
  tipoCliente: [],
  jpClass: [],
  search: '',
  ano: [_currentYearStr],
  mes: [_currentMonthStr],
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
  // 1. Data/mês atual real do sistema (regra do usuário: por padrão, mostrar dados do MÊS CORRENTE)
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1 // 1 a 12

  // 2. Determinar se o ano/mês corrente é o padrão ou se cai no fallback da base
  // A instrução do usuário é explícita:
  // Filtros Globais e JP-Class devem sempre mostrar por padrão os dados do MÊS CORRENTE.
  let selectedAno = String(currentYear)
  let selectedMes = String(currentMonth)

  // Caso opcional: se o chamador fornecer opções e o ano corrente for muito discrepante (ex: base legada),
  // ainda podemos avaliar, mas por padrão respeita o ano/mês corrente do sistema
  if (options?.anos && options.anos.length > 0 && !options.anos.includes(currentYear)) {
    const anosDisponiveis = options.anos.slice().sort((a, b) => b - a)
    selectedAno = String(anosDisponiveis[0])
    selectedMes = String(options.ultimoMes || currentMonth)
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
    canal: [],
    canalClientes: [],
    deploy: [],
    inside: [],
    tipoCliente: [],
    jpClass: [],
  }
}

export const FILTERS_CHANGED_EVENT = 'paineis_vendas_filters_changed'

export function saveFiltersToSession(filters: FilterState): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(filters))
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(FILTERS_CHANGED_EVENT, { detail: filters }))
    }
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

    // Se há um estado salvo no sessionStorage (inclusive após "Limpar Filtros", onde ano e mes
    // são arrays vazios []), respeita exatamente o que o usuário definiu no estado salvo!
    // Não força DEFAULT_FILTERS.ano / DEFAULT_FILTERS.mes quando o usuário intencionalmente
    // limpou os filtros ou escolheu ver todos os períodos.
    const grupoItemMapped = parsedGrupoItem.map((g) => {
      const up = g.toUpperCase().trim()
      if (up === 'EQUIPAMENTOS') return 'EQUIPAMENTOS'
      if (up === 'ACESSÓRIOS' || up === 'ACESSORIOS') return 'ACESSÓRIOS'
      if (up === 'TINTAS') return 'TINTAS'
      if (up === 'PEÇAS' || up === 'PECAS') return 'PEÇAS'
      return g
    })

    // Caso a sessão carregue a seleção legada pré-0.0.234 de grupoItem contendo apenas PEÇAS/PECAS,
    // atualiza para os 4 grupos padrão (DEFAULT_GRUPOS_ITEM: EQUIPAMENTOS, ACESSÓRIOS, TINTAS, PEÇAS).
    // Isso garante que tanto Visão Geral/Canais quanto JP-Class não fiquem travados na seleção antiga
    // e o usuário veja os 4 grupos ao abrir qualquer painel.
    const isLegacySinglePecas =
      grupoItemMapped.length === 1 &&
      (grupoItemMapped[0] === 'PEÇAS' ||
        grupoItemMapped[0].toUpperCase().trim() === 'PECAS' ||
        grupoItemMapped[0].toUpperCase().trim() === 'PECA')

    const finalGrupoItem = isLegacySinglePecas ? [...DEFAULT_GRUPOS_ITEM] : grupoItemMapped

    const merged: FilterState = {
      ...EMPTY_FILTERS,
      ...parsed,
      base: normalizeBase(parsed.base),
      ano: parsedAno,
      mes: parsedMes,
      dia: normalizeArray(parsed.dia),
      vendedorCliente: normalizeArray(parsed.vendedorCliente),
      vendedor: normalizeArray(parsed.vendedor),
      grupoItem: finalGrupoItem,
      estado: normalizeArray(parsed.estado),
      utilizacao: parsedUtilizacao,
      tipoDocumento: parsedTipoDoc,
      canal: normalizeArray(parsed.canal),
      canalClientes: normalizeArray(parsed.canalClientes),
      deploy: normalizeArray(parsed.deploy),
      inside: normalizeArray(parsed.inside),
      tipoCliente: normalizeArray(parsed.tipoCliente),
      jpClass: normalizeArray(parsed.jpClass),
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
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(FILTERS_CHANGED_EVENT, { detail: null }))
    }
  } catch {
    // ignora
  }
}
