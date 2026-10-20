import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Download,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronsDownUp,
  ChevronsUpDown,
  Search,
  Clock,
  Layers,
  DollarSign,
  FileText,
  RotateCw,
  Building2,
  AlertCircle,
  Boxes,
  Briefcase,
  Users,
  Filter,
} from 'lucide-react'
import { fetchPedidosAbertosList, fetchPedidosAbertosStats } from '@/services/pedidosAbertos'
import {
  fetchTiposClienteOptions,
  fetchTiposClienteMap,
  TipoClienteInfo,
} from '@/services/tiposCliente'
import { logAudit } from '@/services/audit'
import type {
  PedidoAberto,
  CanalOption,
  CanalClienteOption,
  PedidosAbertosKpis,
} from '@/types/sales'
import { formatCurrency, formatNumber, formatDate, exportToCSV } from '@/lib/formatters'
import PedidosAbertosFilterBar, {
  PedidosAbertosFilters,
  EMPTY_PEDIDOS_ABERTOS_FILTERS,
} from '@/components/PedidosAbertosFilterBar'
import KpiCard from '@/components/KpiCard'
import PedidosAbertosDashboard from '@/components/PedidosAbertosDashboard'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import type { SortDir } from '@/lib/sort'
import { cn } from '@/lib/utils'

const PAGE_SIZE = 25

type PedidosAbertosSortColumn =
  | 'nome_canal'
  | 'numero_pedido'
  | 'data_pedido'
  | 'tipo_cliente'
  | 'nome_cliente'
  | 'status_cadastro'
  | 'tipo_pn'
  | 'codigo_item'
  | 'qtd_aberto'
  | 'preco_apos_desconto'
  | 'valor_em_aberto'
  | 'status_linha'
  | 'em_estoque'

type SortField = PedidosAbertosSortColumn

type ViewMode = 'none' | 'faturamento' | 'canal' | 'cliente' | 'tipo_cliente' | 'detalhado'

export type StatusLinhaFilter = 'todos' | 'Aberta' | 'Fechada'

const matchesStatusLinha = (item: PedidoAberto, filter: StatusLinhaFilter): boolean => {
  if (filter === 'todos') return true
  const st = (item.status_linha || 'Aberta').trim().toLowerCase()
  if (filter === 'Aberta') {
    return st === 'aberta' || st === 'aberto' || st === 'a' || !st
  }
  if (filter === 'Fechada') {
    return st === 'fechada' || st === 'fechado' || st === 'f'
  }
  return true
}

interface TipoClienteGroup {
  key: string
  tipo_cliente: string
  totalPedidos: number
  totalLinhas: number
  totalClientes: number
  totalQtdAberto: number
  totalQtdSolicitada: number
  totalValorEmAberto: number
  totalValorLiquido: number
  items: PedidoAberto[]
}

interface CanalFaturamentoGroup {
  key: string
  canal_faturamento: string
  totalPedidos: number
  totalLinhas: number
  totalClientes: number
  totalQtdAberto: number
  totalQtdSolicitada: number
  totalValorEmAberto: number
  totalValorLiquido: number
  items: PedidoAberto[]
}

interface ClientGroup {
  key: string
  codigo_cliente: string
  nome_cliente: string
  nome_canal: string
  deploy: string
  inside: string
  totalPedidos: number
  totalLinhas: number
  totalQtdAberto: number
  totalQtdSolicitada: number
  totalValorEmAberto: number
  totalValorLiquido: number
  items: PedidoAberto[]
}

interface CanalGroup {
  key: string
  nome_canal: string
  deploy: string
  totalPedidos: number
  totalLinhas: number
  totalClientes: number
  totalQtdAberto: number
  totalQtdSolicitada: number
  totalValorEmAberto: number
  totalValorLiquido: number
  items: PedidoAberto[]
}

