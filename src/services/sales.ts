import pb from '@/lib/pocketbase/client'
import type {
  Produto,
  RacNew,
  NetSales,
  VendaConsolidada,
  ImportResult,
  ConsolidarResult,
  VendaGrupoMensal,
  VendaHistoricoPeriodo,
  VendaPorAnoMes,
  ClientesAtivosEquipamentos,
  ClientesAtivosInsumos,
} from '@/types/sales'

export async function fetchProdutos(): Promise<Produto[]> {
  return pb.collection<Produto>('produtos').getFullList({
    sort: 'codigo_item',
  })
}

export async function fetchRacNew(): Promise<RacNew[]> {
  return pb.collection<RacNew>('racnew').getFullList({
    sort: '-data_lancamento',
  })
}

export async function fetchNetSales(): Promise<NetSales[]> {
  return pb.collection<NetSales>('netsales').getFullList({
    sort: '-docdate',
  })
}

export async function fetchVendas(): Promise<VendaConsolidada[]> {
  return pb.collection<VendaConsolidada>('vendas').getFullList({
    sort: '-data_lancamento',
  })
}

export async function importProdutosApi(rows: Record<string, unknown>[]): Promise<ImportResult> {
  return pb.send<ImportResult>('/backend/v1/import/produtos', {
    method: 'POST',
    body: { rows },
  })
}

export async function importRacNewApi(rows: Record<string, unknown>[]): Promise<ImportResult> {
  return pb.send<ImportResult>('/backend/v1/import/racnew', {
    method: 'POST',
    body: { rows },
  })
}

export async function importNetSalesApi(rows: Record<string, unknown>[]): Promise<ImportResult> {
  return pb.send<ImportResult>('/backend/v1/import/netsales', {
    method: 'POST',
    body: { rows },
  })
}

export async function consolidarVendasApi(): Promise<ConsolidarResult> {
  return pb.send<ConsolidarResult>('/backend/v1/vendas/consolidar', {
    method: 'POST',
    body: {},
  })
}

export interface ResetBasesResult {
  success: boolean
  alreadyEmpty: boolean
  message: string
  counts: {
    produtos: number
    racnew: number
    netsales: number
    vendas: number
  }
  total_removido: number
}

export async function resetBasesApi(
  password: string,
  collections?: string[],
): Promise<ResetBasesResult> {
  const body: { password: string; collections?: string[] } = { password }
  if (collections && collections.length > 0) {
    body.collections = collections
  }
  return pb.send<ResetBasesResult>('/backend/v1/admin/reset-bases', {
    method: 'POST',
    body,
  })
}

export interface CountsSummary {
  produtos: number
  racnew: number
  netsales: number
  vendas: number
  ultimaCarga: string | null
}

/**
 * Contagem autoritativa de registros de cada base.
 * Delega para o endpoint backend `/backend/v1/stats/counts`, que usa
 * `$app.countRecords` (contagem real do banco) por coleção.
 */
export async function getCountsSummary(): Promise<CountsSummary> {
  const data = await pb.send<{
    produtos: number
    racnew: number
    netsales: number
    vendas: number
    ultimaCarga: string
  }>('/backend/v1/stats/counts', {
    method: 'GET',
  })

  return {
    produtos: data.produtos ?? 0,
    racnew: data.racnew ?? 0,
    netsales: data.netsales ?? 0,
    vendas: data.vendas ?? 0,
    ultimaCarga: data.ultimaCarga || null,
  }
}

export interface DashboardStatsResult {
  kpis: {
    faturamento: number
    valorLiquido: number
    itensVendidos: number
    documentos: number
    devolucoes: number
  }
  charts: {
    vendasPorMes: Array<{
      mes: string
      faturamento: number
      liquido: number
      devolucoes: number
      faturamento_ano_anterior: number
    }>
    vendasPorAno: Array<{
      ano: string
      faturamento: number
      devolucoes: number
      variacao: number | null
    }>
    grupoItem: Array<{ name: string; value: number }>
    vendasPorGrupoItemMensal: VendaGrupoMensal[]
    vendasEquipamentosPorAno?: VendaHistoricoPeriodo[] | VendaPorAnoMes[]
    vendasInsumosPorAno?: VendaHistoricoPeriodo[] | VendaPorAnoMes[]
    vendasEquipamentosHistorico?: VendaHistoricoPeriodo[]
    vendasInsumosHistorico?: VendaHistoricoPeriodo[]
    clientesAtivosEquipamentos?: ClientesAtivosEquipamentos[]
    clientesAtivosInsumos?: ClientesAtivosInsumos[]
    topVendedores: Array<{ name: string; total: number }>
    topClientes: Array<{ name: string; total: number }>
    estado: Array<{ uf: string; total: number }>
  }
  recentSales: Array<{
    id: string
    data_lancamento: string
    nome_cliente: string
    vendedor_cliente: string
    codigo_item: string
    descricao_item: string
    grupo_item: string
    quantidade: number
    total_linha: number
  }>
  filterOptions: {
    vendedorCliente: string[]
    vendedor: string[]
    grupoItem: string[]
    estado: string[]
    utilizacao: string[]
    tipoDocumento: string[]
    anos: number[]
    meses: number[]
    dias: number[]
  }
}

export async function fetchDashboardStats(
  filters?: Record<string, unknown>,
): Promise<DashboardStatsResult> {
  return pb.send<DashboardStatsResult>('/backend/v1/dashboard/stats', {
    method: 'POST',
    body: { filters: filters || {} },
  })
}

export interface VendasListResult {
  items: VendaConsolidada[]
  page: number
  perPage: number
  totalItems: number
  totalPages: number
}

export async function fetchVendasList(params?: {
  page?: number
  perPage?: number
  sort?: string
  sortField?: string
  sortDirection?: 'asc' | 'desc'
  filters?: Record<string, unknown>
}): Promise<VendasListResult> {
  return pb.send<VendasListResult>('/backend/v1/vendas/list', {
    method: 'POST',
    body: params || {},
  })
}

export interface VendasExportResult {
  items: VendaConsolidada[]
  totalItems: number
}

export async function fetchVendasExport(params?: {
  sort?: string
  sortField?: string
  sortDirection?: 'asc' | 'desc'
  filters?: Record<string, unknown>
}): Promise<VendasExportResult> {
  return pb.send<VendasExportResult>('/backend/v1/vendas/export', {
    method: 'POST',
    body: params || {},
  })
}
