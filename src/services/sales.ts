import pb from '@/lib/pocketbase/client'
import { safeAuthRefresh } from '@/lib/pocketbase/auth-session'
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
  CanalOption,
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

export async function importCanaisClientesApi(
  rows: Record<string, unknown>[],
  options?: { clearBefore?: boolean; replace?: boolean },
): Promise<ImportResult> {
  return pb.send<ImportResult>('/backend/v1/import/canais-clientes', {
    method: 'POST',
    body: { rows, ...options },
  })
}

export async function consolidarVendasApi(): Promise<ConsolidarResult> {
  return pb.send<ConsolidarResult>('/backend/v1/vendas/consolidar', {
    method: 'POST',
    body: {},
  })
}

export async function reconstruirResumosApi(): Promise<
  import('../types/sales').ReconstruirResumosResult
> {
  return pb.send<import('../types/sales').ReconstruirResumosResult>(
    '/backend/v1/vendas/reconstruir-resumos',
    {
      method: 'POST',
      body: {},
    },
  )
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
  canais_clientes: number
  pedidos_abertos: number
  ultimaCarga: string | null
}

/**
 * Contagem autoritativa de registros de cada base.
 * Delega para o endpoint backend `/backend/v1/stats/counts`, que usa
 * `$app.countRecords` (contagem real do banco) por coleção.
 */
export async function getCountsSummary(): Promise<CountsSummary> {
  const run = () =>
    pb.send<{
      produtos: number
      racnew: number
      netsales: number
      vendas: number
      canais_clientes?: number
      pedidos_abertos?: number
      ultimaCarga: string
    }>('/backend/v1/stats/counts', {
      method: 'GET',
    })

  let data
  try {
    data = await run()
  } catch (err: unknown) {
    const status = (err as { status?: number })?.status
    if (status === 401 || status === 403) {
      try {
        const refreshed = await safeAuthRefresh()
        if (refreshed && pb.authStore.isValid) {
          data = await run()
        } else {
          throw err
        }
      } catch {
        throw err
      }
    } else {
      throw err
    }
  }

  return {
    produtos: data.produtos ?? 0,
    racnew: data.racnew ?? 0,
    netsales: data.netsales ?? 0,
    vendas: data.vendas ?? 0,
    canais_clientes: (data as unknown as Record<string, number>).canais_clientes ?? 0,
    pedidos_abertos: (data as unknown as Record<string, number>).pedidos_abertos ?? 0,
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
    revendasFaturamento?: Record<string, { faturamento: number; documentos: number; itens: number }>
    vendasPorCanal?: Array<{ canal: string; faturamento: number; clientesQtd: number }>
    vendasPorDeploy?: Array<{
      deploy: 'AGIS' | 'Roland' | 'Nenhum' | string
      faturamento: number
      label: string
    }>
    canaisSummary?: { canaisAtivos: number; clientesVinculados: number; faturamentoTotal: number }
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
    canais?: CanalOption[]
    canaisClientes?: import('../types/sales').CanalClienteOption[]
    inside?: string[]
    anos: number[]
    meses: number[]
    dias: number[]
    ultimoAno?: number
    ultimoMes?: number
    maxDataLancamento?: string
  }
}

// Cache e deduplicação de requisições de dashboard stats no frontend
let pendingStatsPromise: {
  key: string
  promise: Promise<DashboardStatsResult>
} | null = null

export async function fetchDashboardStats(
  filters?: Record<string, unknown>,
  options?: { timeoutMs?: number; signal?: AbortSignal },
): Promise<DashboardStatsResult> {
  const cacheKey = JSON.stringify(filters || {})

  // Se já houver uma requisição idêntica em andamento e nenhum signal customizado for passado,
  // reutiliza a promise em voo (deduplicação real no frontend)
  if (!options?.signal && pendingStatsPromise && pendingStatsPromise.key === cacheKey) {
    return pendingStatsPromise.promise
  }

  // Timeout padrão de 45 segundos no cliente para abortar e notificar erro amigável
  const timeoutMs = options?.timeoutMs || 45000
  const internalController = new AbortController()
  let isTimeoutAbort = false

  const timer = setTimeout(() => {
    isTimeoutAbort = true
    internalController.abort(
      new Error('Tempo limite de requisição excedido ao buscar estatísticas do painel.'),
    )
  }, timeoutMs)

  // Se um sinal externo for fornecido, propaga o cancelamento para o internalController
  if (options?.signal) {
    if (options.signal.aborted) {
      internalController.abort(options.signal.reason)
    } else {
      options.signal.addEventListener(
        'abort',
        () => {
          internalController.abort(options.signal?.reason)
        },
        { once: true },
      )
    }
  }

  const run = () =>
    pb.send<DashboardStatsResult>('/backend/v1/dashboard/stats', {
      method: 'POST',
      body: { filters: filters || {} },
      signal: internalController.signal,
    })

  const exec = async () => {
    try {
      return await run()
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status
      if ((status === 401 || status === 403) && !internalController.signal.aborted) {
        try {
          const refreshed = await safeAuthRefresh()
          if (refreshed && pb.authStore.isValid) {
            return await run()
          }
        } catch {
          throw err
        }
      }

      if (status === 504) {
        throw new Error(
          'A consulta demorou mais do que o esperado para responder. Refine os filtros selecionados.',
        )
      }

      const isAbort =
        (err as Error)?.name === 'AbortError' ||
        String(err).includes('aborted') ||
        String(err).includes('autocancelled') ||
        internalController.signal.aborted

      if (isAbort) {
        if (isTimeoutAbort) {
          throw new Error(
            'Tempo limite esgotado ao buscar os dados do painel. Por favor, tente refinar os filtros.',
          )
        }
        const abortError = new Error('Requisição cancelada.')
        abortError.name = 'AbortError'
        throw abortError
      }

      throw err
    } finally {
      clearTimeout(timer)
      if (pendingStatsPromise && pendingStatsPromise.key === cacheKey) {
        pendingStatsPromise = null
      }
    }
  }

  const promise = exec()
  if (!options?.signal) {
    pendingStatsPromise = { key: cacheKey, promise }
  }

  return promise
}

