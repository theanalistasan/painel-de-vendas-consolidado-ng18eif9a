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
  Users,
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
  LineChart,
  Line,
  ReferenceLine,
} from 'recharts'
import { fetchDashboardStats, fetchVendasList, type DashboardStatsResult } from '@/services/sales'
import { useRealtime } from '@/hooks/use-realtime'
import type { FilterState, VendaConsolidada } from '@/types/sales'
import {
  formatCurrency,
  formatNumber,
  formatDate,
  getGrupoColor,
  extractAno,
  extractMes,
  extractDia,
  MESES_CURTOS,
} from '@/lib/formatters'
import { saveFiltersToSession, loadFiltersFromSession } from '@/lib/filter-persistence'
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

// Ordem fixa dos grupos e paleta indigo/violeta para o gráfico "Venda Mensal por Grupo do Item".
// 1. EQUIPAMENTOS (indigo escuro #4F46E5)
// 2. PEÇAS (indigo médio #6366F1)
// 3. TINTAS (violeta #7C3AED)
// 4. ACESSÓRIOS (violeta claro #A78BFA)
const MENSAL_GRUPOS_ORDEM = ['EQUIPAMENTOS', 'PEÇAS', 'TINTAS', 'ACESSÓRIOS'] as const

const MENSAL_GRUPO_COLORS: Record<string, string> = {
  EQUIPAMENTOS: '#4F46E5', // Indigo escuro (Barra 1)
  PEÇAS: '#6366F1', // Indigo médio (Barra 2)
  PECAS: '#6366F1',
  TINTAS: '#7C3AED', // Violeta (Barra 3)
  ACESSÓRIOS: '#A78BFA', // Violeta claro (Barra 4)
  ACESSORIOS: '#A78BFA',
}

