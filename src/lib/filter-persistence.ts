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
  search: '',
  ano: [],
  mes: [],
  dia: [],
}

/**
 * Grupos padrão solicitados para inicialização do Dashboard:
 * "EQUIPAMENTOS", "ACESSÓRIOS", "TINTAS" e "PEÇAS" (alinhados em maiúsculas com a base de dados)
 */
export const DEFAULT_GRUPOS_ITEM: string[] = ['EQUIPAMENTOS', 'ACESSÓRIOS', 'TINTAS', 'PEÇAS']

/**
 * Filtros padrão estáticos básicos (quando ainda não computou dinamicamente com base nas opções da base)
 * Padrão Geral (Fase 2): Tipo de documento = NF; Utilização = iniciadas com "VENDA"
 * (resolvidas dinamicamente em buildDynamicInitialFilters); Grupo do Item = VAZIO []
 * (array vazio = TODOS os grupos — o backend dashboard_stats.js trata grupoItem vazio
 * como "todos" e o MultiSelectDropdown mostra "Todos", não "Nenhum").
 */
const _currentDate = new Date()
const _currentYearStr = String(_currentDate.getFullYear())
const _currentMonthStr = String(_currentDate.getMonth() + 1)

export const DEFAULT_FILTERS: FilterState = {
  dataDe: '',
  dataAte: '',
  vendedorCliente: [],
  vendedor: [],
  grupoItem: [],
  estado: [],
  utilizacao: [],
  tipoDocumento: ['NF'],
  canal: [],
  canalClientes: [],
  deploy: [],
  inside: [],
  tipoCliente: [],
  search: '',
  ano: [_currentYearStr],
  mes: [_currentMonthStr],
  dia: [],
}

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
 * - tipoDocumento: ['NF']
 * - grupoItem: [] (VAZIO = todos os grupos — padrão geral)
 * - utilizacao: todas as opções distintas que começam com "VENDA"
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

  // Grupo do Item: padrão geral = VAZIO [] (todos os grupos).
  // O backend dashboard_stats.js trata grupoItem vazio como "todos".
  const selectedGrupos: string[] = []

  // Utilização: todas as opções distintas que INICIAM com "VENDA"
  const rawUtilizacao = options?.utilizacao || []
  const selectedUtilizacao = rawUtilizacao.filter((u) => u.toUpperCase().trim().startsWith('VENDA'))

  // Tipo de Documento: "NF" (valor real da base; sem fallback legado 'NF de Saída')
  const rawDocs = options?.tipoDocumento || []
  const docMatch = rawDocs.find((d) => d.toUpperCase().trim() === 'NF')
  const selectedDoc = docMatch ? [docMatch] : ['NF']

  return {
    ...EMPTY_FILTERS,
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

    // Sessões legadas: seleção apenas de PEÇAS/PECAS (pré-0.0.234) NÃO é mais promovida
    // aos 4 grupos — o padrão geral agora é array vazio [] (todos os grupos).
    const finalGrupoItem = grupoItemMapped

    // Migração legada: sessões anteriores ao 0.0.306 usavam 'NF de Saída' (valor que não
    // existe mais na base — hoje tipo_documento ∈ {NF, DEVNF, NFCOMDEV, ...}). Promove
    // para 'NF'. Seleção explícita de outros tipos é respeitada.
    const tipoDocPromoted =
      parsedTipoDoc.length > 0 &&
      parsedTipoDoc.every(
        (d) => d.toUpperCase().trim() === 'NF DE SAÍDA' || d.toUpperCase().trim() === 'NF DE SAIDA',
      )
        ? ['NF']
        : parsedTipoDoc

    // Migração legada: sessões anteriores ao 0.0.306 selecionavam utilização contendo
    // "VENDA" (inclusive "REMESSA ENTR FUTURA" case contém? não — mas "DEVENDA..." etc.);
    // restringe para as que INICIAM com "VENDA", alinhando sessões antigas ao novo padrão.
    // Sessões com seleção vazia (usuário limpou) permanecem vazias.
    const utilizacaoPromoted =
      parsedUtilizacao.length > 0 &&
      parsedUtilizacao.some((u) => !u.toUpperCase().trim().startsWith('VENDA'))
        ? parsedUtilizacao.filter((u) => u.toUpperCase().trim().startsWith('VENDA'))
        : parsedUtilizacao

    const merged: FilterState = {
      ...EMPTY_FILTERS,
      ...parsed,
      ano: parsedAno,
      mes: parsedMes,
      dia: normalizeArray(parsed.dia),
      vendedorCliente: normalizeArray(parsed.vendedorCliente),
      vendedor: normalizeArray(parsed.vendedor),
      grupoItem: finalGrupoItem,
      estado: normalizeArray(parsed.estado),
      utilizacao: utilizacaoPromoted,
      tipoDocumento: tipoDocPromoted,
      canal: normalizeArray(parsed.canal),
      canalClientes: normalizeArray(parsed.canalClientes),
      deploy: normalizeArray(parsed.deploy),
      inside: normalizeArray(parsed.inside),
      tipoCliente: normalizeArray(parsed.tipoCliente),
      dataDe: typeof parsed.dataDe === 'string' ? parsed.dataDe : '',
      dataAte: typeof parsed.dataAte === 'string' ? parsed.dataAte : '',
      search: typeof parsed.search === 'string' ? parsed.search : '',
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

// ============================================================================
// Filtro local de período do módulo JP-Class
// ============================================================================
// Prioridade sobre os Filtros Globais: se o usuário escolher Ano (e/ou Mês)
// aqui, esses valores SOBREPÕEM o período vindo dos Filtros Globais ao buscar
// dados (fetchVendasExport). Campo local vazio ("") = segue o valor global.
// Persistência em sessionStorage com chave própria do JP-Class.

const JPCLASS_STORAGE_KEY = 'jpclass_periodo'

/** Preferência local de período do JP-Class persistida em sessionStorage */
export interface JpClassPeriodoLocal {
  /** Ano escolhido localmente (string '2026') ou '' = segue os Filtros Globais */
  ano: string
  /** Mês escolhido localmente ('1'..'12') ou '' = segue os Filtros Globais */
  mes: string
}

export const EMPTY_JPCLASS_PERIODO: JpClassPeriodoLocal = { ano: '', mes: '' }

export function saveJpClassPeriodoToSession(periodo: JpClassPeriodoLocal): void {
  try {
    sessionStorage.setItem(JPCLASS_STORAGE_KEY, JSON.stringify(periodo))
  } catch {
    // sessionStorage não disponível — ignora silenciosamente
  }
}

export function loadJpClassPeriodoFromSession(): JpClassPeriodoLocal {
  try {
    const raw = sessionStorage.getItem(JPCLASS_STORAGE_KEY)
    if (!raw) return { ...EMPTY_JPCLASS_PERIODO }
    const parsed = JSON.parse(raw) as Partial<JpClassPeriodoLocal> | null
    return {
      ano: typeof parsed?.ano === 'string' ? parsed.ano : '',
      mes: typeof parsed?.mes === 'string' ? parsed.mes : '',
    }
  } catch {
    return { ...EMPTY_JPCLASS_PERIODO }
  }
}

export function clearJpClassPeriodoFromSession(): void {
  try {
    sessionStorage.removeItem(JPCLASS_STORAGE_KEY)
  } catch {
    // ignora
  }
}

// ============================================================================
// Filtros locais da Visão Canais (Ano, Mês, Data, Nota Fiscal e Pedido)
// ============================================================================
// Mesma mecânica do JP-Class: campo local PREENCHIDO SOBREPÕE o filtro global
// correspondente ao montar o payload de busca da Visão Canais; campo VAZIO
// ("") = segue o valor do Filtro Global. Persistência em sessionStorage com
// chave própria da Visão Canais.

const CANAIS_STORAGE_KEY = 'canais_filtros'

/** Filtros locais da Visão Canais persistidos em sessionStorage */
export interface CanaisFiltroLocal {
  /** Ano escolhido localmente ('2026') ou '' = segue os Filtros Globais */
  ano: string
  /** Mês escolhido localmente ('1'..'12') ou '' = segue os Filtros Globais */
  mes: string
  /** Data inicial do período (yyyy-mm-dd) ou '' = segue os Filtros Globais */
  dataDe: string
  /** Data final do período (yyyy-mm-dd) ou '' = segue os Filtros Globais */
  dataAte: string
  /** Busca textual por Nota Fiscal (numero_nfe) ou '' = segue o global */
  numeroNfe: string
  /** Busca textual por N° do Pedido (numero_documento_netsales) ou '' = segue o global */
  numeroPedido: string
}

export const EMPTY_CANAIS_FILTRO_LOCAL: CanaisFiltroLocal = {
  ano: '',
  mes: '',
  dataDe: '',
  dataAte: '',
  numeroNfe: '',
  numeroPedido: '',
}

export function saveCanaisFiltrosToSession(filtros: CanaisFiltroLocal): void {
  try {
    sessionStorage.setItem(CANAIS_STORAGE_KEY, JSON.stringify(filtros))
  } catch {
    // sessionStorage não disponível — ignora silenciosamente
  }
}

export function loadCanaisFiltrosFromSession(): CanaisFiltroLocal {
  try {
    const raw = sessionStorage.getItem(CANAIS_STORAGE_KEY)
    if (!raw) return { ...EMPTY_CANAIS_FILTRO_LOCAL }
    const parsed = JSON.parse(raw) as Partial<CanaisFiltroLocal> | null
    return {
      ano: typeof parsed?.ano === 'string' ? parsed.ano : '',
      mes: typeof parsed?.mes === 'string' ? parsed.mes : '',
      dataDe: typeof parsed?.dataDe === 'string' ? parsed.dataDe : '',
      dataAte: typeof parsed?.dataAte === 'string' ? parsed.dataAte : '',
      numeroNfe: typeof parsed?.numeroNfe === 'string' ? parsed.numeroNfe : '',
      numeroPedido: typeof parsed?.numeroPedido === 'string' ? parsed.numeroPedido : '',
    }
  } catch {
    return { ...EMPTY_CANAIS_FILTRO_LOCAL }
  }
}

export function clearCanaisFiltrosFromSession(): void {
  try {
    sessionStorage.removeItem(CANAIS_STORAGE_KEY)
  } catch {
    // ignora
  }
}
