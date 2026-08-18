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
 * `$app.countRecords` (contagem real do banco) por coleção — evita o
 * problema do `getList(1,1).totalItems` que podia retornar o mesmo número
 * para coleções distintas e gerar a impressão de importação incorreta.
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
