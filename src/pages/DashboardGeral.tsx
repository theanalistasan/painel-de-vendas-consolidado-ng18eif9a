import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  TrendingUp,
  BarChart2,
  RefreshCw,
  RotateCcw,
  Users,
  Sparkles,
  SlidersHorizontal,
  DollarSign,
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
  ComposedChart,
  LineChart,
  ReferenceLine,
  Line,
} from 'recharts'
import { fetchDashboardStats, type DashboardStatsResult } from '@/services/sales'
import { useRealtime } from '@/hooks/use-realtime'
import type { FilterState } from '@/types/sales'
import { formatCurrency, formatCompactCurrency, formatNumber, MESES_CURTOS } from '@/lib/formatters'
import { TITULO_VALOR_TOTAL_BRUTO, TITULO_VALOR_LIQUIDO_NET } from '@/lib/valor-titulos'
import {
  loadFiltersFromSession,
  saveFiltersToSession,
  hasSavedFiltersInSession,
  FILTERS_CHANGED_EVENT,
} from '@/lib/filter-persistence'
import ChartCard from '@/components/ChartCard'
import KpiCard from '@/components/KpiCard'
import { Card, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

const COLOR_BLUE = '#0B6E99'
const COLOR_CYAN_DARK = '#106A82'

const tooltipContentStyle = {
  backgroundColor: '#0F172A',
  borderRadius: '8px',
  color: '#fff',
  fontSize: '12px',
  border: '1px solid #334155',
}

/** Formata "yyyy-mm" (ex: "2025-06") como "Jun/25". */
const formatMesAnoCurto = (ym: string) => {
  if (!ym) return ''
  const p = ym.split('-')
  if (p.length < 2) return ym
  const mo = parseInt(p[1], 10)
  if (isNaN(mo) || mo < 1 || mo > 12) return ym
  return MESES_CURTOS[mo - 1] + '/' + p[0].slice(2)
}

export default function DashboardGeral() {
  const [data, setData] = useState<DashboardStatsResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()
  const location = useLocation()

  const [filters, setFilters] = useState<FilterState>(() => {
    const loaded = loadFiltersFromSession()
    if (!hasSavedFiltersInSession()) {
      saveFiltersToSession(loaded)
    }
    return loaded
  })

  const filtersRef = useRef<FilterState>(filters)
  filtersRef.current = filters
  const requestSeqRef = useRef<number>(0)
  const abortControllerRef = useRef<AbortController | null>(null)

  const loadData = useCallback(async (activeFilters = filtersRef.current) => {
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
  }, [])

  // Sincroniza os filtros com o sessionStorage de forma reativa:
  // recarrega ao navegar para esta rota, ao focar na janela, ao disparar
  // evento de alteração/limpeza ou evento storage nativo.
  const syncFiltersFromSession = useCallback(() => {
    const latest = loadFiltersFromSession()
    const currentSerialized = JSON.stringify(filtersRef.current)
    const latestSerialized = JSON.stringify(latest)

    if (currentSerialized !== latestSerialized) {
      setFilters(latest)
      loadData(latest)
    }
  }, [loadData])

  // Reagir quando a rota mudar (usuário volta da tela /dashboard/filtros para /dashboard/geral ou /)
  useEffect(() => {
    syncFiltersFromSession()
  }, [location.pathname, syncFiltersFromSession])

  // Reagir a eventos de foco, storage entre abas e evento customizado de filtros alterados/limpos
  useEffect(() => {
    const handleFiltersChanged = (e?: Event) => {
      const customEvent = e as CustomEvent<FilterState | null> | undefined
      if (customEvent?.detail) {
        const nextFilters = customEvent.detail
        if (JSON.stringify(filtersRef.current) !== JSON.stringify(nextFilters)) {
          setFilters(nextFilters)
          loadData(nextFilters)
          return
        }
      }
      syncFiltersFromSession()
    }

    const handleFocus = () => {
      syncFiltersFromSession()
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        syncFiltersFromSession()
      }
    }

    const handleStorage = (e: StorageEvent) => {
      if (!e.key || e.key === 'paineis_vendas_filters') {
        syncFiltersFromSession()
      }
    }

    window.addEventListener(FILTERS_CHANGED_EVENT, handleFiltersChanged)
    window.addEventListener('focus', handleFocus)
    window.addEventListener('storage', handleStorage)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener(FILTERS_CHANGED_EVENT, handleFiltersChanged)
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('storage', handleStorage)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [syncFiltersFromSession, loadData])

  useEffect(() => {
    loadData(filters)
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [filters, loadData])

  useRealtime('vendas', () => {
    loadData(filtersRef.current)
  })

  const chartVendasPorMes = data?.charts?.vendasPorMes || []
  const chartVendasPorAno = data?.charts?.vendasPorAno || []
  const chartGrupoItem = data?.charts?.grupoItem || []
  const chartVendasEquipamentosRaw =
    data?.charts?.vendasEquipamentosHistorico || data?.charts?.vendasEquipamentosPorAno || []
  const chartVendasInsumosRaw =
    data?.charts?.vendasInsumosHistorico || data?.charts?.vendasInsumosPorAno || []
  const chartClientesAtivosEquipamentos = data?.charts?.clientesAtivosEquipamentos || []
  const chartClientesAtivosTintas = data?.charts?.clientesAtivosTintas || []
  const chartClientesAtivosAcessorios = data?.charts?.clientesAtivosAcessorios || []
  const chartClientesAtivosPecas = data?.charts?.clientesAtivosPecas || []

  // Rótulos dinâmicos de anos comparativos (3 anos: anoRetrasado, anoAnterior, anoAtual)
  const { anoAtualLabel, anoAnteriorLabel, anoRetrasadoLabel } = useMemo(() => {
    let maxY = 2026
    if (chartClientesAtivosEquipamentos.length > 0) {
      const ultimoMes =
        chartClientesAtivosEquipamentos[chartClientesAtivosEquipamentos.length - 1].mes
      const y = parseInt(ultimoMes.slice(0, 4), 10)
      if (!isNaN(y) && y >= 2020) maxY = y
    } else if (chartVendasPorMes.length > 0) {
      const ultimoItem = chartVendasPorMes[chartVendasPorMes.length - 1].mes
      const parts = ultimoItem.split('/')
      if (parts.length === 2) {
        const y2 = parseInt(parts[1], 10)
        if (!isNaN(y2)) maxY = 2000 + y2
      }
    }
    return {
      anoAtualLabel: String(maxY),
      anoAnteriorLabel: String(maxY - 1),
      anoRetrasadoLabel: String(maxY - 2),
    }
  }, [chartClientesAtivosEquipamentos, chartVendasPorMes])

  // Visão Geral exibe SOMENTE os 2 totais da Faixa Comercial (pedido do Silvio):
  // "Valor Total (Bruto)" (total_nf_novo) e "Valor Líquido (NET)" (valor_liquido).
  const reportKpis = useMemo(() => {
    return {
      valorTotalBruto: data?.kpis?.totalNfNovo || 0,
      valorLiquido: data?.kpis?.valorLiquido || 0,
    }
  }, [data])

  // Multi-ano: 2+ anos nos Filtros Globais (ou janela dataDe→dataAte multi-ano)
  // ⇒ os 2 KPIs de valor também são exibidos por ano em barras verticais, com o
  // mesmo critério do backend (MAX por NF para o total bruto).
  const multiAno = useMemo(() => {
    const anosSel = (filters?.ano || []).length
    if (anosSel > 1) return true
    if (anosSel > 0) return false
    if (filters?.dataDe && filters?.dataAte) {
      const yMin = Number(String(filters.dataDe).slice(0, 4))
      const yMax = Number(String(filters.dataAte).slice(0, 4))
      if (!isNaN(yMin) && !isNaN(yMax)) return yMax > yMin
    }
    return false
  }, [filters])

  const porAnoValuesData = useMemo(() => {
    return (data?.porAno || [])
      .map((item) => ({
        ano: item.ano,
        [TITULO_VALOR_TOTAL_BRUTO]: Number(item.total_nf_novo) || 0,
        [TITULO_VALOR_LIQUIDO_NET]: Number(item.valor_liquido_total) || 0,
      }))
      .sort((a, b) => Number(a.ano) - Number(b.ano))
  }, [data])

  const isNoData =
    !loading &&
    !error &&
    data !== null &&
    (data.kpis?.faturamento ?? 0) === 0 &&
    (data.kpis?.documentos ?? 0) === 0 &&
    chartVendasPorMes.length === 0 &&
    chartGrupoItem.length === 0

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

  // Médias anuais dos gráficos históricos com granularidade mensal:
  // Agrupa os pontos do recorte por ano, calcula a soma de cada ano e tira a média por ano.
  const mediaPorAnoTendenciaEquipamentos = useMemo(() => {
    if (dataTendenciaEquipamentos.length === 0) return 0
    const anoSoma = new Map<string, number>()
    for (const p of dataTendenciaEquipamentos) {
      const ano = p.periodo.slice(0, 4)
      anoSoma.set(ano, (anoSoma.get(ano) || 0) + (p.total || 0))
    }
    if (anoSoma.size === 0) return 0
    let total = 0
    for (const v of anoSoma.values()) {
      total += v
    }
    return total / anoSoma.size
  }, [dataTendenciaEquipamentos])

  // Média mensal (na escala do eixo Y) para Tendência de Equipamentos
  const mediaMensalTendenciaEquipamentos = useMemo(() => {
    if (dataTendenciaEquipamentos.length === 0) return 0
    const sum = dataTendenciaEquipamentos.reduce((acc, cur) => acc + (cur.total || 0), 0)
    return sum / dataTendenciaEquipamentos.length
  }, [dataTendenciaEquipamentos])

  const mediaPorAnoAcumuladoInsumos = useMemo(() => {
    if (dataAcumuladoInsumos.length === 0) return 0
    const anoSoma = new Map<string, number>()
    for (const p of dataAcumuladoInsumos) {
      const ano = p.periodo.slice(0, 4)
      anoSoma.set(ano, (anoSoma.get(ano) || 0) + (p.total || 0))
    }
    if (anoSoma.size === 0) return 0
    let total = 0
    for (const v of anoSoma.values()) {
      total += v
    }
    return total / anoSoma.size
  }, [dataAcumuladoInsumos])

  // Média mensal (na escala do eixo Y) para Acumulado de Insumos
  const mediaMensalAcumuladoInsumos = useMemo(() => {
    if (dataAcumuladoInsumos.length === 0) return 0
    const sum = dataAcumuladoInsumos.reduce((acc, cur) => acc + (cur.total || 0), 0)
    return sum / dataAcumuladoInsumos.length
  }, [dataAcumuladoInsumos])

  // Média anual de "Evolução de Vendas por Ano" (cada ponto exibido é um ano)
  const mediaVendasPorAno = useMemo(() => {
    if (chartVendasPorAno.length === 0) return 0
    const sum = chartVendasPorAno.reduce((acc, cur) => acc + (Number(cur.faturamento) || 0), 0)
    return sum / chartVendasPorAno.length
  }, [chartVendasPorAno])

  // Média de faturamento dos meses exibidos em "Evolução de Vendas por Mês"
  const mediaVendasPorMesAtual = useMemo(() => {
    if (chartVendasPorMes.length === 0) return 0
    const sum = chartVendasPorMes.reduce((acc, cur) => acc + (Number(cur.faturamento) || 0), 0)
    return sum / chartVendasPorMes.length
  }, [chartVendasPorMes])

  return (
    <div className="space-y-6">
      {/* Filtros globais: geridos na página dedicada /dashboard/filtros */}
      <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-3 shadow-xs">
        <div className="flex items-center gap-2 min-w-0">
          <SlidersHorizontal className="w-4 h-4 text-[#0B6E99] shrink-0" />
          <span className="text-xs text-slate-600 font-medium truncate">
            Filtros globais gerenciados no submenu{' '}
            <span className="font-bold text-slate-800">Dashboard → Filtros Globais (Setup)</span>
            {' — '}aplicados automaticamente a esta visão.
          </span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate('/dashboard/filtros')}
          className="bg-white border-gray-200 text-[#0B6E99] hover:bg-cyan-50 font-bold gap-1.5 text-xs shadow-2xs h-8 shrink-0"
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          Abrir Filtros Globais
        </Button>
      </div>

      {/* Título da Visão Geral por Clientes */}
      <Card className="rounded-xl border border-gray-200 bg-white p-4 shadow-xs">
        <div>
          <CardTitle className="text-base font-extrabold text-slate-900">
            Visão Geral por Clientes — Indicadores Consolidados
          </CardTitle>
          <CardDescription className="text-xs text-slate-500 font-medium mt-0.5">
            Tendências de mercado, evolução temporal e comparativos de clientes ativos
          </CardDescription>
        </div>
      </Card>

      {/* Multi-ano: barras verticais POR ANO com os 5 KPIs de valor (uma barra
          por ano, uma série colorida por métrica — mesmo critério do backend) */}
      {multiAno && porAnoValuesData.length > 1 && !loading && (
        <div>
          <ChartCard
            title="Valores por Ano"
            description="Valor Total (Bruto) e Valor Líquido (NET) — comparados ano a ano no período filtrado"
            icon={BarChart2}
            iconColor="text-[#0B6E99]"
          >
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={porAnoValuesData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                <XAxis
                  dataKey="ano"
                  tickLine={false}
                  axisLine={{ stroke: '#E2E8F0' }}
                  tick={{ fill: '#334155', fontSize: 12, fontWeight: 600 }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: '#64748B', fontSize: 11 }}
                  tickFormatter={(val) => {
                    const n = Number(val)
                    if (Math.abs(n) >= 1_000_000) return `R$ ${(n / 1_000_000).toFixed(1)}M`
                    if (Math.abs(n) >= 1_000) return `R$ ${(n / 1_000).toFixed(0)}k`
                    return `R$ ${n}`
                  }}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(148, 163, 184, 0.15)' }}
                  formatter={(val: number | string | undefined) => [
                    formatCurrency(Number(val) || 0),
                    '',
                  ]}
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
                  dataKey="Valor Total (Bruto)"
                  fill="#0B6E99"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={32}
                />
                <Bar
                  dataKey="Valor Líquido (NET)"
                  fill="#0D9488"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={32}
                />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      )}

      {/* KPIs — Faixa Comercial: apenas os 2 totais oficiais (pedido do Silvio) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-4">
        <KpiCard
          title={TITULO_VALOR_TOTAL_BRUTO}
          value={reportKpis.valorTotalBruto}
          isCurrency
          icon={DollarSign}
          iconBgColor="bg-cyan-50"
          iconColor="text-[#0B6E99]"
        />
        <KpiCard
          title={TITULO_VALOR_LIQUIDO_NET}
          value={reportKpis.valorLiquido}
          isCurrency
          icon={TrendingUp}
          iconBgColor="bg-teal-50"
          iconColor="text-teal-600"
        />
      </div>

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
              onClick={() => navigate('/dashboard/filtros')}
              variant="outline"
              className="border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-bold"
            >
              <SlidersHorizontal className="w-4 h-4 mr-2" />
              Abrir Filtros Globais
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
        /* Indicadores da Visão Geral */
        <div className="space-y-6">
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
                      Os indicadores e gráficos sensíveis ao período estão zerados para o recorte
                      atual.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    onClick={() => navigate('/dashboard/filtros')}
                    className="bg-[#0B6E99] hover:bg-[#084F6E] text-white font-bold text-xs h-9 px-4 shadow-sm"
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5 mr-1.5" />
                    Abrir Filtros Globais
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {/* Seção: Evolução de Vendas por Mês & Evolução de Vendas por Ano (antes de Tendência) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Indicador: Evolução de Vendas por Mês */}
            <ChartCard
              title="Evolução de Vendas por Mês"
              description={`Últimos 6 meses com comparação trienal (${anoRetrasadoLabel}, ${anoAnteriorLabel}, ${anoAtualLabel})`}
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
                      if (name === 'faturamento')
                        return [formatCurrency(n), `${TITULO_VALOR_TOTAL_BRUTO} (${anoAtualLabel})`]
                      if (name === 'faturamento_ano_anterior')
                        return [
                          formatCurrency(n),
                          `${TITULO_VALOR_TOTAL_BRUTO} (${anoAnteriorLabel})`,
                        ]
                      if (name === 'faturamento_ano_retrasado')
                        return [
                          formatCurrency(n),
                          `${TITULO_VALOR_TOTAL_BRUTO} (${anoRetrasadoLabel})`,
                        ]
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
                        faturamento: `${TITULO_VALOR_TOTAL_BRUTO} (${anoAtualLabel})`,
                        faturamento_ano_anterior: `${TITULO_VALOR_TOTAL_BRUTO} (${anoAnteriorLabel})`,
                        faturamento_ano_retrasado: `${TITULO_VALOR_TOTAL_BRUTO} (${anoRetrasadoLabel})`,
                        devolucoes: 'Devoluções',
                      }
                      return (
                        <span className="text-xs font-bold text-slate-700">
                          {labels[value] ?? value}
                        </span>
                      )
                    }}
                  />
                  {mediaVendasPorMesAtual > 0 && (
                    <ReferenceLine
                      y={mediaVendasPorMesAtual}
                      stroke="#64748B"
                      strokeDasharray="4 4"
                      strokeWidth={1.5}
                      label={{
                        value: `Média: ${formatCompactCurrency(mediaVendasPorMesAtual)}`,
                        position: 'top',
                        fill: '#475569',
                        fontSize: 10,
                        fontWeight: 700,
                      }}
                    />
                  )}
                  <Bar
                    dataKey="faturamento_ano_retrasado"
                    name="faturamento_ano_retrasado"
                    fill="#94A3B8"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={22}
                  />
                  <Bar
                    dataKey="faturamento_ano_anterior"
                    name="faturamento_ano_anterior"
                    fill="#67D2E2"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={22}
                  />
                  <Bar
                    dataKey="faturamento"
                    name="faturamento"
                    fill={COLOR_BLUE}
                    radius={[4, 4, 0, 0]}
                    maxBarSize={22}
                  />
                  <Bar
                    dataKey="devolucoes"
                    name="devolucoes"
                    fill="#EF4444"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={22}
                  />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* Indicador: Evolução de Vendas por Ano */}
            <ChartCard
              title="Evolução de Vendas por Ano"
              description={`${TITULO_VALOR_TOTAL_BRUTO} por ano e variação percentual em relação ao ano anterior`}
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
                      return [formatCurrency(n), TITULO_VALOR_TOTAL_BRUTO]
                    }}
                    contentStyle={tooltipContentStyle}
                  />
                  <Legend
                    verticalAlign="top"
                    height={36}
                    formatter={(value) => {
                      const labels: Record<string, string> = {
                        faturamento: TITULO_VALOR_TOTAL_BRUTO,
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
                  {mediaVendasPorAno > 0 && (
                    <ReferenceLine
                      yAxisId="left"
                      y={mediaVendasPorAno}
                      stroke="#64748B"
                      strokeDasharray="4 4"
                      strokeWidth={1.5}
                      label={{
                        value: `Média/ano: ${formatCompactCurrency(mediaVendasPorAno)}`,
                        position: 'top',
                        fill: '#475569',
                        fontSize: 10,
                        fontWeight: 700,
                      }}
                    />
                  )}
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

          {/* Seção: Tendência de Vendas — Equipamentos & Acumulado de Vendas — Insumos */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Indicador: Tendência de Vendas — Equipamentos */}
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
                      formatter={(val: number | string | undefined, name: string) => {
                        const n = typeof val === 'number' ? val : Number(val)
                        if (name === 'Equipamentos') {
                          return [formatCurrency(n), 'Vendas Equipamentos']
                        }
                        if (name === 'Média (mês)') {
                          return [formatCurrency(n), 'Média Mensal']
                        }
                        return [formatCurrency(n), name]
                      }}
                      labelFormatter={(label) => `Período: ${formatMesAnoCurto(String(label))}`}
                      contentStyle={tooltipContentStyle}
                    />
                    {mediaMensalTendenciaEquipamentos > 0 && (
                      <ReferenceLine
                        y={mediaMensalTendenciaEquipamentos}
                        stroke="#64748B"
                        strokeDasharray="4 4"
                        strokeWidth={1.5}
                        label={{
                          value: `Média/ano: ${formatCompactCurrency(mediaPorAnoTendenciaEquipamentos)} (mês: ${formatCompactCurrency(mediaMensalTendenciaEquipamentos)})`,
                          position: 'top',
                          fill: '#475569',
                          fontSize: 10,
                          fontWeight: 700,
                        }}
                      />
                    )}
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

            {/* Indicador: Acumulado de Vendas — Insumos */}
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
                      formatter={(val: number | string | undefined, name: string) => {
                        const n = typeof val === 'number' ? val : Number(val)
                        if (name === 'Insumos') {
                          return [formatCurrency(n), 'Vendas Insumos']
                        }
                        if (name === 'Média (mês)') {
                          return [formatCurrency(n), 'Média Mensal']
                        }
                        return [formatCurrency(n), name]
                      }}
                      labelFormatter={(label) => `Período: ${formatMesAnoCurto(String(label))}`}
                      contentStyle={tooltipContentStyle}
                    />
                    {mediaMensalAcumuladoInsumos > 0 && (
                      <ReferenceLine
                        y={mediaMensalAcumuladoInsumos}
                        stroke="#64748B"
                        strokeDasharray="4 4"
                        strokeWidth={1.5}
                        label={{
                          value: `Média/ano: ${formatCompactCurrency(mediaPorAnoAcumuladoInsumos)} (mês: ${formatCompactCurrency(mediaMensalAcumuladoInsumos)})`,
                          position: 'top',
                          fill: '#475569',
                          fontSize: 10,
                          fontWeight: 700,
                        }}
                      />
                    )}
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

          {/* Seção: Clientes Ativos — Equipamentos, Tintas, Acessórios e Peças */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Clientes Ativos — Equipamentos */}
            <ChartCard
              title="Clientes Ativos — Equipamentos"
              description={`Comparativo trienal de clientes ativos de equipamentos (${anoRetrasadoLabel}, ${anoAnteriorLabel}, ${anoAtualLabel})`}
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
                      dataKey="clientesAnoRetrasado"
                      name={anoRetrasadoLabel}
                      fill="#94A3B8"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={24}
                    />
                    <Bar
                      dataKey="clientesAnoAnterior"
                      name={anoAnteriorLabel}
                      fill="#67D2E2"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={24}
                    />
                    <Bar
                      dataKey="clientes"
                      name={anoAtualLabel}
                      fill={COLOR_BLUE}
                      radius={[4, 4, 0, 0]}
                      maxBarSize={24}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            {/* Clientes Ativos — Tintas */}
            <ChartCard
              title="Clientes Ativos — Tintas"
              description={`Comparativo trienal de clientes ativos de tintas (${anoRetrasadoLabel}, ${anoAnteriorLabel}, ${anoAtualLabel})`}
              icon={Users}
              iconColor="text-[#0B6E99]"
            >
              {chartClientesAtivosTintas.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs text-slate-400">
                  Nenhum dado disponível
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartClientesAtivosTintas}
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
                      dataKey="clientesAnoRetrasado"
                      name={anoRetrasadoLabel}
                      fill="#94A3B8"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={24}
                    />
                    <Bar
                      dataKey="clientesAnoAnterior"
                      name={anoAnteriorLabel}
                      fill="#67D2E2"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={24}
                    />
                    <Bar
                      dataKey="clientes"
                      name={anoAtualLabel}
                      fill={COLOR_BLUE}
                      radius={[4, 4, 0, 0]}
                      maxBarSize={24}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            {/* Clientes Ativos — Acessórios */}
            <ChartCard
              title="Clientes Ativos — Acessórios"
              description={`Comparativo trienal de clientes ativos de acessórios (${anoRetrasadoLabel}, ${anoAnteriorLabel}, ${anoAtualLabel})`}
              icon={Users}
              iconColor="text-[#0B6E99]"
            >
              {chartClientesAtivosAcessorios.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs text-slate-400">
                  Nenhum dado disponível
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartClientesAtivosAcessorios}
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
                      dataKey="clientesAnoRetrasado"
                      name={anoRetrasadoLabel}
                      fill="#94A3B8"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={24}
                    />
                    <Bar
                      dataKey="clientesAnoAnterior"
                      name={anoAnteriorLabel}
                      fill="#67D2E2"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={24}
                    />
                    <Bar
                      dataKey="clientes"
                      name={anoAtualLabel}
                      fill={COLOR_BLUE}
                      radius={[4, 4, 0, 0]}
                      maxBarSize={24}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            {/* Clientes Ativos — Peças */}
            <ChartCard
              title="Clientes Ativos — Peças"
              description={`Comparativo trienal de clientes ativos de peças (${anoRetrasadoLabel}, ${anoAnteriorLabel}, ${anoAtualLabel})`}
              icon={Users}
              iconColor="text-[#0B6E99]"
            >
              {chartClientesAtivosPecas.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs text-slate-400">
                  Nenhum dado disponível
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartClientesAtivosPecas}
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
                      dataKey="clientesAnoRetrasado"
                      name={anoRetrasadoLabel}
                      fill="#94A3B8"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={24}
                    />
                    <Bar
                      dataKey="clientesAnoAnterior"
                      name={anoAnteriorLabel}
                      fill="#67D2E2"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={24}
                    />
                    <Bar
                      dataKey="clientes"
                      name={anoAtualLabel}
                      fill={COLOR_BLUE}
                      radius={[4, 4, 0, 0]}
                      maxBarSize={24}
                    />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
          </div>
        </div>
      )}
    </div>
  )
}