export interface VendasListResult {
  items: (VendaConsolidada & { itens_qtd?: number })[]
  page: number
  perPage: number
  totalItems: number
  totalNetsales?: number
  totalRacnew?: number
  totalPages: number
  hasMore?: boolean
  isGrouped?: boolean
}

export async function fetchVendasList(params?: {
  page?: number
  perPage?: number
  sort?: string
  sortField?: string
  sortDirection?: 'asc' | 'desc'
  filters?: Record<string, unknown>
  groupByNfe?: boolean
  collapsed?: boolean
  signal?: AbortSignal
}): Promise<VendasListResult> {
  const internalController = new AbortController()
  let isTimeoutAbort = false
  const timer = setTimeout(() => {
    isTimeoutAbort = true
    internalController.abort()
  }, 40000)

  if (params?.signal) {
    if (params.signal.aborted) {
      clearTimeout(timer)
      const err = new Error('Requisição cancelada.')
      err.name = 'AbortError'
      throw err
    }
    params.signal.addEventListener('abort', () => internalController.abort())
  }

  const { signal: _s, ...bodyPayload } = params || {}

  const run = () =>
    pb.send<VendasListResult>('/backend/v1/vendas/list', {
      method: 'POST',
      body: bodyPayload,
      signal: internalController.signal,
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
    if (status === 504) {
      throw new Error(
        'A consulta demorou mais do que o esperado. Por favor, refine os filtros selecionados.',
      )
    }
    const isAbort =
      (err as Error)?.name === 'AbortError' ||
      String(err).includes('aborted') ||
      String(err).includes('autocancelled') ||
      internalController.signal.aborted
    if (isAbort) {
      if (isTimeoutAbort) {
        throw new Error(
          'Tempo limite esgotado ao buscar lista de vendas. Por favor, tente refinar os filtros.',
        )
      }
      const abortError = new Error('Requisição cancelada.')
      abortError.name = 'AbortError'
      throw abortError
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

export interface VendasExportResult {
  items: (VendaConsolidada & { itens_qtd?: number })[]
  totalItems: number
  isGrouped?: boolean
}

export async function fetchVendasExport(params?: {
  sort?: string
  sortField?: string
  sortDirection?: 'asc' | 'desc'
  filters?: Record<string, unknown>
  groupByNfe?: boolean
  collapsed?: boolean
  signal?: AbortSignal
}): Promise<VendasExportResult> {
  const internalController = new AbortController()
  let isTimeoutAbort = false
  const timer = setTimeout(() => {
    isTimeoutAbort = true
    internalController.abort()
  }, 40000)

  if (params?.signal) {
    if (params.signal.aborted) {
      clearTimeout(timer)
      const err = new Error('Requisição cancelada.')
      err.name = 'AbortError'
      throw err
    }
    params.signal.addEventListener('abort', () => internalController.abort())
  }

  const { signal: _s, ...bodyPayload } = params || {}

  const run = () =>
    pb.send<VendasExportResult>('/backend/v1/vendas/export', {
      method: 'POST',
      body: bodyPayload,
      signal: internalController.signal,
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
    if (status === 504) {
      throw new Error(
        'A exportação de vendas demorou mais do que o esperado. Refine os filtros selecionados.',
      )
    }
    const isAbort =
      (err as Error)?.name === 'AbortError' ||
      String(err).includes('aborted') ||
      String(err).includes('autocancelled') ||
      internalController.signal.aborted
    if (isAbort) {
      if (isTimeoutAbort) {
        throw new Error(
          'Tempo limite esgotado na exportação de vendas. Por favor, refine os filtros.',
        )
      }
      const abortError = new Error('Requisição cancelada.')
      abortError.name = 'AbortError'
      throw abortError
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}
