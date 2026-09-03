import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  DollarSign,
  TrendingUp,
  Package,
  FileText,
  ArrowRight,
  Sparkles,
  BarChart2,
  PieChart as PieChartIcon,
  RefreshCw,
  RotateCcw,
  ArrowUpDown,
  Users,
  Expand,
  MapPin,
} from 'lucide-react'
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  Legend,
  ComposedChart,
  LineChart,
  Line,
  ReferenceLine,
} from 'recharts'
import { fetchDashboardStats, fetchVendasList, type DashboardStatsResult } from '@/services/sales'
import { useRealtime } from '@/hooks/use-realtime'
import type { FilterState } from '@/types/sales'
import {
  formatCurrency,
  formatNumber,
  formatDate,
  getGrupoColor,
  MESES_CURTOS,
} from '@/lib/formatters'
import {
  saveFiltersToSession,
  loadFiltersFromSession,
  hasSavedFiltersInSession,
  buildDynamicInitialFilters,
} from '@/lib/filter-persistence'
import FilterBar from '@/components/FilterBar'
import KpiCard from '@/components/KpiCard'
import ChartCard from '@/components/ChartCard'
import { VendasPorEstadoIndicador } from '@/components/VendasPorEstadoIndicador'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useTableSort } from '@/hooks/use-table-sort'

const COLOR_BLUE = '#0B6E99'
const COLOR_CYAN = '#1895A8'
const COLOR_CYAN_DARK = '#106A82'
const COLOR_CYAN_LIGHT = '#67D2E2'

const CHART_PALETTE = [
  '#0B6E99', // Azul
  '#1895A8', // Ciano
  '#106A82', // Ciano Escuro
  '#67D2E2', // Ciano Claro
  '#084F6E', // Azul Escuro
  '#38BDF8', // Sky
  '#0284C7', // Azul Médio
  '#14B8A6', // Teal
]

// Ordem fixa dos grupos e paleta de cores
const MENSAL_GRUPOS_ORDEM = ['EQUIPAMENTOS', 'PEÇAS', 'TINTAS', 'ACESSÓRIOS'] as const

const MENSAL_GRUPO_COLORS: Record<string, string> = {
  EQUIPAMENTOS: '#0B6E99', // Azul (Barra 1)
  PEÇAS: '#1895A8', // Ciano (Barra 2)
  PECAS: '#1895A8',
  TINTAS: '#106A82', // Ciano escuro (Barra 3)
  ACESSÓRIOS: '#67D2E2', // Ciano claro (Barra 4)
  ACESSORIOS: '#67D2E2',
}

const MENSAL_GRUPO_PALETTE = [
  '#0B6E99', // Azul
  '#1895A8', // Ciano
  '#106A82', // Ciano escuro
  '#67D2E2', // Ciano claro
  '#084F6E', // Azul escuro
  '#38BDF8', // Sky
  '#0284C7', // Azul médio
  '#14B8A6', // Teal
]

const tooltipContentStyle = {
  backgroundColor: '#0F172A',
  borderRadius: '8px',
  color: '#fff',
  fontSize: '12px',
  border: '1px solid #334155',
}

const currencyFormatter =
  (label = 'Total') =>
  (val: number | string | undefined) =>
    [formatCurrency(typeof val === 'number' ? val : Number(val)), label] as [string, string]

/** Formata "yyyy-mm" (ex: "2025-06") como "Jun/25". */
const formatMesAnoCurto = (ym: string) => {
  if (!ym) return ''
  const p = ym.split('-')
  if (p.length < 2) return ym
  const mo = parseInt(p[1], 10)
  if (isNaN(mo) || mo < 1 || mo > 12) return ym
  return MESES_CURTOS[mo - 1] + '/' + p[0].slice(2)
}

/** Tooltip customizado do gráfico "Venda Mensal por Grupo do Item":
 *  mostra o mês, o grupo (com cor) e o valor em R$. */
interface MensalGrupoTooltipProps {
  active?: boolean
  payload?: Array<{ name?: string; value?: number | string; color?: string }>
  label?: string | number
}

function MensalGrupoTooltip({ active, payload, label }: MensalGrupoTooltipProps) {
  if (!active || !payload || payload.length === 0) return null
  return (
    <div className="rounded-lg bg-slate-900 px-3 py-2 text-xs text-white border border-slate-700">
      <div className="font-bold mb-1 text-slate-200">{formatMesAnoCurto(String(label ?? ''))}</div>
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2">
          <span
            className="inline-block w-2.5 h-2.5 rounded-sm"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-slate-300">{entry.name}</span>
          <span className="font-bold ml-auto text-white">
            {formatCurrency(typeof entry.value === 'number' ? entry.value : Number(entry.value))}
          </span>
        </div>
      ))}
    </div>
  )
}

type DashboardSortField =
  | 'data_lancamento'
  | 'nome_cliente'
  | 'vendedor_cliente'
  | 'codigo_item'
  | 'grupo_item'
  | 'quantidade'
  | 'total_linha'

