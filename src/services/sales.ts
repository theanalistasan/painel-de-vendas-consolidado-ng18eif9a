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
    filter: "codigo_item != 'SERVICOS'",
    sort: 'codigo_item',
  })
}

export async function fetchRacNew(): Promise<RacNew[]> {
  return pb.collection<RacNew>('racnew').getFullList({
    filter: "codigo_item != 'SERVICOS'",
    sort: '-data_lancamento',
  })
}

export async function fetchNetSales(): Promise<NetSales[]> {
  return pb.collection<NetSales>('netsales').getFullList({
    filter: "itemcode != 'SERVICOS'",
    sort: '-docdate',
  })
}

export async function fetchVendas(): Promise<VendaConsolidada[]> {
  return pb.collection<VendaConsolidada>('vendas').getFullList({
    filter: "codigo_item != 'SERVICOS'",
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

export async function getConsolidacaoStatusApi(): Promise<{
  success: boolean
  status: import('@/types/sales').ConsolidacaoStatus
}> {
  return pb.send<{ success: boolean; status: import('@/types/sales').ConsolidacaoStatus }>(
    '/backend/v1/vendas/consolidar/status',
    {
      method: 'GET',
    },
  )
}

export async function stepConsolidarVendasApi(): Promise<{
  success: boolean
  done?: boolean
  already_finished?: boolean
  batch_processed?: number
  total_batches?: number
  registros_processados?: number
  total_registros?: number
  status: import('@/types/sales').ConsolidacaoStatus
}> {
  return pb.send<{
    success: boolean
    done?: boolean
    already_finished?: boolean
    batch_processed?: number
    total_batches?: number
    registros_processados?: number
    total_registros?: number
    status: import('@/types/sales').ConsolidacaoStatus
  }>('/backend/v1/vendas/consolidar/step', {
    method: 'POST',
    body: {},
  })
}

export async function consolidarVendasApi(options?: {
  timeoutMs?: number
  signal?: AbortSignal
  onProgress?: (status: import('@/types/sales').ConsolidacaoStatus) => void
}): Promise<ConsolidarResult> {
  const startTime = Date.now()

  // 1. Dispara o início da consolidação
  let initRes: {
    success: boolean
    started: boolean
    already_running?: boolean
    total_batches?: number
    batch_size?: number
    total_registros?: number
    data_carga: string
    status: import('@/types/sales').ConsolidacaoStatus
    message?: string
  }

  try {
    initRes = await pb.send<{
      success: boolean
      started: boolean
      already_running?: boolean
      total_batches?: number
      batch_size?: number
      total_registros?: number
      data_carga: string
      status: import('@/types/sales').ConsolidacaoStatus
      message?: string
    }>('/backend/v1/vendas/consolidar', {
      method: 'POST',
      body: {},
    })
  } catch (initErr: unknown) {
    const errObj = initErr as {
      data?: { error?: string; stage?: string; message?: string }
      response?: { error?: string; stage?: string; message?: string }
      message?: string
    }
    const backendData = errObj?.data || errObj?.response

    let msg =
      backendData?.error ||
      backendData?.message ||
      errObj?.message ||
      'Falha ao iniciar consolidação'
    const stage = backendData?.stage || 'iniciar'

    if (!msg || msg.includes('Something went wrong')) {
      try {
        const freshStatus = await getConsolidacaoStatusApi()
        if (freshStatus.status?.erro && !freshStatus.status.erro.includes('Something went wrong')) {
          msg = freshStatus.status.erro
        }
      } catch {
        /* intentionally ignored */
      }
    }

    throw new Error(`Falha na consolidação na etapa [${stage}] (início): ${msg}`)
  }

  let currentStatus = initRes.status
  if (options?.onProgress && currentStatus) {
    options.onProgress(currentStatus)
  }

  // 2. Itera executando os lotes passo a passo (cada um leva <2-5 segundos)
  // Isso impede que qualquer requisição única exceda o timeout de proxy HTTP.
  const maxIterations = 100 // Teto de segurança
  let iterations = 0

  while (iterations < maxIterations) {
    iterations++

    if (options?.signal?.aborted) {
      throw new Error('Consolidação cancelada pelo usuário.')
    }

    if (currentStatus.status === 'completed') {
      break
    }

    if (currentStatus.status === 'error') {
      const msg =
        currentStatus.erro ||
        currentStatus.mensagem ||
        `Falha na consolidação na etapa [${currentStatus.etapa || 'desconhecida'}]`
      throw new Error(msg)
    }

    try {
      const stepRes = await stepConsolidarVendasApi()
      currentStatus = stepRes.status
      if (options?.onProgress && currentStatus) {
        options.onProgress(currentStatus)
      }

      if (stepRes.done || stepRes.already_finished || currentStatus.status === 'completed') {
        break
      }
    } catch (stepErr: unknown) {
      // Extrai a resposta de erro detalhada do PocketBase / fetch
      const errObj = stepErr as {
        data?: { error?: string; message?: string; stage?: string; lote?: number }
        response?: { error?: string; message?: string; stage?: string; lote?: number }
        message?: string
      }
      const backendData = errObj?.data || errObj?.response

      const stage = backendData?.stage || currentStatus?.etapa || 'processamento'
      const lote = backendData?.lote || (currentStatus ? currentStatus.lote_atual + 1 : 1)

      let rawMsg =
        backendData?.error ||
        backendData?.message ||
        errObj?.message ||
        'Erro desconhecido no servidor'

      // Se a mensagem for genérica como "Something went wrong.", tenta consultar o status do backend
      if (!rawMsg || rawMsg.includes('Something went wrong')) {
        try {
          const freshStatus = await getConsolidacaoStatusApi()
          if (
            freshStatus.status?.erro &&
            !freshStatus.status.erro.includes('Something went wrong')
          ) {
            rawMsg = freshStatus.status.erro
          } else if (
            freshStatus.status?.mensagem &&
            !freshStatus.status.mensagem.includes('Something went wrong')
          ) {
            rawMsg = freshStatus.status.mensagem
          }
        } catch {
          /* intentionally ignored */
        }
      }

      const specificMsg =
        rawMsg.includes(`[${stage}]`) || rawMsg.includes(`Lote`)
          ? rawMsg
          : `Falha na etapa [${stage}] (Lote ${lote}): ${rawMsg}`

      throw new Error(specificMsg)
    }
  }

  return {
    success: true,
    total_consolidado: currentStatus.registros_processados || currentStatus.total_registros || 0,
    data_carga: currentStatus.data_carga || new Date().toISOString(),
    durationMs: Date.now() - startTime,
    resumos_pendentes: true,
    message: currentStatus.mensagem || 'Consolidação concluída com sucesso.',
    status: currentStatus,
  }
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
  estoque_sap: number
  tipos_cliente?: number
  ultimaCarga: string | null
  ultimaCargaPedidosAbertos?: string | null
  ultimaCargaEstoqueSap?: string | null
  ultimaCargaTiposCliente?: string | null
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
      estoque_sap?: number
      tipos_cliente?: number
      ultimaCarga: string
      ultimaCargaPedidosAbertos?: string
      ultimaCargaEstoqueSap?: string
      ultimaCargaTiposCliente?: string
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
    estoque_sap: (data as unknown as Record<string, number>).estoque_sap ?? 0,
    tipos_cliente: (data as unknown as Record<string, number>).tipos_cliente ?? 0,
    ultimaCarga: data.ultimaCarga || null,
    ultimaCargaPedidosAbertos: data.ultimaCargaPedidosAbertos || null,
    ultimaCargaEstoqueSap: data.ultimaCargaEstoqueSap || null,
    ultimaCargaTiposCliente:
      (data as unknown as Record<string, string>).ultimaCargaTiposCliente || null,
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
    clientesAtivosTintas?: ClientesAtivosInsumos[]
    clientesAtivosAcessorios?: ClientesAtivosInsumos[]
    clientesAtivosPecas?: ClientesAtivosInsumos[]
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
    tipoCliente?: string[]
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

export interface CanalComparativoItem {
  canal: string
  faturamentoAtual: number
  faturamentoAnterior: number
  diff: number
  variacaoPercentual: number | null
  clientesAtual: number
  clientesAnterior: number
}

export interface CanaisComparativoResult {
  anoAtual: number
  mesAtual: number
  anoAnterior: number
  mesAnterior: number
  ymAtual: string
  ymAnterior: string
  mesLabelAtual: string
  mesLabelAnterior: string
  mesNomeCompletoAtual: string
  mesNomeCompletoAnterior: string
  totalAtual: number
  totalAnterior: number
  diffTotal: number
  variacaoTotal: number | null
  canais: CanalComparativoItem[]
}

export async function fetchCanaisComparativo(params?: {
  filters?: Record<string, unknown>
  ano?: number
  mes?: number
  signal?: AbortSignal
}): Promise<CanaisComparativoResult> {
  const internalController = new AbortController()
  const timer = setTimeout(() => {
    internalController.abort(new Error('Tempo limite esgotado ao buscar comparativo de canais.'))
  }, 40000)

  if (params?.signal) {
    if (params.signal.aborted) {
      clearTimeout(timer)
      const err = new Error('Requisição cancelada.')
      err.name = 'AbortError'
      throw err
    }
    params.signal.addEventListener('abort', () => internalController.abort(), { once: true })
  }

  const run = () =>
    pb.send<CanaisComparativoResult>('/backend/v1/canais/comparativo-mes', {
      method: 'POST',
      body: {
        filters: params?.filters || {},
        ano: params?.ano,
        mes: params?.mes,
      },
      signal: internalController.signal,
    })

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
    throw err
  } finally {
    clearTimeout(timer)
  }
}

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
