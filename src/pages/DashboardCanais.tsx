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
  RefreshCw,
  RotateCcw,
  ArrowUpDown,
  Expand,
  MapPin,
  Download,
  FileSpreadsheet,
} from 'lucide-react'
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend,
} from 'recharts'
import {
  fetchDashboardStats,
  fetchVendasList,
  fetchVendasExport,
  type DashboardStatsResult,
} from '@/services/sales'
import { useRealtime } from '@/hooks/use-realtime'
import type { FilterState, VendaConsolidada } from '@/types/sales'
import {
  formatCurrency,
  formatNumber,
  formatDate,
  exportToCSV,
  getGrupoColor,
} from '@/lib/formatters'
import { toast } from '@/hooks/use-toast'
import {
  saveFiltersToSession,
  loadFiltersFromSession,
  hasSavedFiltersInSession,
  hasValidPeriodFilters,
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
import { VendasRelatorioTable, RELATORIO_COLUMNS } from '@/components/VendasRelatorioTable'

const COLOR_BLUE = '#0B6E99'
const RELATORIO_PAGE_SIZE = 15

type SortField = Extract<keyof VendaConsolidada, string>

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

export default function DashboardCanais() {
  const [data, setData] = useState<DashboardStatsResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Relatório de Lançamentos/Vendas no modelo de Vendas.tsx
  const [reportVendas, setReportVendas] = useState<(VendaConsolidada & { itens_qtd?: number })[]>(
    [],
  )
  const [reportLoading, setReportLoading] = useState(false)
  const [reportPage, setReportPage] = useState(1)
  const [reportTotalItems, setReportTotalItems] = useState(0)
  const [reportTotalPages, setReportTotalPages] = useState(1)
  const [reportTotalNetsales, setReportTotalNetsales] = useState(0)
  const [reportTotalRacnew, setReportTotalRacnew] = useState(0)
  const [isGroupedByNfe, setIsGroupedByNfe] = useState(false)
  const [exportingReport, setExportingReport] = useState(false)

  // Ordenação server-side por clique nos cabeçalhos da tabela do relatório
  const sort = useTableSort<SortField>()

  const hadSavedFiltersAtMount = useRef(hasSavedFiltersInSession())
  const [filters, setFilters] = useState<FilterState>(() => loadFiltersFromSession())
  const [initializedFromBase, setInitializedFromBase] = useState(
    () => hasSavedFiltersInSession() && hasValidPeriodFilters(loadFiltersFromSession()),
  )
  const [mapExpanded, setMapExpanded] = useState(false)

  // Persistir filtros no sessionStorage
  useEffect(() => {
    if (hadSavedFiltersAtMount.current || initializedFromBase) {
      saveFiltersToSession(filters)
    }
  }, [filters, initializedFromBase])

  const requestSeqRef = useRef<number>(0)
  const abortControllerRef = useRef<AbortController | null>(null)

  // Load aggregated dashboard stats from server
  const loadData = async (activeFilters = filters) => {
    const seq = ++requestSeqRef.current

    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    const currentController = new AbortController()
    abortControllerRef.current = currentController

    setLoading(true)
    setError(null)

    try {
      const res = await fetchDashboardStats(activeFilters as unknown as Record<string, unknown>, {
        signal: currentController.signal,
      })

      if (seq !== requestSeqRef.current) {
        return
      }

      // Se ainda não foi inicializado com as opções dinâmicas da base, OU se os filtros atuais
      // estiverem com ano/mês vazios (ex: residual de "Limpar Filtros" ou sessão antiga),
      // aplica os filtros dinâmicos padrão baseados na base e persiste na sessão.
      const needsDynamicInit = !initializedFromBase || !hasValidPeriodFilters(activeFilters)
      if (needsDynamicInit && res?.filterOptions) {
        const dynamicFilters = buildDynamicInitialFilters(res.filterOptions)
        setInitializedFromBase(true)
        saveFiltersToSession(dynamicFilters)
        setFilters(dynamicFilters)
        return
      }

      if (!initializedFromBase && res?.filterOptions) {
        setInitializedFromBase(true)
      }

      setData(res)
      setLoading(false)
    } catch (err: unknown) {
      if ((err as Error)?.name === 'AbortError' || String(err).includes('aborted')) {
        return
      }

      if (seq !== requestSeqRef.current) {
        return
      }

      console.error(`[DashboardCanais:loadData #${seq}] Erro:`, err)
      setError(err instanceof Error ? err.message : 'Falha ao carregar dados do painel.')
      setLoading(false)
    }
  }

  // Carrega relatório paginado com suporte a ordenação server-side e colapsado por NF
  const loadReportData = async (
    activeFilters = filters,
    targetPage = reportPage,
    sortField = sort.field,
    sortDir = sort.dir,
    grouped = isGroupedByNfe,
  ) => {
    setReportLoading(true)
    try {
      const res = await fetchVendasList({
        page: targetPage,
        perPage: RELATORIO_PAGE_SIZE,
        sortField: sortField || undefined,
        sortDirection: sortField ? sortDir : undefined,
        sort: sortField ? undefined : '-data_lancamento',
        groupByNfe: grouped,
        filters: activeFilters as unknown as Record<string, unknown>,
      })

      setReportVendas(res.items || [])
      setReportTotalItems(res.totalItems || 0)
      setReportTotalPages(res.totalPages || 1)
      setReportTotalNetsales(res.totalNetsales || 0)
      setReportTotalRacnew(res.totalRacnew || 0)
    } catch (err) {
      console.error('[DashboardCanais] Erro ao carregar relatório:', err)
    } finally {
      setReportLoading(false)
    }
  }

  useEffect(() => {
    loadData(filters)
    loadReportData(filters, 1, sort.field, sort.dir, isGroupedByNfe)
    setReportPage(1)
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [filters])

  const handleReportPageChange = (newPage: number) => {
    setReportPage(newPage)
    loadReportData(filters, newPage, sort.field, sort.dir, isGroupedByNfe)
  }

  const handleReportSort = (field: string) => {
    sort.toggle(field as SortField)
    const nextDir = sort.field === field && sort.dir === 'asc' ? 'desc' : 'asc'
    setReportPage(1)
    loadReportData(filters, 1, field as SortField, nextDir, isGroupedByNfe)
  }

  const handleToggleGroupByNfe = () => {
    const nextGrouped = !isGroupedByNfe
    setIsGroupedByNfe(nextGrouped)
    setReportPage(1)
    loadReportData(filters, 1, sort.field, sort.dir, nextGrouped)
    toast({
      title: nextGrouped ? 'Relatório colapsado por NF' : 'Relatório expandido',
      description: nextGrouped
        ? 'Exibindo 1 linha consolidada por Nota Fiscal para todos os dados do filtro.'
        : 'Exibindo todos os itens detalhados de cada Nota Fiscal.',
    })
  }

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
  const chartTopVendedores = data?.charts?.topVendedores || []
  const chartTopClientes = data?.charts?.topClientes || []
  const chartEstado = data?.charts?.estado || []
  const revendasFaturamento = data?.charts?.revendasFaturamento

  const isNoData =
    !loading &&
    !error &&
    data !== null &&
    kpis.faturamento === 0 &&
    kpis.documentos === 0 &&
    reportTotalItems === 0

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

  // Exportação de relatórios seguindo exatamente o modelo e colunas de Vendas
  const handleExportDashboardReport = async (forceGrouped?: boolean) => {
    const shouldGroup = forceGrouped !== undefined ? forceGrouped : isGroupedByNfe

    setExportingReport(true)
    toast({
      title: shouldGroup
        ? 'Gerando relatório consolidado por NF...'
        : 'Gerando relatório completo de Canais...',
      description: 'Buscando todos os registros filtrados no servidor...',
    })

    try {
      const res = await fetchVendasExport({
        sortField: sort.field || undefined,
        sortDirection: sort.field ? sort.dir : undefined,
        sort: sort.field ? undefined : '-data_lancamento',
        groupByNfe: shouldGroup,
        collapsed: shouldGroup,
        filters: filters as unknown as Record<string, unknown>,
      })

      const rowsToExport = res.items || []

      if (rowsToExport.length === 0) {
        toast({
          variant: 'destructive',
          title: 'Nenhum dado encontrado',
          description: 'Nenhum registro encontrado para exportar com os filtros atuais.',
        })
        return
      }

      // Ordem exata das 10 primeiras colunas + complementares (RELATORIO_COLUMNS)
      const exportColumns = RELATORIO_COLUMNS.map((c) => ({
        key: c.key,
        label: c.label,
      }))

      const formattedRows = rowsToExport.map((row) => ({
        ...row,
        origem:
          row.tem_netsales && row.tem_racnew
            ? 'Consolidado'
            : row.tem_netsales
              ? 'NetSales'
              : 'RacNew',
      }))

      const dateStr = new Date().toISOString().slice(0, 10)
      const filenameSuffix = shouldGroup ? 'por_nf' : 'detalhado'
      const filename = `relatorio_canais_${filenameSuffix}_${dateStr}`

      exportToCSV(filename, formattedRows as unknown as Record<string, unknown>[], exportColumns)

      toast({
        title: 'Relatório exportado com sucesso!',
        description: shouldGroup
          ? `${rowsToExport.length} Notas Fiscais consolidadas exportadas em formato Excel/CSV.`
          : `Todos os ${rowsToExport.length} registros foram exportados em formato Excel/CSV (UTF-8 BOM).`,
      })
    } catch (err) {
      console.error('Erro na exportação do relatório de canais:', err)
      toast({
        variant: 'destructive',
        title: 'Falha na exportação',
        description: 'Não foi possível exportar o relatório. Tente novamente.',
      })
    } finally {
      setExportingReport(false)
    }
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
          <Skeleton className="h-96 w-full rounded-xl" />
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
          <h3 className="text-lg font-extrabold text-slate-900">
            {error.toLowerCase().includes('tempo limite') || error.toLowerCase().includes('demorou')
              ? 'A consulta demorou demais'
              : 'Erro ao carregar os dados'}
          </h3>
          <p className="text-sm text-slate-600 max-w-md mx-auto mt-1 mb-6 font-medium">
            {error.toLowerCase().includes('tempo limite') || error.toLowerCase().includes('demorou')
              ? 'A varredura com o volume de dados solicitado excedeu o tempo de resposta. Tente refinar os filtros selecionados ou limpá-los para restabelecer os valores padrões.'
              : error ||
                'Não foi possível conectar ao servidor para obter os indicadores do painel.'}
          </p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <Button
              onClick={handleClearFilters}
              variant="outline"
              className="border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-bold"
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              Limpar Filtros
            </Button>
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
          {/* Alerta de Empty State */}
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
                      Os indicadores e rankings abaixo estão zerados para o recorte atual.
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
                </div>
              </div>
            </Card>
          )}

          {/* Vendas por Estado (UF) e Região com Mapa do Brasil e Revendas */}
          <Card className="group relative rounded-xl border border-gray-200 bg-white shadow-xs transition-all duration-200 hover:border-slate-300">
            <CardHeader className="pb-3 border-b border-gray-100">
              <div className="flex items-start sm:items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-[#0B6E99]" />
                      Vendas por Estado (UF) &amp; Região — Visão Canais
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
            />
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

          {/* Charts Grid: Top Vendedores & Top Clientes */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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

          {/* Gráfico: Valor Líquido x Faturamento por Mês */}
          <div className="grid grid-cols-1 gap-6">
            <ChartCard
              title="Valor Líquido x Faturamento por Mês"
              description="Comparativo de margem financeira dos canais"
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

          {/* Relatório de Vendas da Visão Canais (mesmo modelo estrutural e comportamental de Vendas) */}
          <Card className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4">
              <div>
                <CardTitle className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-[#0B6E99]" />
                  Relatório de Vendas — Visão Canais
                </CardTitle>
                <CardDescription className="text-xs text-slate-500 font-medium">
                  {reportTotalItems} registros encontrados • Base RacNew + NetSales • Ordenação
                  server-side, colunas ajustáveis e colapso por NF
                </CardDescription>
              </div>
              <div className="flex items-center flex-wrap gap-2">
                <Button
                  asChild
                  variant="ghost"
                  size="sm"
                  className="text-[#0B6E99] hover:text-[#084F6E] hover:bg-cyan-50 font-bold gap-1 text-xs h-8"
                >
                  <Link to="/vendas">
                    Abrir em Vendas
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </Button>
              </div>
            </CardHeader>

            <VendasRelatorioTable
              items={reportVendas}
              loading={reportLoading}
              totalItems={reportTotalItems}
              totalNetsales={reportTotalNetsales}
              totalRacnew={reportTotalRacnew}
              page={reportPage}
              pageSize={RELATORIO_PAGE_SIZE}
              totalPages={reportTotalPages}
              onPageChange={handleReportPageChange}
              sortField={sort.field}
              sortDir={sort.dir}
              onSort={handleReportSort}
              isGroupedByNfe={isGroupedByNfe}
              onToggleGroupByNfe={handleToggleGroupByNfe}
              storageKeyPrefix="relatorio_canais"
              exporting={exportingReport}
              onExport={handleExportDashboardReport}
              showOriginSummary={true}
            />
          </Card>

          {/* Footer note */}
          <div className="flex items-center justify-between text-xs text-slate-400 pt-2 pb-6">
            <span className="flex items-center gap-1.5 font-medium">
              <RefreshCw className="w-3.5 h-3.5 text-[#0B6E99]" />
              Sincronização em tempo real ativa
            </span>
            <span className="font-medium">
              Exibindo {reportVendas.length} de {reportTotalItems}{' '}
              {isGroupedByNfe ? 'notas fiscais' : 'registros'} consolidados
            </span>
          </div>
        </>
      )}
    </div>
  )
}