export default function PedidosAbertos() {
  const [paginatedPedidos, setPaginatedPedidos] = useState<PedidoAberto[]>([])
  const [allFilteredPedidos, setAllFilteredPedidos] = useState<PedidoAberto[]>([])
  const [dashboardPedidos, setDashboardPedidos] = useState<PedidoAberto[]>([])
  const [totalItems, setTotalItems] = useState(0)
  const [totalValor, setTotalValor] = useState(0)
  const [totalQtd, setTotalQtd] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [page, setPage] = useState(1)
  const [searchTerm, setSearchTerm] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    try {
      const saved = sessionStorage.getItem('pedidos_abertos_view_mode')
      if (
        saved === 'none' ||
        saved === 'faturamento' ||
        saved === 'canal' ||
        saved === 'cliente' ||
        saved === 'tipo_cliente' ||
        saved === 'detalhado'
      ) {
        return (saved === 'detalhado' ? 'none' : saved) as ViewMode
      }
    } catch {
      // ignora
    }
    return 'none'
  })
  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set())
  const [expandedCanais, setExpandedCanais] = useState<Set<string>>(new Set())
  const [expandedFaturamentos, setExpandedFaturamentos] = useState<Set<string>>(new Set())
  const [statusLinhaFilter, setStatusLinhaFilter] = useState<StatusLinhaFilter>(() => {
    try {
      const saved = sessionStorage.getItem('pedidos_abertos_status_linha')
      if (saved === 'todos' || saved === 'Aberta' || saved === 'Fechada') {
        return saved
      }
    } catch {
      // ignora
    }
    return 'Aberta'
  })
  const [expandedTiposCliente, setExpandedTiposCliente] = useState<Set<string>>(() => {
    try {
      const raw = sessionStorage.getItem('pedidos_abertos_expanded_tipos')
      if (raw) {
        const arr = JSON.parse(raw)
        if (Array.isArray(arr)) return new Set(arr)
      }
    } catch {
      // ignora
    }
    return new Set<string>()
  })
  const [sortState, setSortState] = useState<{ field: SortField | null; dir: SortDir }>(() => {
    try {
      const raw = sessionStorage.getItem('pedidos_abertos_sort')
      if (raw) {
        const parsed = JSON.parse(raw) as { field?: SortField | null; dir?: SortDir }
        if (parsed && (parsed.dir === 'asc' || parsed.dir === 'desc')) {
          return {
            field: parsed.field || null,
            dir: parsed.dir,
          }
        }
      }
    } catch {
      // ignora
    }
    return { field: null, dir: 'asc' }
  })

  // Salva no sessionStorage sempre que o estado de ordenação mudar
  useEffect(() => {
    try {
      sessionStorage.setItem('pedidos_abertos_sort', JSON.stringify(sortState))
    } catch {
      // ignora
    }
  }, [sortState])

  const sort = useMemo(
    () => ({
      field: sortState.field,
      dir: sortState.dir,
      toggle: (next: SortField) => {
        setSortState((prev) => {
          if (prev.field !== next) return { field: next, dir: 'asc' }
          if (prev.dir === 'asc') return { field: next, dir: 'desc' }
          return { field: null, dir: 'asc' }
        })
      },
      reset: () => setSortState({ field: null, dir: 'asc' }),
    }),
    [sortState],
  )
  const { toast } = useToast()

  useEffect(() => {
    try {
      sessionStorage.setItem('pedidos_abertos_view_mode', viewMode)
    } catch {
      // ignora
    }
  }, [viewMode])

  useEffect(() => {
    try {
      sessionStorage.setItem('pedidos_abertos_status_linha', statusLinhaFilter)
    } catch {
      // ignora
    }
  }, [statusLinhaFilter])

  const [filters, setFilters] = useState<PedidosAbertosFilters>(() => {
    try {
      const raw = sessionStorage.getItem('paineis_vendas_filters')
      if (raw) {
        const parsed = JSON.parse(raw) as {
          tipoCliente?: unknown
          statusCadastro?: unknown
          tipoPn?: unknown
        }
        const savedTipoCliente = Array.isArray(parsed?.tipoCliente)
          ? parsed.tipoCliente.map(String).filter(Boolean)
          : []
        const savedStatusCadastro = Array.isArray(parsed?.statusCadastro)
          ? parsed.statusCadastro.map(String).filter(Boolean)
          : []
        const savedTipoPn = Array.isArray(parsed?.tipoPn)
          ? parsed.tipoPn.map(String).filter(Boolean)
          : []
        return {
          ...EMPTY_PEDIDOS_ABERTOS_FILTERS,
          tipoCliente: savedTipoCliente,
          statusCadastro: savedStatusCadastro,
          tipoPn: savedTipoPn,
        }
      }
    } catch {
      // ignora
    }
    return {
      ...EMPTY_PEDIDOS_ABERTOS_FILTERS,
    }
  })

  const [tipoClienteOptions, setTipoClienteOptions] = useState<string[]>([])
  const [statusCadastroOptions, setStatusCadastroOptions] = useState<string[]>([])
  const [tipoPnOptions, setTipoPnOptions] = useState<string[]>([])
  const [loadingTipoClienteOptions, setLoadingTipoClienteOptions] = useState(false)
  const [tiposClienteMap, setTiposClienteMap] = useState<Record<string, TipoClienteInfo>>({})

  const [kpis, setKpis] = useState<PedidosAbertosKpis>({
    valorTotalAberto: 0,
    pedidosDistintos: 0,
    itensPendentes: 0,
    clientesDistintos: 0,
  })

  const [filterOptions, setFilterOptions] = useState<{
    canais?: CanalOption[]
    canaisClientes?: CanalClienteOption[]
    inside?: string[]
    tipoCliente?: string[]
    statusCadastro?: string[]
    tipoPn?: string[]
  }>({
    canais: [],
    canaisClientes: [],
    inside: [],
    tipoCliente: [],
    statusCadastro: [],
    tipoPn: [],
  })

  const [statsLoading, setStatsLoading] = useState(false)

  // Resolução resiliente dos campos de Tipo de Cliente a partir do código do cliente e mapa em memória
  const resolveClienteInfo = useCallback(
    (item: {
      codigo_cliente?: string
      tipo_cliente?: string
      status_cadastro?: string
      tipo_pn?: string
    }) => {
      const cod = (item.codigo_cliente || '').trim().toUpperCase()
      const mapped = cod ? tiposClienteMap[cod] : undefined

      const directTipo = item.tipo_cliente?.trim()
      const directStatus = item.status_cadastro?.trim()
      const directTipoPn = item.tipo_pn?.trim()

      const tipo_cliente = directTipo || mapped?.tipo_cliente?.trim() || ''
      const status_cadastro = directStatus || mapped?.status_cadastro?.trim() || ''
      const tipo_pn = directTipoPn || mapped?.tipo_pn?.trim() || ''

      return { tipo_cliente, status_cadastro, tipo_pn }
    },
    [tiposClienteMap],
  )

  /**
   * Função de comparação robusta para todas as colunas de Pedidos em Aberto.
   * - Datas: cronologicamente por 'data_pedido' (ISO AAAA-MM-DD)
   * - Números: qtd_aberto, preco_apos_desconto (fallback preco_unitario), valor_em_aberto, em_estoque (Number(x)||0)
   * - Textos: nome_canal, nome_cliente, status_cadastro, tipo_pn, status_linha, codigo_item, numero_pedido (localeCompare pt-BR)
   * - tipo_cliente: obtido via resolveClienteInfo(item).tipo_cliente (localeCompare pt-BR)
   * - Desempate estável sempre por: data_pedido asc + numero_pedido asc
   */
  const comparePedidos = useCallback(
    (
      a: PedidoAberto,
      b: PedidoAberto,
      field: SortField | null = sort.field,
      dir: SortDir = sort.dir,
    ): number => {
      // Comparador primário quando há campo ativo
      if (field) {
        let cmp = 0
        switch (field) {
          case 'data_pedido': {
            const dataA = (a.data_pedido || '').trim()
            const dataB = (b.data_pedido || '').trim()
            cmp = dataA.localeCompare(dataB)
            break
          }
          case 'qtd_aberto': {
            const numA = Number(a.qtd_aberto) || 0
            const numB = Number(b.qtd_aberto) || 0
            cmp = numA - numB
            break
          }
          case 'preco_apos_desconto': {
            const numA = Number(a.preco_apos_desconto) || Number(a.preco_unitario) || 0
            const numB = Number(b.preco_apos_desconto) || Number(b.preco_unitario) || 0
            cmp = numA - numB
            break
          }
          case 'valor_em_aberto': {
            const numA = Number(a.valor_em_aberto) || 0
            const numB = Number(b.valor_em_aberto) || 0
            cmp = numA - numB
            break
          }
          case 'em_estoque': {
            const numA = Number(a.em_estoque) || 0
            const numB = Number(b.em_estoque) || 0
            cmp = numA - numB
            break
          }
          case 'tipo_cliente': {
            const tcA = resolveClienteInfo(a).tipo_cliente
            const tcB = resolveClienteInfo(b).tipo_cliente
            cmp = tcA.localeCompare(tcB, 'pt-BR', { sensitivity: 'base' })
            break
          }
          case 'status_cadastro': {
            const scA = resolveClienteInfo(a).status_cadastro
            const scB = resolveClienteInfo(b).status_cadastro
            cmp = scA.localeCompare(scB, 'pt-BR', { sensitivity: 'base' })
            break
          }
          case 'tipo_pn': {
            const tpnA = resolveClienteInfo(a).tipo_pn
            const tpnB = resolveClienteInfo(b).tipo_pn
            cmp = tpnA.localeCompare(tpnB, 'pt-BR', { sensitivity: 'base' })
            break
          }
          case 'nome_canal': {
            const strA = (a.nome_canal || '').trim()
            const strB = (b.nome_canal || '').trim()
            cmp = strA.localeCompare(strB, 'pt-BR', { sensitivity: 'base' })
            break
          }
          case 'nome_cliente': {
            const strA = (a.nome_cliente || '').trim()
            const strB = (b.nome_cliente || '').trim()
            cmp = strA.localeCompare(strB, 'pt-BR', { sensitivity: 'base' })
            break
          }
          case 'status_linha': {
            const strA = (a.status_linha || '').trim()
            const strB = (b.status_linha || '').trim()
            cmp = strA.localeCompare(strB, 'pt-BR', { sensitivity: 'base' })
            break
          }
          case 'codigo_item': {
            const strA = (a.codigo_item || '').trim()
            const strB = (b.codigo_item || '').trim()
            cmp = strA.localeCompare(strB, 'pt-BR', { sensitivity: 'base' })
            break
          }
          case 'numero_pedido': {
            const strA = String(a.numero_pedido || '').trim()
            const strB = String(b.numero_pedido || '').trim()
            cmp = strA.localeCompare(strB, 'pt-BR', { numeric: true, sensitivity: 'base' })
            break
          }
          default: {
            cmp = 0
          }
        }

        if (cmp !== 0) {
          return dir === 'desc' ? -cmp : cmp
        }
      }

      // Desempate estável sempre por: data_pedido asc + numero_pedido asc
      const tieData = (a.data_pedido || '').trim().localeCompare((b.data_pedido || '').trim())
      if (tieData !== 0) return tieData

      const tieNum = String(a.numero_pedido || '')
        .trim()
        .localeCompare(String(b.numero_pedido || '').trim(), 'pt-BR', {
          numeric: true,
          sensitivity: 'base',
        })
      if (tieNum !== 0) return tieNum

      // Desempate complementar por linha do pedido
      return (Number(a.linha) || 0) - (Number(b.linha) || 0)
    },
    [resolveClienteInfo, sort.field, sort.dir],
  )

  const renderTipoClienteBadge = (tipo?: string) => {
    if (!tipo) {
      return <span className="text-slate-400 text-xs">-</span>
    }
    return (
      <Badge
        variant="outline"
        className="text-[10px] font-semibold bg-purple-50 text-purple-700 border-purple-200 px-2 py-0.5 whitespace-nowrap"
        title={tipo}
      >
        {tipo}
      </Badge>
    )
  }

  const renderStatusCadastroCell = (status?: string) => {
    if (!status) {
      return <span className="text-slate-400 text-xs">-</span>
    }
    return (
      <Badge
        variant="outline"
        className="text-[10px] font-medium bg-slate-50 text-slate-700 border-slate-200 whitespace-nowrap"
        title={status}
      >
        {status}
      </Badge>
    )
  }

  const renderTipoPnCell = (tipoPn?: string) => {
    if (!tipoPn) {
      return <span className="text-slate-400 text-xs">-</span>
    }
    return (
      <span className="text-slate-700 text-xs font-medium whitespace-nowrap" title={tipoPn}>
        {tipoPn}
      </span>
    )
  }

  // Carrega opções e mapa de Tipos de Cliente (mesmo padrão de Visão Geral / Visão Canais / Canais)
  const loadTiposClienteData = async () => {
    try {
      setLoadingTipoClienteOptions(true)
      const [opts, map] = await Promise.all([fetchTiposClienteOptions(), fetchTiposClienteMap()])
      if (Array.isArray(opts) && opts.length > 0) {
        setTipoClienteOptions(opts)
      }
      if (map && Object.keys(map).length > 0) {
        setTiposClienteMap(map)
        // Extrai também opções de status_cadastro e tipo_pn a partir do mapa em memória se disponíveis
        const scSet = new Set<string>()
        const tpnSet = new Set<string>()
        Object.values(map).forEach((info) => {
          if (info.status_cadastro?.trim()) scSet.add(info.status_cadastro.trim())
          if (info.tipo_pn?.trim()) tpnSet.add(info.tipo_pn.trim())
        })
        if (scSet.size > 0) {
          setStatusCadastroOptions(Array.from(scSet).sort())
        }
        if (tpnSet.size > 0) {
          setTipoPnOptions(Array.from(tpnSet).sort())
        }
      }
    } catch (err) {
      console.warn('Erro ao carregar tipos de cliente em Pedidos em Aberto:', err)
    } finally {
      setLoadingTipoClienteOptions(false)
    }
  }

  useEffect(() => {
    loadTiposClienteData()
  }, [])

  // Carrega opções de canais e KPIs de pedidos abertos
  const loadStats = async (activeFilters = filters) => {
    try {
      setStatsLoading(true)
      let statsPedidos: Awaited<ReturnType<typeof fetchPedidosAbertosStats>>
      try {
        statsPedidos = await fetchPedidosAbertosStats(
          activeFilters as unknown as Record<string, unknown>,
        )
      } catch (backendErr: unknown) {
        const status = (backendErr as { status?: number })?.status
        if (
          status === 400 &&
          ((activeFilters.tipoCliente && activeFilters.tipoCliente.length > 0) ||
            (activeFilters.statusCadastro && activeFilters.statusCadastro.length > 0) ||
            (activeFilters.tipoPn && activeFilters.tipoPn.length > 0))
        ) {
          const {
            tipoCliente: _tc,
            statusCadastro: _sc,
            tipoPn: _tpn,
            ...filtersWithoutCadastro
          } = activeFilters
          statsPedidos = await fetchPedidosAbertosStats(
            filtersWithoutCadastro as unknown as Record<string, unknown>,
          )
        } else {
          throw backendErr
        }
      }

      const hasCustomCadastroFilters = Boolean(
        (activeFilters.tipoCliente && activeFilters.tipoCliente.length > 0) ||
        (activeFilters.statusCadastro && activeFilters.statusCadastro.length > 0) ||
        (activeFilters.tipoPn && activeFilters.tipoPn.length > 0) ||
        statusLinhaFilter !== 'todos',
      )

      // Só sobrescreve os KPIs agregados se nenhum filtro customizado ou de status da linha estiver ativo
      if (statsPedidos?.kpis && !hasCustomCadastroFilters) {
        setKpis(statsPedidos.kpis)
      }

      if (statsPedidos?.filterOptions) {
        setFilterOptions((prev) => ({
          ...prev,
          canais: statsPedidos.filterOptions.canais || [],
          canaisClientes: statsPedidos.filterOptions.canaisClientes || [],
          inside: statsPedidos.filterOptions.inside || [],
          tipoCliente:
            statsPedidos.filterOptions.tipoCliente &&
            statsPedidos.filterOptions.tipoCliente.length > 0
              ? statsPedidos.filterOptions.tipoCliente
              : prev.tipoCliente,
          statusCadastro:
            statsPedidos.filterOptions.statusCadastro &&
            statsPedidos.filterOptions.statusCadastro.length > 0
              ? statsPedidos.filterOptions.statusCadastro
              : prev.statusCadastro,
          tipoPn:
            statsPedidos.filterOptions.tipoPn && statsPedidos.filterOptions.tipoPn.length > 0
              ? statsPedidos.filterOptions.tipoPn
              : prev.tipoPn,
        }))
        if (
          Array.isArray(statsPedidos.filterOptions.tipoCliente) &&
          statsPedidos.filterOptions.tipoCliente.length > 0
        ) {
          setTipoClienteOptions((prev) =>
            prev.length > 0 ? prev : statsPedidos.filterOptions.tipoCliente!,
          )
        }
        if (
          Array.isArray(statsPedidos.filterOptions.statusCadastro) &&
          statsPedidos.filterOptions.statusCadastro.length > 0
        ) {
          setStatusCadastroOptions((prev) =>
            prev.length > 0 ? prev : statsPedidos.filterOptions.statusCadastro!,
          )
        }
        if (
          Array.isArray(statsPedidos.filterOptions.tipoPn) &&
          statsPedidos.filterOptions.tipoPn.length > 0
        ) {
          setTipoPnOptions((prev) => (prev.length > 0 ? prev : statsPedidos.filterOptions.tipoPn!))
        }
      }
    } catch (err: unknown) {
      console.error('Erro ao carregar estatísticas de pedidos abertos:', err)
      const msg =
        err instanceof Error
          ? err.message
          : 'Não foi possível carregar as estatísticas dos pedidos.'
      const isTimeout =
        msg.toLowerCase().includes('tempo limite') ||
        msg.toLowerCase().includes('demorou') ||
        msg.toLowerCase().includes('timeout') ||
        msg.includes('504')
      if (isTimeout) {
        toast({
          variant: 'destructive',
          title: 'A consulta demorou mais que o esperado',
          description:
            'A consulta demorou mais que o esperado devido ao volume de registros. Tente filtrar por um ano específico ou refinar os filtros selecionados.',
        })
      }
    } finally {
      setStatsLoading(false)
    }
  }

  // Carrega a lista paginada ou completa para agrupamento de pedidos em aberto
  const loadData = async (
    activeFilters = filters,
    targetPage = page,
    sortField = sort.field,
    sortDir = sort.dir,
    search = searchTerm,
    currentViewMode = viewMode,
    activeMap = tiposClienteMap,
    activeStatusLinha = statusLinhaFilter,
  ) => {
    setLoading(true)
    try {
      // Sempre carregamos a base completa do recorte (até 2000 registros) para alimentar
      // com precisão o Dashboard e os agrupamentos por Canal / Cliente / Faturamento / Tipo de Cliente
      let res: Awaited<ReturnType<typeof fetchPedidosAbertosList>>
      let usedMemoryFallback = false

      try {
        res = await fetchPedidosAbertosList({
          page: 1,
          perPage: 2000,
          sortField: sortField || 'data_pedido',
          sortDirection: sortDir || 'asc',
          search: search.trim() || undefined,
          filters: activeFilters as unknown as Record<string, unknown>,
        })
      } catch (backendErr: unknown) {
        const status = (backendErr as { status?: number })?.status
        // Se der erro 400 (ex: coluna não existe no backend), tenta sem os filtros de cadastro e aplica em memória
        const hasCadastro = Boolean(
          (activeFilters.tipoCliente && activeFilters.tipoCliente.length > 0) ||
          (activeFilters.statusCadastro && activeFilters.statusCadastro.length > 0) ||
          (activeFilters.tipoPn && activeFilters.tipoPn.length > 0),
        )
        if (status === 400 && hasCadastro) {
          const {
            tipoCliente: _tc,
            statusCadastro: _sc,
            tipoPn: _tpn,
            ...filtersWithoutCadastro
          } = activeFilters
          res = await fetchPedidosAbertosList({
            page: 1,
            perPage: 2000,
            sortField: sortField || 'data_pedido',
            sortDirection: sortDir || 'asc',
            search: search.trim() || undefined,
            filters: filtersWithoutCadastro as unknown as Record<string, unknown>,
          })
          usedMemoryFallback = true
        } else {
          throw backendErr
        }
      }

      let items = res.items || []

      // Garante mapa de tipos_cliente em memória se houver filtros de cadastro ativos
      const hasTipoClienteFilter = Boolean(
        activeFilters.tipoCliente && activeFilters.tipoCliente.length > 0,
      )
      const hasStatusCadastroFilter = Boolean(
        activeFilters.statusCadastro && activeFilters.statusCadastro.length > 0,
      )
      const hasTipoPnFilter = Boolean(activeFilters.tipoPn && activeFilters.tipoPn.length > 0)

      let currentMap = activeMap
      if (
        (hasTipoClienteFilter || hasStatusCadastroFilter || hasTipoPnFilter) &&
        Object.keys(currentMap).length === 0
      ) {
        try {
          currentMap = await fetchTiposClienteMap()
          setTiposClienteMap(currentMap)
        } catch {
          // mantém fallback
        }
      }

      // Aplica recorte em memória resiliente para Tipo de Cliente, Status do Cadastro e Tipo de PN
      if (hasTipoClienteFilter || hasStatusCadastroFilter || hasTipoPnFilter) {
        const tcSet = hasTipoClienteFilter ? new Set(activeFilters.tipoCliente) : null
        const scSet = hasStatusCadastroFilter ? new Set(activeFilters.statusCadastro) : null
        const tpnSet = hasTipoPnFilter ? new Set(activeFilters.tipoPn) : null

        items = items.filter((item) => {
          const cod = (item.codigo_cliente || '').trim().toUpperCase()
          const mapped = cod ? currentMap[cod] : undefined

          if (tcSet) {
            const direct = (item as unknown as { tipo_cliente?: string }).tipo_cliente?.trim()
            const resolved = direct || mapped?.tipo_cliente?.trim() || ''
            if (!resolved || !tcSet.has(resolved)) return false
          }

          if (scSet) {
            const direct = (item as unknown as { status_cadastro?: string }).status_cadastro?.trim()
            const resolved = direct || mapped?.status_cadastro?.trim() || ''
            if (!resolved || !scSet.has(resolved)) return false
          }

          if (tpnSet) {
            const direct = (item as unknown as { tipo_pn?: string }).tipo_pn?.trim()
            const resolved = direct || mapped?.tipo_pn?.trim() || ''
            if (!resolved || !tpnSet.has(resolved)) return false
          }

          return true
        })
      }

      // Aplica o filtro de Status da Linha (padrão 'Aberta' para visualizar o que tem aberto para faturar)
      if (activeStatusLinha !== 'todos') {
        items = items.filter((item) => matchesStatusLinha(item, activeStatusLinha))
      }

      // Ordenação aplicada usando a função de comparação robusta
      items.sort((a, b) => comparePedidos(a, b, sortField, sortDir))

      setDashboardPedidos(items)
      const isCustomCadastroActive =
        hasTipoClienteFilter ||
        hasStatusCadastroFilter ||
        hasTipoPnFilter ||
        activeStatusLinha !== 'todos'

      const computedTotalItems =
        usedMemoryFallback || isCustomCadastroActive ? items.length : res.totalItems || items.length
      setTotalItems(computedTotalItems)
      setTotalPages(Math.max(1, Math.ceil(computedTotalItems / PAGE_SIZE)))

      const computedTotalValor =
        usedMemoryFallback || isCustomCadastroActive
          ? items.reduce((acc, cur) => acc + (Number(cur.valor_em_aberto) || 0), 0)
          : res.totalValor || 0
      const computedTotalQtd =
        usedMemoryFallback || isCustomCadastroActive
          ? items.reduce((acc, cur) => acc + (Number(cur.qtd_aberto) || 0), 0)
          : res.totalQtd || 0
      setTotalValor(computedTotalValor)
      setTotalQtd(computedTotalQtd)

      // Atualiza também os KPIs com base no recorte filtrado
      if (isCustomCadastroActive) {
        const distinctOrders = new Set(items.map((i) => i.numero_pedido).filter(Boolean))
        const distinctClients = new Set(
          items.map((i) => (i.codigo_cliente || i.nome_cliente || '').trim()).filter(Boolean),
        )
        setKpis({
          valorTotalAberto: computedTotalValor,
          pedidosDistintos: distinctOrders.size || (items.length > 0 ? 1 : 0),
          itensPendentes: items.length,
          clientesDistintos: distinctClients.size || (items.length > 0 ? 1 : 0),
        })
      }

      const isGrouped = currentViewMode !== 'none' && currentViewMode !== 'detalhado'
      if (isGrouped) {
        setAllFilteredPedidos(items)
        setPaginatedPedidos(items.slice((targetPage - 1) * PAGE_SIZE, targetPage * PAGE_SIZE))
      } else {
        setAllFilteredPedidos([])
        setPaginatedPedidos(items.slice((targetPage - 1) * PAGE_SIZE, targetPage * PAGE_SIZE))
      }
      return true
    } catch (err: unknown) {
      console.error('Erro ao listar pedidos em aberto:', err)
      const msg =
        err instanceof Error ? err.message : 'Não foi possível carregar os pedidos em aberto.'
      const isTimeout =
        msg.toLowerCase().includes('tempo limite') ||
        msg.toLowerCase().includes('demorou') ||
        msg.toLowerCase().includes('timeout') ||
        msg.includes('504')
      toast({
        variant: 'destructive',
        title: isTimeout
          ? 'A consulta demorou mais que o esperado'
          : 'Erro ao carregar pedidos em aberto',
        description: isTimeout
          ? 'A consulta demorou mais que o esperado devido ao volume de registros. Tente filtrar por um ano específico ou refinar os filtros selecionados.'
          : msg,
      })
      return false
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    logAudit('pedidos_abertos_view', 'Acesso ao módulo Pedidos em Aberto (SAP)')
  }, [])

  // Escalonamento do carregamento: primeiro a listagem paginada (feedback imediato),
  // e em seguida os KPIs e dados agregados/estatísticas.
  useEffect(() => {
    let isCancelled = false

    const runStaggeredLoad = async () => {
      // 1. Carrega primeiro a listagem de pedidos
      await loadData(
        filters,
        page,
        sort.field,
        sort.dir,
        searchTerm,
        viewMode,
        tiposClienteMap,
        statusLinhaFilter,
      )
      if (isCancelled) return

      // 2. Carrega depois os KPIs e estatísticas agregadas
      loadStats(filters)
    }

    runStaggeredLoad()

    return () => {
      isCancelled = true
    }
  }, [page, filters, sort.field, sort.dir, viewMode, statusLinhaFilter])

  // Atualiza os filtros e persiste a seleção de tipoCliente, statusCadastro e tipoPn no sessionStorage compartilhado
  const handleFiltersChange = (newFilters: PedidosAbertosFilters) => {
    setFilters(newFilters)
    try {
      const raw = sessionStorage.getItem('paineis_vendas_filters')
      const current = raw ? JSON.parse(raw) : {}
      sessionStorage.setItem(
        'paineis_vendas_filters',
        JSON.stringify({
          ...current,
          tipoCliente: newFilters.tipoCliente || [],
          statusCadastro: newFilters.statusCadastro || [],
          tipoPn: newFilters.tipoPn || [],
        }),
      )
    } catch {
      // ignora se sessionStorage indisponível
    }
  }

  const handleApplyFilters = (applied: PedidosAbertosFilters) => {
    setPage(1)
    // Garante persistência da seleção ao aplicar
    try {
      const raw = sessionStorage.getItem('paineis_vendas_filters')
      const current = raw ? JSON.parse(raw) : {}
      sessionStorage.setItem(
        'paineis_vendas_filters',
        JSON.stringify({
          ...current,
          tipoCliente: applied.tipoCliente || [],
          statusCadastro: applied.statusCadastro || [],
          tipoPn: applied.tipoPn || [],
        }),
      )
    } catch {
      // ignora se sessionStorage indisponível
    }

    // Carrega primeiro a listagem e depois as estatísticas
    loadData(
      applied,
      1,
      sort.field,
      sort.dir,
      searchTerm,
      viewMode,
      tiposClienteMap,
      statusLinhaFilter,
    ).then(() => {
      loadStats(applied)
    })
  }

  const handleStatusLinhaChange = (val: StatusLinhaFilter) => {
    setStatusLinhaFilter(val)
    setPage(1)
  }

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setPage(1)
    loadData(
      filters,
      1,
      sort.field,
      sort.dir,
      searchTerm,
      viewMode,
      tiposClienteMap,
      statusLinhaFilter,
    )
  }

  const handleSort = (field: SortField) => {
    sort.toggle(field)
    setPage(1)
  }

  // Agrupamento por cliente: consolidado com soma de todos os campos monetários, itens e pedidos
  const clientGroups: ClientGroup[] = useMemo(() => {
    if (viewMode !== 'cliente') return []
    const sourceItems = allFilteredPedidos.length > 0 ? allFilteredPedidos : paginatedPedidos

    const groupMap = new Map<string, ClientGroup>()

    for (const item of sourceItems) {
      const key = (item.codigo_cliente || item.nome_cliente || 'SEM_IDENTIFICACAO')
        .trim()
        .toUpperCase()
      let group = groupMap.get(key)
      if (!group) {
        group = {
          key,
          codigo_cliente: item.codigo_cliente || '',
          nome_cliente: item.nome_cliente || 'Cliente não identificado',
          nome_canal: item.nome_canal || '',
          deploy: item.deploy || '',
          inside: item.inside || '',
          totalPedidos: 0,
          totalLinhas: 0,
          totalQtdAberto: 0,
          totalQtdSolicitada: 0,
          totalValorEmAberto: 0,
          totalValorLiquido: 0,
          items: [],
        }
        groupMap.set(key, group)
      }

      group.items.push(item)
      group.totalLinhas += 1
      const qtdAbertoNum = Number(item.qtd_aberto) || 0
      const qtdSolNum = Number(item.qtd_solicitada) || 0
      const valorEmAbertoNum = Number(item.valor_em_aberto) || 0
      const precoLiq = Number(item.preco_apos_desconto) || Number(item.preco_unitario) || 0

      group.totalQtdAberto += qtdAbertoNum
      group.totalQtdSolicitada += qtdSolNum
      group.totalValorEmAberto += valorEmAbertoNum
      group.totalValorLiquido += precoLiq * (qtdAbertoNum || 1)
      if (item.nome_canal && !group.nome_canal) group.nome_canal = item.nome_canal
      if (item.deploy && !group.deploy) group.deploy = item.deploy
      if (item.inside && !group.inside) group.inside = item.inside
    }

    // Calcula número de pedidos distintos por grupo
    const list = Array.from(groupMap.values())
    for (const g of list) {
      const distinctOrders = new Set(g.items.map((i) => i.numero_pedido).filter(Boolean))
      g.totalPedidos = distinctOrders.size || g.totalLinhas
    }

    // Ordena grupos pelo maior valor total em aberto por padrão, mantendo ordenação das linhas internas
    list.sort((a, b) => b.totalValorEmAberto - a.totalValorEmAberto)
    list.forEach((g) => {
      g.items.sort((a, b) => comparePedidos(a, b))
    })
    return list
  }, [viewMode, allFilteredPedidos, paginatedPedidos, comparePedidos])

  // Agrupamento por Canal: soma de TODOS os campos de valor, qtd aberta, qtd solicitada,
  // nº pedidos distintos, nº itens e nº clientes distintos
  const canalGroups: CanalGroup[] = useMemo(() => {
    if (viewMode !== 'canal') return []
    const sourceItems = allFilteredPedidos.length > 0 ? allFilteredPedidos : paginatedPedidos

    const groupMap = new Map<string, CanalGroup>()

    for (const item of sourceItems) {
      const rawCanal = (item.nome_canal || '').trim()
      const key = rawCanal ? rawCanal.toUpperCase() : 'SEM_CANAL'
      let group = groupMap.get(key)
      if (!group) {
        group = {
          key,
          nome_canal: rawCanal || 'Sem Canal',
          deploy: item.deploy || '',
          totalPedidos: 0,
          totalLinhas: 0,
          totalClientes: 0,
          totalQtdAberto: 0,
          totalQtdSolicitada: 0,
          totalValorEmAberto: 0,
          totalValorLiquido: 0,
          items: [],
        }
        groupMap.set(key, group)
      }

      group.items.push(item)
      group.totalLinhas += 1
      const qtdAbertoNum = Number(item.qtd_aberto) || 0
      const qtdSolNum = Number(item.qtd_solicitada) || 0
      const valorEmAbertoNum = Number(item.valor_em_aberto) || 0
      const precoLiq = Number(item.preco_apos_desconto) || Number(item.preco_unitario) || 0

      group.totalQtdAberto += qtdAbertoNum
      group.totalQtdSolicitada += qtdSolNum
      group.totalValorEmAberto += valorEmAbertoNum
      group.totalValorLiquido += precoLiq * (qtdAbertoNum || 1)
      if (item.deploy && !group.deploy) group.deploy = item.deploy
    }

    const list = Array.from(groupMap.values())
    for (const g of list) {
      const distinctOrders = new Set(g.items.map((i) => i.numero_pedido).filter(Boolean))
      g.totalPedidos = distinctOrders.size || g.totalLinhas
      const distinctClients = new Set(
        g.items.map((i) => (i.codigo_cliente || i.nome_cliente || '').trim()).filter(Boolean),
      )
      g.totalClientes = distinctClients.size || 1
    }

    // Ordena alfabeticamente pelo nome do canal/deploy; "Sem Canal" permanece ao final
    list.sort((a, b) => {
      if (a.key === 'SEM_CANAL') return 1
      if (b.key === 'SEM_CANAL') return -1
      return a.nome_canal.localeCompare(b.nome_canal, 'pt-BR', { sensitivity: 'base' })
    })
    list.forEach((g) => {
      g.items.sort((a, b) => comparePedidos(a, b))
    })
    return list
  }, [viewMode, allFilteredPedidos, paginatedPedidos, comparePedidos])

  // Agrupamento por Tipo de Cliente (ex: Revendas, Atas, ..., Sem tipo)
  // Segue o mesmo padrão visual e de regras da página Canais (commit 0.0.179)
  const tipoClienteGroups: TipoClienteGroup[] = useMemo(() => {
    if (viewMode !== 'tipo_cliente') return []
    const sourceItems = allFilteredPedidos.length > 0 ? allFilteredPedidos : paginatedPedidos

    const groupMap = new Map<string, TipoClienteGroup>()

    for (const item of sourceItems) {
      const resolved = resolveClienteInfo(item)
      const rawTipo = resolved.tipo_cliente?.trim()
      const upper = rawTipo ? rawTipo.toUpperCase() : ''
      const isSemTipo =
        !rawTipo || upper === 'SEM TIPO' || upper === '-' || upper === 'SEM INFORMACAO'

      const key = isSemTipo ? 'SEM_TIPO' : upper
      const label = isSemTipo ? 'Sem tipo' : rawTipo

      let group = groupMap.get(key)
      if (!group) {
        group = {
          key,
          tipo_cliente: label,
          totalPedidos: 0,
          totalLinhas: 0,
          totalClientes: 0,
          totalQtdAberto: 0,
          totalQtdSolicitada: 0,
          totalValorEmAberto: 0,
          totalValorLiquido: 0,
          items: [],
        }
        groupMap.set(key, group)
      }

      group.items.push(item)
      group.totalLinhas += 1
      const qtdAbertoNum = Number(item.qtd_aberto) || 0
      const qtdSolNum = Number(item.qtd_solicitada) || 0
      const valorEmAbertoNum = Number(item.valor_em_aberto) || 0
      const precoLiq = Number(item.preco_apos_desconto) || Number(item.preco_unitario) || 0

      group.totalQtdAberto += qtdAbertoNum
      group.totalQtdSolicitada += qtdSolNum
      group.totalValorEmAberto += valorEmAbertoNum
      group.totalValorLiquido += precoLiq * (qtdAbertoNum || 1)
    }

    const list = Array.from(groupMap.values())
    for (const g of list) {
      const distinctOrders = new Set(g.items.map((i) => i.numero_pedido).filter(Boolean))
      g.totalPedidos = distinctOrders.size || g.totalLinhas
      const distinctClients = new Set(
        g.items.map((i) => (i.codigo_cliente || i.nome_cliente || '').trim()).filter(Boolean),
      )
      g.totalClientes = distinctClients.size || 1
    }

    // Ordenação alfabética; "Sem tipo" sempre ao final (mesmo padrão de Canais)
    list.sort((a, b) => {
      if (a.key === 'SEM_TIPO') return 1
      if (b.key === 'SEM_TIPO') return -1
      return a.tipo_cliente.localeCompare(b.tipo_cliente, 'pt-BR', {
        sensitivity: 'base',
      })
    })
    list.forEach((g) => {
      g.items.sort((a, b) => comparePedidos(a, b))
    })

    return list
  }, [viewMode, allFilteredPedidos, paginatedPedidos, tiposClienteMap, comparePedidos])

  // Controles de expansão e colapso por Tipo de Cliente (com persistência na sessão)
  const toggleTipoClienteGroup = (key: string) => {
    setExpandedTiposCliente((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      try {
        sessionStorage.setItem('pedidos_abertos_expanded_tipos', JSON.stringify(Array.from(next)))
      } catch {
        // ignora
      }
      return next
    })
  }

  const collapseAllTiposCliente = () => {
    setExpandedTiposCliente(new Set())
    try {
      sessionStorage.setItem('pedidos_abertos_expanded_tipos', JSON.stringify([]))
    } catch {
      // ignora
    }
  }

  const expandAllTiposCliente = () => {
    const allKeys = new Set(tipoClienteGroups.map((g) => g.key))
    setExpandedTiposCliente(allKeys)
    try {
      sessionStorage.setItem('pedidos_abertos_expanded_tipos', JSON.stringify(Array.from(allKeys)))
    } catch {
      // ignora
    }
  }

  // Agrupamento por Canal de Faturamento (ex: AGIS, Roland, Nenhum):
  // soma de todos os campos de valor, qtd aberta, qtd solicitada, pedidos distintos, itens e clientes distintos
  const faturamentoGroups: CanalFaturamentoGroup[] = useMemo(() => {
    if (viewMode !== 'faturamento') return []
    const sourceItems = allFilteredPedidos.length > 0 ? allFilteredPedidos : paginatedPedidos

    const groupMap = new Map<string, CanalFaturamentoGroup>()

    for (const item of sourceItems) {
      const rawDeploy = (item.deploy || '').trim()
      const upper = rawDeploy.toUpperCase()

      let label = ''
      let key = ''
      if (
        !rawDeploy ||
        upper === 'NENHUM' ||
        upper === 'SEM DEPLOY' ||
        upper === 'VAZIO' ||
        upper === '-'
      ) {
        key = 'SEM_FATURAMENTO'
        label = 'Sem Canal de Faturamento'
      } else if (upper.includes('AGIS')) {
        key = 'AGIS'
        label = 'AGIS'
      } else if (upper.includes('ROLAND')) {
        key = 'ROLAND'
        label = 'Roland'
      } else {
        key = upper
        label = rawDeploy
      }

      let group = groupMap.get(key)
      if (!group) {
        group = {
          key,
          canal_faturamento: label,
          totalPedidos: 0,
          totalLinhas: 0,
          totalClientes: 0,
          totalQtdAberto: 0,
          totalQtdSolicitada: 0,
          totalValorEmAberto: 0,
          totalValorLiquido: 0,
          items: [],
        }
        groupMap.set(key, group)
      }

      group.items.push(item)
      group.totalLinhas += 1
      const qtdAbertoNum = Number(item.qtd_aberto) || 0
      const qtdSolNum = Number(item.qtd_solicitada) || 0
      const valorEmAbertoNum = Number(item.valor_em_aberto) || 0
      const precoLiq = Number(item.preco_apos_desconto) || Number(item.preco_unitario) || 0

      group.totalQtdAberto += qtdAbertoNum
      group.totalQtdSolicitada += qtdSolNum
      group.totalValorEmAberto += valorEmAbertoNum
      group.totalValorLiquido += precoLiq * (qtdAbertoNum || 1)
    }

    const list = Array.from(groupMap.values())
    for (const g of list) {
      const distinctOrders = new Set(g.items.map((i) => i.numero_pedido).filter(Boolean))
      g.totalPedidos = distinctOrders.size || g.totalLinhas
      const distinctClients = new Set(
        g.items.map((i) => (i.codigo_cliente || i.nome_cliente || '').trim()).filter(Boolean),
      )
      g.totalClientes = distinctClients.size || 1
    }

    // Ordena alfabeticamente pelo nome do canal de faturamento; "Sem Canal de Faturamento" permanece ao final
    list.sort((a, b) => {
      if (a.key === 'SEM_FATURAMENTO') return 1
      if (b.key === 'SEM_FATURAMENTO') return -1
      return a.canal_faturamento.localeCompare(b.canal_faturamento, 'pt-BR', {
        sensitivity: 'base',
      })
    })
    list.forEach((g) => {
      g.items.sort((a, b) => comparePedidos(a, b))
    })
    return list
  }, [viewMode, allFilteredPedidos, paginatedPedidos, comparePedidos])

  // Controles de expansão e colapso por Canal de Faturamento
  const toggleFaturamentoGroup = (key: string) => {
    setExpandedFaturamentos((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  const collapseAllFaturamentos = () => {
    setExpandedFaturamentos(new Set())
  }

  const expandAllFaturamentos = () => {
    setExpandedFaturamentos(new Set(faturamentoGroups.map((g) => g.key)))
  }

  // Controles de expansão e colapso por cliente
  const toggleClientGroup = (key: string) => {
    setExpandedClients((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  const collapseAllClients = () => {
    setExpandedClients(new Set())
  }

  const expandAllClients = () => {
    setExpandedClients(new Set(clientGroups.map((g) => g.key)))
  }

  // Controles de expansão e colapso por canal
  const toggleCanalGroup = (key: string) => {
    setExpandedCanais((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  const collapseAllCanais = () => {
    setExpandedCanais(new Set())
  }

  const expandAllCanais = () => {
    setExpandedCanais(new Set(canalGroups.map((g) => g.key)))
  }

  const handleExportCSV = async () => {
    if (totalItems === 0) {
      toast({
        variant: 'destructive',
        title: 'Nenhum dado para exportar',
        description: 'Não há pedidos em aberto com os filtros atuais.',
      })
      return
    }

    setExporting(true)
    toast({
      title: 'Gerando exportação de Pedidos em Aberto...',
      description: 'Buscando todos os registros filtrados...',
    })

    try {
      // Busca até 2000 registros para exportação com fallback resiliente para filtros de cadastro
      let res: Awaited<ReturnType<typeof fetchPedidosAbertosList>>
      try {
        res = await fetchPedidosAbertosList({
          page: 1,
          perPage: 2000,
          sortField: sort.field || 'data_pedido',
          sortDirection: sort.dir || 'asc',
          search: searchTerm.trim() || undefined,
          filters: filters as unknown as Record<string, unknown>,
        })
      } catch (backendErr: unknown) {
        const status = (backendErr as { status?: number })?.status
        const hasCadastro = Boolean(
          (filters.tipoCliente && filters.tipoCliente.length > 0) ||
          (filters.statusCadastro && filters.statusCadastro.length > 0) ||
          (filters.tipoPn && filters.tipoPn.length > 0),
        )
        if (status === 400 && hasCadastro) {
          const {
            tipoCliente: _tc,
            statusCadastro: _sc,
            tipoPn: _tpn,
            ...filtersWithoutCadastro
          } = filters
          res = await fetchPedidosAbertosList({
            page: 1,
            perPage: 2000,
            sortField: sort.field || 'data_pedido',
            sortDirection: sort.dir || 'asc',
            search: searchTerm.trim() || undefined,
            filters: filtersWithoutCadastro as unknown as Record<string, unknown>,
          })
        } else {
          throw backendErr
        }
      }

      let rows = res.items || []

      // Garante mapa de tipos_cliente disponível
      let mapToUse = tiposClienteMap
      if (Object.keys(mapToUse).length === 0) {
        try {
          mapToUse = await fetchTiposClienteMap()
          setTiposClienteMap(mapToUse)
        } catch {
          // fallback
        }
      }

      // Se houver filtros de cadastro ativos, aplica recorte em memória
      const hasTc = Boolean(filters.tipoCliente && filters.tipoCliente.length > 0)
      const hasSc = Boolean(filters.statusCadastro && filters.statusCadastro.length > 0)
      const hasTpn = Boolean(filters.tipoPn && filters.tipoPn.length > 0)

      if (hasTc || hasSc || hasTpn) {
        const tcSet = hasTc ? new Set(filters.tipoCliente) : null
        const scSet = hasSc ? new Set(filters.statusCadastro) : null
        const tpnSet = hasTpn ? new Set(filters.tipoPn) : null

        rows = rows.filter((item) => {
          const cod = (item.codigo_cliente || '').trim().toUpperCase()
          const mapped = cod ? mapToUse[cod] : undefined

          if (tcSet) {
            const direct = (item as unknown as { tipo_cliente?: string }).tipo_cliente?.trim()
            const resolved = direct || mapped?.tipo_cliente?.trim() || ''
            if (!resolved || !tcSet.has(resolved)) return false
          }

          if (scSet) {
            const direct = (item as unknown as { status_cadastro?: string }).status_cadastro?.trim()
            const resolved = direct || mapped?.status_cadastro?.trim() || ''
            if (!resolved || !scSet.has(resolved)) return false
          }

          if (tpnSet) {
            const direct = (item as unknown as { tipo_pn?: string }).tipo_pn?.trim()
            const resolved = direct || mapped?.tipo_pn?.trim() || ''
            if (!resolved || !tpnSet.has(resolved)) return false
          }

          return true
        })
      }

      // Aplica o filtro de status da linha também na exportação CSV
      if (statusLinhaFilter !== 'todos') {
        rows = rows.filter((item) => matchesStatusLinha(item, statusLinhaFilter))
      }

      const exportCols = [
        { key: 'nome_canal', label: 'Canal' },
        { key: 'deploy', label: 'Deploy' },
        { key: 'inside', label: 'Inside' },
        { key: 'numero_pedido', label: 'Nº Pedido' },
        { key: 'linha', label: 'Linha' },
        { key: 'data_pedido', label: 'Data do Pedido' },
        { key: 'codigo_cliente', label: 'Código Cliente' },
        { key: 'nome_cliente', label: 'Nome Cliente' },
        { key: 'tipo_cliente', label: 'Tipo de Cliente' },
        { key: 'status_cadastro', label: 'Status do Cadastro' },
        { key: 'tipo_pn', label: 'Tipo de PN' },
        { key: 'codigo_item', label: 'Código Item' },
        { key: 'descricao_item', label: 'Descrição Item' },
        { key: 'grupo_item', label: 'Grupo do Item' },
        { key: 'qtd_solicitada', label: 'Qtd Solicitada' },
        { key: 'qtd_aberto', label: 'Qtd Aberto' },
        { key: 'em_estoque', label: 'Em Estoque' },
        { key: 'em_transito', label: 'Em Trânsito' },
        { key: 'deposito', label: 'Depósito' },
        { key: 'preco_unitario', label: 'Preço Unitário' },
        { key: 'desconto_percentual', label: '% Desconto' },
        { key: 'preco_apos_desconto', label: 'Preço após desconto' },
        { key: 'valor_em_aberto', label: 'Valor em Aberto (R$)' },
        { key: 'status_linha', label: 'Status da Linha' },
        { key: 'status', label: 'Status' },
        { key: 'usuario_emitente', label: 'Usuário Emitente' },
        { key: 'origem', label: 'Origem' },
      ]

      const formatted = rows.map((r) => {
        const cod = (r.codigo_cliente || '').trim().toUpperCase()
        const mapped = cod ? mapToUse[cod] : undefined
        const directTipo = (r as unknown as { tipo_cliente?: string }).tipo_cliente?.trim()
        const directStatus = (r as unknown as { status_cadastro?: string }).status_cadastro?.trim()
        const directTipoPn = (r as unknown as { tipo_pn?: string }).tipo_pn?.trim()

        return {
          ...r,
          tipo_cliente: directTipo || mapped?.tipo_cliente?.trim() || '-',
          status_cadastro: directStatus || mapped?.status_cadastro?.trim() || '-',
          tipo_pn: directTipoPn || mapped?.tipo_pn?.trim() || '-',
          data_pedido: r.data_pedido ? formatDate(r.data_pedido) : '',
          valor_em_aberto: r.valor_em_aberto?.toFixed(2) || '0.00',
          preco_unitario: r.preco_unitario?.toFixed(2) || '0.00',
          preco_apos_desconto: r.preco_apos_desconto?.toFixed(2) || '0.00',
        }
      })

      const dateStr = new Date().toISOString().slice(0, 10)
      exportToCSV(
        `pedidos_em_aberto_sap_${dateStr}`,
        formatted as unknown as Record<string, unknown>[],
        exportCols,
      )

      toast({
        title: 'Exportação concluída!',
        description: `${rows.length} linhas de pedidos em aberto exportadas com sucesso.`,
      })
    } catch (err) {
      console.error('Erro na exportação:', err)
      toast({
        variant: 'destructive',
        title: 'Falha na exportação',
        description: 'Não foi possível gerar a planilha CSV.',
      })
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-6 min-w-0 max-w-full">
      {/* Header Info */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <span className="p-2 rounded-xl bg-amber-500/10 text-amber-600">
              <Clock className="w-5 h-5" />
            </span>
            Pedidos em Aberto (SAP)
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Carteira de pedidos pendentes de faturamento, integrada ao cadastro de canais e catálogo
            Roland DG.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              loadStats(filters)
              loadData(filters, page, sort.field, sort.dir, searchTerm, viewMode)
            }}
            disabled={loading}
            className="text-xs h-9 gap-1.5 border-slate-200 text-slate-700 hover:bg-slate-50"
          >
            <RotateCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>

          <Button
            variant="default"
            size="sm"
            onClick={handleExportCSV}
            disabled={exporting || totalItems === 0}
            className="text-xs h-9 gap-1.5 bg-[#0B6E99] hover:bg-[#085273] text-white"
          >
            <Download className="w-3.5 h-3.5" />
            {exporting ? 'Exportando...' : 'Exportar CSV'}
          </Button>
        </div>
      </div>

      {/* Filtros específicos de Pedidos em Aberto (Canais, Clientes, Deploy, Inside, Tipo de Cliente, Status do Cadastro, Tipo de PN e Período) */}
      <PedidosAbertosFilterBar
        filters={filters}
        setFilters={handleFiltersChange}
        options={{
          ...filterOptions,
          tipoCliente:
            tipoClienteOptions.length > 0 ? tipoClienteOptions : filterOptions.tipoCliente || [],
          isLoadingTipoCliente: loadingTipoClienteOptions,
          onOpenTipoCliente: () => {
            if (tipoClienteOptions.length === 0) {
              loadTiposClienteData()
            }
          },
          statusCadastro:
            statusCadastroOptions.length > 0
              ? statusCadastroOptions
              : filterOptions.statusCadastro || [],
          isLoadingStatusCadastro: loadingTipoClienteOptions,
          onOpenStatusCadastro: () => {
            if (statusCadastroOptions.length === 0) {
              loadTiposClienteData()
            }
          },
          tipoPn: tipoPnOptions.length > 0 ? tipoPnOptions : filterOptions.tipoPn || [],
          isLoadingTipoPn: loadingTipoClienteOptions,
          onOpenTipoPn: () => {
            if (tipoPnOptions.length === 0) {
              loadTiposClienteData()
            }
          },
        }}
        isLoading={loading || statsLoading}
        loadingMessage="Atualizando carteira de pedidos em aberto..."
        onApplyFilters={handleApplyFilters}
      />

      {/* Dashboard de Pedidos em Aberto:
          - Pedidos com Itens em Estoque vs. Sem Estoque
          - Valor por Canal com destaque para Revendas sem canal
          - Pedidos Abertos por Mês cronológico */}
      <PedidosAbertosDashboard
        pedidos={dashboardPedidos}
        isLoading={loading || statsLoading}
        filters={filters}
      />

      {/* 4 KPIs de Pedidos em Aberto */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Valor Total em Aberto"
          value={kpis.valorTotalAberto}
          isCurrency
          icon={DollarSign}
          iconBgColor="bg-amber-50"
          iconColor="text-amber-600"
        />
        <KpiCard
          title="Nº de Pedidos Distintos"
          value={kpis.pedidosDistintos}
          decimals={0}
          icon={FileText}
          iconBgColor="bg-sky-50"
          iconColor="text-sky-600"
        />
        <KpiCard
          title="Itens / Linhas Pendentes"
          value={kpis.itensPendentes}
          decimals={0}
          icon={Boxes}
          iconBgColor="bg-indigo-50"
          iconColor="text-indigo-600"
        />
        <KpiCard
          title="Clientes com Pedidos"
          value={kpis.clientesDistintos}
          decimals={0}
          icon={Building2}
          iconBgColor="bg-emerald-50"
          iconColor="text-emerald-600"
        />
      </div>

      {/* Tabela de Relatório */}
      <Card className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-xs">
        <CardHeader className="p-4 sm:p-5 border-b border-gray-100 bg-slate-50/50">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base font-bold text-slate-800 flex items-center gap-2">
                <span>
                  {viewMode === 'faturamento'
                    ? 'Pedidos em Aberto por Canal de Faturamento'
                    : viewMode === 'canal'
                      ? 'Pedidos em Aberto por Canal'
                      : viewMode === 'cliente'
                        ? 'Pedidos em Aberto por Cliente'
                        : viewMode === 'tipo_cliente'
                          ? 'Pedidos em Aberto por Tipo de Cliente'
                          : 'Linhas de Pedidos Pendentes'}
                </span>
                <Badge
                  variant="secondary"
                  className="font-semibold text-xs bg-amber-100 text-amber-800"
                >
                  {viewMode === 'faturamento'
                    ? `${formatNumber(faturamentoGroups.length)} canal(is) de faturamento • ${formatNumber(totalItems)} linha(s)`
                    : viewMode === 'canal'
                      ? `${formatNumber(canalGroups.length)} canal(is) • ${formatNumber(totalItems)} linha(s)`
                      : viewMode === 'cliente'
                        ? `${formatNumber(clientGroups.length)} cliente(s) • ${formatNumber(totalItems)} linha(s)`
                        : viewMode === 'tipo_cliente'
                          ? `${formatNumber(tipoClienteGroups.length)} tipo(s) de cliente • ${formatNumber(totalItems)} linha(s)`
                          : `${formatNumber(totalItems)} registro(s)`}
                </Badge>
              </CardTitle>
              <CardDescription className="text-xs text-slate-500 mt-0.5">
                Total acumulado no recorte: {formatCurrency(totalValor)} ({formatNumber(totalQtd)}{' '}
                unidades pendentes)
              </CardDescription>
            </div>

            {/* Controles: Busca rápida e Agrupamento por Cliente */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
              <form onSubmit={handleSearchSubmit} className="flex items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Buscar pedido, cliente ou item..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0B6E99]/30 focus:border-[#0B6E99] w-52 sm:w-64"
                  />
                </div>
                <Button type="submit" size="sm" variant="secondary" className="text-xs h-8 px-2.5">
                  Filtrar
                </Button>
              </form>
            </div>
          </div>

          {/* Barra de Visualização / Agrupamento (Faturamento / Canal / Por Cliente / Detalhado) */}
          <div className="mt-3 pt-3 border-t border-slate-200/70 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 text-slate-700 font-bold">
                <Layers className="w-3.5 h-3.5 text-[#0B6E99]" />
                <span className="text-[11px]">Visualização:</span>
              </div>
              <div className="inline-flex rounded-lg bg-slate-200/70 p-0.5 gap-0.5">
                {/* 1. Primeira opção: Sem agrupamento */}
                <button
                  type="button"
                  onClick={() => {
                    setViewMode('none')
                    setExpandedClients(new Set())
                    setExpandedCanais(new Set())
                    setExpandedFaturamentos(new Set())
                  }}
                  className={cn(
                    'px-2.5 py-1 text-[11px] font-bold rounded-md transition-all cursor-pointer',
                    viewMode === 'none' || viewMode === 'detalhado'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900',
                  )}
                  title="Visualização direta por linha de pedido"
                >
                  Sem agrupamento
                </button>
                {/* 2. Agrupado por Canal de Faturamento */}
                <button
                  type="button"
                  onClick={() => {
                    setViewMode('faturamento')
                    setExpandedClients(new Set())
                    setExpandedCanais(new Set())
                    setExpandedFaturamentos(new Set())
                  }}
                  className={cn(
                    'px-2.5 py-1 text-[11px] font-bold rounded-md transition-all cursor-pointer flex items-center gap-1',
                    viewMode === 'faturamento'
                      ? 'bg-white text-[#0B6E99] shadow-xs'
                      : 'text-slate-600 hover:text-slate-900',
                  )}
                  title="Agrupar e colapsar por Canal de Faturamento (ex: AGIS, Roland) somando todos os valores"
                >
                  <Briefcase className="w-3 h-3" />
                  Agrupado por Canal de Faturamento
                </button>
                {/* 3. Agrupado por Canal */}
                <button
                  type="button"
                  onClick={() => {
                    setViewMode('canal')
                    setExpandedClients(new Set())
                    setExpandedCanais(new Set())
                    setExpandedFaturamentos(new Set())
                  }}
                  className={cn(
                    'px-2.5 py-1 text-[11px] font-bold rounded-md transition-all cursor-pointer flex items-center gap-1',
                    viewMode === 'canal'
                      ? 'bg-white text-[#0B6E99] shadow-xs'
                      : 'text-slate-600 hover:text-slate-900',
                  )}
                  title="Agrupar e colapsar por Canal somando todos os valores do canal"
                >
                  <Layers className="w-3 h-3" />
                  Agrupado por Canal
                </button>
                {/* 4. Agrupado por Cliente */}
                <button
                  type="button"
                  onClick={() => {
                    setViewMode('cliente')
                    setExpandedClients(new Set())
                    setExpandedCanais(new Set())
                    setExpandedFaturamentos(new Set())
                  }}
                  className={cn(
                    'px-2.5 py-1 text-[11px] font-bold rounded-md transition-all cursor-pointer flex items-center gap-1',
                    viewMode === 'cliente'
                      ? 'bg-white text-[#0B6E99] shadow-xs'
                      : 'text-slate-600 hover:text-slate-900',
                  )}
                  title="Agrupar e colapsar por Cliente somando todos os valores do cliente"
                >
                  <Building2 className="w-3 h-3" />
                  Agrupado por Cliente
                </button>
                {/* 5. Tipo de Cliente */}
                <button
                  type="button"
                  onClick={() => {
                    setViewMode('tipo_cliente')
                    setExpandedClients(new Set())
                    setExpandedCanais(new Set())
                    setExpandedFaturamentos(new Set())
                  }}
                  className={cn(
                    'px-2.5 py-1 text-[11px] font-bold rounded-md transition-all cursor-pointer flex items-center gap-1',
                    viewMode === 'tipo_cliente'
                      ? 'bg-white text-[#0B6E99] shadow-xs'
                      : 'text-slate-600 hover:text-slate-900',
                  )}
                  title="Agrupar e colapsar por Tipo de Cliente (ex: Revendas, Atas, Sem tipo) somando todos os valores"
                >
                  <Users className="w-3 h-3" />
                  Tipo de Cliente
                </button>
              </div>
            </div>

            {/* Ações de Expandir/Colapsar todos quando agrupado por Canal de Faturamento */}
            {viewMode === 'faturamento' && faturamentoGroups.length > 0 && (
              <div className="flex items-center gap-1.5 self-end sm:self-auto">
                <span className="text-[11px] text-slate-500 font-medium mr-1 hidden sm:inline">
                  {faturamentoGroups.length} canal(is) de fat. •
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={collapseAllFaturamentos}
                  disabled={expandedFaturamentos.size === 0}
                  className="h-7 px-2.5 text-[11px] bg-white border-slate-200 text-slate-700 hover:bg-slate-50 font-bold gap-1 shadow-2xs"
                  title="Colapsar todos os canais de faturamento (modo consolidado com somas)"
                >
                  <ChevronsDownUp className="w-3 h-3 text-[#0B6E99]" />
                  Colapsar Todos
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={expandAllFaturamentos}
                  disabled={expandedFaturamentos.size === faturamentoGroups.length}
                  className="h-7 px-2.5 text-[11px] bg-white border-slate-200 text-slate-700 hover:bg-slate-50 font-bold gap-1 shadow-2xs"
                  title="Expandir todos os canais de faturamento para ver os pedidos e itens detalhados"
                >
                  <ChevronsUpDown className="w-3 h-3 text-[#0B6E99]" />
                  Expandir Todos
                </Button>
              </div>
            )}

            {/* Ações de Expandir/Colapsar todos quando agrupado por canal */}
            {viewMode === 'canal' && canalGroups.length > 0 && (
              <div className="flex items-center gap-1.5 self-end sm:self-auto">
                <span className="text-[11px] text-slate-500 font-medium mr-1 hidden sm:inline">
                  {canalGroups.length} canal(is) •
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={collapseAllCanais}
                  disabled={expandedCanais.size === 0}
                  className="h-7 px-2.5 text-[11px] bg-white border-slate-200 text-slate-700 hover:bg-slate-50 font-bold gap-1 shadow-2xs"
                  title="Colapsar todos os canais (modo consolidado com somas)"
                >
                  <ChevronsDownUp className="w-3 h-3 text-[#0B6E99]" />
                  Colapsar Todos
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={expandAllCanais}
                  disabled={expandedCanais.size === canalGroups.length}
                  className="h-7 px-2.5 text-[11px] bg-white border-slate-200 text-slate-700 hover:bg-slate-50 font-bold gap-1 shadow-2xs"
                  title="Expandir todos os canais para ver os pedidos e itens detalhados"
                >
                  <ChevronsUpDown className="w-3 h-3 text-[#0B6E99]" />
                  Expandir Todos
                </Button>
              </div>
            )}

            {/* Ações de Expandir/Colapsar todos quando agrupado por cliente */}
            {viewMode === 'cliente' && clientGroups.length > 0 && (
              <div className="flex items-center gap-1.5 self-end sm:self-auto">
                <span className="text-[11px] text-slate-500 font-medium mr-1 hidden sm:inline">
                  {clientGroups.length} cliente(s) •
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={collapseAllClients}
                  disabled={expandedClients.size === 0}
                  className="h-7 px-2.5 text-[11px] bg-white border-slate-200 text-slate-700 hover:bg-slate-50 font-bold gap-1 shadow-2xs"
                  title="Colapsar todos os clientes (modo consolidado com somas)"
                >
                  <ChevronsDownUp className="w-3 h-3 text-[#0B6E99]" />
                  Colapsar Todos
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={expandAllClients}
                  disabled={expandedClients.size === clientGroups.length}
                  className="h-7 px-2.5 text-[11px] bg-white border-slate-200 text-slate-700 hover:bg-slate-50 font-bold gap-1 shadow-2xs"
                  title="Expandir todos os clientes para ver os pedidos e itens detalhados"
                >
                  <ChevronsUpDown className="w-3 h-3 text-[#0B6E99]" />
                  Expandir Todos
                </Button>
              </div>
            )}

            {/* Ações de Expandir/Colapsar todos quando agrupado por Tipo de Cliente */}
            {viewMode === 'tipo_cliente' && tipoClienteGroups.length > 0 && (
              <div className="flex items-center gap-1.5 self-end sm:self-auto">
                <span className="text-[11px] text-slate-500 font-medium mr-1 hidden sm:inline">
                  {tipoClienteGroups.length} tipo(s) •
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={collapseAllTiposCliente}
                  disabled={expandedTiposCliente.size === 0}
                  className="h-7 px-2.5 text-[11px] bg-white border-slate-200 text-slate-700 hover:bg-slate-50 font-bold gap-1 shadow-2xs"
                  title="Colapsar todos os tipos de cliente (modo consolidado com somas)"
                >
                  <ChevronsDownUp className="w-3 h-3 text-[#0B6E99]" />
                  Colapsar Todos
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={expandAllTiposCliente}
                  disabled={expandedTiposCliente.size === tipoClienteGroups.length}
                  className="h-7 px-2.5 text-[11px] bg-white border-slate-200 text-slate-700 hover:bg-slate-50 font-bold gap-1 shadow-2xs"
                  title="Expandir todos os tipos de cliente para ver os pedidos e itens detalhados"
                >
                  <ChevronsUpDown className="w-3 h-3 text-[#0B6E99]" />
                  Expandir Todos
                </Button>
              </div>
            )}
          </div>

          {/* Filtro Status Linha (posicionado logo abaixo de Sem agrupamento / controles de visualização) */}
          <div className="mt-2.5 pt-2.5 border-t border-slate-200/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 text-slate-700 font-bold">
                <Filter className="w-3.5 h-3.5 text-[#0B6E99]" />
                <span className="text-[11px]">Status Linha:</span>
              </div>
              <div className="inline-flex rounded-lg bg-slate-200/70 p-0.5 gap-0.5">
                <button
                  type="button"
                  onClick={() => handleStatusLinhaChange('todos')}
                  className={cn(
                    'px-2.5 py-1 text-[11px] font-bold rounded-md transition-all cursor-pointer',
                    statusLinhaFilter === 'todos'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900',
                  )}
                  title="Visualizar todas as linhas de pedidos (abertas e fechadas)"
                >
                  Todos
                </button>
                <button
                  type="button"
                  onClick={() => handleStatusLinhaChange('Aberta')}
                  className={cn(
                    'px-2.5 py-1 text-[11px] font-bold rounded-md transition-all cursor-pointer flex items-center gap-1.5',
                    statusLinhaFilter === 'Aberta'
                      ? 'bg-amber-500 text-white shadow-xs font-black'
                      : 'text-slate-600 hover:text-slate-900',
                  )}
                  title="Visualizar apenas o que ainda tem aberto para faturar"
                >
                  <span
                    className={cn(
                      'inline-block w-1.5 h-1.5 rounded-full',
                      statusLinhaFilter === 'Aberta' ? 'bg-amber-100' : 'bg-amber-500',
                    )}
                  />
                  Aberta
                </button>
                <button
                  type="button"
                  onClick={() => handleStatusLinhaChange('Fechada')}
                  className={cn(
                    'px-2.5 py-1 text-[11px] font-bold rounded-md transition-all cursor-pointer flex items-center gap-1.5',
                    statusLinhaFilter === 'Fechada'
                      ? 'bg-slate-700 text-white shadow-xs font-black'
                      : 'text-slate-600 hover:text-slate-900',
                  )}
                  title="Visualizar apenas linhas fechadas"
                >
                  <span
                    className={cn(
                      'inline-block w-1.5 h-1.5 rounded-full',
                      statusLinhaFilter === 'Fechada' ? 'bg-slate-300' : 'bg-slate-500',
                    )}
                  />
                  Fechada
                </button>
              </div>
              {statusLinhaFilter === 'Aberta' && (
                <span className="text-[11px] text-amber-800 bg-amber-50 font-semibold px-2 py-0.5 rounded border border-amber-200/80">
                  Filtro ativo: visualizando o que ainda está em aberto para faturar
                </span>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="max-h-[65vh] overflow-auto border-b border-gray-100">
            <table className="w-full text-left border-collapse text-xs min-w-[1000px]">
              <thead className="sticky top-0 z-20 bg-slate-100 shadow-2xs">
                <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 uppercase tracking-wider text-[11px]">
                  {viewMode !== 'none' && viewMode !== 'detalhado' && (
                    <th className="py-3 px-2 w-10 text-center sticky top-0 bg-slate-100">
                      <Layers className="w-3.5 h-3.5 mx-auto text-slate-400" />
                    </th>
                  )}
                  {/* Coluna Canal como PRIMEIRA COLUNA */}
                  <th
                    className="p-3 cursor-pointer hover:bg-slate-200/70 transition-colors sticky top-0 bg-slate-100 whitespace-nowrap select-none"
                    onClick={() => handleSort('nome_canal')}
                    title="Ordenar por Canal"
                  >
                    <div className="flex items-center gap-1">
                      <span>Canal / Deploy</span>
                      {sort.field === 'nome_canal' ? (
                        sort.dir === 'asc' ? (
                          <ArrowUp className="w-3 h-3 text-[#0B6E99]" />
                        ) : (
                          <ArrowDown className="w-3 h-3 text-[#0B6E99]" />
                        )
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60" />
                      )}
                    </div>
                  </th>
                  <th
                    className="p-3 cursor-pointer hover:bg-slate-200/70 transition-colors sticky top-0 bg-slate-100 whitespace-nowrap select-none"
                    onClick={() => handleSort('numero_pedido')}
                    title="Ordenar por Número do Pedido"
                  >
                    <div className="flex items-center gap-1">
                      <span>Nº Pedido / Linha</span>
                      {sort.field === 'numero_pedido' ? (
                        sort.dir === 'asc' ? (
                          <ArrowUp className="w-3 h-3 text-[#0B6E99]" />
                        ) : (
                          <ArrowDown className="w-3 h-3 text-[#0B6E99]" />
                        )
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60" />
                      )}
                    </div>
                  </th>
                  <th
                    className="p-3 cursor-pointer hover:bg-slate-200/70 transition-colors sticky top-0 bg-slate-100 whitespace-nowrap select-none"
                    onClick={() => handleSort('data_pedido')}
                    title="Ordenar por Data do Pedido"
                  >
                    <div className="flex items-center gap-1">
                      <span>Data</span>
                      {sort.field === 'data_pedido' ? (
                        sort.dir === 'asc' ? (
                          <ArrowUp className="w-3 h-3 text-[#0B6E99]" />
                        ) : (
                          <ArrowDown className="w-3 h-3 text-[#0B6E99]" />
                        )
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60" />
                      )}
                    </div>
                  </th>
                  <th
                    className="p-3 cursor-pointer hover:bg-slate-200/70 transition-colors sticky top-0 bg-slate-100 whitespace-nowrap select-none"
                    onClick={() => handleSort('tipo_cliente')}
                    title="Ordenar por Tipo de Cliente"
                  >
                    <div className="flex items-center gap-1">
                      <span>Tipo de Cliente</span>
                      {sort.field === 'tipo_cliente' ? (
                        sort.dir === 'asc' ? (
                          <ArrowUp className="w-3 h-3 text-[#0B6E99]" />
                        ) : (
                          <ArrowDown className="w-3 h-3 text-[#0B6E99]" />
                        )
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60" />
                      )}
                    </div>
                  </th>
                  <th
                    className="p-3 cursor-pointer hover:bg-slate-200/70 transition-colors sticky top-0 bg-slate-100 whitespace-nowrap select-none"
                    onClick={() => handleSort('nome_cliente')}
                    title="Ordenar por Cliente"
                  >
                    <div className="flex items-center gap-1">
                      <span>Cliente (Código)</span>
                      {sort.field === 'nome_cliente' ? (
                        sort.dir === 'asc' ? (
                          <ArrowUp className="w-3 h-3 text-[#0B6E99]" />
                        ) : (
                          <ArrowDown className="w-3 h-3 text-[#0B6E99]" />
                        )
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60" />
                      )}
                    </div>
                  </th>
                  {/* Status da Linha e Estoque / Trânsito reposicionados IMEDIATAMENTE após Cliente (Código) */}
                  <th
                    className="p-3 text-center cursor-pointer hover:bg-slate-200/70 transition-colors sticky top-0 bg-slate-100 whitespace-nowrap select-none"
                    onClick={() => handleSort('status_linha')}
                    title="Ordenar por Status da Linha"
                  >
                    <div className="flex items-center justify-center gap-1">
                      <span>Status Linha</span>
                      {sort.field === 'status_linha' ? (
                        sort.dir === 'asc' ? (
                          <ArrowUp className="w-3 h-3 text-[#0B6E99]" />
                        ) : (
                          <ArrowDown className="w-3 h-3 text-[#0B6E99]" />
                        )
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60" />
                      )}
                    </div>
                  </th>
                  <th
                    className="p-3 text-center cursor-pointer hover:bg-slate-200/70 transition-colors sticky top-0 bg-slate-100 whitespace-nowrap select-none"
                    onClick={() => handleSort('em_estoque')}
                    title="Ordenar por Estoque"
                  >
                    <div className="flex items-center justify-center gap-1">
                      <span>Estoque / Trânsito</span>
                      {sort.field === 'em_estoque' ? (
                        sort.dir === 'asc' ? (
                          <ArrowUp className="w-3 h-3 text-[#0B6E99]" />
                        ) : (
                          <ArrowDown className="w-3 h-3 text-[#0B6E99]" />
                        )
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60" />
                      )}
                    </div>
                  </th>
                  <th
                    className="p-3 cursor-pointer hover:bg-slate-200/70 transition-colors sticky top-0 bg-slate-100 whitespace-nowrap select-none"
                    onClick={() => handleSort('status_cadastro')}
                    title="Ordenar por Status do Cadastro"
                  >
                    <div className="flex items-center gap-1">
                      <span>Status do Cadastro</span>
                      {sort.field === 'status_cadastro' ? (
                        sort.dir === 'asc' ? (
                          <ArrowUp className="w-3 h-3 text-[#0B6E99]" />
                        ) : (
                          <ArrowDown className="w-3 h-3 text-[#0B6E99]" />
                        )
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60" />
                      )}
                    </div>
                  </th>
                  <th
                    className="p-3 cursor-pointer hover:bg-slate-200/70 transition-colors sticky top-0 bg-slate-100 whitespace-nowrap select-none"
                    onClick={() => handleSort('tipo_pn')}
                    title="Ordenar por Tipo de PN"
                  >
                    <div className="flex items-center gap-1">
                      <span>Tipo de PN</span>
                      {sort.field === 'tipo_pn' ? (
                        sort.dir === 'asc' ? (
                          <ArrowUp className="w-3 h-3 text-[#0B6E99]" />
                        ) : (
                          <ArrowDown className="w-3 h-3 text-[#0B6E99]" />
                        )
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60" />
                      )}
                    </div>
                  </th>
                  <th
                    className="p-3 cursor-pointer hover:bg-slate-200/70 transition-colors sticky top-0 bg-slate-100 whitespace-nowrap select-none"
                    onClick={() => handleSort('codigo_item')}
                    title="Ordenar por Item / Descrição"
                  >
                    <div className="flex items-center gap-1">
                      <span>Item / Descrição</span>
                      {sort.field === 'codigo_item' ? (
                        sort.dir === 'asc' ? (
                          <ArrowUp className="w-3 h-3 text-[#0B6E99]" />
                        ) : (
                          <ArrowDown className="w-3 h-3 text-[#0B6E99]" />
                        )
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60" />
                      )}
                    </div>
                  </th>
                  <th
                    className="p-3 text-center cursor-pointer hover:bg-slate-200/70 transition-colors sticky top-0 bg-slate-100 whitespace-nowrap select-none"
                    onClick={() => handleSort('qtd_aberto')}
                    title="Ordenar por Quantidade em Aberto"
                  >
                    <div className="flex items-center justify-center gap-1">
                      <span>Qtd Aberto</span>
                      {sort.field === 'qtd_aberto' ? (
                        sort.dir === 'asc' ? (
                          <ArrowUp className="w-3 h-3 text-[#0B6E99]" />
                        ) : (
                          <ArrowDown className="w-3 h-3 text-[#0B6E99]" />
                        )
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60" />
                      )}
                    </div>
                  </th>
                  <th
                    className="p-3 text-right cursor-pointer hover:bg-slate-200/70 transition-colors sticky top-0 bg-slate-100 whitespace-nowrap select-none"
                    onClick={() => handleSort('preco_apos_desconto')}
                    title="Ordenar por Preço Líquido"
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span>Preço Liq.</span>
                      {sort.field === 'preco_apos_desconto' ? (
                        sort.dir === 'asc' ? (
                          <ArrowUp className="w-3 h-3 text-[#0B6E99]" />
                        ) : (
                          <ArrowDown className="w-3 h-3 text-[#0B6E99]" />
                        )
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60" />
                      )}
                    </div>
                  </th>
                  <th
                    className="p-3 text-right cursor-pointer hover:bg-slate-200/70 transition-colors sticky top-0 bg-slate-100 whitespace-nowrap select-none"
                    onClick={() => handleSort('valor_em_aberto')}
                    title="Ordenar por Valor em Aberto"
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span>Valor em Aberto</span>
                      {sort.field === 'valor_em_aberto' ? (
                        sort.dir === 'asc' ? (
                          <ArrowUp className="w-3 h-3 text-[#0B6E99]" />
                        ) : (
                          <ArrowDown className="w-3 h-3 text-[#0B6E99]" />
                        )
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60" />
                      )}
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td
                      colSpan={viewMode !== 'none' && viewMode !== 'detalhado' ? 14 : 13}
                      className="p-8 text-center text-slate-400"
                    >
                      <div className="flex items-center justify-center gap-2">
                        <div className="w-4 h-4 border-2 border-[#0B6E99] border-t-transparent rounded-full animate-spin" />
                        <span>Carregando pedidos em aberto...</span>
                      </div>
                    </td>
                  </tr>
                ) : (
                    viewMode === 'faturamento'
                      ? faturamentoGroups.length === 0
                      : viewMode === 'canal'
                        ? canalGroups.length === 0
                        : viewMode === 'cliente'
                          ? clientGroups.length === 0
                          : viewMode === 'tipo_cliente'
                            ? tipoClienteGroups.length === 0
                            : paginatedPedidos.length === 0
                  ) ? (
                  <tr>
                    <td
                      colSpan={viewMode !== 'none' && viewMode !== 'detalhado' ? 14 : 13}
                      className="p-12 text-center text-slate-400"
                    >
                      <AlertCircle className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                      <p className="font-semibold text-slate-600">
                        Nenhum pedido em aberto encontrado
                      </p>
                      <p className="text-xs text-slate-400 mt-1">
                        Verifique os filtros selecionados ou importe a planilha do SAP na tela de
                        importação.
                      </p>
                    </td>
                  </tr>
                ) : viewMode === 'faturamento' ? (
                  /* MODO AGRUPADO / COLAPSÁVEL POR CANAL DE FATURAMENTO */
                  faturamentoGroups.map((group) => {
                    const isExpanded = expandedFaturamentos.has(group.key)
                    return (
                      <React.Fragment key={group.key}>
                        {/* Linha Consolidada do Canal de Faturamento (Cabeçalho com soma de todos os valores) */}
                        <tr
                          onClick={() => toggleFaturamentoGroup(group.key)}
                          className={cn(
                            'cursor-pointer transition-colors border-y border-slate-200/80 font-semibold select-none',
                            isExpanded
                              ? 'bg-blue-50/80 hover:bg-blue-100/70 text-slate-900'
                              : 'bg-slate-50/90 hover:bg-slate-100/80 text-slate-800',
                          )}
                          title={
                            isExpanded
                              ? 'Clique para recolher pedidos do canal de faturamento'
                              : 'Clique para expandir pedidos do canal de faturamento'
                          }
                        >
                          {/* Toggle */}
                          <td className="py-2.5 px-2 text-center align-middle">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                toggleFaturamentoGroup(group.key)
                              }}
                              className="p-1 rounded hover:bg-blue-200/60 text-blue-800 focus:outline-hidden transition-colors"
                            >
                              {isExpanded ? (
                                <ChevronDown className="w-4 h-4 text-[#0B6E99]" />
                              ) : (
                                <ChevronRight className="w-4 h-4 text-slate-500" />
                              )}
                            </button>
                          </td>

                          {/* 1. Canal / Deploy (PRIMEIRA COLUNA: exibe o Canal de Faturamento) */}
                          <td className="p-3 whitespace-nowrap min-w-[180px]">
                            {group.key === 'SEM_FATURAMENTO' ? (
                              <span className="text-slate-500 font-bold italic">
                                Sem Canal de Faturamento
                              </span>
                            ) : (
                              <div className="space-y-0.5">
                                <span className="inline-block text-xs font-black text-[#0B6E99]">
                                  {group.canal_faturamento}
                                </span>
                                <div className="text-[10px] text-slate-500 font-semibold">
                                  Canal de Faturamento
                                </div>
                              </div>
                            )}
                          </td>

                          {/* Resumo de Pedidos do Canal de Faturamento */}
                          <td className="p-3 font-semibold text-slate-900 whitespace-nowrap">
                            <Badge
                              variant="outline"
                              className="text-xs bg-white text-[#0B6E99] border-sky-200 font-bold"
                            >
                              {group.totalPedidos} pedido(s) • {group.totalLinhas} lin.
                            </Badge>
                          </td>

                          {/* Data (indicação de consolidado) */}
                          <td className="p-3 text-slate-500 whitespace-nowrap text-[11px]">
                            {isExpanded ? 'Detalhamento ▼' : 'Consolidado ▲'}
                          </td>

                          {/* Colunas complementares no consolidado: Tipo de Cliente */}
                          <td className="p-3 text-center text-slate-300">-</td>

                          {/* Clientes distintos do Canal de Faturamento */}
                          <td className="p-3 min-w-[200px]">
                            <div className="font-bold text-slate-800 text-xs">
                              {group.totalClientes} cliente(s) distinto(s)
                            </div>
                            <div className="text-[11px] text-slate-400">
                              {group.items.length} itens no canal
                            </div>
                          </td>

                          {/* Status consolidado (alinhado com a coluna Status Linha) */}
                          <td className="p-3 text-center whitespace-nowrap">
                            <Badge
                              variant="secondary"
                              className="text-[10px] font-bold bg-blue-100 text-blue-950 border border-blue-200"
                            >
                              {isExpanded ? 'Expandido' : 'Colapsado'}
                            </Badge>
                          </td>

                          {/* Ação rápida (alinhado com a coluna Estoque / Trânsito) */}
                          <td className="p-3 text-center whitespace-nowrap text-[10px] text-slate-400 font-medium">
                            {isExpanded ? 'Recolher ▲' : 'Ver pedidos ▼'}
                          </td>

                          {/* Colunas complementares no consolidado: Status do Cadastro e Tipo de PN */}
                          <td className="p-3 text-center text-slate-300">-</td>
                          <td className="p-3 text-center text-slate-300">-</td>

                          {/* Itens do Canal de Faturamento */}
                          <td className="p-3 text-slate-600 text-[11px]">
                            <span className="font-bold text-slate-800">
                              {group.totalLinhas} item(ns)
                            </span>
                            <span className="text-slate-400 ml-1">pendente(s)</span>
                          </td>

                          {/* SOMA Qtd Aberto */}
                          <td className="p-3 text-center whitespace-nowrap">
                            <div className="font-extrabold text-slate-900">
                              {formatNumber(group.totalQtdAberto)}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              de {formatNumber(group.totalQtdSolicitada)} solicit.
                            </div>
                          </td>

                          {/* Preço Líquido Médio */}
                          <td className="p-3 text-right text-slate-600 whitespace-nowrap font-medium text-[11px]">
                            {group.totalQtdAberto > 0
                              ? formatCurrency(group.totalValorEmAberto / group.totalQtdAberto)
                              : '-'}
                            <span className="block text-[9px] text-slate-400">preço médio</span>
                          </td>

                          {/* SOMA de todos os valores em aberto do Canal de Faturamento */}
                          <td className="p-3 text-right whitespace-nowrap font-black text-blue-900 text-sm bg-blue-100/40">
                            {formatCurrency(group.totalValorEmAberto)}
                          </td>
                        </tr>

                        {/* Linhas detalhadas quando canal de faturamento expandido */}
                        {isExpanded &&
                          group.items.map((item) => (
                            <tr
                              key={item.id}
                              className="bg-white hover:bg-slate-50/80 transition-colors border-b border-slate-100/80"
                            >
                              <td className="py-2.5 px-2 text-center text-slate-300">
                                <span className="inline-block w-1.5 h-1.5 rounded-full bg-slate-300" />
                              </td>

                              {/* 1. Canal / Deploy (PRIMEIRA COLUNA) */}
                              <td className="p-3 whitespace-nowrap">
                                {item.nome_canal ? (
                                  <div className="space-y-0.5">
                                    <span className="inline-block text-[11px] font-bold text-[#0B6E99]">
                                      {item.nome_canal}
                                    </span>
                                    {item.deploy && (
                                      <div className="text-[10px] text-slate-500 font-medium">
                                        Deploy: {item.deploy}
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-slate-400 text-[11px] italic">—</span>
                                )}
                              </td>

                              {/* Pedido / Linha */}
                              <td className="p-3 font-semibold text-slate-900 whitespace-nowrap">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-mono text-xs text-[#0B6E99] font-bold">
                                    {item.numero_pedido}
                                  </span>
                                  <span className="text-[11px] text-slate-400">
                                    / L{item.linha}
                                  </span>
                                </div>
                              </td>

                              {/* Data */}
                              <td className="p-3 text-slate-600 whitespace-nowrap">
                                {item.data_pedido ? formatDate(item.data_pedido) : '-'}
                              </td>

                              {/* Tipo de Cliente */}
                              <td className="p-3 whitespace-nowrap">
                                {renderTipoClienteBadge(resolveClienteInfo(item).tipo_cliente)}
                              </td>

                              {/* Cliente */}
                              <td className="p-3 min-w-[200px]">
                                <div
                                  className="font-medium text-slate-800 truncate"
                                  title={item.nome_cliente}
                                >
                                  {item.nome_cliente || 'Cliente não identificado'}
                                </div>
                                {item.codigo_cliente && (
                                  <div className="text-[11px] text-slate-400 font-mono">
                                    {item.codigo_cliente}
                                  </div>
                                )}
                              </td>

                              {/* Status Linha */}
                              <td className="p-3 text-center whitespace-nowrap">
                                <Badge
                                  variant="outline"
                                  className={
                                    item.status_linha?.toLowerCase() === 'fechada'
                                      ? 'bg-slate-100 text-slate-600 border-slate-200'
                                      : 'bg-amber-50 text-amber-700 border-amber-200 font-semibold'
                                  }
                                >
                                  {item.status_linha || 'Aberta'}
                                </Badge>
                              </td>

                              {/* Estoque / Trânsito */}
                              <td className="p-3 text-center whitespace-nowrap text-[11px]">
                                <div className="flex items-center justify-center gap-2">
                                  <span
                                    className={`font-semibold ${
                                      item.em_estoque > 0 ? 'text-emerald-600' : 'text-slate-400'
                                    }`}
                                    title="Em Estoque"
                                  >
                                    Est: {formatNumber(item.em_estoque)}
                                  </span>
                                  <span className="text-slate-300">|</span>
                                  <span
                                    className={`font-semibold ${
                                      item.em_transito > 0 ? 'text-sky-600' : 'text-slate-400'
                                    }`}
                                    title="Em Trânsito"
                                  >
                                    Trân: {formatNumber(item.em_transito)}
                                  </span>
                                </div>
                                {item.deposito && (
                                  <div className="text-[10px] text-slate-400 mt-0.5">
                                    Depósito: {item.deposito}
                                  </div>
                                )}
                              </td>

                              {/* Status do Cadastro */}
                              <td className="p-3 whitespace-nowrap">
                                {renderStatusCadastroCell(resolveClienteInfo(item).status_cadastro)}
                              </td>

                              {/* Tipo de PN */}
                              <td className="p-3 whitespace-nowrap">
                                {renderTipoPnCell(resolveClienteInfo(item).tipo_pn)}
                              </td>

                              {/* Item / Descrição */}
                              <td className="p-3 min-w-[220px]">
                                <div className="font-mono text-xs font-semibold text-slate-800">
                                  {item.codigo_item || '-'}
                                </div>
                                <div
                                  className="text-[11px] text-slate-600 truncate"
                                  title={item.descricao_item}
                                >
                                  {item.descricao_item || '-'}
                                </div>
                                {item.grupo_item && (
                                  <span className="inline-block text-[10px] text-slate-400 uppercase tracking-tight mt-0.5">
                                    Grupo: {item.grupo_item}
                                  </span>
                                )}
                              </td>

                              {/* Qtd Aberto */}
                              <td className="p-3 text-center whitespace-nowrap">
                                <div className="font-bold text-slate-900">
                                  {formatNumber(item.qtd_aberto)}
                                </div>
                                <div className="text-[10px] text-slate-400">
                                  de {formatNumber(item.qtd_solicitada)} ped.
                                </div>
                              </td>

                              {/* Preço Unitário Líquido */}
                              <td className="p-3 text-right text-slate-700 whitespace-nowrap font-medium">
                                {formatCurrency(
                                  Number(item.preco_apos_desconto) ||
                                    Number(item.preco_unitario) ||
                                    0,
                                )}
                                {Number(item.desconto_percentual) > 0 && (
                                  <span className="block text-[10px] text-rose-500">
                                    -{Math.round(Number(item.desconto_percentual))}%
                                  </span>
                                )}
                              </td>

                              {/* Valor em Aberto */}
                              <td className="p-3 text-right whitespace-nowrap font-bold text-amber-700">
                                {formatCurrency(Number(item.valor_em_aberto) || 0)}
                              </td>
                            </tr>
                          ))}
                      </React.Fragment>
                    )
                  })
                ) : viewMode === 'canal' ? (
                  /* MODO AGRUPADO / COLAPSÁVEL POR CANAL */
                  canalGroups.map((group) => {
                    const isExpanded = expandedCanais.has(group.key)
                    return (
                      <React.Fragment key={group.key}>
                        {/* Linha Consolidada do Canal (Cabeçalho com soma de todos os valores) */}
                        <tr
                          onClick={() => toggleCanalGroup(group.key)}
                          className={cn(
                            'cursor-pointer transition-colors border-y border-slate-200/80 font-semibold select-none',
                            isExpanded
                              ? 'bg-cyan-50/70 hover:bg-cyan-100/60 text-slate-900'
                              : 'bg-slate-50/90 hover:bg-slate-100/80 text-slate-800',
                          )}
                          title={
                            isExpanded
                              ? 'Clique para recolher pedidos do canal'
                              : 'Clique para expandir pedidos do canal'
                          }
                        >
                          {/* Toggle */}
                          <td className="py-2.5 px-2 text-center align-middle">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                toggleCanalGroup(group.key)
                              }}
                              className="p-1 rounded hover:bg-cyan-200/60 text-cyan-800 focus:outline-hidden transition-colors"
                            >
                              {isExpanded ? (
                                <ChevronDown className="w-4 h-4 text-[#0B6E99]" />
                              ) : (
                                <ChevronRight className="w-4 h-4 text-slate-500" />
                              )}
                            </button>
                          </td>

                          {/* 1. Canal / Deploy (PRIMEIRA COLUNA) */}
                          <td className="p-3 whitespace-nowrap min-w-[180px]">
                            {group.key === 'SEM_CANAL' ? (
                              <span className="text-slate-500 font-bold italic">Sem Canal</span>
                            ) : (
                              <div className="space-y-0.5">
                                <span className="inline-block text-xs font-black text-[#0B6E99]">
                                  {group.nome_canal}
                                </span>
                                {group.deploy && (
                                  <div className="text-[10px] text-slate-500 font-semibold">
                                    Deploy: {group.deploy}
                                  </div>
                                )}
                              </div>
                            )}
                          </td>

                          {/* Resumo de Pedidos do Canal */}
                          <td className="p-3 font-semibold text-slate-900 whitespace-nowrap">
                            <Badge
                              variant="outline"
                              className="text-xs bg-white text-[#0B6E99] border-sky-200 font-bold"
                            >
                              {group.totalPedidos} pedido(s) • {group.totalLinhas} lin.
                            </Badge>
                          </td>

                          {/* Data (indicação de consolidado) */}
                          <td className="p-3 text-slate-500 whitespace-nowrap text-[11px]">
                            {isExpanded ? 'Detalhamento ▼' : 'Consolidado ▲'}
                          </td>

                          {/* Colunas complementares no consolidado: Tipo de Cliente */}
                          <td className="p-3 text-center text-slate-300">-</td>

                          {/* Clientes distintos do Canal */}
                          <td className="p-3 min-w-[200px]">
                            <div className="font-bold text-slate-800 text-xs">
                              {group.totalClientes} cliente(s) distinto(s)
                            </div>
                            <div className="text-[11px] text-slate-400">
                              {group.items.length} itens no canal
                            </div>
                          </td>

                          {/* Status consolidado (alinhado com Status Linha) */}
                          <td className="p-3 text-center whitespace-nowrap">
                            <Badge
                              variant="secondary"
                              className="text-[10px] font-bold bg-cyan-100 text-cyan-950 border border-cyan-200"
                            >
                              {isExpanded ? 'Expandido' : 'Colapsado'}
                            </Badge>
                          </td>

                          {/* Ação rápida (alinhado com Estoque / Trânsito) */}
                          <td className="p-3 text-center whitespace-nowrap text-[10px] text-slate-400 font-medium">
                            {isExpanded ? 'Recolher ▲' : 'Ver pedidos ▼'}
                          </td>

                          {/* Colunas complementares no consolidado: Status do Cadastro e Tipo de PN */}
                          <td className="p-3 text-center text-slate-300">-</td>
                          <td className="p-3 text-center text-slate-300">-</td>

                          {/* Itens do Canal */}
                          <td className="p-3 text-slate-600 text-[11px]">
                            <span className="font-bold text-slate-800">
                              {group.totalLinhas} item(ns)
                            </span>
                            <span className="text-slate-400 ml-1">pendente(s)</span>
                          </td>

                          {/* SOMA Qtd Aberto */}
                          <td className="p-3 text-center whitespace-nowrap">
                            <div className="font-extrabold text-slate-900">
                              {formatNumber(group.totalQtdAberto)}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              de {formatNumber(group.totalQtdSolicitada)} solicit.
                            </div>
                          </td>

                          {/* Preço Líquido Médio */}
                          <td className="p-3 text-right text-slate-600 whitespace-nowrap font-medium text-[11px]">
                            {group.totalQtdAberto > 0
                              ? formatCurrency(group.totalValorEmAberto / group.totalQtdAberto)
                              : '-'}
                            <span className="block text-[9px] text-slate-400">preço médio</span>
                          </td>

                          {/* SOMA de todos os valores em aberto do Canal */}
                          <td className="p-3 text-right whitespace-nowrap font-black text-cyan-900 text-sm bg-cyan-100/40">
                            {formatCurrency(group.totalValorEmAberto)}
                          </td>
                        </tr>

                        {/* Linhas detalhadas quando canal expandido */}
                        {isExpanded &&
                          group.items.map((item) => (
                            <tr
                              key={item.id}
                              className="bg-white hover:bg-slate-50/80 transition-colors border-b border-slate-100/80"
                            >
                              <td className="py-2.5 px-2 text-center text-slate-300">
                                <span className="inline-block w-1.5 h-1.5 rounded-full bg-slate-300" />
                              </td>

                              {/* 1. Canal / Deploy (PRIMEIRA COLUNA) */}
                              <td className="p-3 whitespace-nowrap">
                                {item.nome_canal ? (
                                  <div className="space-y-0.5">
                                    <span className="inline-block text-[11px] font-bold text-[#0B6E99]">
                                      {item.nome_canal}
                                    </span>
                                    {item.deploy && (
                                      <div className="text-[10px] text-slate-500 font-medium">
                                        Deploy: {item.deploy}
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-slate-400 text-[11px] italic">—</span>
                                )}
                              </td>

                              {/* Pedido / Linha */}
                              <td className="p-3 font-semibold text-slate-900 whitespace-nowrap">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-mono text-xs text-[#0B6E99] font-bold">
                                    {item.numero_pedido}
                                  </span>
                                  <span className="text-[11px] text-slate-400">
                                    / L{item.linha}
                                  </span>
                                </div>
                              </td>

                              {/* Data */}
                              <td className="p-3 text-slate-600 whitespace-nowrap">
                                {item.data_pedido ? formatDate(item.data_pedido) : '-'}
                              </td>

                              {/* Tipo de Cliente */}
                              <td className="p-3 whitespace-nowrap">
                                {renderTipoClienteBadge(resolveClienteInfo(item).tipo_cliente)}
                              </td>

                              {/* Cliente */}
                              <td className="p-3 min-w-[200px]">
                                <div
                                  className="font-medium text-slate-800 truncate"
                                  title={item.nome_cliente}
                                >
                                  {item.nome_cliente || 'Cliente não identificado'}
                                </div>
                                {item.codigo_cliente && (
                                  <div className="text-[11px] text-slate-400 font-mono">
                                    {item.codigo_cliente}
                                  </div>
                                )}
                              </td>

                              {/* Status Linha */}
                              <td className="p-3 text-center whitespace-nowrap">
                                <Badge
                                  variant="outline"
                                  className={
                                    item.status_linha?.toLowerCase() === 'fechada'
                                      ? 'bg-slate-100 text-slate-600 border-slate-200'
                                      : 'bg-amber-50 text-amber-700 border-amber-200 font-semibold'
                                  }
                                >
                                  {item.status_linha || 'Aberta'}
                                </Badge>
                              </td>

                              {/* Estoque / Trânsito */}
                              <td className="p-3 text-center whitespace-nowrap text-[11px]">
                                <div className="flex items-center justify-center gap-2">
                                  <span
                                    className={`font-semibold ${
                                      item.em_estoque > 0 ? 'text-emerald-600' : 'text-slate-400'
                                    }`}
                                    title="Em Estoque"
                                  >
                                    Est: {formatNumber(item.em_estoque)}
                                  </span>
                                  <span className="text-slate-300">|</span>
                                  <span
                                    className={`font-semibold ${
                                      item.em_transito > 0 ? 'text-sky-600' : 'text-slate-400'
                                    }`}
                                    title="Em Trânsito"
                                  >
                                    Trân: {formatNumber(item.em_transito)}
                                  </span>
                                </div>
                                {item.deposito && (
                                  <div className="text-[10px] text-slate-400 mt-0.5">
                                    Depósito: {item.deposito}
                                  </div>
                                )}
                              </td>

                              {/* Status do Cadastro */}
                              <td className="p-3 whitespace-nowrap">
                                {renderStatusCadastroCell(resolveClienteInfo(item).status_cadastro)}
                              </td>

                              {/* Tipo de PN */}
                              <td className="p-3 whitespace-nowrap">
                                {renderTipoPnCell(resolveClienteInfo(item).tipo_pn)}
                              </td>

                              {/* Item / Descrição */}
                              <td className="p-3 min-w-[220px]">
                                <div className="font-mono text-xs font-semibold text-slate-800">
                                  {item.codigo_item || '-'}
                                </div>
                                <div
                                  className="text-[11px] text-slate-600 truncate"
                                  title={item.descricao_item}
                                >
                                  {item.descricao_item || '-'}
                                </div>
                                {item.grupo_item && (
                                  <span className="inline-block text-[10px] text-slate-400 uppercase tracking-tight mt-0.5">
                                    Grupo: {item.grupo_item}
                                  </span>
                                )}
                              </td>

                              {/* Qtd Aberto */}
                              <td className="p-3 text-center whitespace-nowrap">
                                <div className="font-bold text-slate-900">
                                  {formatNumber(item.qtd_aberto)}
                                </div>
                                <div className="text-[10px] text-slate-400">
                                  de {formatNumber(item.qtd_solicitada)} ped.
                                </div>
                              </td>

                              {/* Preço Unitário Líquido */}
                              <td className="p-3 text-right text-slate-700 whitespace-nowrap font-medium">
                                {formatCurrency(
                                  Number(item.preco_apos_desconto) ||
                                    Number(item.preco_unitario) ||
                                    0,
                                )}
                                {Number(item.desconto_percentual) > 0 && (
                                  <span className="block text-[10px] text-rose-500">
                                    -{Math.round(Number(item.desconto_percentual))}%
                                  </span>
                                )}
                              </td>

                              {/* Valor em Aberto */}
                              <td className="p-3 text-right whitespace-nowrap font-bold text-amber-700">
                                {formatCurrency(Number(item.valor_em_aberto) || 0)}
                              </td>
                            </tr>
                          ))}
                      </React.Fragment>
                    )
                  })
                ) : viewMode === 'cliente' ? (
                  /* MODO AGRUPADO / COLAPSÁVEL POR CLIENTE */
                  clientGroups.map((group) => {
                    const isExpanded = expandedClients.has(group.key)
                    return (
                      <React.Fragment key={group.key}>
                        {/* Linha Consolidada do Cliente (Cabeçalho com soma de todos os valores) */}
                        <tr
                          onClick={() => toggleClientGroup(group.key)}
                          className={cn(
                            'cursor-pointer transition-colors border-y border-slate-200/80 font-semibold select-none',
                            isExpanded
                              ? 'bg-amber-50/70 hover:bg-amber-100/60 text-slate-900'
                              : 'bg-slate-50/90 hover:bg-slate-100/80 text-slate-800',
                          )}
                          title={
                            isExpanded
                              ? 'Clique para recolher pedidos do cliente'
                              : 'Clique para expandir pedidos do cliente'
                          }
                        >
                          {/* Toggle */}
                          <td className="py-2.5 px-2 text-center align-middle">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                toggleClientGroup(group.key)
                              }}
                              className="p-1 rounded hover:bg-amber-200/60 text-amber-800 focus:outline-hidden transition-colors"
                            >
                              {isExpanded ? (
                                <ChevronDown className="w-4 h-4 text-amber-700" />
                              ) : (
                                <ChevronRight className="w-4 h-4 text-slate-500" />
                              )}
                            </button>
                          </td>

                          {/* 1. Canal / Deploy (PRIMEIRA COLUNA) */}
                          <td className="p-3 whitespace-nowrap min-w-[180px]">
                            {group.nome_canal ? (
                              <div className="space-y-0.5">
                                <span className="inline-block text-[11px] font-bold text-[#0B6E99]">
                                  {group.nome_canal}
                                </span>
                                {group.deploy && (
                                  <div className="text-[10px] text-slate-500 font-medium">
                                    Deploy: {group.deploy}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-400 text-[11px] italic">—</span>
                            )}
                          </td>

                          {/* Resumo de Pedidos do Cliente */}
                          <td className="p-3 font-semibold text-slate-900 whitespace-nowrap">
                            <Badge
                              variant="outline"
                              className="text-xs bg-white text-[#0B6E99] border-sky-200 font-bold"
                            >
                              {group.totalPedidos} pedido(s) • {group.totalLinhas} lin.
                            </Badge>
                          </td>

                          {/* Data (indicação de consolidado) */}
                          <td className="p-3 text-slate-500 whitespace-nowrap text-[11px]">
                            {isExpanded ? 'Detalhamento ▼' : 'Consolidado ▲'}
                          </td>

                          {/* Tipo de Cliente do grupo de cliente */}
                          <td className="p-3 whitespace-nowrap">
                            {(() => {
                              const clientCod = (group.codigo_cliente || '').trim().toUpperCase()
                              const clientInfo = clientCod ? tiposClienteMap[clientCod] : undefined
                              return renderTipoClienteBadge(clientInfo?.tipo_cliente)
                            })()}
                          </td>

                          {/* Cliente e Código */}
                          <td className="p-3 min-w-[200px]">
                            <div
                              className="font-extrabold text-slate-900 truncate"
                              title={group.nome_cliente}
                            >
                              {group.nome_cliente}
                            </div>
                            {group.codigo_cliente && (
                              <div className="text-[11px] text-slate-500 font-mono font-bold">
                                Cód: {group.codigo_cliente}
                              </div>
                            )}
                          </td>

                          {/* Status consolidado (alinhado com Status Linha) */}
                          <td className="p-3 text-center whitespace-nowrap">
                            <Badge
                              variant="secondary"
                              className="text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-200"
                            >
                              {isExpanded ? 'Expandido' : 'Colapsado'}
                            </Badge>
                          </td>

                          {/* Ação rápida (alinhado com Estoque / Trânsito) */}
                          <td className="p-3 text-center whitespace-nowrap text-[10px] text-slate-400 font-medium">
                            {isExpanded ? 'Recolher ▲' : 'Ver itens ▼'}
                          </td>

                          {/* Status do Cadastro do grupo de cliente */}
                          <td className="p-3 whitespace-nowrap">
                            {(() => {
                              const clientCod = (group.codigo_cliente || '').trim().toUpperCase()
                              const clientInfo = clientCod ? tiposClienteMap[clientCod] : undefined
                              return renderStatusCadastroCell(clientInfo?.status_cadastro)
                            })()}
                          </td>

                          {/* Tipo de PN do grupo de cliente */}
                          <td className="p-3 whitespace-nowrap">
                            {(() => {
                              const clientCod = (group.codigo_cliente || '').trim().toUpperCase()
                              const clientInfo = clientCod ? tiposClienteMap[clientCod] : undefined
                              return renderTipoPnCell(clientInfo?.tipo_pn)
                            })()}
                          </td>

                          {/* Itens do Cliente */}
                          <td className="p-3 text-slate-600 text-[11px]">
                            <span className="font-bold text-slate-800">
                              {group.totalLinhas} item(ns)
                            </span>
                            <span className="text-slate-400 ml-1">pendente(s)</span>
                          </td>

                          {/* SOMA Qtd Aberto */}
                          <td className="p-3 text-center whitespace-nowrap">
                            <div className="font-extrabold text-slate-900">
                              {formatNumber(group.totalQtdAberto)}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              de {formatNumber(group.totalQtdSolicitada)} solicit.
                            </div>
                          </td>

                          {/* Preço Líquido Médio */}
                          <td className="p-3 text-right text-slate-600 whitespace-nowrap font-medium text-[11px]">
                            {group.totalQtdAberto > 0
                              ? formatCurrency(group.totalValorEmAberto / group.totalQtdAberto)
                              : '-'}
                            <span className="block text-[9px] text-slate-400">preço médio</span>
                          </td>

                          {/* SOMA de todos os valores em aberto do Cliente */}
                          <td className="p-3 text-right whitespace-nowrap font-black text-amber-800 text-sm bg-amber-100/40">
                            {formatCurrency(group.totalValorEmAberto)}
                          </td>
                        </tr>

                        {/* Linhas detalhadas quando expandido */}
                        {isExpanded &&
                          group.items.map((item) => (
                            <tr
                              key={item.id}
                              className="bg-white hover:bg-slate-50/80 transition-colors border-b border-slate-100/80"
                            >
                              <td className="py-2.5 px-2 text-center text-slate-300">
                                <span className="inline-block w-1.5 h-1.5 rounded-full bg-slate-300" />
                              </td>

                              {/* 1. Canal / Deploy (PRIMEIRA COLUNA) */}
                              <td className="p-3 whitespace-nowrap">
                                {item.nome_canal ? (
                                  <div className="space-y-0.5">
                                    <span className="inline-block text-[11px] font-bold text-[#0B6E99]">
                                      {item.nome_canal}
                                    </span>
                                    {item.deploy && (
                                      <div className="text-[10px] text-slate-500 font-medium">
                                        Deploy: {item.deploy}
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-slate-400 text-[11px] italic">—</span>
                                )}
                              </td>

                              {/* Pedido / Linha */}
                              <td className="p-3 font-semibold text-slate-900 whitespace-nowrap">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-mono text-xs text-[#0B6E99] font-bold">
                                    {item.numero_pedido}
                                  </span>
                                  <span className="text-[11px] text-slate-400">
                                    / L{item.linha}
                                  </span>
                                </div>
                              </td>

                              {/* Data */}
                              <td className="p-3 text-slate-600 whitespace-nowrap">
                                {item.data_pedido ? formatDate(item.data_pedido) : '-'}
                              </td>

                              {/* Tipo de Cliente */}
                              <td className="p-3 whitespace-nowrap">
                                {renderTipoClienteBadge(resolveClienteInfo(item).tipo_cliente)}
                              </td>

                              {/* Cliente */}
                              <td className="p-3 min-w-[200px]">
                                <div
                                  className="font-medium text-slate-800 truncate"
                                  title={item.nome_cliente}
                                >
                                  {item.nome_cliente || 'Cliente não identificado'}
                                </div>
                                {item.codigo_cliente && (
                                  <div className="text-[11px] text-slate-400 font-mono">
                                    {item.codigo_cliente}
                                  </div>
                                )}
                              </td>

                              {/* Status Linha */}
                              <td className="p-3 text-center whitespace-nowrap">
                                <Badge
                                  variant="outline"
                                  className={
                                    item.status_linha?.toLowerCase() === 'fechada'
                                      ? 'bg-slate-100 text-slate-600 border-slate-200'
                                      : 'bg-amber-50 text-amber-700 border-amber-200 font-semibold'
                                  }
                                >
                                  {item.status_linha || 'Aberta'}
                                </Badge>
                              </td>

                              {/* Estoque / Trânsito */}
                              <td className="p-3 text-center whitespace-nowrap text-[11px]">
                                <div className="flex items-center justify-center gap-2">
                                  <span
                                    className={`font-semibold ${
                                      item.em_estoque > 0 ? 'text-emerald-600' : 'text-slate-400'
                                    }`}
                                    title="Em Estoque"
                                  >
                                    Est: {formatNumber(item.em_estoque)}
                                  </span>
                                  <span className="text-slate-300">|</span>
                                  <span
                                    className={`font-semibold ${
                                      item.em_transito > 0 ? 'text-sky-600' : 'text-slate-400'
                                    }`}
                                    title="Em Trânsito"
                                  >
                                    Trân: {formatNumber(item.em_transito)}
                                  </span>
                                </div>
                                {item.deposito && (
                                  <div className="text-[10px] text-slate-400 mt-0.5">
                                    Depósito: {item.deposito}
                                  </div>
                                )}
                              </td>

                              {/* Status do Cadastro */}
                              <td className="p-3 whitespace-nowrap">
                                {renderStatusCadastroCell(resolveClienteInfo(item).status_cadastro)}
                              </td>

                              {/* Tipo de PN */}
                              <td className="p-3 whitespace-nowrap">
                                {renderTipoPnCell(resolveClienteInfo(item).tipo_pn)}
                              </td>

                              {/* Item / Descrição */}
                              <td className="p-3 min-w-[220px]">
                                <div className="font-mono text-xs font-semibold text-slate-800">
                                  {item.codigo_item || '-'}
                                </div>
                                <div
                                  className="text-[11px] text-slate-600 truncate"
                                  title={item.descricao_item}
                                >
                                  {item.descricao_item || '-'}
                                </div>
                                {item.grupo_item && (
                                  <span className="inline-block text-[10px] text-slate-400 uppercase tracking-tight mt-0.5">
                                    Grupo: {item.grupo_item}
                                  </span>
                                )}
                              </td>

                              {/* Qtd Aberto */}
                              <td className="p-3 text-center whitespace-nowrap">
                                <div className="font-bold text-slate-900">
                                  {formatNumber(item.qtd_aberto)}
                                </div>
                                <div className="text-[10px] text-slate-400">
                                  de {formatNumber(item.qtd_solicitada)} ped.
                                </div>
                              </td>

                              {/* Preço Unitário Líquido */}
                              <td className="p-3 text-right text-slate-700 whitespace-nowrap font-medium">
                                {formatCurrency(
                                  Number(item.preco_apos_desconto) ||
                                    Number(item.preco_unitario) ||
                                    0,
                                )}
                                {Number(item.desconto_percentual) > 0 && (
                                  <span className="block text-[10px] text-rose-500">
                                    -{Math.round(Number(item.desconto_percentual))}%
                                  </span>
                                )}
                              </td>

                              {/* Valor em Aberto */}
                              <td className="p-3 text-right whitespace-nowrap font-bold text-amber-700">
                                {formatCurrency(Number(item.valor_em_aberto) || 0)}
                              </td>
                            </tr>
                          ))}
                      </React.Fragment>
                    )
                  })
                ) : viewMode === 'tipo_cliente' ? (
                  /* MODO AGRUPADO / COLAPSÁVEL POR TIPO DE CLIENTE */
                  tipoClienteGroups.map((group) => {
                    const isExpanded = expandedTiposCliente.has(group.key)
                    const isSemTipo = group.key === 'SEM_TIPO'
                    return (
                      <React.Fragment key={group.key}>
                        {/* Linha Consolidada do Tipo de Cliente (Cabeçalho com soma de todos os valores) */}
                        <tr
                          onClick={() => toggleTipoClienteGroup(group.key)}
                          className={cn(
                            'cursor-pointer transition-colors border-y border-slate-200/80 font-semibold select-none',
                            isExpanded
                              ? 'bg-purple-50/80 hover:bg-purple-100/70 text-slate-900'
                              : isSemTipo
                                ? 'bg-slate-50/90 hover:bg-slate-100/80 text-slate-600'
                                : 'bg-purple-50/40 hover:bg-purple-100/50 text-slate-800',
                          )}
                          title={
                            isExpanded
                              ? 'Clique para recolher pedidos do tipo de cliente'
                              : 'Clique para expandir pedidos do tipo de cliente'
                          }
                        >
                          {/* Toggle */}
                          <td className="py-2.5 px-2 text-center align-middle">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                toggleTipoClienteGroup(group.key)
                              }}
                              className="p-1 rounded hover:bg-purple-200/60 text-purple-800 focus:outline-hidden transition-colors"
                            >
                              {isExpanded ? (
                                <ChevronDown className="w-4 h-4 text-purple-700" />
                              ) : (
                                <ChevronRight className="w-4 h-4 text-slate-500" />
                              )}
                            </button>
                          </td>

                          {/* 1. Tipo de Cliente no cabeçalho consolidado */}
                          <td className="p-3 whitespace-nowrap min-w-[180px]">
                            {isSemTipo ? (
                              <span className="text-slate-500 font-bold italic">Sem tipo</span>
                            ) : (
                              <div className="space-y-0.5">
                                <span className="inline-block text-xs font-black text-purple-900">
                                  {group.tipo_cliente}
                                </span>
                                <div className="text-[10px] text-purple-700/80 font-semibold">
                                  Tipo de Cliente
                                </div>
                              </div>
                            )}
                          </td>

                          {/* Resumo de Pedidos do Tipo de Cliente */}
                          <td className="p-3 font-semibold text-slate-900 whitespace-nowrap">
                            <Badge
                              variant="outline"
                              className="text-xs bg-white text-purple-800 border-purple-200 font-bold"
                            >
                              {group.totalPedidos} pedido(s) • {group.totalLinhas} lin.
                            </Badge>
                          </td>

                          {/* Data (indicação de consolidado) */}
                          <td className="p-3 text-slate-500 whitespace-nowrap text-[11px]">
                            {isExpanded ? 'Detalhamento ▼' : 'Consolidado ▲'}
                          </td>

                          {/* Coluna consolidada: Tipo de Cliente */}
                          <td className="p-3 whitespace-nowrap">
                            {renderTipoClienteBadge(isSemTipo ? undefined : group.tipo_cliente)}
                          </td>

                          {/* Clientes distintos do Tipo de Cliente */}
                          <td className="p-3 min-w-[200px]">
                            <div className="font-bold text-slate-800 text-xs">
                              {group.totalClientes} cliente(s) distinto(s)
                            </div>
                            <div className="text-[11px] text-slate-400">
                              {group.items.length} itens no tipo
                            </div>
                          </td>

                          {/* Status consolidado (alinhado com Status Linha) */}
                          <td className="p-3 text-center whitespace-nowrap">
                            <Badge
                              variant="secondary"
                              className="text-[10px] font-bold bg-purple-100 text-purple-900 border border-purple-200"
                            >
                              {isExpanded ? 'Expandido' : 'Colapsado'}
                            </Badge>
                          </td>

                          {/* Ação rápida (alinhado com Estoque / Trânsito) */}
                          <td className="p-3 text-center whitespace-nowrap text-[10px] text-slate-400 font-medium">
                            {isExpanded ? 'Recolher ▲' : 'Ver pedidos ▼'}
                          </td>

                          {/* Colunas complementares no consolidado (Status do Cadastro, Tipo de PN) */}
                          <td className="p-3 text-center text-slate-300">-</td>
                          <td className="p-3 text-center text-slate-300">-</td>

                          {/* Itens do Tipo de Cliente */}
                          <td className="p-3 text-slate-600 text-[11px]">
                            <span className="font-bold text-slate-800">
                              {group.totalLinhas} item(ns)
                            </span>
                            <span className="text-slate-400 ml-1">pendente(s)</span>
                          </td>

                          {/* SOMA Qtd Aberto */}
                          <td className="p-3 text-center whitespace-nowrap">
                            <div className="font-extrabold text-slate-900">
                              {formatNumber(group.totalQtdAberto)}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              de {formatNumber(group.totalQtdSolicitada)} solicit.
                            </div>
                          </td>

                          {/* Preço Líquido Médio */}
                          <td className="p-3 text-right text-slate-600 whitespace-nowrap font-medium text-[11px]">
                            {group.totalQtdAberto > 0
                              ? formatCurrency(group.totalValorEmAberto / group.totalQtdAberto)
                              : '-'}
                            <span className="block text-[9px] text-slate-400">preço médio</span>
                          </td>

                          {/* SOMA de todos os valores em aberto do Tipo de Cliente */}
                          <td className="p-3 text-right whitespace-nowrap font-black text-purple-950 text-sm bg-purple-100/50">
                            {formatCurrency(group.totalValorEmAberto)}
                          </td>
                        </tr>

                        {/* Linhas detalhadas quando expandido */}
                        {isExpanded &&
                          group.items.map((item) => (
                            <tr
                              key={item.id}
                              className="bg-white hover:bg-slate-50/80 transition-colors border-b border-slate-100/80"
                            >
                              <td className="py-2.5 px-2 text-center text-slate-300">
                                <span className="inline-block w-1.5 h-1.5 rounded-full bg-slate-300" />
                              </td>

                              {/* 1. Canal / Deploy (PRIMEIRA COLUNA) */}
                              <td className="p-3 whitespace-nowrap">
                                {item.nome_canal ? (
                                  <div className="space-y-0.5">
                                    <span className="inline-block text-[11px] font-bold text-[#0B6E99]">
                                      {item.nome_canal}
                                    </span>
                                    {item.deploy && (
                                      <div className="text-[10px] text-slate-500 font-medium">
                                        Deploy: {item.deploy}
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-slate-400 text-[11px] italic">—</span>
                                )}
                              </td>

                              {/* Pedido / Linha */}
                              <td className="p-3 font-semibold text-slate-900 whitespace-nowrap">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-mono text-xs text-[#0B6E99] font-bold">
                                    {item.numero_pedido}
                                  </span>
                                  <span className="text-[11px] text-slate-400">
                                    / L{item.linha}
                                  </span>
                                </div>
                              </td>

                              {/* Data */}
                              <td className="p-3 text-slate-600 whitespace-nowrap">
                                {item.data_pedido ? formatDate(item.data_pedido) : '-'}
                              </td>

                              {/* Tipo de Cliente */}
                              <td className="p-3 whitespace-nowrap">
                                {renderTipoClienteBadge(resolveClienteInfo(item).tipo_cliente)}
                              </td>

                              {/* Cliente */}
                              <td className="p-3 min-w-[200px]">
                                <div
                                  className="font-medium text-slate-800 truncate"
                                  title={item.nome_cliente}
                                >
                                  {item.nome_cliente || 'Cliente não identificado'}
                                </div>
                                {item.codigo_cliente && (
                                  <div className="text-[11px] text-slate-400 font-mono">
                                    {item.codigo_cliente}
                                  </div>
                                )}
                              </td>

                              {/* Status Linha */}
                              <td className="p-3 text-center whitespace-nowrap">
                                <Badge
                                  variant="outline"
                                  className={
                                    item.status_linha?.toLowerCase() === 'fechada'
                                      ? 'bg-slate-100 text-slate-600 border-slate-200'
                                      : 'bg-amber-50 text-amber-700 border-amber-200 font-semibold'
                                  }
                                >
                                  {item.status_linha || 'Aberta'}
                                </Badge>
                              </td>

                              {/* Estoque / Trânsito */}
                              <td className="p-3 text-center whitespace-nowrap text-[11px]">
                                <div className="flex items-center justify-center gap-2">
                                  <span
                                    className={`font-semibold ${
                                      item.em_estoque > 0 ? 'text-emerald-600' : 'text-slate-400'
                                    }`}
                                    title="Em Estoque"
                                  >
                                    Est: {formatNumber(item.em_estoque)}
                                  </span>
                                  <span className="text-slate-300">|</span>
                                  <span
                                    className={`font-semibold ${
                                      item.em_transito > 0 ? 'text-sky-600' : 'text-slate-400'
                                    }`}
                                    title="Em Trânsito"
                                  >
                                    Trân: {formatNumber(item.em_transito)}
                                  </span>
                                </div>
                                {item.deposito && (
                                  <div className="text-[10px] text-slate-400 mt-0.5">
                                    Depósito: {item.deposito}
                                  </div>
                                )}
                              </td>

                              {/* Status do Cadastro */}
                              <td className="p-3 whitespace-nowrap">
                                {renderStatusCadastroCell(resolveClienteInfo(item).status_cadastro)}
                              </td>

                              {/* Tipo de PN */}
                              <td className="p-3 whitespace-nowrap">
                                {renderTipoPnCell(resolveClienteInfo(item).tipo_pn)}
                              </td>

                              {/* Item / Descrição */}
                              <td className="p-3 min-w-[220px]">
                                <div className="font-mono text-xs font-semibold text-slate-800">
                                  {item.codigo_item || '-'}
                                </div>
                                <div
                                  className="text-[11px] text-slate-600 truncate"
                                  title={item.descricao_item}
                                >
                                  {item.descricao_item || '-'}
                                </div>
                                {item.grupo_item && (
                                  <span className="inline-block text-[10px] text-slate-400 uppercase tracking-tight mt-0.5">
                                    Grupo: {item.grupo_item}
                                  </span>
                                )}
                              </td>

                              {/* Qtd Aberto */}
                              <td className="p-3 text-center whitespace-nowrap">
                                <div className="font-bold text-slate-900">
                                  {formatNumber(item.qtd_aberto)}
                                </div>
                                <div className="text-[10px] text-slate-400">
                                  de {formatNumber(item.qtd_solicitada)} ped.
                                </div>
                              </td>

                              {/* Preço Unitário Líquido */}
                              <td className="p-3 text-right text-slate-700 whitespace-nowrap font-medium">
                                {formatCurrency(
                                  Number(item.preco_apos_desconto) ||
                                    Number(item.preco_unitario) ||
                                    0,
                                )}
                                {Number(item.desconto_percentual) > 0 && (
                                  <span className="block text-[10px] text-rose-500">
                                    -{Math.round(Number(item.desconto_percentual))}%
                                  </span>
                                )}
                              </td>

                              {/* Valor em Aberto */}
                              <td className="p-3 text-right whitespace-nowrap font-bold text-amber-700">
                                {formatCurrency(Number(item.valor_em_aberto) || 0)}
                              </td>
                            </tr>
                          ))}
                      </React.Fragment>
                    )
                  })
                ) : (
                  /* MODO DIRETO SEM AGRUPAMENTO */
                  paginatedPedidos.map((item) => (
                    <tr
                      key={item.id}
                      className="hover:bg-slate-50/80 transition-colors border-b border-slate-100/80"
                    >
                      {/* 1. Canal / Deploy (PRIMEIRA COLUNA) */}
                      <td className="p-3 whitespace-nowrap">
                        {item.nome_canal ? (
                          <div className="space-y-0.5">
                            <span className="inline-block text-[11px] font-bold text-[#0B6E99]">
                              {item.nome_canal}
                            </span>
                            {item.deploy && (
                              <div className="text-[10px] text-slate-500 font-medium">
                                Deploy: {item.deploy}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 text-[11px] italic">—</span>
                        )}
                      </td>

                      {/* Pedido / Linha */}
                      <td className="p-3 font-semibold text-slate-900 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-xs text-[#0B6E99] font-bold">
                            {item.numero_pedido}
                          </span>
                          <span className="text-[11px] text-slate-400">/ L{item.linha}</span>
                        </div>
                      </td>

                      {/* Data */}
                      <td className="p-3 text-slate-600 whitespace-nowrap">
                        {item.data_pedido ? formatDate(item.data_pedido) : '-'}
                      </td>

                      {/* Tipo de Cliente */}
                      <td className="p-3 whitespace-nowrap">
                        {renderTipoClienteBadge(resolveClienteInfo(item).tipo_cliente)}
                      </td>

                      {/* Cliente */}
                      <td className="p-3 min-w-[200px]">
                        <div
                          className="font-medium text-slate-800 truncate"
                          title={item.nome_cliente}
                        >
                          {item.nome_cliente || 'Cliente não identificado'}
                        </div>
                        {item.codigo_cliente && (
                          <div className="text-[11px] text-slate-400 font-mono">
                            {item.codigo_cliente}
                          </div>
                        )}
                      </td>

                      {/* Status Linha */}
                      <td className="p-3 text-center whitespace-nowrap">
                        <Badge
                          variant="outline"
                          className={
                            item.status_linha?.toLowerCase() === 'fechada'
                              ? 'bg-slate-100 text-slate-600 border-slate-200'
                              : 'bg-amber-50 text-amber-700 border-amber-200 font-semibold'
                          }
                        >
                          {item.status_linha || 'Aberta'}
                        </Badge>
                      </td>

                      {/* Estoque / Trânsito */}
                      <td className="p-3 text-center whitespace-nowrap text-[11px]">
                        <div className="flex items-center justify-center gap-2">
                          <span
                            className={`font-semibold ${
                              item.em_estoque > 0 ? 'text-emerald-600' : 'text-slate-400'
                            }`}
                            title="Em Estoque"
                          >
                            Est: {formatNumber(item.em_estoque)}
                          </span>
                          <span className="text-slate-300">|</span>
                          <span
                            className={`font-semibold ${
                              item.em_transito > 0 ? 'text-sky-600' : 'text-slate-400'
                            }`}
                            title="Em Trânsito"
                          >
                            Trân: {formatNumber(item.em_transito)}
                          </span>
                        </div>
                        {item.deposito && (
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            Depósito: {item.deposito}
                          </div>
                        )}
                      </td>

                      {/* Status do Cadastro */}
                      <td className="p-3 whitespace-nowrap">
                        {renderStatusCadastroCell(resolveClienteInfo(item).status_cadastro)}
                      </td>

                      {/* Tipo de PN */}
                      <td className="p-3 whitespace-nowrap">
                        {renderTipoPnCell(resolveClienteInfo(item).tipo_pn)}
                      </td>

                      {/* Item / Descrição */}
                      <td className="p-3 min-w-[220px]">
                        <div className="font-mono text-xs font-semibold text-slate-800">
                          {item.codigo_item || '-'}
                        </div>
                        <div
                          className="text-[11px] text-slate-600 truncate"
                          title={item.descricao_item}
                        >
                          {item.descricao_item || '-'}
                        </div>
                        {item.grupo_item && (
                          <span className="inline-block text-[10px] text-slate-400 uppercase tracking-tight mt-0.5">
                            Grupo: {item.grupo_item}
                          </span>
                        )}
                      </td>

                      {/* Qtd Aberto */}
                      <td className="p-3 text-center whitespace-nowrap">
                        <div className="font-bold text-slate-900">
                          {formatNumber(item.qtd_aberto)}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          de {formatNumber(item.qtd_solicitada)} ped.
                        </div>
                      </td>

                      {/* Preço Unitário Líquido */}
                      <td className="p-3 text-right text-slate-700 whitespace-nowrap font-medium">
                        {formatCurrency(
                          Number(item.preco_apos_desconto) || Number(item.preco_unitario) || 0,
                        )}
                        {Number(item.desconto_percentual) > 0 && (
                          <span className="block text-[10px] text-rose-500">
                            -{Math.round(Number(item.desconto_percentual))}%
                          </span>
                        )}
                      </td>

                      {/* Valor em Aberto */}
                      <td className="p-3 text-right whitespace-nowrap font-bold text-amber-700">
                        {formatCurrency(Number(item.valor_em_aberto) || 0)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Paginação */}
          {totalPages > 1 && (viewMode === 'none' || viewMode === 'detalhado') && (
            <div className="p-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs bg-slate-50/50">
              <div className="text-slate-500">
                Página <span className="font-bold text-slate-800">{page}</span> de{' '}
                <span className="font-bold text-slate-800">{totalPages}</span> —{' '}
                {formatNumber(totalItems)} registro(s) no total
              </div>

              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1 || loading}
                  className="h-8 text-xs gap-1"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  Anterior
                </Button>
                <span className="px-2 font-bold text-slate-700">{page}</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages || loading}
                  className="h-8 text-xs gap-1"
                >
                  Próxima
                  <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
