import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import {
  PackageX,
  PackageCheck,
  TrendingUp,
  AlertTriangle,
  Layers,
  Search,
  Download,
  RotateCw,
  RefreshCw,
  AlertCircle,
  FileSpreadsheet,
  ArrowUpDown,
  Filter,
  CheckCircle2,
  Clock,
  Boxes,
  HelpCircle,
  BarChart2,
  Calendar,
  Building2,
  ChevronRight,
  Info,
} from 'lucide-react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
} from 'recharts'
import * as XLSX from 'xlsx'
import {
  fetchEstoqueFaltanteList,
  fetchEstoqueFaltanteStats,
  fetchMrpData,
  type EstoqueFaltanteItem,
  type EstoqueFaltanteStatsResult,
  type MrpItem,
  type MrpResult,
} from '@/services/estoqueFaltante'
import PedidosAbertosFilterBar, {
  type PedidosAbertosFilters,
  EMPTY_PEDIDOS_ABERTOS_FILTERS,
} from '@/components/PedidosAbertosFilterBar'
import { formatCurrency, formatNumber, formatDate, formatDateTime } from '@/lib/formatters'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import ChartCard from '@/components/ChartCard'
import KpiCard from '@/components/KpiCard'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

const ROLAND_BLUE = '#0B6E99'
const ROLAND_BLUE_DARK = '#085273'
const AMBER_ACCENT = '#D97706'
const RED_ALERT = '#EF4444'
const EMERALD_OK = '#10B981'
const SLATE_MUTED = '#64748B'

