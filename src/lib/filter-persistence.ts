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
    if (!raw) return { ...EMPTY_FILTERS }
    const parsed = JSON.parse(raw) as Partial<FilterState>
    // Garantir que todos os campos existam (merge com defaults)
    return { ...EMPTY_FILTERS, ...parsed }
  } catch {
    return { ...EMPTY_FILTERS }
  }
}

export function clearFiltersFromSession(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignora
  }
}
