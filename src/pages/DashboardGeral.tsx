import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  TrendingUp,
  BarChart2,
  PieChart as PieChartIcon,
  RefreshCw,
  RotateCcw,
  Users,
  Download,
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
import { fetchDashboardStats, fetchVendasExport, type DashboardStatsResult } from '@/services/sales'
import { useRealtime } from '@/hooks/use-realtime'
import type { FilterState } from '@/types/sales'
import {
  formatCurrency,
  formatNumber,
  exportToCSV,
  getGrupoColor,
  MESES_CURTOS,
} from '@/lib/formatters'
import { toast } from '@/hooks/use-toast'
import {
  saveFiltersToSession,
  loadFiltersFromSession,
  hasSavedFiltersInSession,
  buildDynamicInitialFilters,
} from '@/lib/filter-persistence'
import FilterBar from '@/components/FilterBar'
import ChartCard from '@/components/ChartCard'
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

const COLOR_BLUE = '#0B6E99'
const COLOR_CYAN = '#1895A8'
const COLOR_CYAN_DARK = '#106A82'

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
  EQUIPAMENTOS: '#0B6E99',
  PEÇAS: '#1895A8',
  PECAS: '#1895A8',
  TINTAS: '#106A82',
  ACESSÓRIOS: '#67D2E2',
  ACESSORIOS: '#67D2E2',
}

const MENSAL_GRUPO_PALETTE = [
  '#0B6E99',
  '#1895A8',
  '#106A82',
  '#67D2E2',
  '#084F6E',
  '#38BDF8',
  '#0284C7',
  '#14B8A6',
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

/** Tooltip customizado do gráfico "Venda Mensal por Grupo do Item" */
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

export default function DashboardGeral() {
  const [data, setData] = useState<DashboardStatsResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [exportingReport, setExportingReport] = useState(false)

  const hadSavedFiltersAtMount = useRef(hasSavedFiltersInSession())
  const [filters, setFilters] = useState<FilterState>(() => loadFiltersFromSession())
  const [initializedFromBase, setInitializedFromBase] = useState(() => hasSavedFiltersInSession())

  useEffect(() => {
    if (hadSavedFiltersAtMount.current || initializedFromBase) {
      saveFiltersToSession(filters)
    }
  }, [filters, initializedFromBase])

  const requestSeqRef = useRef<number>(0)
  const abortControllerRef = useRef<AbortController | null>(null)

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

      if (!hadSavedFiltersAtMount.current && !initializedFromBase && res?.filterOptions) {
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

      console.error(`[DashboardGeral:loadData #${seq}] Erro:`, err)
      setError(err instanceof Error ? err.message : 'Falha ao carregar dados do painel.')
      setLoading(false)
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

  const chartVendasPorMes = data?.charts?.vendasPorMes || []
  const chartVendasPorAno = data?.charts?.vendasPorAno || []
  const chartGrupoItem = data?.charts?.grupoItem || []
  const chartVendasPorGrupoItemMensal = data?.charts?.vendasPorGrupoItemMensal || []
  const chartVendasEquipamentosRaw =
    data?.charts?.vendasEquipamentosHistorico || data?.charts?.vendasEquipamentosPorAno || []
  const chartVendasInsumosRaw =
    data?.charts?.vendasInsumosHistorico || data?.charts?.vendasInsumosPorAno || []
  const chartClientesAtivosEquipamentos = data?.charts?.clientesAtivosEquipamentos || []
  const chartClientesAtivosInsumos = data?.charts?.clientesAtivosInsumos || []

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

  // Exportação de relatórios respeitando filtros ativos
  const handleExportReport = async (groupByNfe = false) => {
    setExportingReport(true)
    toast({
      title: groupByNfe
        ? 'Gerando relatório consolidado por NF...'
        : 'Gerando relatório completo do Dashboard...',
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
        ? `relatorio_geral_por_nf_${dateStr}`
        : `relatorio_geral_completo_${dateStr}`

      exportToCSV(filename, formattedRows as unknown as Record<string, unknown>[], exportColumns)

      toast({
        title: 'Relatório exportado com sucesso!',
        description: groupByNfe
          ? `${rowsToExport.length} Notas Fiscais consolidadas exportadas em formato Excel/CSV.`
          : `Todos os ${rowsToExport.length} registros detalhados foram exportados com sucesso.`,
      })
    } catch (err) {
      console.error('Erro na exportação do relatório:', err)
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

      {/* Barra de Ações com Botões de Exportação no Topo */}
      <Card className="rounded-xl border border-gray-200 bg-white p-4 shadow-xs">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base font-extrabold text-slate-900">
              Visão Geral — Indicadores Consolidados
            </CardTitle>
            <CardDescription className="text-xs text-slate-500 font-medium mt-0.5">
              Tendências de mercado, evolução temporal e comparativos de clientes ativos e grupos
            </CardDescription>
          </div>
          <div className="flex items-center flex-wrap gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleExportReport(false)}
              disabled={exportingReport}
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
              onClick={() => handleExportReport(true)}
              disabled={exportingReport}
              className="bg-cyan-50 border-cyan-200 text-[#0B6E99] hover:bg-cyan-100 font-bold gap-1.5 text-xs shadow-2xs h-8"
              title="Exportar relatório consolidado (1 linha compacta por Nota Fiscal)"
            >
              <Download className="w-3.5 h-3.5" />
              Exportar por NF
            </Button>
          </div>
        </div>
      </Card>

      {/* Loading Skeleton */}
      {loading ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Skeleton className="h-80 w-full rounded-xl" />
            <Skeleton className="h-80 w-full rounded-xl" />
            <Skeleton className="h-80 w-full rounded-xl" />
            <Skeleton className="h-80 w-full rounded-xl" />
            <Skeleton className="h-80 w-full rounded-xl" />
            <Skeleton className="h-80 w-full rounded-xl" />
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
        /* Grade dos 8 Indicadores Solicitados para a Visão Geral */
        <div className="space-y-6">
          {/* Linha 1: Tendência de Vendas — Equipamentos & Acumulado de Vendas — Insumos */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Indicador 1: Tendência de Vendas — Equipamentos */}
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

            {/* Indicador 2: Acumulado de Vendas — Insumos */}
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
          </div>

          {/* Linha 2: Clientes Ativos — Equipamentos & Clientes Ativos — Insumos */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Indicador 3: Clientes Ativos — Equipamentos */}
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

            {/* Indicador 4: Clientes Ativos — Insumos */}
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

          {/* Linha 3: Evolução de Vendas por Mês & Evolução de Vendas por Ano */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Indicador 5: Evolução de Vendas por Mês */}
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

            {/* Indicador 6: Evolução de Vendas por Ano */}
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
          </div>

          {/* Linha 4: Vendas por Grupo do Item & Venda Mensal por Grupo do Item */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Indicador 7: Vendas por Grupo do Item */}
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

            {/* Indicador 8: Venda Mensal por Grupo do Item (últimos 6 meses) */}
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
        </div>
      )}
    </div>
  )
}