export default function EstoqueFaltante() {
  const [searchParams] = useSearchParams()
  const { toast } = useToast()

  // Tabs principais: 'itens_faltantes' | 'mrp'
  const [activeTab, setActiveTab] = useState<'itens_faltantes' | 'mrp'>('itens_faltantes')

  // Inicialização de filtros vindos da querystring do Dashboard Pedidos em Aberto
  const initialFilters = useMemo<PedidosAbertosFilters>(() => {
    const canalParam = searchParams.get('canal')
    const canalClientesParam = searchParams.get('canalClientes')
    const deployParam = searchParams.get('deploy')
    const insideParam = searchParams.get('inside')
    const ehCanalParam = searchParams.get('ehCanal')

    const ehCanalValid =
      ehCanalParam === 'sim' || ehCanalParam === 'nao' || ehCanalParam === 'todos'
        ? (ehCanalParam as 'sim' | 'nao' | 'todos')
        : 'todos'

    return {
      ...EMPTY_PEDIDOS_ABERTOS_FILTERS,
      canal: canalParam ? canalParam.split(',').filter(Boolean) : [],
      canalClientes: canalClientesParam ? canalClientesParam.split(',').filter(Boolean) : [],
      deploy: deployParam ? deployParam.split(',').filter(Boolean) : [],
      inside: insideParam ? insideParam.split(',').filter(Boolean) : [],
      ehCanal: ehCanalValid,
    }
  }, [searchParams])

  const [filters, setFilters] = useState<PedidosAbertosFilters>(initialFilters)

  // Sub-filtro de trânsito na visão Itens Faltantes: '' (todos faltantes) | 'com_transito' | 'sem_transito'
  const [statusTransitoFilter, setStatusTransitoFilter] = useState<
    '' | 'com_transito' | 'sem_transito'
  >('')
  const [searchTerm, setSearchTerm] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')

  // Estados de Paginação e Ordenação
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(50)
  const [sortField, setSortField] = useState('valor_em_aberto')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')

  // Dados da Visão 1: Itens Faltantes
  const [items, setItems] = useState<EstoqueFaltanteItem[]>([])
  const [totalItems, setTotalItems] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [totalValor, setTotalValor] = useState(0)
  const [totalQtd, setTotalQtd] = useState(0)
  const [listLoading, setListLoading] = useState(true)

  // KPIs e Top 20 da Visão 1 (carregamento escalonado para performance)
  const [statsData, setStatsData] = useState<EstoqueFaltanteStatsResult | null>(null)
  const [statsLoading, setStatsLoading] = useState(true)

  // Dados da Visão 2: MRP
  const [mrpData, setMrpData] = useState<MrpResult | null>(null)
  const [mrpLoading, setMrpLoading] = useState(false)
  const [mrpLoadedOnce, setMrpLoadedOnce] = useState(false)

  // AbortControllers para evitar condições de corrida
  const listAbortRef = useRef<AbortController | null>(null)
  const statsAbortRef = useRef<AbortController | null>(null)
  const mrpAbortRef = useRef<AbortController | null>(null)

  // 1. Carregamento da Lista de Itens Faltantes
  const loadList = useCallback(async () => {
    if (listAbortRef.current) {
      listAbortRef.current.abort()
    }
    const controller = new AbortController()
    listAbortRef.current = controller

    setListLoading(true)
    try {
      const res = await fetchEstoqueFaltanteList({
        page,
        perPage,
        sortField,
        sortDirection,
        statusTransito: statusTransitoFilter,
        search: appliedSearch,
        filters: {
          canal: filters.canal,
          canalClientes: filters.canalClientes,
          deploy: filters.deploy,
          inside: filters.inside,
          ehCanal: filters.ehCanal,
        },
        signal: controller.signal,
      })
      setItems(res.items || [])
      setTotalItems(res.totalItems || 0)
      setTotalPages(res.totalPages || 1)
      setTotalValor(res.totalValor || 0)
      setTotalQtd(res.totalQtd || 0)
    } catch (err: unknown) {
      if ((err as Error)?.name === 'AbortError') return
      console.error('Erro ao carregar lista de itens faltantes:', err)
      toast({
        variant: 'destructive',
        title: 'Erro ao carregar lista',
        description: 'Não foi possível carregar o relatório de itens faltantes.',
      })
    } finally {
      setListLoading(false)
    }
  }, [page, perPage, sortField, sortDirection, statusTransitoFilter, appliedSearch, filters, toast])

  // 2. Carregamento escalonado de KPIs e Gráficos Top 20 (após a tabela iniciar)
  const loadStats = useCallback(async () => {
    if (statsAbortRef.current) {
      statsAbortRef.current.abort()
    }
    const controller = new AbortController()
    statsAbortRef.current = controller

    setStatsLoading(true)
    try {
      const res = await fetchEstoqueFaltanteStats(
        {
          canal: filters.canal,
          canalClientes: filters.canalClientes,
          deploy: filters.deploy,
          inside: filters.inside,
          ehCanal: filters.ehCanal,
          search: appliedSearch,
        },
        { signal: controller.signal },
      )
      setStatsData(res)
    } catch (err: unknown) {
      if ((err as Error)?.name === 'AbortError') return
      console.warn('Erro ao carregar estatísticas de estoque faltante:', err)
    } finally {
      setStatsLoading(false)
    }
  }, [filters, appliedSearch])

  // 3. Carregamento dos dados MRP
  const loadMrp = useCallback(async () => {
    if (mrpAbortRef.current) {
      mrpAbortRef.current.abort()
    }
    const controller = new AbortController()
    mrpAbortRef.current = controller

    setMrpLoading(true)
    try {
      const res = await fetchMrpData({ signal: controller.signal })
      setMrpData(res)
      setMrpLoadedOnce(true)
    } catch (err: unknown) {
      if ((err as Error)?.name === 'AbortError') return
      console.error('Erro ao carregar MRP:', err)
      toast({
        variant: 'destructive',
        title: 'Erro ao carregar MRP',
        description: 'Não foi possível carregar os dados de vendas e estoque para MRP.',
      })
    } finally {
      setMrpLoading(false)
    }
  }, [toast])

  // Dispara consultas da Visão 1
  useEffect(() => {
    loadList()
  }, [loadList])

  useEffect(() => {
    loadStats()
  }, [loadStats])

  // Carrega MRP sob demanda ao abrir a aba
  useEffect(() => {
    if (activeTab === 'mrp' && !mrpLoadedOnce) {
      loadMrp()
    }
  }, [activeTab, mrpLoadedOnce, loadMrp])

  // Handler de ordenação da tabela
  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDirection('desc')
    }
    setPage(1)
  }

  // Busca rápida
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setAppliedSearch(searchTerm.trim())
    setPage(1)
  }

  // Aplicação de filtros de Canais
  const handleApplyFilters = (newFilters: PedidosAbertosFilters) => {
    setFilters(newFilters)
    setPage(1)
  }

  // Exportação Excel
  const handleExportExcel = async () => {
    try {
      toast({
        title: 'Gerando arquivo Excel...',
        description: 'Aguarde o processamento de todos os registros faltantes.',
      })

      // Busca completa sem paginação
      const res = await fetchEstoqueFaltanteList({
        page: 1,
        perPage: 2000,
        sortField,
        sortDirection,
        statusTransito: statusTransitoFilter,
        search: appliedSearch,
        filters: {
          canal: filters.canal,
          canalClientes: filters.canalClientes,
          deploy: filters.deploy,
          inside: filters.inside,
          ehCanal: filters.ehCanal,
        },
      })

      const exportRows = (res.items || []).map((item) => ({
        Canal: item.canal,
        'Código Item': item.codigo_item,
        Descrição: item.descricao_item,
        Grupo: item.grupo_item,
        'Qtd Aberta': item.qtd_aberto,
        'Valor em Aberto (R$)': item.valor_em_aberto,
        'Nº de Pedidos': item.pedidos_qtd,
        'Nº de Clientes': item.clientes_qtd,
        Clientes: item.clientes_nomes,
        'Em Trânsito': item.em_transito,
        'Status Trânsito': item.em_transito > 0 ? 'Com Trânsito' : 'Sem Trânsito (Faltante Total)',
        'Média Mensal Vendas (6m)': item.media_mensal_vendas,
        'Total Vendido (6m)': item.qtd_vendida_6m,
      }))

      const ws = XLSX.utils.json_to_sheet(exportRows)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Itens Faltantes')
      const fileName = `Itens_Faltantes_${new Date().toISOString().slice(0, 10)}.xlsx`
      XLSX.writeFile(wb, fileName)

      toast({
        title: 'Download iniciado',
        description: `Exportados ${exportRows.length} registros com sucesso.`,
      })
    } catch (err) {
      console.error('Erro na exportação:', err)
      toast({
        variant: 'destructive',
        title: 'Erro ao exportar',
        description: 'Não foi possível gerar a planilha Excel.',
      })
    }
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Cabeçalho da Página */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-amber-500/10 text-amber-700">
            <PackageX className="w-6 h-6 text-amber-600" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold tracking-tight text-slate-900">
                Estoque Faltante &amp; MRP
              </h2>
              <Badge
                variant="outline"
                className="bg-amber-50 text-amber-900 border-amber-300 font-bold text-xs"
              >
                SAP Consolidado
              </Badge>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Gestão de itens com estoque zerado em pedidos abertos e planejamento de reposição
              baseado no histórico de vendas dos últimos 6 meses.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end md:self-auto">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              loadList()
              loadStats()
              if (activeTab === 'mrp') loadMrp()
            }}
            disabled={listLoading || statsLoading || mrpLoading}
            className="text-xs h-9 px-3 border-slate-200 hover:bg-slate-100 text-slate-700 gap-1.5"
          >
            <RotateCw
              className={cn(
                'w-3.5 h-3.5 text-[#0B6E99]',
                (listLoading || statsLoading || mrpLoading) && 'animate-spin',
              )}
            />
            Atualizar
          </Button>

          <Button
            size="sm"
            onClick={handleExportExcel}
            className="bg-[#0B6E99] hover:bg-[#085273] text-white font-bold text-xs h-9 px-3 gap-1.5 shadow-xs"
          >
            <Download className="w-3.5 h-3.5" />
            Exportar Excel
          </Button>
        </div>
      </div>

      {/* Barra de Filtros de Canais (herdando os mesmos controles de Pedidos em Aberto) */}
      <PedidosAbertosFilterBar filters={filters} onApplyFilters={handleApplyFilters} />

      {/* Tabs Principais: Itens Faltantes vs MRP */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as 'itens_faltantes' | 'mrp')}
        className="space-y-5"
      >
        <div className="flex items-center justify-between border-b border-slate-200 pb-2">
          <TabsList className="bg-slate-100 p-1 rounded-xl h-10">
            <TabsTrigger
              value="itens_faltantes"
              className="text-xs font-bold data-[state=active]:bg-white data-[state=active]:text-[#0B6E99] data-[state=active]:shadow-xs rounded-lg px-4 gap-2"
            >
              <PackageX className="w-4 h-4 text-amber-600" />
              (1) Itens Faltantes em Carteira
            </TabsTrigger>
            <TabsTrigger
              value="mrp"
              className="text-xs font-bold data-[state=active]:bg-white data-[state=active]:text-[#0B6E99] data-[state=active]:shadow-xs rounded-lg px-4 gap-2"
            >
              <TrendingUp className="w-4 h-4 text-teal-600" />
              (2) MRP — Reposição Top 20 Mais Vendidos
            </TabsTrigger>
          </TabsList>

          <span className="text-xs text-slate-500 hidden sm:inline">
            {activeTab === 'itens_faltantes'
              ? 'Regra: Pedidos em aberto com Em Estoque = 0'
              : 'Base Vendas últimos 6 meses vs Posição SAP'}
          </span>
        </div>

        {/* ------------------------------------------------------------- */}
        {/* VISÃO 1: ITENS FALTANTES */}
        {/* ------------------------------------------------------------- */}
        <TabsContent value="itens_faltantes" className="space-y-6 mt-0">
          {/* 4 KPIs de Itens Faltantes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              title="Itens Faltantes Distintos"
              value={statsData?.kpis.totalItensDistintos ?? 0}
              decimals={0}
              icon={Boxes}
              iconBgColor="bg-amber-50"
              iconColor="text-amber-600"
              comparisonText="Itens com estoque zerado e pedido em aberto"
            />
            <KpiCard
              title="Demanda Pendente (R$)"
              value={statsData?.kpis.valorDemandaPendente ?? 0}
              isCurrency
              icon={TrendingUp}
              iconBgColor="bg-rose-50"
              iconColor="text-rose-600"
              comparisonText="Soma do valor em aberto dos itens sem estoque"
            />
            <KpiCard
              title="Pedidos Impactados"
              value={statsData?.kpis.pedidosImpactados ?? 0}
              decimals={0}
              icon={Calendar}
              iconBgColor="bg-sky-50"
              iconColor="text-sky-600"
              comparisonText="Pedidos travados aguardando esses itens"
            />
            <Card className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-xs flex flex-col justify-between">
              <div>
                <span className="text-xs font-semibold text-slate-500 block uppercase tracking-wider">
                  Situação de Trânsito
                </span>
                <div className="mt-2 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 text-emerald-700 font-semibold">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      Em Trânsito:
                    </span>
                    <strong className="text-slate-800">
                      {formatNumber(statsData?.kpis.comTransito.itens ?? 0)} itens (
                      {formatCurrency(statsData?.kpis.comTransito.valor ?? 0)})
                    </strong>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 text-rose-700 font-semibold">
                      <span className="w-2 h-2 rounded-full bg-rose-500" />
                      Faltante Total:
                    </span>
                    <strong className="text-rose-800">
                      {formatNumber(statsData?.kpis.semTransito.itens ?? 0)} itens (
                      {formatCurrency(statsData?.kpis.semTransito.valor ?? 0)})
                    </strong>
                  </div>
                </div>
              </div>
              <p className="text-[10px] text-slate-400 mt-2 pt-2 border-t border-slate-100">
                Itens sem estoque e sem trânsito exigem compra urgente.
              </p>
            </Card>
          </div>

          {/* Gráficos: Top 20 Itens Mais Solicitados Sem Estoque (por Quantidade e por Valor) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Top 20 por Quantidade Aberta */}
            <ChartCard
              title="Top 20 Faltantes por Quantidade Aberta"
              description="Itens com Em Estoque = 0 mais solicitados em unidades"
              icon={Boxes}
              iconColor="text-amber-600"
            >
              {!statsData?.top20Qtd || statsData.top20Qtd.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center p-8 text-center text-slate-400">
                  <PackageCheck className="w-8 h-8 text-slate-300 mb-1" />
                  <p className="text-xs font-semibold text-slate-600">
                    Nenhum item faltante encontrado no recorte
                  </p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={statsData.top20Qtd}
                    layout="vertical"
                    margin={{ top: 5, right: 20, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#F1F5F9" />
                    <XAxis
                      type="number"
                      tickLine={false}
                      axisLine={{ stroke: '#E2E8F0' }}
                      tick={{ fill: SLATE_MUTED, fontSize: 10 }}
                    />
                    <YAxis
                      type="category"
                      dataKey="codigo_item"
                      width={85}
                      tickLine={false}
                      axisLine={{ stroke: '#E2E8F0' }}
                      tick={{ fill: SLATE_MUTED, fontSize: 10 }}
                    />
                    <Tooltip
                      formatter={(val: number | string | undefined, name: string) => {
                        const n = typeof val === 'number' ? val : Number(val) || 0
                        if (name === 'qtd_aberto') return [`${formatNumber(n)} un`, 'Qtd Aberta']
                        return [n, name]
                      }}
                      labelFormatter={(label: any, payload: any) => {
                        const row = payload?.[0]?.payload
                        return `${label} - ${row?.descricao_item || ''} (${row?.tem_transito ? 'Com Trânsito' : 'Sem Trânsito'})`
                      }}
                      contentStyle={{
                        backgroundColor: '#0F172A',
                        borderRadius: '8px',
                        border: '1px solid #334155',
                        color: '#fff',
                        fontSize: '11px',
                        padding: '8px 12px',
                      }}
                    />
                    <Bar
                      dataKey="qtd_aberto"
                      name="qtd_aberto"
                      radius={[0, 4, 4, 0]}
                      maxBarSize={18}
                    >
                      {statsData.top20Qtd.map((entry, idx) => (
                        <Cell
                          key={`cell-${idx}`}
                          fill={entry.tem_transito ? '#3B82F6' : '#EF4444'}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            {/* Top 20 por Valor em Aberto */}
            <ChartCard
              title="Top 20 Faltantes por Valor em Aberto (R$)"
              description="Itens com Em Estoque = 0 de maior impacto financeiro na carteira"
              icon={TrendingUp}
              iconColor="text-rose-600"
            >
              {!statsData?.top20Valor || statsData.top20Valor.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center p-8 text-center text-slate-400">
                  <PackageCheck className="w-8 h-8 text-slate-300 mb-1" />
                  <p className="text-xs font-semibold text-slate-600">
                    Nenhum item faltante encontrado no recorte
                  </p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={statsData.top20Valor}
                    layout="vertical"
                    margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#F1F5F9" />
                    <XAxis
                      type="number"
                      tickLine={false}
                      axisLine={{ stroke: '#E2E8F0' }}
                      tick={{ fill: SLATE_MUTED, fontSize: 10 }}
                      tickFormatter={(val) => `R$ ${(val / 1000).toFixed(0)}k`}
                    />
                    <YAxis
                      type="category"
                      dataKey="codigo_item"
                      width={85}
                      tickLine={false}
                      axisLine={{ stroke: '#E2E8F0' }}
                      tick={{ fill: SLATE_MUTED, fontSize: 10 }}
                    />
                    <Tooltip
                      formatter={(val: number | string | undefined, name: string) => {
                        const n = typeof val === 'number' ? val : Number(val) || 0
                        if (name === 'valor_em_aberto')
                          return [formatCurrency(n), 'Valor em Aberto']
                        return [n, name]
                      }}
                      labelFormatter={(label: any, payload: any) => {
                        const row = payload?.[0]?.payload
                        return `${label} - ${row?.descricao_item || ''} (${row?.tem_transito ? 'Com Trânsito' : 'Sem Trânsito'})`
                      }}
                      contentStyle={{
                        backgroundColor: '#0F172A',
                        borderRadius: '8px',
                        border: '1px solid #334155',
                        color: '#fff',
                        fontSize: '11px',
                        padding: '8px 12px',
                      }}
                    />
                    <Bar
                      dataKey="valor_em_aberto"
                      name="valor_em_aberto"
                      radius={[0, 4, 4, 0]}
                      maxBarSize={18}
                    >
                      {statsData.top20Valor.map((entry, idx) => (
                        <Cell
                          key={`cell-val-${idx}`}
                          fill={entry.tem_transito ? '#0B6E99' : '#D97706'}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
          </div>

          {/* Legenda rápida das cores do Top 20 */}
          <div className="flex items-center justify-end gap-4 text-xs text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-200/60">
            <span className="font-semibold text-slate-700">Legenda dos gráficos:</span>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-xs bg-[#3B82F6] inline-block" />
              <span>Sem estoque mas com trânsito (a caminho)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-xs bg-[#EF4444] inline-block" />
              <span>Faltante total (sem estoque e sem trânsito)</span>
            </div>
          </div>

          {/* Tabela de Relatório: Itens Faltantes */}
          <Card className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-xs">
            <CardHeader className="p-4 sm:p-5 border-b border-slate-100 bg-slate-50/50">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base font-bold text-slate-800 flex items-center gap-2">
                    <PackageX className="w-5 h-5 text-amber-600" />
                    <span>Relatório de Itens Faltantes (Em Estoque = 0)</span>
                    <Badge
                      variant="secondary"
                      className="font-semibold text-xs bg-amber-100 text-amber-800"
                    >
                      {formatNumber(totalItems)} item(ns)
                    </Badge>
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500 mt-0.5">
                    Total em aberto: {formatCurrency(totalValor)} • {formatNumber(totalQtd)} un.
                    pendentes
                  </CardDescription>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  {/* Filtro rápido por Trânsito */}
                  <div className="inline-flex rounded-lg bg-slate-200/70 p-0.5 gap-0.5 text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        setStatusTransitoFilter('')
                        setPage(1)
                      }}
                      className={cn(
                        'px-2.5 py-1 text-[11px] font-bold rounded-md transition-all cursor-pointer',
                        statusTransitoFilter === ''
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900',
                      )}
                    >
                      Todos ({formatNumber(statsData?.kpis.totalItensDistintos ?? 0)})
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setStatusTransitoFilter('com_transito')
                        setPage(1)
                      }}
                      className={cn(
                        'px-2.5 py-1 text-[11px] font-bold rounded-md transition-all cursor-pointer flex items-center gap-1',
                        statusTransitoFilter === 'com_transito'
                          ? 'bg-white text-emerald-700 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900',
                      )}
                    >
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      Com Trânsito ({formatNumber(statsData?.kpis.comTransito.itens ?? 0)})
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setStatusTransitoFilter('sem_transito')
                        setPage(1)
                      }}
                      className={cn(
                        'px-2.5 py-1 text-[11px] font-bold rounded-md transition-all cursor-pointer flex items-center gap-1',
                        statusTransitoFilter === 'sem_transito'
                          ? 'bg-white text-rose-700 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900',
                      )}
                    >
                      <span className="w-2 h-2 rounded-full bg-rose-500" />
                      Faltante Total ({formatNumber(statsData?.kpis.semTransito.itens ?? 0)})
                    </button>
                  </div>

                  {/* Campo de Busca Rápida */}
                  <form onSubmit={handleSearchSubmit} className="flex items-center gap-1.5">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        placeholder="Buscar item, canal, pedido..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0B6E99]/30 focus:border-[#0B6E99] w-48 sm:w-56"
                      />
                    </div>
                    <Button
                      type="submit"
                      size="sm"
                      variant="secondary"
                      className="text-xs h-8 px-2.5"
                    >
                      Filtrar
                    </Button>
                  </form>
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-0">
              <div className="max-h-[60vh] overflow-auto border-b border-gray-100">
                <table className="w-full text-left border-collapse text-xs min-w-[1000px]">
                  <thead className="sticky top-0 z-20 bg-slate-100 shadow-2xs">
                    <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 uppercase tracking-wider text-[11px]">
                      {/* Coluna Canal como PRIMEIRA COLUNA */}
                      <th
                        className="p-3 cursor-pointer hover:bg-slate-200/70 transition-colors sticky top-0 bg-slate-100"
                        onClick={() => handleSort('canal')}
                      >
                        <div className="flex items-center gap-1">
                          <span>Canal</span>
                          <ArrowUpDown className="w-3 h-3 text-slate-400" />
                        </div>
                      </th>
                      <th
                        className="p-3 cursor-pointer hover:bg-slate-200/70 transition-colors sticky top-0 bg-slate-100"
                        onClick={() => handleSort('codigo_item')}
                      >
                        <div className="flex items-center gap-1">
                          <span>Código do Item</span>
                          <ArrowUpDown className="w-3 h-3 text-slate-400" />
                        </div>
                      </th>
                      <th
                        className="p-3 cursor-pointer hover:bg-slate-200/70 transition-colors sticky top-0 bg-slate-100"
                        onClick={() => handleSort('descricao_item')}
                      >
                        <div className="flex items-center gap-1">
                          <span>Descrição</span>
                          <ArrowUpDown className="w-3 h-3 text-slate-400" />
                        </div>
                      </th>
                      <th
                        className="p-3 cursor-pointer hover:bg-slate-200/70 transition-colors sticky top-0 bg-slate-100"
                        onClick={() => handleSort('grupo_item')}
                      >
                        <div className="flex items-center gap-1">
                          <span>Grupo</span>
                          <ArrowUpDown className="w-3 h-3 text-slate-400" />
                        </div>
                      </th>
                      <th className="p-3 sticky top-0 bg-slate-100">Clientes Solicitando</th>
                      <th
                        className="p-3 text-center cursor-pointer hover:bg-slate-200/70 transition-colors sticky top-0 bg-slate-100"
                        onClick={() => handleSort('qtd_aberto')}
                      >
                        <div className="flex items-center justify-center gap-1">
                          <span>Qtd Aberta</span>
                          <ArrowUpDown className="w-3 h-3 text-slate-400" />
                        </div>
                      </th>
                      <th
                        className="p-3 text-right cursor-pointer hover:bg-slate-200/70 transition-colors sticky top-0 bg-slate-100"
                        onClick={() => handleSort('valor_em_aberto')}
                      >
                        <div className="flex items-center justify-end gap-1">
                          <span>Valor em Aberto</span>
                          <ArrowUpDown className="w-3 h-3 text-slate-400" />
                        </div>
                      </th>
                      <th
                        className="p-3 text-center cursor-pointer hover:bg-slate-200/70 transition-colors sticky top-0 bg-slate-100"
                        onClick={() => handleSort('pedidos_qtd')}
                      >
                        <div className="flex items-center justify-center gap-1">
                          <span>Nº Pedidos</span>
                          <ArrowUpDown className="w-3 h-3 text-slate-400" />
                        </div>
                      </th>
                      <th
                        className="p-3 text-center cursor-pointer hover:bg-slate-200/70 transition-colors sticky top-0 bg-slate-100"
                        onClick={() => handleSort('em_transito')}
                      >
                        <div className="flex items-center justify-center gap-1">
                          <span>Em Trânsito</span>
                          <ArrowUpDown className="w-3 h-3 text-slate-400" />
                        </div>
                      </th>
                      <th
                        className="p-3 text-right cursor-pointer hover:bg-slate-200/70 transition-colors sticky top-0 bg-slate-100"
                        onClick={() => handleSort('media_mensal_vendas')}
                        title="Média mensal vendida nos últimos 6 meses (base Vendas consolidada)"
                      >
                        <div className="flex items-center justify-end gap-1">
                          <span>Média Venda 6m</span>
                          <ArrowUpDown className="w-3 h-3 text-slate-400" />
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {listLoading ? (
                      <tr>
                        <td colSpan={10} className="p-8 text-center text-slate-400">
                          <div className="flex items-center justify-center gap-2">
                            <div className="w-4 h-4 border-2 border-[#0B6E99] border-t-transparent rounded-full animate-spin" />
                            <span>Carregando itens faltantes...</span>
                          </div>
                        </td>
                      </tr>
                    ) : items.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="p-12 text-center text-slate-400">
                          <AlertCircle className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                          <p className="font-semibold text-slate-600">
                            Nenhum item faltante encontrado
                          </p>
                          <p className="text-xs text-slate-400 mt-1">
                            Não há linhas com estoque zerado no recorte de filtros selecionado.
                          </p>
                        </td>
                      </tr>
                    ) : (
                      items.map((item) => {
                        const temTransito = item.em_transito > 0

                        return (
                          <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                            {/* Canal */}
                            <td className="p-3 font-semibold text-slate-900">
                              <Badge
                                variant="outline"
                                className={cn(
                                  'text-[10px] font-bold border',
                                  item.canal === 'Sem Canal'
                                    ? 'bg-slate-100 text-slate-700 border-slate-300'
                                    : 'bg-sky-50 text-sky-900 border-sky-200',
                                )}
                              >
                                {item.canal}
                              </Badge>
                            </td>

                            {/* Código do Item */}
                            <td className="p-3 font-mono font-bold text-slate-900">
                              {item.codigo_item}
                            </td>

                            {/* Descrição */}
                            <td
                              className="p-3 text-slate-700 max-w-[240px] truncate"
                              title={item.descricao_item}
                            >
                              {item.descricao_item || '—'}
                            </td>

                            {/* Grupo */}
                            <td className="p-3 text-slate-600">{item.grupo_item || '—'}</td>

                            {/* Clientes */}
                            <td className="p-3 text-slate-700 max-w-[200px]">
                              <span className="truncate block" title={item.clientes_nomes}>
                                {item.clientes_qtd > 1
                                  ? `${item.clientes_qtd} clientes (${item.clientes_nomes.split(',')[0]}...)`
                                  : item.clientes_nomes || '—'}
                              </span>
                            </td>

                            {/* Qtd Aberta */}
                            <td className="p-3 text-center font-bold text-slate-900">
                              {formatNumber(item.qtd_aberto)}
                            </td>

                            {/* Valor em Aberto */}
                            <td className="p-3 text-right font-black text-slate-900">
                              {formatCurrency(item.valor_em_aberto)}
                            </td>

                            {/* Nº de Pedidos */}
                            <td className="p-3 text-center text-slate-700">
                              {formatNumber(item.pedidos_qtd)}
                            </td>

                            {/* Em Trânsito */}
                            <td className="p-3 text-center">
                              {temTransito ? (
                                <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 font-bold text-[10px]">
                                  {formatNumber(item.em_transito)} un (A caminho)
                                </Badge>
                              ) : (
                                <Badge className="bg-rose-100 text-rose-800 border-rose-300 font-bold text-[10px]">
                                  0 (Faltante Total)
                                </Badge>
                              )}
                            </td>

                            {/* Média de Venda Mensal dos últimos 6 meses */}
                            <td className="p-3 text-right">
                              {item.media_mensal_vendas > 0 ? (
                                <div>
                                  <span className="font-bold text-slate-900 block">
                                    {formatNumber(item.media_mensal_vendas)} un/mês
                                  </span>
                                  <span className="text-[10px] text-slate-400">
                                    total: {formatNumber(item.qtd_vendida_6m)} un
                                  </span>
                                </div>
                              ) : (
                                <span className="text-slate-400 font-mono">—</span>
                              )}
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Paginação */}
              <div className="p-3 sm:p-4 bg-slate-50 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
                <div>
                  Mostrando {items.length} de {formatNumber(totalItems)} registro(s)
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-slate-500">Linhas por página:</span>
                  <select
                    value={perPage}
                    onChange={(e) => {
                      setPerPage(Number(e.target.value))
                      setPage(1)
                    }}
                    className="p-1 border border-slate-200 rounded-md text-xs bg-white"
                  >
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                    <option value={200}>200</option>
                  </select>

                  <div className="flex items-center gap-1 ml-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page <= 1}
                      className="h-7 px-2.5 text-xs"
                    >
                      Anterior
                    </Button>
                    <span className="px-2 font-bold text-slate-800">
                      {page} / {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page >= totalPages}
                      className="h-7 px-2.5 text-xs"
                    >
                      Próxima
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ------------------------------------------------------------- */}
        {/* VISÃO 2: MRP — TOP 20 MAIS VENDIDOS VS ESTOQUE ATUAL */}
        {/* ------------------------------------------------------------- */}
        <TabsContent value="mrp" className="space-y-6 mt-0">
          {/* Alerta se base estoque_sap estiver vazia */}
          {mrpData && !mrpData.estoqueSapInfo.temRegistros && (
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs flex items-start justify-between gap-3 shadow-xs">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-sm text-amber-950">
                    Posição de Estoque (SAP) ainda não foi importada
                  </h4>
                  <p className="mt-0.5 text-amber-800">
                    Os itens mais vendidos nos últimos 6 meses estão listados abaixo com base na
                    base Vendas consolidada. Para calcular a cobertura em meses e os alertas de
                    reposição automáticos, importe a planilha de saldo físico pelo card{' '}
                    <strong>Posição de Estoque (SAP)</strong> na tela Importar Dados.
                  </p>
                </div>
              </div>
              <Link to="/importar">
                <Button
                  size="sm"
                  className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shrink-0 shadow-xs"
                >
                  Ir para Importar Dados
                </Button>
              </Link>
            </div>
          )}

          {/* Cards resumo do MRP */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                Janela Histórica de Vendas
              </span>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-xl font-bold text-slate-900">
                  Últimos {mrpData?.periodo.meses || 6} meses
                </span>
                <span className="text-xs text-slate-400">
                  ({mrpData?.periodo.de} a {mrpData?.periodo.ate})
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Fórmula da média: soma das quantidades faturadas no período ÷ 6
              </p>
            </Card>

            <Card className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                Posição do Estoque Atual (SAP)
              </span>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-xl font-bold text-slate-900">
                  {mrpData?.estoqueSapInfo.temRegistros
                    ? `${formatNumber(mrpData.estoqueSapInfo.totalRegistros)} itens mapeados`
                    : 'Nenhum saldo importado'}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                {mrpData?.estoqueSapInfo.ultimaCarga
                  ? `Última carga: ${formatDateTime(mrpData.estoqueSapInfo.ultimaCarga)}`
                  : 'Origem: Coleção estoque_sap'}
              </p>
            </Card>

            <Card className="p-4 rounded-xl border border-slate-200 bg-white shadow-xs">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                Critérios do Alerta de Reposição
              </span>
              <div className="mt-2 space-y-1 text-xs">
                <div className="flex items-center gap-2">
                  <Badge className="bg-rose-100 text-rose-800 border-rose-300 font-bold text-[10px]">
                    Repor
                  </Badge>
                  <span className="text-slate-600">Cobertura &lt; 1 mês</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className="bg-amber-100 text-amber-800 border-amber-300 font-bold text-[10px]">
                    Atenção
                  </Badge>
                  <span className="text-slate-600">Cobertura entre 1 e 2 meses</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 font-bold text-[10px]">
                    Normal
                  </Badge>
                  <span className="text-slate-600">Cobertura &gt; 2 meses</span>
                </div>
              </div>
            </Card>
          </div>

          {/* Gráfico do Top 20: Quantidade Vendida vs Estoque Atual */}
          <ChartCard
            title="Top 20 Itens Mais Vendidos (6m) vs Estoque Atual"
            description="Comparativo de volume total vendido nos 6 meses com o saldo físico em estoque"
            icon={TrendingUp}
            iconColor="text-[#0B6E99]"
          >
            {mrpLoading ? (
              <div className="h-full flex items-center justify-center p-8 text-slate-400">
                <div className="w-5 h-5 border-2 border-[#0B6E99] border-t-transparent rounded-full animate-spin mr-2" />
                <span>Calculando Top 20 e cruzando posição de estoque...</span>
              </div>
            ) : !mrpData?.top20Vendidos || mrpData.top20Vendidos.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center p-8 text-center text-slate-400">
                <AlertCircle className="w-8 h-8 text-slate-300 mb-1" />
                <p className="text-xs font-semibold text-slate-600">
                  Nenhum registro de vendas encontrado no período
                </p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={mrpData.top20Vendidos}
                  margin={{ top: 10, right: 10, left: 10, bottom: 25 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                  <XAxis
                    dataKey="codigo_item"
                    tickLine={false}
                    axisLine={{ stroke: '#E2E8F0' }}
                    tick={{ fill: SLATE_MUTED, fontSize: 10 }}
                    angle={-25}
                    textAnchor="end"
                    interval={0}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: SLATE_MUTED, fontSize: 10 }}
                  />
                  <Tooltip
                    formatter={(val: number | string | undefined, name: string) => {
                      const n = typeof val === 'number' ? val : Number(val) || 0
                      if (name === 'qtd_total_6m')
                        return [`${formatNumber(n)} un`, 'Qtd Vendida (6m)']
                      if (name === 'estoque_atual')
                        return [
                          val === null ? 'Sem posição' : `${formatNumber(n)} un`,
                          'Estoque Atual',
                        ]
                      return [n, name]
                    }}
                    labelFormatter={(label: any, payload: any) => {
                      const row = payload?.[0]?.payload
                      return `${label} - ${row?.descricao_item || ''}`
                    }}
                    contentStyle={{
                      backgroundColor: '#0F172A',
                      borderRadius: '8px',
                      border: '1px solid #334155',
                      color: '#fff',
                      fontSize: '11px',
                      padding: '8px 12px',
                    }}
                  />
                  <Legend
                    verticalAlign="top"
                    height={32}
                    formatter={(value) => (
                      <span className="text-xs font-bold text-slate-700">
                        {value === 'qtd_total_6m' ? 'Qtd Vendida (6m)' : 'Estoque Físico Atual'}
                      </span>
                    )}
                  />
                  <Bar
                    dataKey="qtd_total_6m"
                    name="qtd_total_6m"
                    fill={ROLAND_BLUE}
                    radius={[4, 4, 0, 0]}
                    maxBarSize={28}
                  />
                  <Bar
                    dataKey="estoque_atual"
                    name="estoque_atual"
                    fill="#10B981"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={20}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          {/* Tabela MRP */}
          <Card className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-xs">
            <CardHeader className="p-4 sm:p-5 border-b border-slate-100 bg-slate-50/50">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-base font-bold text-slate-800 flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-teal-600" />
                    Top 20 Itens Mais Vendidos &amp; Cobertura de Estoque (MRP)
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500 mt-0.5">
                    Cobertura em meses calculada sobre a média mensal dos últimos 6 meses
                  </CardDescription>
                </div>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={loadMrp}
                  disabled={mrpLoading}
                  className="text-xs h-8 px-2.5 gap-1.5 self-end sm:self-auto"
                >
                  <RefreshCw className={cn('w-3.5 h-3.5', mrpLoading && 'animate-spin')} />
                  Recalcular MRP
                </Button>
              </div>
            </CardHeader>

            <CardContent className="p-0">
              <div className="max-h-[60vh] overflow-auto">
                <table className="w-full text-left border-collapse text-xs min-w-[900px]">
                  <thead className="sticky top-0 z-20 bg-slate-100 shadow-2xs">
                    <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 uppercase tracking-wider text-[11px]">
                      <th className="p-3">#</th>
                      <th className="p-3">Código Item</th>
                      <th className="p-3">Descrição</th>
                      <th className="p-3">Grupo</th>
                      <th className="p-3 text-center">Qtd Vendida (6m)</th>
                      <th className="p-3 text-center">Média Mensal</th>
                      <th className="p-3 text-right">Valor Vendido (6m)</th>
                      <th className="p-3 text-center">Estoque Atual</th>
                      <th className="p-3 text-center">Em Trânsito</th>
                      <th className="p-3 text-center">Cobertura (meses)</th>
                      <th className="p-3 text-center">Alerta de Reposição</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {mrpLoading ? (
                      <tr>
                        <td colSpan={11} className="p-8 text-center text-slate-400">
                          <div className="flex items-center justify-center gap-2">
                            <div className="w-4 h-4 border-2 border-[#0B6E99] border-t-transparent rounded-full animate-spin" />
                            <span>Calculando MRP...</span>
                          </div>
                        </td>
                      </tr>
                    ) : !mrpData?.top20Vendidos || mrpData.top20Vendidos.length === 0 ? (
                      <tr>
                        <td colSpan={11} className="p-8 text-center text-slate-400">
                          Nenhum dado encontrado para o MRP.
                        </td>
                      </tr>
                    ) : (
                      mrpData.top20Vendidos.map((row, idx) => {
                        return (
                          <tr
                            key={row.codigo_item}
                            className="hover:bg-slate-50/80 transition-colors"
                          >
                            <td className="p-3 font-bold text-slate-400">{idx + 1}</td>
                            <td className="p-3 font-mono font-bold text-slate-900">
                              {row.codigo_item}
                            </td>
                            <td
                              className="p-3 text-slate-700 max-w-[240px] truncate"
                              title={row.descricao_item}
                            >
                              {row.descricao_item || '—'}
                            </td>
                            <td className="p-3 text-slate-600">{row.grupo_item || '—'}</td>
                            <td className="p-3 text-center font-bold text-slate-900">
                              {formatNumber(row.qtd_total_6m)}
                            </td>
                            <td className="p-3 text-center font-semibold text-[#0B6E99]">
                              {formatNumber(row.media_mensal)} un
                            </td>
                            <td className="p-3 text-right font-medium text-slate-900">
                              {formatCurrency(row.valor_total_6m)}
                            </td>
                            <td className="p-3 text-center">
                              {row.tem_posicao_estoque ? (
                                <span className="font-bold text-slate-900">
                                  {formatNumber(row.estoque_atual || 0)}
                                </span>
                              ) : (
                                <span className="text-slate-400 font-mono text-[11px]">
                                  Sem posição
                                </span>
                              )}
                            </td>
                            <td className="p-3 text-center">
                              {row.tem_posicao_estoque ? (
                                row.em_transito && row.em_transito > 0 ? (
                                  <Badge className="bg-sky-100 text-sky-800 border-sky-300 font-bold text-[10px]">
                                    {formatNumber(row.em_transito)}
                                  </Badge>
                                ) : (
                                  <span className="text-slate-400">0</span>
                                )
                              ) : (
                                <span className="text-slate-400 font-mono text-[11px]">—</span>
                              )}
                            </td>
                            <td className="p-3 text-center font-bold">
                              {row.tem_posicao_estoque && row.cobertura_meses !== null ? (
                                <span
                                  className={cn(
                                    row.cobertura_meses < 1
                                      ? 'text-rose-600 font-black'
                                      : row.cobertura_meses <= 2
                                        ? 'text-amber-600 font-black'
                                        : 'text-emerald-700',
                                  )}
                                >
                                  {row.cobertura_meses > 99
                                    ? '> 99 m'
                                    : `${row.cobertura_meses.toFixed(1)} m`}
                                </span>
                              ) : (
                                <span className="text-slate-400 font-mono text-[11px]">—</span>
                              )}
                            </td>
                            <td className="p-3 text-center">
                              {!row.tem_posicao_estoque ? (
                                <Badge
                                  variant="outline"
                                  className="bg-slate-100 text-slate-500 border-slate-300 text-[10px]"
                                >
                                  Sem posição
                                </Badge>
                              ) : row.status_reposicao === 'repor' ? (
                                <Badge className="bg-rose-500 text-white font-bold text-[10px] animate-pulse">
                                  Repor (&lt; 1m)
                                </Badge>
                              ) : row.status_reposicao === 'atencao' ? (
                                <Badge className="bg-amber-500 text-white font-bold text-[10px]">
                                  Atenção (1–2m)
                                </Badge>
                              ) : (
                                <Badge className="bg-emerald-600 text-white font-bold text-[10px]">
                                  Normal (&gt; 2m)
                                </Badge>
                              )}
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