const MENSAL_GRUPO_PALETTE = [
  '#4F46E5', // Indigo escuro
  '#6366F1', // Indigo médio
  '#7C3AED', // Violeta
  '#A78BFA', // Violeta claro
  '#8B5CF6', // Violet 500
  '#4338CA', // Indigo 700
  '#9333EA', // Purple 600
  '#818CF8', // Indigo 400
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
    <div className="rounded-lg bg-slate-900 px-3 py-2 text-xs text-white shadow-lg">
      <div className="font-semibold mb-1">{formatMesAnoCurto(String(label ?? ''))}</div>
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2">
          <span
            className="inline-block w-2.5 h-2.5 rounded-sm"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-slate-300">{entry.name}</span>
          <span className="font-semibold ml-auto">
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

  const [filters, setFilters] = useState<FilterState>(() => loadFiltersFromSession())

  // Persistir filtros no sessionStorage sempre que mudarem (após aplicar),
  // para que o estado seja compartilhado com a página de Vendas.
  useEffect(() => {
    saveFiltersToSession(filters)
  }, [filters])

  // Load aggregated dashboard stats from server
  const loadData = async (activeFilters = filters) => {
    setLoading(true)
    try {
      const res = await fetchDashboardStats(activeFilters as unknown as Record<string, unknown>)
      setData(res)
      if (!sort.field) {
        setRecentSalesList(res?.recentSales || [])
      }
    } catch (err) {
      console.error('Erro ao buscar estatísticas do dashboard:', err)
    } finally {
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

    // Caso seja a nova estrutura { periodo: 'yyyy-mm', total: number }
    if ('periodo' in chartVendasEquipamentosRaw[0]) {
      return (chartVendasEquipamentosRaw as { periodo: string; total: number }[]).map((item) => ({
        periodo: item.periodo,
        label: formatMesAnoCurto(item.periodo),
        total: item.total,
      }))
    }

    // Fallback retrocompatível se vier no formato antigo { ano: '2023', valores: [...] }
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

    // Caso seja a nova estrutura { periodo: 'yyyy-mm', total: number }
    if ('periodo' in chartVendasInsumosRaw[0]) {
      return (chartVendasInsumosRaw as { periodo: string; total: number }[]).map((item) => ({
        periodo: item.periodo,
        label: formatMesAnoCurto(item.periodo),
        total: item.total,
      }))
    }

    // Fallback retrocompatível
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

  // Grupos fixos (ordem fixa: EQUIPAMENTOS, TINTAS, PEÇAS, ACESSÓRIOS + outros eventuais)
  // e dados pivôs (1 linha por mês, 1 coluna por grupo) para o gráfico "Venda Mensal por Grupo do Item".
  const mensalGrupos = useMemo(() => {
    const backendGrupos = new Set<string>()
    for (const m of chartVendasPorGrupoItemMensal) {
      for (const g of m.grupos) {
        if (g.grupo) backendGrupos.add(g.grupo)
      }
    }

    // Normalizador para casar variações de grafia/acentuação com os 4 grupos fixos
    const matchFixedGroup = (grupoName: string): string | null => {
      const upper = (grupoName || '').toUpperCase().trim()
      if (upper === 'EQUIPAMENTOS') return 'EQUIPAMENTOS'
      if (upper === 'PEÇAS' || upper === 'PECAS') return 'PEÇAS'
      if (upper === 'TINTAS') return 'TINTAS'
      if (upper === 'ACESSÓRIOS' || upper === 'ACESSORIOS') return 'ACESSÓRIOS'
      return null
    }

    const list: string[] = [...MENSAL_GRUPOS_ORDEM]
    // Se houver algum outro grupo no backend que não esteja nos 4 fixos, inclui no final
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
      // Inicializa os 4 grupos fixos com 0
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

  // Empty state check
  const isNoData =
    !data || (kpis.faturamento === 0 && kpis.documentos === 0 && recentSales.length === 0)

  // Cores para linhas de anos (paleta indigos/violetas/azuis)
  const LINE_COLORS = [
    '#4F46E5', // Indigo 600
    '#7C3AED', // Violet 600
    '#2563EB', // Blue 600
    '#0D9488', // Teal 600
    '#9333EA', // Purple 600
    '#EC4899', // Pink 600
    '#F59E0B', // Amber 500
    '#6366F1', // Indigo 500
  ]

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
          {/* Top 4 Charts Skeleton */}
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
                  tipoDocumento: [],
                  search: '',
                  ano: [],
                  mes: [],
                  dia: [],
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
          {/* 4 Novos Gráficos no Topo (Linha 1: Tendência Equipamentos + Acumulado Insumos | Linha 2: Clientes Ativos Equipamentos + Clientes Ativos Insumos) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Gráfico 1: Tendência de Vendas — Equipamentos (Linha Única Contínua) */}
            <ChartCard
              title="Tendência de Vendas — Equipamentos"
              description="Evolução histórica contínua de vendas de Equipamentos"
              icon={TrendingUp}
              iconColor="text-indigo-600"
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
                      stroke="#4F46E5"
                      strokeWidth={2.5}
                      dot={{ r: 2.5, fill: '#4F46E5' }}
                      activeDot={{ r: 5, fill: '#4F46E5', stroke: '#FFFFFF', strokeWidth: 2 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            {/* Gráfico 2: Acumulado de Vendas — Insumos (Linha Única Contínua) */}
            <ChartCard
              title="Acumulado de Vendas — Insumos"
              description="Evolução histórica contínua de Peças, Tintas e Acessórios"
              icon={TrendingUp}
              iconColor="text-violet-600"
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
                      stroke="#7C3AED"
                      strokeWidth={2.5}
                      dot={{ r: 2.5, fill: '#7C3AED' }}
                      activeDot={{ r: 5, fill: '#7C3AED', stroke: '#FFFFFF', strokeWidth: 2 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            {/* Gráfico 3: Clientes Ativos — Equipamentos (Barras) */}
            <ChartCard
              title="Clientes Ativos — Equipamentos"
              description="Contagem de clientes únicos compradores de equipamentos nos últimos 6 meses"
              icon={Users}
              iconColor="text-indigo-600"
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
                      formatter={(val: number | string | undefined) => [
                        formatNumber(typeof val === 'number' ? val : Number(val)),
                        'Clientes Ativos',
                      ]}
                      labelFormatter={(label) => formatMesAnoCurto(String(label))}
                      contentStyle={tooltipContentStyle}
                    />
                    <Bar
                      dataKey="clientes"
                      name="Clientes Ativos"
                      fill="#4F46E5"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={48}
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
              iconColor="text-violet-600"
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
                        <span className="text-xs font-semibold text-slate-700">{value}</span>
                      )}
                    />
                    <Bar
                      dataKey="clientesAnoAnterior"
                      name="Ano Anterior"
                      fill="#A5B4FC"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={32}
                    />
                    <Bar
                      dataKey="clientes"
                      name="Atual"
                      fill="#6366F1"
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
              description="Últimos 6 meses com comparação do mesmo mês no ano anterior"
              icon={BarChart2}
              iconColor="text-indigo-600"
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
                        <span className="text-xs font-semibold text-slate-700">
                          {labels[value] ?? value}
                        </span>
                      )
                    }}
                  />
                  <Bar
                    dataKey="faturamento_ano_anterior"
                    name="faturamento_ano_anterior"
                    fill="#A5B4FC"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={28}
                  />
                  <Bar
                    dataKey="faturamento"
                    name="faturamento"
                    fill="#4F46E5"
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
                        <span className="text-xs font-semibold text-slate-700">
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
                    fill="#4F46E5"
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

            {/* Chart 2.5: Venda Mensal por Grupo do Item (últimos 6 meses) */}
            <ChartCard
              title="Venda Mensal por Grupo do Item"
              description="Faturamento por grupo de item nos últimos 6 meses"
              icon={BarChart2}
              iconColor="text-violet-600"
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
                    cursor={{ fill: 'rgba(99,102,241,0.08)' }}
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
                              <span className="text-xs font-semibold text-slate-700">{grupo}</span>
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
                    {recentSalesLoading ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-slate-400">
                          <div className="flex items-center justify-center gap-2">
                            <RefreshCw className="w-4 h-4 animate-spin text-indigo-600" />
                            <span>Carregando vendas ordenadas...</span>
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
                      ))
                    )}
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
