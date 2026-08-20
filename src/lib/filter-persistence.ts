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
  ano: [],
  mes: [],
  dia: [],
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
  ano: [new Date().getFullYear().toString()],
  mes: [],
  dia: [],
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
    const parsed = JSON.parse(raw) as Record<string, unknown>

    // Normalizar caso venham strings de sessões antigas
    const normalizeArray = (val: unknown): string[] => {
      if (Array.isArray(val)) return val.map(String)
      if (typeof val === 'string' && val.trim() !== '') return [val.trim()]
      if (typeof val === 'number') return [String(val)]
      return []
    }

    const merged: FilterState = {
      ...EMPTY_FILTERS,
      ...parsed,
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