export default function Index() {
  const [data, setData] = useState<DashboardStatsResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [recentSalesList, setRecentSalesList] = useState<
    Array<{
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
  >([])
  const [recentSalesLoading, setRecentSalesLoading] = useState(false)

  // Ordenação server-side por clique nos cabeçalhos da tabela "Vendas Recentes".
  const sort = useTableSort<DashboardSortField>()

  const hadSavedFiltersAtMount = useRef(hasSavedFiltersInSession())
  const [filters, setFilters] = useState<FilterState>(() => loadFiltersFromSession())
  const [initializedFromBase, setInitializedFromBase] = useState(() => hasSavedFiltersInSession())
  const [mapExpanded, setMapExpanded] = useState(false)

  // Persistir filtros no sessionStorage sempre que mudarem, mas APENAS após a inicialização
  // dinâmica ser concluída (se for o primeiro acesso sem filtros salvos), ou se já havia filtros salvos na montagem.
  // Isso impede que filtros estáticos parciais sejam gravados precocemente antes de obter as opções da base.
  useEffect(() => {
    if (hadSavedFiltersAtMount.current || initializedFromBase) {
      saveFiltersToSession(filters)
    }
  }, [filters, initializedFromBase])

  // Ref para controle de requisições em voo e garantia de que apenas a mais recente atualize o estado
  const requestSeqRef = useRef<number>(0)
  const abortControllerRef = useRef<AbortController | null>(null)

  // Load aggregated dashboard stats from server
  const loadData = async (activeFilters = filters) => {
    const seq = ++requestSeqRef.current

    // Cancela requisição anterior em voo para economizar recursos e evitar race conditions
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    const currentController = new AbortController()
    abortControllerRef.current = currentController

    console.info(`[Dashboard:loadData #${seq}] Chamada iniciada. Filtros:`, {
      ano: activeFilters.ano,
      mes: activeFilters.mes,
      tipoDocumento: activeFilters.tipoDocumento,
      grupoItem: activeFilters.grupoItem,
      utilizacao: activeFilters.utilizacao,
      base: activeFilters.base,
    })

    setLoading(true)
    setError(null)

    try {
      const res = await fetchDashboardStats(activeFilters as unknown as Record<string, unknown>, {
        signal: currentController.signal,
      })

      // Se outra requisição foi disparada depois desta, descarta esta resposta obsoleta
      if (seq !== requestSeqRef.current) {
        console.warn(
          `[Dashboard:loadData #${seq}] Resposta descartada por obsolescência (requisição ativa: #${requestSeqRef.current}).`,
        )
        return
      }

      console.info(`[Dashboard:loadData #${seq}] Resposta recebida com sucesso.`, {
        faturamento: res?.kpis?.faturamento,
        documentos: res?.kpis?.documentos,
        recentSalesCount: res?.recentSales?.length ?? 0,
        tendenciaEquipamentosCount:
          res?.charts?.vendasEquipamentosHistorico?.length ||
          res?.charts?.vendasEquipamentosPorAno?.length ||
          0,
        filterOptionsAnos: res?.filterOptions?.anos,
      })

      // Se for o primeiro acesso (sem filtros salvos na sessão) e ainda não inicializou
      // dinamicamente com base nas opções da base consolidada:
      // Apenas define setFilters(dynamicFilters) e deixa o useEffect([filters]) disparar a busca única!
      // NÃO fazer fetchDashboardStats síncrono aqui para evitar race condition.
      if (!hadSavedFiltersAtMount.current && !initializedFromBase && res?.filterOptions) {
        const dynamicFilters = buildDynamicInitialFilters(res.filterOptions)
        console.info(
          `[Dashboard:loadData #${seq}] Inicialização dinâmica configurando novos filtros:`,
          dynamicFilters,
        )
        setInitializedFromBase(true)
        saveFiltersToSession(dynamicFilters)
        setFilters(dynamicFilters)
        // O useEffect([filters]) será disparado pelo setFilters.
        // O loading continua true até a busca dos novos filtros concluir.
        return
      }

      setData(res)
      if (!sort.field) {
        setRecentSalesList(res?.recentSales || [])
      }
      setLoading(false)
    } catch (err: unknown) {
      // Se foi abortada porque uma nova requisição entrou na frente, ignora silenciosamente
      if ((err as Error)?.name === 'AbortError' || String(err).includes('aborted')) {
        console.info(`[Dashboard:loadData #${seq}] Requisição cancelada por nova ação.`)
        return
      }

      // Se a resposta pertence a uma chamada antiga que falhou, ignora
      if (seq !== requestSeqRef.current) {
        console.warn(
          `[Dashboard:loadData #${seq}] Erro ignorado pois uma chamada mais recente (#${requestSeqRef.current}) está em andamento.`,
        )
        return
      }

      console.error(`[Dashboard:loadData #${seq}] Erro ao buscar estatísticas do dashboard:`, err)
      setError(err instanceof Error ? err.message : 'Falha ao carregar dados do painel.')
      setLoading(false)
    }
  }

  // Se houver ordenação ativa pelo usuário, busca as 8 primeiras ordenadas server-side
  const loadRecentSalesWithSort = async (
    activeFilters = filters,
    field = sort.field,
    dir = sort.dir,
  ) => {
    if (!field) {
      if (data?.recentSales) {
        setRecentSalesList(data.recentSales)
      }
      return
    }
    setRecentSalesLoading(true)
    try {
      const res = await fetchVendasList({
        page: 1,
        perPage: 8,
        sortField: field,
        sortDirection: dir,
        filters: activeFilters as unknown as Record<string, unknown>,
      })
      setRecentSalesList(
        (res.items || []).map((item) => ({
          id: item.id,
          data_lancamento: item.data_lancamento,
          nome_cliente: item.nome_cliente,
          vendedor_cliente: item.vendedor_cliente,
          codigo_item: item.codigo_item,
          descricao_item: item.descricao_item,
          grupo_item: item.grupo_item,
          quantidade: item.quantidade,
          total_linha: item.total_linha,
        })),
      )
    } catch (err) {
      console.error('Erro ao carregar vendas recentes ordenadas:', err)
    } finally {
      setRecentSalesLoading(false)
    }
  }

  useEffect(() => {
    loadData(filters)
    return () => {
      // Aborta requisições pendentes ao desmontar
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [filters])

  useEffect(() => {
    if (sort.field) {
      loadRecentSalesWithSort(filters, sort.field, sort.dir)
    } else if (data?.recentSales) {
      setRecentSalesList(data.recentSales)
    }
  }, [sort.field, sort.dir, filters])

  // Realtime subscription for sales updates
  useRealtime('vendas', () => {
    loadData()
  })

  const filterOptions = useMemo(() => {
    if (!data?.filterOptions) {
      return {
        vendedorCliente: [],
        vendedor: [],
        grupoItem: [],
        estado: [],
        utilizacao: [],
        tipoDocumento: [],
        anos: [],
        meses: [],
        dias: [],
      }
    }
    return data.filterOptions
  }, [data])

  const kpis = useMemo(() => {
    return {
      faturamento: data?.kpis?.faturamento || 0,
      valorLiquido: data?.kpis?.valorLiquido || 0,
      itensVendidos: data?.kpis?.itensVendidos || 0,
      documentos: data?.kpis?.documentos || 0,
      devolucoes: data?.kpis?.devolucoes || 0,
    }
  }, [data])

  const chartVendasPorMes = data?.charts?.vendasPorMes || []
  const chartVendasPorAno = data?.charts?.vendasPorAno || []
  const chartGrupoItem = data?.charts?.grupoItem || []
  const chartTopVendedores = data?.charts?.topVendedores || []
  const chartTopClientes = data?.charts?.topClientes || []
  const chartEstado = data?.charts?.estado || []
  const revendasFaturamento = data?.charts?.revendasFaturamento
  const chartVendasPorGrupoItemMensal = data?.charts?.vendasPorGrupoItemMensal || []
  const chartVendasEquipamentosRaw =
    data?.charts?.vendasEquipamentosHistorico || data?.charts?.vendasEquipamentosPorAno || []
  const chartVendasInsumosRaw =
    data?.charts?.vendasInsumosHistorico || data?.charts?.vendasInsumosPorAno || []
  const chartClientesAtivosEquipamentos = data?.charts?.clientesAtivosEquipamentos || []
  const chartClientesAtivosInsumos = data?.charts?.clientesAtivosInsumos || []
  const recentSales =
    recentSalesList.length > 0 || sort.field ? recentSalesList : data?.recentSales || []

  // Normalização para série temporal contínua de Equipamentos (linha única)
  const dataTendenciaEquipamentos = useMemo(() => {
    if (!Array.isArray(chartVendasEquipamentosRaw) || chartVendasEquipamentosRaw.length === 0)
      return []

    if ('periodo' in chartVendasEquipamentosRaw[0]) {
      return (chartVendasEquipamentosRaw as { periodo: string; total: number }[]).map((item) => ({
        periodo: item.periodo,
        label: formatMesAnoCurto(item.periodo),
        total: item.total,
      }))
    }

    const list: { periodo: string; label: string; total: number }[] = []
    for (const item of chartVendasEquipamentosRaw as unknown as {
      ano: string
      valores: { mes: number; total: number }[]
    }[]) {
      for (const v of item.valores || []) {
        const p = `${item.ano}-${String(v.mes).padStart(2, '0')}`
        list.push({
          periodo: p,
          label: formatMesAnoCurto(p),
          total: v.total,
        })
      }
    }
    return list.sort((a, b) => a.periodo.localeCompare(b.periodo))
  }, [chartVendasEquipamentosRaw])

  // Normalização para série temporal contínua de Insumos (linha única)
  const dataAcumuladoInsumos = useMemo(() => {
    if (!Array.isArray(chartVendasInsumosRaw) || chartVendasInsumosRaw.length === 0) return []

    if ('periodo' in chartVendasInsumosRaw[0]) {
      return (chartVendasInsumosRaw as { periodo: string; total: number }[]).map((item) => ({
        periodo: item.periodo,
        label: formatMesAnoCurto(item.periodo),
        total: item.total,
      }))
    }

    const list: { periodo: string; label: string; total: number }[] = []
    for (const item of chartVendasInsumosRaw as unknown as {
      ano: string
      valores: { mes: number; total: number }[]
    }[]) {
      for (const v of item.valores || []) {
        const p = `${item.ano}-${String(v.mes).padStart(2, '0')}`
        list.push({
          periodo: p,
          label: formatMesAnoCurto(p),
          total: v.total,
        })
      }
    }
    return list.sort((a, b) => a.periodo.localeCompare(b.periodo))
  }, [chartVendasInsumosRaw])

  const mensalGrupos = useMemo(() => {
    const backendGrupos = new Set<string>()
    for (const m of chartVendasPorGrupoItemMensal) {
      for (const g of m.grupos) {
        if (g.grupo) backendGrupos.add(g.grupo)
      }
    }

    const matchFixedGroup = (grupoName: string): string | null => {
      const upper = (grupoName || '').toUpperCase().trim()
      if (upper === 'EQUIPAMENTOS') return 'EQUIPAMENTOS'
      if (upper === 'PEÇAS' || upper === 'PECAS') return 'PEÇAS'
      if (upper === 'TINTAS') return 'TINTAS'
      if (upper === 'ACESSÓRIOS' || upper === 'ACESSORIOS') return 'ACESSÓRIOS'
      return null
    }

    const list: string[] = [...MENSAL_GRUPOS_ORDEM]
    for (const bg of backendGrupos) {
      const fixed = matchFixedGroup(bg)
      if (!fixed && !list.includes(bg)) {
        list.push(bg)
      }
    }
    return list
  }, [chartVendasPorGrupoItemMensal])

  const mensalGrupoData = useMemo(() => {
    return chartVendasPorGrupoItemMensal.map((m) => {
      const row: Record<string, number | string> = { mes: m.mes }
      for (const g of MENSAL_GRUPOS_ORDEM) {
        row[g] = 0
      }
      for (const g of m.grupos) {
        const upper = (g.grupo || '').toUpperCase().trim()
        if (upper === 'PEÇAS' || upper === 'PECAS') {
          row['PEÇAS'] = (Number(row['PEÇAS']) || 0) + g.total
        } else if (upper === 'ACESSÓRIOS' || upper === 'ACESSORIOS') {
          row['ACESSÓRIOS'] = (Number(row['ACESSÓRIOS']) || 0) + g.total
        } else if (upper === 'EQUIPAMENTOS') {
          row['EQUIPAMENTOS'] = (Number(row['EQUIPAMENTOS']) || 0) + g.total
        } else if (upper === 'TINTAS') {
          row['TINTAS'] = (Number(row['TINTAS']) || 0) + g.total
        } else {
          row[g.grupo] = g.total
        }
      }
      return row
    })
  }, [chartVendasPorGrupoItemMensal])

  const recentSalesColumns: { key: DashboardSortField; label: string; className?: string }[] = [
    { key: 'data_lancamento', label: 'Data' },
    { key: 'nome_cliente', label: 'Cliente' },
    { key: 'vendedor_cliente', label: 'Vendedor > Cliente' },
    { key: 'codigo_item', label: 'Item' },
    { key: 'grupo_item', label: 'Grupo' },
    { key: 'quantidade', label: 'Qtd', className: 'text-center' },
    { key: 'total_linha', label: 'Total Linha', className: 'text-right' },
  ]

  const isNoData =
    !data || (kpis.faturamento === 0 && kpis.documentos === 0 && recentSales.length === 0)

  // Função para limpar todos os filtros ativos e recarregar
  const handleClearFilters = () => {
    const cleared: FilterState = {
      base: 'ambos',
      dataDe: '',
      dataAte: '',
      vendedorCliente: [],
      vendedor: [],
      grupoItem: [],
      estado: [],
      utilizacao: [],
      tipoDocumento: [],
      search: '',
      ano: [],
      mes: [],
      dia: [],
      tipoDevolucao: '',
    }
    setFilters(cleared)
  }

  return (
    <div className="space-y-6">
      {/* Filters Bar */}
      <FilterBar
        filters={filters}
        setFilters={setFilters}
        options={filterOptions}
        onApplyFilters={(applied) => loadData(applied)}
      />

      {/* Loading Skeleton */}
      {loading ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Skeleton className="h-80 w-full rounded-xl" />
            <Skeleton className="h-80 w-full rounded-xl" />
            <Skeleton className="h-80 w-full rounded-xl" />
            <Skeleton className="h-80 w-full rounded-xl" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-32 w-full rounded-xl" />
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Skeleton className="h-80 w-full rounded-xl" />
            <Skeleton className="h-80 w-full rounded-xl" />
          </div>
        </div>
      ) : error ? (
        /* Error State */
        <Card className="rounded-xl border border-red-200 p-12 text-center bg-red-50/40">
          <div className="w-16 h-16 mx-auto rounded-full bg-red-100 flex items-center justify-center text-red-600 mb-4">
            <RotateCcw className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-extrabold text-slate-900">Erro ao carregar os dados</h3>
          <p className="text-sm text-slate-600 max-w-md mx-auto mt-1 mb-6 font-medium">
            {error || 'Não foi possível conectar ao servidor para obter os indicadores do painel.'}
          </p>
          <div className="flex items-center justify-center gap-3">
            <Button
              onClick={() => loadData(filters)}
              className="bg-[#0B6E99] hover:bg-[#084F6E] text-white font-bold"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Tentar Novamente
            </Button>
          </div>
        </Card>
      ) : (
        <>
          {/* Alerta inteligente de Empty State quando os filtros ativos não retornam vendas */}
          {isNoData && (
            <Card className="rounded-xl border border-amber-200 bg-amber-50/60 p-6 shadow-xs">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-extrabold text-slate-900">
                      Nenhuma venda encontrada para os filtros selecionados
                    </h4>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Os indicadores e rankings abaixo estão zerados para o recorte atual. Os
                      gráficos históricos globais de tendência continuam visíveis.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    onClick={handleClearFilters}
                    className="bg-[#0B6E99] hover:bg-[#084F6E] text-white font-bold text-xs h-9 px-4 shadow-sm"
                  >
                    <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                    Limpar Filtros
                  </Button>
                  <Button
                    asChild
                    variant="outline"
                    className="border-slate-300 bg-white text-slate-700 hover:bg-slate-50 font-bold text-xs h-9 px-4"
                  >
                    <Link to="/importar">Importar Dados</Link>
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {/* PRIMEIRO INDICADOR DO DASHBOARD: Vendas por Estado (UF) e Região com Mapa do Brasil e Revendas */}
          <Card className="group relative rounded-xl border border-gray-200 bg-white shadow-xs transition-all duration-200 hover:border-slate-300">
            <CardHeader className="pb-3 border-b border-gray-100">
              <div className="flex items-start sm:items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-[#0B6E99]" />
                      Vendas por Estado (UF) &amp; Região
                    </CardTitle>
                    {filters.estado.length > 0 && (
                      <Badge
                        variant="outline"
                        className="border-cyan-200 bg-cyan-50 text-[#0B6E99] text-xs font-bold"
                      >
                        Filtro ativo: {filters.estado.join(', ')}
                      </Badge>
                    )}
                  </div>
                  <CardDescription className="text-xs text-slate-500 font-medium mt-1">
                    Distribuição geográfica, ranking regional e mapa térmico com pinos das revendas
                    autorizadas Roland DG
                  </CardDescription>
                </div>
                <button
                  type="button"
                  onClick={() => setMapExpanded(true)}
                  aria-label="Expandir Vendas por Estado (UF) & Região"
                  title="Expandir em tela cheia"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-[#0B6E99] hover:bg-cyan-50 transition-colors opacity-80 sm:opacity-0 group-hover:opacity-100 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-[#0B6E99]/40 shrink-0"
                >
                  <Expand className="w-4 h-4" />
                </button>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              <VendasPorEstadoIndicador
                data={chartEstado}
                selectedUf={filters.estado.length === 1 ? filters.estado[0] : null}
                onSelectUf={(uf) => {
                  setFilters((prev) => ({
                    ...prev,
                    estado: uf ? [uf] : [],
                  }))
                }}
                revendasFaturamento={revendasFaturamento}
              />
            </CardContent>
          </Card>

          {/* Modal de Expansão em Tela Cheia do Mapa do Brasil & Regiões */}
          <Dialog open={mapExpanded} onOpenChange={setMapExpanded}>
            <DialogContent className="max-w-none w-[96vw] sm:w-[94vw] h-[92vh] sm:rounded-2xl border border-gray-200 bg-white p-0 flex flex-col overflow-hidden shadow-2xl">
              <DialogTitle className="sr-only">Vendas por Estado (UF) &amp; Região</DialogTitle>
              <div className="flex items-center justify-between gap-3 px-6 pt-5 pb-4 border-b border-slate-100 bg-white">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-cyan-50 text-[#0B6E99] shrink-0">
                    <MapPin className="w-5 h-5 text-[#0B6E99]" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <CardTitle className="text-lg font-extrabold text-slate-900 tracking-tight">
                        Vendas por Estado (UF) &amp; Região
                      </CardTitle>
                      {filters.estado.length > 0 && (
                        <Badge
                          variant="outline"
                          className="border-cyan-200 bg-cyan-50 text-[#0B6E99] text-xs font-bold"
                        >
                          Filtro ativo: {filters.estado.join(', ')}
                        </Badge>
                      )}
                    </div>
                    <CardDescription className="text-xs sm:text-sm text-slate-500 mt-0.5">
                      Distribuição geográfica, ranking regional e mapa térmico com pinos das
                      revendas autorizadas Roland DG
                    </CardDescription>
                  </div>
                </div>
              </div>
              <div className="flex-1 min-h-0 w-full p-4 sm:p-6 overflow-y-auto">
                <VendasPorEstadoIndicador
                  data={chartEstado}
                  selectedUf={filters.estado.length === 1 ? filters.estado[0] : null}
                  onSelectUf={(uf) => {
                    setFilters((prev) => ({
                      ...prev,
                      estado: uf ? [uf] : [],
                    }))
                  }}
                  revendasFaturamento={revendasFaturamento}
                  isExpanded={true}
                />
              </div>
            </DialogContent>
          </Dialog>

          {/* 4 Novos Gráficos com paleta Azul e Ciano (Tendência Equipamentos, Acumulado Insumos, Clientes Ativos) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Gráfico 1: Tendência de Vendas — Equipamentos (Linha Única Contínua Azul) */}
            <ChartCard
              title="Tendência de Vendas — Equipamentos"
              description="Evolução histórica contínua de vendas de Equipamentos"
              icon={TrendingUp}
              iconColor="text-[#0B6E99]"
            >
              {dataTendenciaEquipamentos.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs text-slate-400">
                  Nenhum dado disponível
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={dataTendenciaEquipamentos}
                    margin={{ top: 10, right: 20, left: 10, bottom: 20 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                    <XAxis
                      dataKey="periodo"
                      tickLine={false}
                      axisLine={{ stroke: '#E2E8F0' }}
                      tick={{ fill: '#64748B', fontSize: 11 }}
                      tickFormatter={(val) => formatMesAnoCurto(String(val))}
                      interval="preserveStartEnd"
                      minTickGap={28}
                      angle={-35}
                      textAnchor="end"
                      height={40}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: '#64748B', fontSize: 11 }}
                      tickFormatter={(val) => `R$ ${(val / 1000).toFixed(0)}k`}
                    />
                    <Tooltip
                      formatter={(val: number | string | undefined) => [
                        formatCurrency(typeof val === 'number' ? val : Number(val)),
                        'Vendas Equipamentos',
                      ]}
                      labelFormatter={(label) => `Período: ${formatMesAnoCurto(String(label))}`}
                      contentStyle={tooltipContentStyle}
                    />
                    <Line
                      type="monotone"
                      dataKey="total"
                      name="Equipamentos"
                      stroke={COLOR_BLUE}
                      strokeWidth={2.5}
                      dot={{ r: 2.5, fill: COLOR_BLUE }}
                      activeDot={{ r: 5, fill: COLOR_BLUE, stroke: '#FFFFFF', strokeWidth: 2 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            {/* Gráfico 2: Acumulado de Vendas — Insumos (Linha Única Contínua Ciano) */}
            <ChartCard
              title="Acumulado de Vendas — Insumos"
              description="Evolução histórica contínua de Peças, Tintas e Acessórios"
              icon={TrendingUp}
              iconColor="text-[#1895A8]"
            >
              {dataAcumuladoInsumos.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs text-slate-400">
                  Nenhum dado disponível
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={dataAcumuladoInsumos}
                    margin={{ top: 10, right: 20, left: 10, bottom: 20 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                    <XAxis
                      dataKey="periodo"
                      tickLine={false}
                      axisLine={{ stroke: '#E2E8F0' }}
                      tick={{ fill: '#64748B', fontSize: 11 }}
                      tickFormatter={(val) => formatMesAnoCurto(String(val))}
                      interval="preserveStartEnd"
                      minTickGap={28}
                      angle={-35}
                      textAnchor="end"
                      height={40}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: '#64748B', fontSize: 11 }}
                      tickFormatter={(val) => `R$ ${(val / 1000).toFixed(0)}k`}
                    />
                    <Tooltip
                      formatter={(val: number | string | undefined) => [
                        formatCurrency(typeof val === 'number' ? val : Number(val)),
                        'Vendas Insumos',
                      ]}
                      labelFormatter={(label) => `Período: ${formatMesAnoCurto(String(label))}`}
                      contentStyle={tooltipContentStyle}
                    />
                    <Line
                      type="monotone"
                      dataKey="total"
                      name="Insumos"
                      stroke={COLOR_CYAN_DARK}
                      strokeWidth={2.5}
                      dot={{ r: 2.5, fill: COLOR_CYAN_DARK }}
                      activeDot={{ r: 5, fill: COLOR_CYAN_DARK, stroke: '#FFFFFF', strokeWidth: 2 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            {/* Gráfico 3: Clientes Ativos — Equipamentos (Barras lado a lado) */}
            <ChartCard
              title="Clientes Ativos — Equipamentos"
              description="Comparativo de clientes ativos de equipamentos nos últimos 6 meses vs. ano anterior"
              icon={Users}
              iconColor="text-[#0B6E99]"
            >
              {chartClientesAtivosEquipamentos.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs text-slate-400">
                  Nenhum dado disponível
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartClientesAtivosEquipamentos}
                    margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                    <XAxis
                      dataKey="mes"
                      tickLine={false}
                      axisLine={{ stroke: '#E2E8F0' }}
                      tick={{ fill: '#64748B', fontSize: 12 }}
                      tickFormatter={(val) => formatMesAnoCurto(String(val))}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: '#64748B', fontSize: 11 }}
                      allowDecimals={false}
                    />
                    <Tooltip
                      formatter={(val: number | string | undefined, name: string) => {
                        const n = typeof val === 'number' ? val : Number(val)
                        return [formatNumber(n), name]
                      }}
                      labelFormatter={(label) => formatMesAnoCurto(String(label))}
                      contentStyle={tooltipContentStyle}
                    />
                    <Legend
                      verticalAlign="top"
                      height={36}
                      formatter={(value) => (
                        <span className="text-xs font-bold text-slate-700">{value}</span>
                      )}
                    />
                    <Bar
                      dataKey="clientesAnoAnterior"
                      name="Ano Anterior"
                      fill="#67D2E2"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={32}
                    />
                    <Bar
                      dataKey="clientes"
                      name="Atual"
                      fill={COLOR_BLUE}
                      radius={[4, 4, 0, 0]}
                      maxBarSize={32}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            {/* Gráfico 4: Clientes Ativos — Insumos (Barras lado a lado) */}
            <ChartCard
              title="Clientes Ativos — Insumos"
              description="Comparativo de clientes ativos de insumos nos últimos 6 meses vs. ano anterior"
              icon={Users}
              iconColor="text-[#1895A8]"
            >
              {chartClientesAtivosInsumos.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs text-slate-400">
                  Nenhum dado disponível
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartClientesAtivosInsumos}
                    margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                    <XAxis
                      dataKey="mes"
                      tickLine={false}
                      axisLine={{ stroke: '#E2E8F0' }}
                      tick={{ fill: '#64748B', fontSize: 12 }}
                      tickFormatter={(val) => formatMesAnoCurto(String(val))}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: '#64748B', fontSize: 11 }}
                      allowDecimals={false}
                    />
                    <Tooltip
                      formatter={(val: number | string | undefined, name: string) => {
                        const n = typeof val === 'number' ? val : Number(val)
                        return [formatNumber(n), name]
                      }}
                      labelFormatter={(label) => formatMesAnoCurto(String(label))}
                      contentStyle={tooltipContentStyle}
                    />
                    <Legend
                      verticalAlign="top"
                      height={36}
                      formatter={(value) => (
                        <span className="text-xs font-bold text-slate-700">{value}</span>
                      )}
                    />
                    <Bar
                      dataKey="clientesAnoAnterior"
                      name="Ano Anterior"
                      fill="#67D2E2"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={32}
                    />
                    <Bar
                      dataKey="clientes"
                      name="Atual"
                      fill={COLOR_CYAN}
                      radius={[4, 4, 0, 0]}
                      maxBarSize={32}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
          </div>

          {/* 5 KPIs Section */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
            <KpiCard
              title="Faturamento Total"
              value={kpis.faturamento}
              isCurrency
              icon={DollarSign}
              iconBgColor="bg-cyan-50"
              iconColor="text-[#0B6E99]"
              deltaPercent={12.4}
            />
            <KpiCard
              title="Valor Líquido"
              value={kpis.valorLiquido}
              isCurrency
              icon={TrendingUp}
              iconBgColor="bg-teal-50"
              iconColor="text-teal-600"
              deltaPercent={8.7}
            />
            <KpiCard
              title="Itens Vendidos"
              value={kpis.itensVendidos}
              decimals={0}
              icon={Package}
              iconBgColor="bg-cyan-50"
              iconColor="text-cyan-600"
              deltaPercent={-2.3}
            />{' '}
            <KpiCard
              title="Documentos (NFe)"
              value={kpis.documentos}
              decimals={0}
              icon={FileText}
              iconBgColor="bg-slate-100"
              iconColor="text-slate-700"
              deltaPercent={4.1}
            />
            <KpiCard
              title="Devoluções"
              value={kpis.devolucoes}
              isCurrency
              icon={RotateCcw}
              iconBgColor="bg-rose-50"
              iconColor="text-rose-600"
            />
          </div>

          {/* Charts Grid Row 1 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Chart 1: Vendas por Mês (últimos 6 meses) */}
            <ChartCard
              title="Evolução de Vendas por Mês"
              description="Últimos 6 meses com comparação do mesmo mês no ano anterior"
              icon={BarChart2}
              iconColor="text-[#0B6E99]"
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartVendasPorMes}
                  margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                  <XAxis
                    dataKey="mes"
                    tickLine={false}
                    axisLine={{ stroke: '#E2E8F0' }}
                    tick={{ fill: '#64748B', fontSize: 12 }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: '#64748B', fontSize: 11 }}
                    tickFormatter={(val) => `R$ ${(val / 1000).toFixed(0)}k`}
                  />
                  <Tooltip
                    formatter={(val: number | string | undefined, name: string) => {
                      const n = typeof val === 'number' ? val : Number(val)
                      if (name === 'faturamento') return [formatCurrency(n), 'Faturamento (atual)']
                      if (name === 'faturamento_ano_anterior')
                        return [formatCurrency(n), 'Faturamento (ano anterior)']
                      if (name === 'devolucoes') return [formatCurrency(n), 'Devoluções']
                      return [formatCurrency(n), name]
                    }}
                    contentStyle={tooltipContentStyle}
                  />
                  <Legend
                    verticalAlign="top"
                    height={36}
                    formatter={(value) => {
                      const labels: Record<string, string> = {
                        faturamento: 'Faturamento (atual)',
                        faturamento_ano_anterior: 'Faturamento (ano anterior)',
                        devolucoes: 'Devoluções',
                      }
                      return (
                        <span className="text-xs font-bold text-slate-700">
                          {labels[value] ?? value}
                        </span>
                      )
                    }}
                  />
                  <Bar
                    dataKey="faturamento_ano_anterior"
                    name="faturamento_ano_anterior"
                    fill="#67D2E2"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={28}
                  />
                  <Bar
                    dataKey="faturamento"
                    name="faturamento"
                    fill={COLOR_BLUE}
                    radius={[4, 4, 0, 0]}
                    maxBarSize={28}
                  />
                  <Bar
                    dataKey="devolucoes"
                    name="devolucoes"
                    fill="#EF4444"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={28}
                  />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* Chart 1.5: Evolução de Vendas por Ano */}
            <ChartCard
              title="Evolução de Vendas por Ano"
              description="Faturamento total por ano e variação percentual em relação ao ano anterior"
              icon={TrendingUp}
              iconColor="text-emerald-600"
            >
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={chartVendasPorAno}
                  margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                  <XAxis
                    dataKey="ano"
                    tickLine={false}
                    axisLine={{ stroke: '#E2E8F0' }}
                    tick={{ fill: '#64748B', fontSize: 12 }}
                  />
                  <YAxis
                    yAxisId="left"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: '#64748B', fontSize: 11 }}
                    tickFormatter={(val) => `R$ ${(val / 1000).toFixed(0)}k`}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: '#64748B', fontSize: 11 }}
                    tickFormatter={(val) => `${val.toFixed(0)}%`}
                  />
                  <Tooltip
                    formatter={(val: number | string | undefined, name: string) => {
                      const n = typeof val === 'number' ? val : Number(val)
                      if (name === 'variacao') {
                        return [`${n >= 0 ? '+' : ''}${n.toFixed(1)}%`, 'Variação vs. ano anterior']
                      }
                      if (name === 'devolucoes') {
                        return [formatCurrency(n), 'Devoluções']
                      }
                      return [formatCurrency(n), 'Faturamento']
                    }}
                    contentStyle={tooltipContentStyle}
                  />
                  <Legend
                    verticalAlign="top"
                    height={36}
                    formatter={(value) => {
                      const labels: Record<string, string> = {
                        faturamento: 'Faturamento',
                        devolucoes: 'Devoluções',
                        variacao: 'Variação %',
                      }
                      return (
                        <span className="text-xs font-bold text-slate-700">
                          {labels[value] ?? value}
                        </span>
                      )
                    }}
                  />
                  <ReferenceLine yAxisId="right" y={0} stroke="#CBD5E1" strokeDasharray="3 3" />
                  <Bar
                    yAxisId="left"
                    dataKey="faturamento"
                    name="faturamento"
                    fill={COLOR_BLUE}
                    radius={[4, 4, 0, 0]}
                    maxBarSize={56}
                  />
                  <Bar
                    yAxisId="left"
                    dataKey="devolucoes"
                    name="devolucoes"
                    fill="#EF4444"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={56}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="variacao"
                    name="variacao"
                    stroke="#1895A8"
                    strokeWidth={2.5}
                    dot={{ r: 4, fill: '#1895A8' }}
                    activeDot={{ r: 5 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* Chart 2: Vendas por Grupo do Item */}
            <ChartCard
              title="Vendas por Grupo do Item"
              description="Distribuição do faturamento por categoria de produto"
              icon={PieChartIcon}
              iconColor="text-teal-600"
            >
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartGrupoItem}
                    cx="50%"
                    cy="50%"
                    innerRadius={65}
                    outerRadius={95}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {chartGrupoItem.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={
                          getGrupoColor(entry.name) || CHART_PALETTE[index % CHART_PALETTE.length]
                        }
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={currencyFormatter('Total')}
                    contentStyle={tooltipContentStyle}
                  />
                  <Legend
                    verticalAlign="bottom"
                    height={36}
                    formatter={(value) => (
                      <span className="text-xs font-bold text-slate-700">{value}</span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* Chart 2.5: Venda Mensal por Grupo do Item (últimos 6 meses) */}
            <ChartCard
              title="Venda Mensal por Grupo do Item"
              description="Faturamento por grupo de item nos últimos 6 meses"
              icon={BarChart2}
              iconColor="text-[#0B6E99]"
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={mensalGrupoData}
                  margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                  <XAxis
                    dataKey="mes"
                    tickLine={false}
                    axisLine={{ stroke: '#E2E8F0' }}
                    tick={{ fill: '#64748B', fontSize: 12 }}
                    tickFormatter={(val) => formatMesAnoCurto(String(val))}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: '#64748B', fontSize: 11 }}
                    tickFormatter={(val) => `R$ ${(val / 1000).toFixed(0)}k`}
                  />
                  <Tooltip
                    content={<MensalGrupoTooltip />}
                    cursor={{ fill: 'rgba(11,110,153,0.08)' }}
                  />
                  <Legend
                    verticalAlign="top"
                    height={36}
                    content={() => (
                      <div className="flex flex-wrap items-center justify-center gap-4 pb-3">
                        {mensalGrupos.map((grupo, i) => {
                          const color =
                            MENSAL_GRUPO_COLORS[grupo] ||
                            MENSAL_GRUPO_PALETTE[i % MENSAL_GRUPO_PALETTE.length]
                          return (
                            <div key={grupo} className="flex items-center gap-1.5">
                              <span
                                className="inline-block w-3 h-3 rounded-[2px]"
                                style={{ backgroundColor: color }}
                              />
                              <span className="text-xs font-bold text-slate-700">{grupo}</span>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  />
                  {mensalGrupos.map((grupo, index) => (
                    <Bar
                      key={grupo}
                      dataKey={grupo}
                      name={grupo}
                      fill={
                        MENSAL_GRUPO_COLORS[grupo] ||
                        MENSAL_GRUPO_PALETTE[index % MENSAL_GRUPO_PALETTE.length]
                      }
                      radius={[4, 4, 0, 0]}
                      maxBarSize={28}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          {/* Charts Grid Row 2 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Chart 3: Top 10 Vendedores */}
            <ChartCard
              title="Top Vendedores (Faturamento)"
              description="Ranking dos vendedores com maior volume financeiro"
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  layout="vertical"
                  data={chartTopVendedores}
                  margin={{ top: 5, right: 20, left: 30, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" horizontal={false} />
                  <XAxis
                    type="number"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: '#64748B', fontSize: 11 }}
                    tickFormatter={(val) => `R$ ${(val / 1000).toFixed(0)}k`}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: '#334155', fontSize: 11 }}
                    width={130}
                  />
                  <Tooltip
                    formatter={currencyFormatter('Total')}
                    contentStyle={tooltipContentStyle}
                  />
                  <Bar dataKey="total" fill={COLOR_BLUE} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* Chart 4: Top 10 Clientes */}
            <ChartCard
              title="Top Clientes (Faturamento)"
              description="Principais compradores consolidados"
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  layout="vertical"
                  data={chartTopClientes}
                  margin={{ top: 5, right: 20, left: 30, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" horizontal={false} />
                  <XAxis
                    type="number"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: '#64748B', fontSize: 11 }}
                    tickFormatter={(val) => `R$ ${(val / 1000).toFixed(0)}k`}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: '#334155', fontSize: 11 }}
                    width={130}
                  />
                  <Tooltip
                    formatter={currencyFormatter('Total')}
                    contentStyle={tooltipContentStyle}
                  />
                  <Bar dataKey="total" fill="#0D9488" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          {/* Charts Grid Row 3: Valor Líquido x Faturamento */}
          <div className="grid grid-cols-1 gap-6">
            <ChartCard
              title="Valor Líquido x Faturamento por Mês"
              description="Comparativo de margem financeira"
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartVendasPorMes}
                  margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                  <XAxis
                    dataKey="mes"
                    tickLine={false}
                    axisLine={{ stroke: '#E2E8F0' }}
                    tick={{ fill: '#64748B', fontSize: 12 }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: '#64748B', fontSize: 11 }}
                    tickFormatter={(val) => `R$ ${(val / 1000).toFixed(0)}k`}
                  />
                  <Tooltip
                    formatter={(val: number | string | undefined) => [
                      formatCurrency(typeof val === 'number' ? val : Number(val)),
                    ]}
                    contentStyle={tooltipContentStyle}
                  />
                  <Legend
                    verticalAlign="top"
                    height={36}
                    formatter={(value) => (
                      <span className="text-xs font-bold text-slate-700 capitalize">
                        {value === 'faturamento' ? 'Faturamento Total' : 'Valor Líquido'}
                      </span>
                    )}
                  />
                  <Bar
                    dataKey="faturamento"
                    name="faturamento"
                    fill={COLOR_BLUE}
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar dataKey="liquido" name="liquido" fill="#0D9488" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          {/* Highlights Table: 8 Most Recent Sales */}
          <Card className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between pb-4">
              <div>
                <CardTitle className="text-base font-extrabold text-slate-900">
                  Vendas Recentes
                </CardTitle>
                <CardDescription className="text-xs text-slate-500 font-medium">
                  Últimos 8 lançamentos consolidados no sistema
                </CardDescription>
              </div>
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="text-[#0B6E99] hover:text-[#084F6E] hover:bg-cyan-50 font-bold gap-1"
              >
                <Link to="/vendas">
                  Ver todas as vendas
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-700 font-bold border-y border-gray-200">
                    <tr>
                      {recentSalesColumns.map((col) => (
                        <th
                          key={col.key}
                          onClick={() => sort.toggle(col.key)}
                          className={`py-3 px-4 cursor-pointer hover:bg-slate-100/80 transition-colors select-none group ${
                            col.className || ''
                          }`}
                        >
                          <div
                            className={`flex items-center gap-1.5 ${
                              col.className === 'text-right'
                                ? 'justify-end'
                                : col.className === 'text-center'
                                  ? 'justify-center'
                                  : ''
                            }`}
                          >
                            <span>{col.label}</span>
                            {sort.field === col.key ? (
                              <span className="text-[10px] text-[#0B6E99] font-extrabold">
                                {sort.dir === 'asc' ? '▲' : '▼'}
                              </span>
                            ) : (
                              <ArrowUpDown className="w-3 h-3 text-slate-400 group-hover:text-slate-700" />
                            )}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {recentSalesLoading ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-slate-400">
                          <div className="flex items-center justify-center gap-2">
                            <RefreshCw className="w-4 h-4 animate-spin text-[#0B6E99]" />
                            <span className="font-medium">Carregando vendas ordenadas...</span>
                          </div>
                        </td>
                      </tr>
                    ) : recentSales.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-6 text-center text-slate-400">
                          Nenhum registro encontrado
                        </td>
                      </tr>
                    ) : (
                      recentSales.map((item) => (
                        <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-3 px-4 font-medium text-slate-700 whitespace-nowrap">
                            {formatDate(item.data_lancamento)}
                          </td>
                          <td className="py-3 px-4 font-bold text-slate-900 max-w-[200px] truncate">
                            {item.nome_cliente || '-'}
                          </td>
                          <td className="py-3 px-4 text-slate-600 max-w-[240px] truncate font-medium">
                            {item.vendedor_cliente || '-'}
                          </td>
                          <td className="py-3 px-4 text-slate-700 max-w-[200px] truncate">
                            <span className="font-mono font-bold text-slate-800">
                              {item.codigo_item}
                            </span>
                            {item.descricao_item && (
                              <span className="text-slate-500 block text-[11px] truncate">
                                {item.descricao_item}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            {item.grupo_item ? (
                              <Badge
                                className="text-[10px] font-bold text-white"
                                style={{ backgroundColor: getGrupoColor(item.grupo_item) }}
                              >
                                {item.grupo_item}
                              </Badge>
                            ) : (
                              <span className="text-slate-400">-</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center font-bold text-slate-800">
                            {formatNumber(item.quantidade)}
                          </td>
                          <td className="py-3 px-4 text-right font-extrabold text-slate-900 tabular-nums">
                            {formatCurrency(item.total_linha)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Footer note */}
          <div className="flex items-center justify-between text-xs text-slate-400 pt-2 pb-6">
            <span className="flex items-center gap-1.5 font-medium">
              <RefreshCw className="w-3.5 h-3.5 text-[#0B6E99]" />
              Sincronização em tempo real ativa
            </span>
            <span className="font-medium">
              Exibindo {recentSales.length} registros recentes consolidados
            </span>
          </div>
        </>
      )}
    </div>
  )
}
