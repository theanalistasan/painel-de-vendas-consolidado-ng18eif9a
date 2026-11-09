import pb from '@/lib/pocketbase/client'
import { safeAuthRefresh } from '@/lib/pocketbase/auth-session'
import type { ImportResult } from '@/types/sales'

// Tipo referenciado pelo cache abaixo (declarado adiante).
type TipoClienteInfoLike = { tipo_cliente: string }

// Cache de leitura em memória (por sessão de navegador) para os endpoints de
// tipos de cliente — os mais chamados do painel (toda página os carrega 1-2x
// em paralelo com as listagens). Deduplica chamadas simultâneas (Promise em
// voo) e serve de TTL curto para evitar refetchs idênticos em remounts.
const TC_READ_TTL_MS = 60000
let tcOptionsCache: { data: string[]; expiresAt: number } | null = null
let tcMapCache: { data: Record<string, TipoClienteInfoLike>; expiresAt: number } | null = null
let tcOptionsInFlight: Promise<string[]> | null = null
let tcMapInFlight: Promise<Record<string, TipoClienteInfoLike>> | null = null

export function invalidateTiposClienteReadCache(): void {
  tcOptionsCache = null
  tcMapCache = null
  tcOptionsInFlight = null
  tcMapInFlight = null
}

export interface TiposClienteOptionsResult {
  options: string[]
}

export interface TipoClienteInfo {
  tipo_cliente: string
  status_cadastro?: string
  tipo_pn?: string
  codigo_cliente?: string
  nome_cliente?: string
  data_carga?: string
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
    const result = await run()
    // Carga concluída: invalida o cache de leitura local (options/map).
    invalidateTiposClienteReadCache()
    return result
  } catch (err: unknown) {
    const status = (err as { status?: number })?.status
    if (status === 401 || status === 403) {
      try {
        const refreshed = await safeAuthRefresh()
        if (refreshed && pb.authStore.isValid) {
          const result = await run()
          invalidateTiposClienteReadCache()
          return result
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
    // Dedupe/TTL: várias páginas chamam options simultaneamente no mount.
    if (tcOptionsCache && tcOptionsCache.expiresAt > Date.now()) return tcOptionsCache.data
    if (tcOptionsInFlight) return tcOptionsInFlight
    tcOptionsInFlight = run().then((res) => {
      const opts = Array.isArray(res?.options) ? res.options : []
      tcOptionsCache = { data: opts, expiresAt: Date.now() + TC_READ_TTL_MS }
      return opts
    })
    const result = await tcOptionsInFlight
    tcOptionsInFlight = null
    return result
  } catch (err: unknown) {
    tcOptionsInFlight = null
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
    // Dedupe/TTL: o mapa é o payload mais pesado desta service e é pedido
    // 2-4x por página (com listagens em paralelo). Uma única viagem por minuto.
    if (tcMapCache && tcMapCache.expiresAt > Date.now()) return tcMapCache.data
    if (tcMapInFlight) return tcMapInFlight
    tcMapInFlight = run().then((res) => {
      const map = res?.map && typeof res.map === 'object' ? res.map : {}
      tcMapCache = { data: map, expiresAt: Date.now() + TC_READ_TTL_MS }
      return map
    })
    const result = await tcMapInFlight
    tcMapInFlight = null
    return result
  } catch (err: unknown) {
    tcMapInFlight = null
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
 * Converte o mapa completo de TipoClienteInfo para um mapa simples código PN -> tipo_cliente (em maiúsculas).
 */
export function buildTiposClienteStringMap(
  map: Record<string, TipoClienteInfo> | undefined | null,
): Record<string, string> {
  const result: Record<string, string> = {}
  if (!map || typeof map !== 'object') return result
  for (const [cod, info] of Object.entries(map)) {
    const tipo = info?.tipo_cliente?.trim()
    if (tipo) {
      result[cod.trim().toUpperCase()] = tipo
    }
  }
  return result
}

/**
 * Resolve o tipo_cliente de um registro usando o valor original ou o mapa como fallback.
 * Retorna '-' se nenhum valor for encontrado (nunca string vazia).
 */
export function resolveTipoCliente(
  tipoCliente: string | undefined | null,
  codigoCliente: string | undefined | null,
  stringMap: Record<string, string>,
): string {
  const tc = (tipoCliente || '').trim()
  if (tc && tc !== '-') return tc
  if (codigoCliente) {
    const cod = codigoCliente.trim().toUpperCase()
    if (stringMap[cod]) {
      return stringMap[cod]
    }
  }
  return '-'
}

/**
 * Enriquece um registro de venda com tipo_cliente resolvido via mapa de fallback.
 */
export function enrichVendaTipoCliente<
  T extends { tipo_cliente?: string; codigo_cliente?: string },
>(item: T, stringMap: Record<string, string>): T {
  return {
    ...item,
    tipo_cliente: resolveTipoCliente(item.tipo_cliente, item.codigo_cliente, stringMap),
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
