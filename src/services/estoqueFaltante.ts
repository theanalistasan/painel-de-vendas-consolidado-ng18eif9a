import pb from '@/lib/pocketbase/client'
import { safeAuthRefresh } from '@/lib/pocketbase/auth-session'
import type { ImportResult } from '@/types/sales'

export interface EstoqueSapItem {
  id: string
  codigo_item: string
  descricao_item?: string
  descricao_ingles?: string
  codigo_grupo?: string
  nome_grupo?: string
  grupo_item?: string
  codigo_subgrupo?: string
  nome_subgrupo?: string
  item_code?: string
  deposito?: string
  quantidade_estoque: number
  em_transito: number
  pedido_venda?: number
  estoque_liquido?: number
  custo_item?: number
  ultima_venda?: string
  data_carga?: string
}

export interface EstoqueFaltanteItem {
  id: string
  canal: string
  codigo_item: string
  descricao_item: string
  grupo_item: string
  qtd_aberto: number
  valor_em_aberto: number
  pedidos_qtd: number
  clientes_qtd: number
  clientes_nomes: string
  em_transito: number
  media_mensal_vendas: number
  qtd_vendida_6m: number
}

export interface EstoqueFaltanteListResult {
  items: EstoqueFaltanteItem[]
  page: number
  perPage: number
  totalItems: number
  totalPages: number
  totalValor: number
  totalQtd: number
}

export interface EstoqueFaltanteStatsResult {
  kpis: {
    totalItensDistintos: number
    valorDemandaPendente: number
    pedidosImpactados: number
    qtdTotalAberto: number
    comTransito: {
      itens: number
      valor: number
      pedidos: number
      qtd: number
    }
    semTransito: {
      itens: number
      valor: number
      pedidos: number
      qtd: number
    }
  }
  top20Qtd: Array<{
    codigo_item: string
    descricao_item: string
    grupo_item: string
    qtd_aberto: number
    valor_em_aberto: number
    pedidos_qtd: number
    em_transito: number
    tem_transito: boolean
  }>
  top20Valor: Array<{
    codigo_item: string
    descricao_item: string
    grupo_item: string
    qtd_aberto: number
    valor_em_aberto: number
    pedidos_qtd: number
    em_transito: number
    tem_transito: boolean
  }>
}

export interface MrpItem {
  codigo_item: string
  descricao_item: string
  grupo_item: string
  qtd_total_6m: number
  media_mensal: number
  valor_total_6m: number
  estoque_atual: number | null
  em_transito: number | null
  tem_posicao_estoque: boolean
  cobertura_meses: number | null
  status_reposicao: 'repor' | 'atencao' | 'normal' | 'sem_posicao'
  data_carga_estoque: string | null
}

export interface MrpResult {
  top20Vendidos: MrpItem[]
  periodo: {
    de: string
    ate: string
    meses: number
  }
  estoqueSapInfo: {
    totalRegistros: number
    ultimaCarga: string
    temRegistros: boolean
  }
}

export interface ImportEstoqueSapOptions {
  clearBefore?: boolean
  replace?: boolean
  batchIndex?: number
  totalBatches?: number
  isSubsequentBatch?: boolean
}

export async function importEstoqueSapApi(
  rows: Record<string, unknown>[],
  options?: ImportEstoqueSapOptions,
): Promise<ImportResult> {
  const isSubsequent =
    options?.isSubsequentBatch ?? (options?.batchIndex ? options.batchIndex > 0 : false)
  const run = () =>
    pb.send<ImportResult>('/backend/v1/import/estoque-sap', {
      method: 'POST',
      body: {
        rows,
        clearBefore: !isSubsequent,
        replace: true,
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

export async function fetchEstoqueFaltanteList(params?: {
  page?: number
  perPage?: number
  sortField?: string
  sortDirection?: 'asc' | 'desc'
  filters?: Record<string, unknown>
  statusTransito?: '' | 'com_transito' | 'sem_transito'
  search?: string
  signal?: AbortSignal
}): Promise<EstoqueFaltanteListResult> {
  const run = () =>
    pb.send<EstoqueFaltanteListResult>('/backend/v1/estoque-faltante/list', {
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

export async function fetchEstoqueFaltanteStats(
  filters?: Record<string, unknown>,
  options?: { signal?: AbortSignal },
): Promise<EstoqueFaltanteStatsResult> {
  const run = () =>
    pb.send<EstoqueFaltanteStatsResult>('/backend/v1/estoque-faltante/stats', {
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
 * Busca a data_carga mais recente da coleção estoque_sap.
 * Faz consulta direta na coleção ordenada por -data_carga.
 * Retorna string ISO ou null caso a coleção esteja vazia.
 */
export async function fetchUltimaCargaEstoqueSap(): Promise<string | null> {
  try {
    const records = await pb.collection('estoque_sap').getList(1, 1, {
      sort: '-data_carga',
      fields: 'data_carga',
      requestKey: null,
    })
    if (records.items.length > 0 && records.items[0].data_carga) {
      return records.items[0].data_carga as string
    }
    return null
  } catch (err) {
    console.warn('Erro ao buscar última data_carga de estoque_sap:', err)
    return null
  }
}

export async function fetchMrpData(options?: { signal?: AbortSignal }): Promise<MrpResult> {
  const run = () =>
    pb.send<MrpResult>('/backend/v1/estoque-faltante/mrp', {
      method: 'POST',
      body: {},
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
