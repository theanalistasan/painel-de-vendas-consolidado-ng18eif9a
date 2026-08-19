import React, { useEffect, useMemo, useState } from 'react'
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
} from 'lucide-react'
import {
  AreaChart,
  Area,
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
  Line,
  ReferenceLine,
} from 'recharts'
import { fetchDashboardStats, type DashboardStatsResult } from '@/services/sales'
import { useRealtime } from '@/hooks/use-realtime'
import type { FilterState } from '@/types/sales'
import {
  formatCurrency,
  formatNumber,
  formatDate,
  getGrupoColor,
  extractAno,
  extractMes,
  extractDia,
} from '@/lib/formatters'
import FilterBar from '@/components/FilterBar'
import KpiCard from '@/components/KpiCard'
import ChartCard from '@/components/ChartCard'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useTableSort } from '@/hooks/use-table-sort'
import { sortData } from '@/lib/sort'

const CHART_PALETTE = [
  '#4F46E5', // Indigo
  '#0D9488', // Teal
  '#F59E0B', // Amber
  '#EF4444', // Red
  '#8B5CF6', // Purple
  '#EC4899', // Pink
  '#3B82F6', // Blue
  '#10B981', // Green
]

const tooltipContentStyle = {
  backgroundColor: '#0F172A',
  borderRadius: '8px',
  color: '#fff',
  fontSize: '12px',
  border: 'none',
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

export default function Index() {
  const [data, setData] = useState<DashboardStatsResult | null>(null)
  const [loading, setLoading] = useState(true)

  // Ordenação por clique nos cabeçalhos da tabela "Vendas Recentes" (frontend).
  const sort = useTableSort<DashboardSortField>()

  const [filters, setFilters] = useState<FilterState>({
    dataDe: '',
    dataAte: '',
    vendedorCliente: [],
    vendedor: [],
    grupoItem: [],
    estado: [],
    utilizacao: [],
    search: '',
    ano: '',
    mes: '',
    dia: '',
    tipoDevolucao: '',
  })

  // Load aggregated dashboard stats from server
  const loadData = async () => {
    setLoading(true)
    try {
      const res = await fetchDashboardStats(filters as unknown as Record<string, unknown>)
      setData(res)
    } catch (err) {
      console.error('Erro ao buscar estatísticas do dashboard:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [filters])

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
  const recentSales = data?.recentSales || []

  const sortedRecentSales = useMemo(
    () => sortData(recentSales, sort.field, sort.dir),
    [recentSales, sort.field, sort.dir],
  )

  const recentSalesColumns: { key: DashboardSortField; label: string; className?: string }[] = [
    { key: 'data_lancamento', label: 'Data' },
    { key: 'nome_cliente', label: 'Cliente' },
    { key: 'vendedor_cliente', label: 'Vendedor > Cliente' },
    { key: 'codigo_item', label: 'Item' },
    { key: 'grupo_item', label: 'Grupo' },
    { key: 'quantidade', label: 'Qtd', className: 'text-center' },
    { key: 'total_linha', label: 'Total Linha', className: 'text-right' },
  ]

  // Empty state check
  const isNoData =
    !data || (kpis.faturamento === 0 && kpis.documentos === 0 && recentSales.length === 0)

  return (
    <div className="space-y-6">
      {/* Filters Bar */}
      <FilterBar filters={filters} setFilters={setFilters} options={filterOptions} />

      {/* Loading Skeleton */}
      {loading ? (
        <div className="space-y-6">
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
      ) : isNoData ? (
        /* Empty State */
        <Card className="rounded-xl border border-dashed border-slate-300 p-12 text-center bg-white shadow-xs">
          <div className="w-16 h-16 mx-auto rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 mb-4">
            <Sparkles className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-slate-900">Nenhuma venda encontrada</h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto mt-1 mb-6">
            Não há registros correspondentes aos filtros selecionados. Tente ajustar os filtros ou
            importar novos dados.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Button
              variant="outline"
              onClick={() =>
                setFilters({
                  dataDe: '',
                  dataAte: '',
                  vendedorCliente: [],
                  vendedor: [],
                  grupoItem: [],
                  estado: [],
                  utilizacao: [],
                  search: '',
                  ano: '',
                  mes: '',
                  dia: '',
                  tipoDevolucao: '',
                })
              }
            >
              Limpar Filtros
            </Button>
            <Button asChild className="bg-indigo-600 hover:bg-indigo-700 text-white">
              <Link to="/importar">Importar Dados</Link>
            </Button>
          </div>
        </Card>
      ) : (
        <>
          {/* 5 KPIs Section */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
            <KpiCard
              title="Faturamento Total"
              value={kpis.faturamento}
              isCurrency
              icon={DollarSign}
              iconBgColor="bg-indigo-50"
              iconColor="text-indigo-600"
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
              iconBgColor="bg-amber-50"
              iconColor="text-amber-600"
              deltaPercent={-2.3}
            />
            <KpiCard
              title="Documentos (NFe)"
              value={kpis.documentos}
              decimals={0}
              icon={FileText}
              iconBgColor="bg-purple-50"
              iconColor="text-purple-600"
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
              description="Últimos 6 meses a partir da data mais recente dos dados"
              icon={BarChart2}
              iconColor="text-indigo-600"
            >
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={chartVendasPorMes}
                  margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="colorFaturamento" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#4F46E5" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#4F46E5" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
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
                    formatter={currencyFormatter('Faturamento')}
                    contentStyle={tooltipContentStyle}
                  />
                  <Area
                    type="monotone"
                    dataKey="faturamento"
                    stroke="#4F46E5"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#colorFaturamento)"
                  />
                </AreaChart>
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
                      return [formatCurrency(n), 'Faturamento']
                    }}
                    contentStyle={tooltipContentStyle}
                  />
                  <ReferenceLine yAxisId="right" y={0} stroke="#CBD5E1" strokeDasharray="3 3" />
                  <Bar
                    yAxisId="left"
                    dataKey="faturamento"
                    name="faturamento"
                    fill="#10B981"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={56}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="variacao"
                    name="variacao"
                    stroke="#F59E0B"
                    strokeWidth={2.5}
                    dot={{ r: 4, fill: '#F59E0B' }}
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
                      <span className="text-xs font-medium text-slate-700">{value}</span>
                    )}
                  />
                </PieChart>
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
                  <Bar dataKey="total" fill="#4F46E5" radius={[0, 4, 4, 0]} />
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

          {/* Charts Grid Row 3 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Chart 5: Vendas por Estado */}
            <ChartCard
              title="Vendas por Estado (UF)"
              description="Faturamento por unidade federativa"
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartEstado} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                  <XAxis
                    dataKey="uf"
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
                    formatter={currencyFormatter('Faturamento')}
                    contentStyle={tooltipContentStyle}
                  />
                  <Bar dataKey="total" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* Chart 6: Valor Líquido x Faturamento */}
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
                      <span className="text-xs font-semibold text-slate-700 capitalize">
                        {value === 'faturamento' ? 'Faturamento Total' : 'Valor Líquido'}
                      </span>
                    )}
                  />
                  <Bar
                    dataKey="faturamento"
                    name="faturamento"
                    fill="#4F46E5"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar dataKey="liquido" name="liquido" fill="#0D9488" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          {/* Highlights Table: 8 Most Recent Sales */}
          <Card className="rounded-xl border border-slate-200/80 bg-white shadow-xs overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between pb-4">
              <div>
                <CardTitle className="text-base font-bold text-slate-900">
                  Vendas Recentes
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Últimos 8 lançamentos consolidados no sistema
                </CardDescription>
              </div>
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 font-semibold gap-1"
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
                  <thead className="bg-slate-50 text-slate-600 font-semibold border-y border-slate-200/80">
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
                              <span className="text-[10px] text-indigo-600 font-bold">
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
                    {sortedRecentSales.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 px-4 font-medium text-slate-700 whitespace-nowrap">
                          {formatDate(item.data_lancamento)}
                        </td>
                        <td className="py-3 px-4 font-semibold text-slate-900 max-w-[200px] truncate">
                          {item.nome_cliente || '-'}
                        </td>
                        <td className="py-3 px-4 text-slate-600 max-w-[240px] truncate font-medium">
                          {item.vendedor_cliente || '-'}
                        </td>
                        <td className="py-3 px-4 text-slate-700 max-w-[200px] truncate">
                          <span className="font-mono font-semibold text-slate-800">
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
                              className="text-[10px] font-semibold text-white"
                              style={{ backgroundColor: getGrupoColor(item.grupo_item) }}
                            >
                              {item.grupo_item}
                            </Badge>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center font-medium text-slate-800">
                          {formatNumber(item.quantidade)}
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-slate-900 tabular-nums">
                          {formatCurrency(item.total_linha)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Footer note */}
          <div className="flex items-center justify-between text-xs text-slate-400 pt-2 pb-6">
            <span className="flex items-center gap-1.5">
              <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
              Sincronização em tempo real ativa
            </span>
            <span>Exibindo {recentSales.length} registros recentes consolidados</span>
          </div>
        </>
      )}
    </div>
  )
}
