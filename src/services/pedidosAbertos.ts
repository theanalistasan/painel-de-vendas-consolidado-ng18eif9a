import pb from '@/lib/pocketbase/client'
import { safeAuthRefresh, ensureAuthToken } from '@/lib/pocketbase/auth-session'
import type {
  ImportResult,
  PedidoAberto,
  PedidosAbertosListResult,
  PedidosAbertosStatsResult,
} from '@/types/sales'

export async function importPedidosAbertosApi(
  rows: Record<string, unknown>[],
  options?: {
    clearBefore?: boolean
    replace?: boolean
    batchIndex?: number
    isSubsequentBatch?: boolean
  },
): Promise<ImportResult> {
  return pb.send<ImportResult>('/backend/v1/import/pedidos-abertos', {
    method: 'POST',
    // clearBefore sempre forçado como true no lote inicial
    body: {
      rows,
      clearBefore: true,
      replace: true,
      ...options,
    },
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

export interface ResumoPedidosAbertosCliente {
  qtd: number
  valor: number
}

export type PedidosAbertosClienteMap = Record<string, ResumoPedidosAbertosCliente>

export interface ClienteContatoInfo {
  codigo_cliente: string
  nome_cliente: string
  email: string
  contato: string
  telefone: string
}

/**
 * Busca dados de contato (email, contato, telefone) dos clientes na coleção canais_clientes.
 * Retorna um Map com chaves em maiúsculas (código do cliente e nome do cliente) para rápido acesso.
 */
export async function fetchClientesContatosMap(): Promise<Map<string, ClienteContatoInfo>> {
  await ensureAuthToken()

  const runQuery = async () => {
    return Promise.race([
      pb.collection('canais_clientes').getFullList({
        fields: 'codigo_cliente,nome_cliente,email,contato,telefone',
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Tempo limite excedido ao buscar contatos.')), 15000),
      ),
    ])
  }

  let records: Array<{
    codigo_cliente?: string
    nome_cliente?: string
    email?: string
    contato?: string
    telefone?: string
  }> = []

  try {
    records = (await runQuery()) as typeof records
  } catch (err: unknown) {
    const status = (err as { status?: number })?.status
    if (status === 401 || status === 403) {
      const refreshed = await safeAuthRefresh()
      if (refreshed && pb.authStore.isValid) {
        records = (await runQuery()) as typeof records
      }
    }
  }

  const map = new Map<string, ClienteContatoInfo>()

  for (const r of records) {
    const info: ClienteContatoInfo = {
      codigo_cliente: (r.codigo_cliente || '').trim(),
      nome_cliente: (r.nome_cliente || '').trim(),
      email: (r.email || '').trim(),
      contato: (r.contato || '').trim(),
      telefone: (r.telefone || '').trim(),
    }

    if (info.codigo_cliente) {
      map.set(info.codigo_cliente.toUpperCase(), info)
    }
    if (info.nome_cliente) {
      map.set(info.nome_cliente.toUpperCase(), info)
    }
  }

  return map
}

/**
 * Busca todos os registros da coleção pedidos_abertos e agrega por cliente:
 * - Mapa indexado por codigo_cliente.trim().toUpperCase()
 * - qtd: contagem de pedidos (numero_pedido distintos)
 * - valor: somatório de valor_em_aberto
 */
export async function fetchPedidosAbertosClienteMap(): Promise<PedidosAbertosClienteMap> {
  const run = async () => {
    const records = await pb.collection('pedidos_abertos').getFullList<{
      codigo_cliente?: string
      numero_pedido?: string
      valor_em_aberto?: number
    }>({
      fields: 'codigo_cliente,numero_pedido,valor_em_aberto',
      requestKey: null,
    })

    const ordersByClient = new Map<string, Set<string>>()
    const valorByClient = new Map<string, number>()

    for (const r of records) {
      const cod = (r.codigo_cliente || '').trim().toUpperCase()
      if (!cod) continue

      if (!ordersByClient.has(cod)) {
        ordersByClient.set(cod, new Set())
      }
      if (r.numero_pedido) {
        ordersByClient.get(cod)!.add(String(r.numero_pedido).trim())
      }

      const val = Number(r.valor_em_aberto) || 0
      valorByClient.set(cod, (valorByClient.get(cod) || 0) + val)
    }

    const map: PedidosAbertosClienteMap = {}
    for (const [cod, orderSet] of ordersByClient.entries()) {
      map[cod] = {
        qtd: orderSet.size,
        valor: valorByClient.get(cod) || 0,
      }
    }
    for (const [cod, val] of valorByClient.entries()) {
      if (!map[cod]) {
        map[cod] = {
          qtd: 0,
          valor: val,
        }
      }
    }

    return map
  }

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
        // fallback silencioso
      }
    }
    console.warn('Erro ao carregar mapa de pedidos abertos por cliente:', err)
    return {}
  }
}
