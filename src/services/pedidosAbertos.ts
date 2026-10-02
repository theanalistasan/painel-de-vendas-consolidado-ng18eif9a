import pb from '@/lib/pocketbase/client'
import { safeAuthRefresh } from '@/lib/pocketbase/auth-session'
import type {
  ImportResult,
  PedidoAberto,
  PedidosAbertosListResult,
  PedidosAbertosStatsResult,
} from '@/types/sales'

export async function importPedidosAbertosApi(
  rows: Record<string, unknown>[],
  options?: { clearBefore?: boolean; replace?: boolean },
): Promise<ImportResult> {
  return pb.send<ImportResult>('/backend/v1/import/pedidos-abertos', {
    method: 'POST',
    body: { rows, ...options },
  })
}

export async function fetchPedidosAbertosList(params?: {
  page?: number
  perPage?: number
  sortField?: string
  sortDirection?: 'asc' | 'desc'
  search?: string
  filters?: Record<string, unknown>
  signal?: AbortSignal
}): Promise<PedidosAbertosListResult> {
  const run = () =>
    pb.send<PedidosAbertosListResult>('/backend/v1/pedidos-abertos/list', {
      method: 'POST',
      body: params || {},
      signal: params?.signal,
    })

  try {
    return await run()
  } catch (err: unknown) {
    const status = (err as { status?: number })?.status
    if (status === 401 || status === 403) {
      try {
        const refreshed = await safeAuthRefresh()
        if (refreshed && pb.authStore.isValid) {
          return await run()
        }
      } catch {
        throw err
      }
    }
    throw err
  }
}

export async function fetchPedidosAbertosStats(
  filters?: Record<string, unknown>,
  options?: { signal?: AbortSignal },
): Promise<PedidosAbertosStatsResult> {
  const run = () =>
    pb.send<PedidosAbertosStatsResult>('/backend/v1/pedidos-abertos/stats', {
      method: 'POST',
      body: { filters: filters || {} },
      signal: options?.signal,
    })

  try {
    return await run()
  } catch (err: unknown) {
    const status = (err as { status?: number })?.status
    if (status === 401 || status === 403) {
      try {
        const refreshed = await safeAuthRefresh()
        if (refreshed && pb.authStore.isValid) {
          return await run()
        }
      } catch {
        throw err
      }
    }
    throw err
  }
}

/**
 * Busca a data_carga mais recente da coleção pedidos_abertos.
 * Faz consulta direta na coleção ordenada por -data_carga.
 * Retorna string ISO ou null caso a coleção esteja vazia.
 */
export async function fetchUltimaCargaPedidosAbertos(): Promise<string | null> {
  try {
    const records = await pb.collection('pedidos_abertos').getList(1, 1, {
      sort: '-data_carga',
      fields: 'data_carga',
      requestKey: null,
    })
    if (records.items.length > 0 && records.items[0].data_carga) {
      return records.items[0].data_carga as string
    }
    return null
  } catch (err) {
    console.warn('Erro ao buscar última data_carga de pedidos_abertos:', err)
    return null
  }
}
