import pb from '@/lib/pocketbase/client'
import type {
  Produto,
  RacNew,
  NetSales,
  VendaConsolidada,
  ImportResult,
  ConsolidarResult,
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

export async function getCountsSummary() {
  const [prodCount, racCount, netCount, venCount] = await Promise.all([
    pb.collection('produtos').getList(1, 1),
    pb.collection('racnew').getList(1, 1),
    pb.collection('netsales').getList(1, 1),
    pb.collection('vendas').getList(1, 1),
  ])

  // Get latest updated date from vendas
  let ultimaCarga: string | null = null
  if (venCount.items.length > 0) {
    const latest = await pb.collection('vendas').getList(1, 1, { sort: '-updated' })
    if (latest.items.length > 0) {
      ultimaCarga = latest.items[0].updated || latest.items[0].created
    }
  }

  return {
    produtos: prodCount.totalItems,
    racnew: racCount.totalItems,
    netsales: netCount.totalItems,
    vendas: venCount.totalItems,
    ultimaCarga,
  }
}
