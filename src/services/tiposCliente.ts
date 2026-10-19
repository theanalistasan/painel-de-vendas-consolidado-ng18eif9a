import pb from '@/lib/pocketbase/client'
import { safeAuthRefresh } from '@/lib/pocketbase/auth-session'
import type { ImportResult } from '@/types/sales'

export interface TiposClienteOptionsResult {
  options: string[]
}

export interface TipoClienteInfo {
  tipo_cliente: string
  status_cadastro: string
  tipo_pn: string
}

export interface TiposClienteMapResult {
  map: Record<string, TipoClienteInfo>
}

/**
 * Importa a planilha de Tipos de Cliente do SAP com substituição total da base.
 */
export async function importTiposClienteApi(
  rows: Record<string, unknown>[],
  options?: {
    batchIndex?: number
    totalBatches?: number
    isSubsequentBatch?: boolean
  },
): Promise<ImportResult> {
  const isSubsequent =
    options?.isSubsequentBatch ?? (options?.batchIndex ? options.batchIndex > 0 : false)

  const run = () =>
    pb.send<ImportResult>('/backend/v1/import/tipos-cliente', {
      method: 'POST',
      body: {
        rows,
        clearBefore: !isSubsequent,
        batchIndex: options?.batchIndex ?? 0,
        totalBatches: options?.totalBatches ?? 1,
        isSubsequentBatch: isSubsequent,
      },
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
 * Busca valores distintos de tipo_cliente para alimentar filtros multi-select.
 */
export async function fetchTiposClienteOptions(options?: {
  signal?: AbortSignal
}): Promise<string[]> {
  const run = () =>
    pb.send<TiposClienteOptionsResult>('/backend/v1/tipos-cliente/options', {
      method: 'GET',
      signal: options?.signal,
    })

  try {
    const res = await run()
    return Array.isArray(res?.options) ? res.options : []
  } catch (err: unknown) {
    const status = (err as { status?: number })?.status
    if (status === 401 || status === 403) {
      try {
        const refreshed = await safeAuthRefresh()
        if (refreshed && pb.authStore.isValid) {
          const res = await run()
          return Array.isArray(res?.options) ? res.options : []
        }
      } catch {
        // fallback silencioso
      }
    }
    console.warn('Erro ao carregar opções de tipo_cliente:', err)
    return []
  }
}

/**
 * Busca o mapa completo de tipos de cliente indexado pelo código do cliente/PN (em maiúsculas).
 */
export async function fetchTiposClienteMap(options?: {
  signal?: AbortSignal
}): Promise<Record<string, TipoClienteInfo>> {
  const run = () =>
    pb.send<TiposClienteMapResult>('/backend/v1/tipos-cliente/map', {
      method: 'GET',
      signal: options?.signal,
    })

  try {
    const res = await run()
    return res?.map && typeof res.map === 'object' ? res.map : {}
  } catch (err: unknown) {
    const status = (err as { status?: number })?.status
    if (status === 401 || status === 403) {
      try {
        const refreshed = await safeAuthRefresh()
        if (refreshed && pb.authStore.isValid) {
          const res = await run()
          return res?.map && typeof res.map === 'object' ? res.map : {}
        }
      } catch {
        // fallback silencioso
      }
    }
    console.warn('Erro ao carregar mapa de tipos_cliente:', err)
    return {}
  }
}

/**
 * Busca a data_carga mais recente da coleção tipos_cliente.
 */
export async function fetchUltimaCargaTiposCliente(): Promise<string | null> {
  try {
    const records = await pb.collection('tipos_cliente').getList(1, 1, {
      sort: '-data_carga',
      fields: 'data_carga',
      requestKey: null,
    })
    if (records.items.length > 0 && records.items[0].data_carga) {
      return records.items[0].data_carga as string
    }
    return null
  } catch (err) {
    console.warn('Erro ao buscar última data_carga de tipos_cliente:', err)
    return null
  }
}
