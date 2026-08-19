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
  search: '',
  ano: '',
  mes: '',
  dia: '',
  tipoDevolucao: '',
}

/**
 * Filtros padrão aplicados ao acessar o app pela primeira vez ou após logout
 * (quando não há nada salvo no sessionStorage). Os valores correspondem aos
 * reais no banco de dados.
 */
const DEFAULT_FILTERS: FilterState = {
  dataDe: '',
  dataAte: '',
  vendedorCliente: [],
  vendedor: [],
  grupoItem: ['PEÇAS', 'TINTAS', 'ACESSÓRIOS', 'EQUIPAMENTOS'],
  estado: [],
  utilizacao: ['VENDA DE MERCADORIA'],
  tipoDocumento: ['NF de Saída'],
  search: '',
  ano: new Date().getFullYear().toString(),
  mes: '',
  dia: '',
  tipoDevolucao: '',
}

export function saveFiltersToSession(filters: FilterState): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(filters))
  } catch {
    // sessionStorage não disponível ou cheio — ignora silenciosamente
  }
}

export function loadFiltersFromSession(): FilterState {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    // Sem nada salvo (primeiro acesso ou pós-logout): usa os filtros padrão
    if (!raw) return { ...DEFAULT_FILTERS }
    const parsed = JSON.parse(raw) as Partial<FilterState>
    // Garantir que todos os campos existam (merge com EMPTY_FILTERS de segurança)
    return { ...EMPTY_FILTERS, ...parsed }
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
