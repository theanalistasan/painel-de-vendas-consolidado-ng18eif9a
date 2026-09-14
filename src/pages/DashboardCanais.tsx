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
import type { FilterState } from '@/types/sales'
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

const COLOR_BLUE = '#0B6E99'

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

type DashboardSortField =
  | 'data_lancamento'
  | 'nome_cliente'
  | 'vendedor_cliente'
  | 'codigo_item'
  | 'grupo_item'
  | 'quantidade'
  | 'total_linha'

export default function DashboardCanais() {
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
  const [exportingReport, setExportingReport] = useState(false)

  // Ordenação server-side por clique nos cabeçalhos da tabela "Vendas Recentes".
  const sort = useTableSort<DashboardSortField>()

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
      if (!sort.field) {
        setRecentSalesList(res?.recentSales || [])
      }
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
  const recentSales =
    recentSalesList.length > 0 || sort.field ? recentSalesList : data?.recentSales || []

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
    !loading &&
    !error &&
    data !== null &&
    kpis.faturamento === 0 &&
    kpis.documentos === 0 &&
    recentSales.length === 0

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

  // Exportação de relatórios
  const handleExportDashboardReport = async (groupByNfe = false) => {
    setExportingReport(true)
    toast({
      title: groupByNfe
        ? 'Gerando relatório consolidado por NF...'
        : 'Gerando relatório completo de Canais...',
      description: 'Buscando todos os registros filtrados no servidor...',
    })

    try {
      const res = await fetchVendasExport({
        sort: '-data_lancamento',
        groupByNfe,
        collapsed: groupByNfe,
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

      const exportColumns = [
        { key: 'data_lancamento', label: 'Data de Lançamento' },
        { key: 'numero_nfe', label: 'Nº NFe' },
        { key: 'numero_sap', label: 'Número SAP' },
        { key: 'tipo_documento', label: 'Tipo de Documento' },
        { key: 'codigo_cliente', label: 'Código do Cliente' },
        { key: 'nome_cliente', label: 'Nome do Cliente' },
        { key: 'vendedor_cliente', label: 'Vendedor > Cliente' },
        { key: 'nome_vendedor', label: 'Nome do Vendedor' },
        { key: 'codigo_item', label: 'Cód. do Item' },
        { key: 'descricao_item', label: 'Descrição do Item' },
        { key: 'grupo_item', label: 'Grupo do Item' },
        { key: 'quantidade', label: 'Quantidade' },
        { key: 'preco_item', label: 'Preço do Item' },
        { key: 'preco_unitario', label: 'Preço Unitário' },
        { key: 'total_linha', label: 'Valor Mercadoria (Total da Linha)' },
        { key: 'total_nf_sem_frete', label: 'Total NF SEM Frete' },
        { key: 'valor_liquido', label: 'Valor Liquido' },
        { key: 'custo_total', label: 'Custo Total' },
        { key: 'utilizacao', label: 'Utilização' },
        { key: 'estado', label: 'Estado' },
        { key: 'cidade', label: 'Cidade' },
        { key: 'classificacao', label: 'Classificacao' },
        { key: 'grupo_cliente', label: 'Grupo do Cliente' },
        { key: 'mercado', label: 'Mercado' },
        { key: 'usuario_emissor_pedido', label: 'Usuário Emitente do Pedido' },
        { key: 'origem', label: 'Origem' },
      ]

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
      const filename = groupByNfe
        ? `relatorio_canais_por_nf_${dateStr}`
        : `relatorio_canais_completo_${dateStr}`

      exportToCSV(filename, formattedRows as unknown as Record<string, unknown>[], exportColumns)

      toast({
        title: 'Relatório exportado com sucesso!',
        description: groupByNfe
          ? `${rowsToExport.length} Notas Fiscais consolidadas exportadas em formato Excel/CSV.`
          : `Todos os ${rowsToExport.length} registros detalhados foram exportados com sucesso.`,
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

          {/* Highlights Table: 8 Most Recent Sales */}
          <Card className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4">
              <div>
                <CardTitle className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-[#0B6E99]" />
                  Vendas Recentes &amp; Relatório
                </CardTitle>
                <CardDescription className="text-xs text-slate-500 font-medium">
                  Últimos lançamentos consolidados no sistema com exportação completa
                </CardDescription>
              </div>
              <div className="flex items-center flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleExportDashboardReport(false)}
                  disabled={exportingReport || isNoData}
                  className="bg-white border-gray-200 text-slate-700 hover:bg-slate-50 font-bold gap-1.5 text-xs shadow-2xs h-8"
                  title="Exportar todos os registros que atendem aos filtros ativos em formato CSV/Excel"
                >
                  {exportingReport ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#0B6E99]" />
                      Exportando...
                    </>
                  ) : (
                    <>
                      <Download className="w-3.5 h-3.5 text-[#0B6E99]" />
                      Exportar Relatório Detalhado
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleExportDashboardReport(true)}
                  disabled={exportingReport || isNoData}
                  className="bg-cyan-50 border-cyan-200 text-[#0B6E99] hover:bg-cyan-100 font-bold gap-1.5 text-xs shadow-2xs h-8"
                  title="Exportar relatório consolidado (1 linha compacta por Nota Fiscal)"
                >
                  <Download className="w-3.5 h-3.5" />
                  Exportar por NF
                </Button>
                <Button
                  asChild
                  variant="ghost"
                  size="sm"
                  className="text-[#0B6E99] hover:text-[#084F6E] hover:bg-cyan-50 font-bold gap-1 text-xs h-8"
                >
                  <Link to="/vendas">
                    Ver todas
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </Button>
              </div>
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
