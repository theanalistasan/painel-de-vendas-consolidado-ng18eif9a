import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  DollarSign,
  TrendingUp,
  FileText,
  Sparkles,
  RefreshCw,
  RotateCcw,
  Expand,
  MapPin,
  BarChart2,
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
  PieChart,
  Pie,
  Cell,
} from 'recharts'
import {
  fetchDashboardStats,
  type DashboardStatsResult,
  fetchCanaisComparativo,
  type CanaisComparativoResult,
  fetchVendasList,
  fetchVendasExport,
  type VendasListResult,
} from '@/services/sales'
import { ComparativoCanaisMesCard } from '@/components/ComparativoCanaisMesCard'
import {
  VendasRelatorioTable,
  RELATORIO_COLUMNS,
  type RelatorioGroupByMode,
  type SortDirection,
} from '@/components/VendasRelatorioTable'
import { useRealtime } from '@/hooks/use-realtime'
import type { FilterState, VendaConsolidada } from '@/types/sales'
import { formatCurrency, formatNumber, MESES_CURTOS } from '@/lib/formatters'
import {
  saveFiltersToSession,
  loadFiltersFromSession,
  hasSavedFiltersInSession,
  buildDynamicInitialFilters,
  type CanaisFiltroLocal,
  EMPTY_CANAIS_FILTRO_LOCAL,
  loadCanaisFiltrosFromSession,
  saveCanaisFiltrosToSession,
  clearCanaisFiltrosFromSession,
} from '@/lib/filter-persistence'
import {
  CanaisFiltrosLocaisBar,
  buildCanaisFiltrosEfetivos,
} from '@/components/CanaisFiltrosLocaisBar'

import { TITULO_VALOR_TOTAL_BRUTO, TITULO_VALOR_LIQUIDO_NET } from '@/lib/valor-titulos'
import KpiCard from '@/components/KpiCard'
import ChartCard from '@/components/ChartCard'
import { MetasIndicador } from '@/components/MetasIndicador'
import { VendasPorEstadoIndicador } from '@/components/VendasPorEstadoIndicador'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { MultiSelectDropdown } from '@/components/FilterBar'
import { exportToCSV } from '@/lib/formatters'
import { useToast } from '@/hooks/use-toast'

const COLOR_BLUE = '#0B6E99'

const tooltipContentStyle = {
  backgroundColor: '#0F172A',
  borderRadius: '8px',
  color: '#fff',
  fontSize: '12px',
  border: '1px solid #334155',
}

const currencyFormatter =
  (label = 'Valor Total (Bruto)') =>
  (val: number | string | undefined) =>
    [formatCurrency(typeof val === 'number' ? val : Number(val)), label] as [string, string]

export default function DashboardCanais() {
  const { toast } = useToast()
  const [data, setData] = useState<DashboardStatsResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [comparativoData, setComparativoData] = useState<CanaisComparativoResult | null>(null)
  const [loadingComparativo, setLoadingComparativo] = useState(false)

  const hadSavedFiltersAtMount = useRef(hasSavedFiltersInSession())
  const [filters, setFilters] = useState<FilterState>(() => {
    const loaded = loadFiltersFromSession()
    if (!hasSavedFiltersInSession()) {
      saveFiltersToSession(loaded)
    }
    return loaded
  })
  const [initializedFromBase, setInitializedFromBase] = useState(true)
  const [mapExpanded, setMapExpanded] = useState(false)

  // Persistir filtros no sessionStorage
  useEffect(() => {
    saveFiltersToSession(filters)
  }, [filters])

  // Filtros LOCAIS de período/documento da Visão Canais (Ano, Mês, Data, Nota
  // Fiscal e Pedido) — prioridade sobre os Filtros Globais; vazio = segue o
  // global. Persistidos em sessionStorage (helpers do commit 0.0.324) para o
  // F5 preservar os valores.
  const [filtrosLocais, setFiltrosLocais] = useState<CanaisFiltroLocal>(() =>
    loadCanaisFiltrosFromSession(),
  )
  const [filtrosLocaisDebounced, setFiltrosLocaisDebounced] =
    useState<CanaisFiltroLocal>(filtrosLocais)

  useEffect(() => {
    saveCanaisFiltrosToSession(filtrosLocais)
    // Debounce: campos textuais (NF/Pedido) não devem disparar uma busca por
    // tecla digitada
    const t = setTimeout(() => setFiltrosLocaisDebounced(filtrosLocais), 500)
    return () => clearTimeout(t)
  }, [filtrosLocais])

  // Filtros EFETIVOS desta visão: local preenchido sobrepõe o global
  const filtrosEfetivos = useMemo(
    () => buildCanaisFiltrosEfetivos(filters, filtrosLocaisDebounced),
    [filters, filtrosLocaisDebounced],
  )

  const requestSeqRef = useRef<number>(0)
  const abortControllerRef = useRef<AbortController | null>(null)

  // Carrega comparativo Mês Atual x Mês Ano Anterior por canal
  const loadComparativoData = async (activeFilters = filtrosEfetivos) => {
    setLoadingComparativo(true)
    try {
      const res = await fetchCanaisComparativo({
        filters: activeFilters as unknown as Record<string, unknown>,
        ano: activeFilters.ano?.[0] ? parseInt(activeFilters.ano[0], 10) : undefined,
        mes: activeFilters.mes?.[0] ? parseInt(activeFilters.mes[0], 10) : undefined,
      })
      setComparativoData(res)
    } catch (err) {
      console.warn('[DashboardCanais] Erro ao carregar comparativo canais:', err)
    } finally {
      setLoadingComparativo(false)
    }
  }

  // Load aggregated dashboard stats from server
  const loadData = async (activeFilters = filtrosEfetivos) => {
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

      // Se ainda não foi inicializado com as opções dinâmicas da base (primeiro acesso sem sessão),
      // aplica os filtros dinâmicos padrão da base APENAS se não houver sessão prévia.
      if (!initializedFromBase && !hasSavedFiltersInSession() && res?.filterOptions) {
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

  useEffect(() => {
    loadData(filtrosEfetivos)
    loadComparativoData(filtrosEfetivos)
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [filtrosEfetivos])

  useRealtime('vendas', () => {
    loadData()
    loadComparativoData()
  })

  // Filtros locais da Visão Canais: Canal, Clientes do Canal, Deploy e Inside.
  // Os demais filtros são globais (página Filtros Globais, lidos via sessionStorage).
  const canalOptions = useMemo(() => data?.filterOptions?.canais || [], [data])
  const canalClientesOptions = useMemo(() => data?.filterOptions?.canaisClientes || [], [data])
  const insideOptions = useMemo(() => data?.filterOptions?.inside || [], [data])
  const clientesDoCanalOptions = useMemo(() => {
    const selected = filters.canal || []
    const list =
      selected.length > 0
        ? canalClientesOptions.filter((cc) => selected.includes(cc.nome_canal))
        : canalClientesOptions
    return list
  }, [canalClientesOptions, filters.canal])

  const handleCanalChange = (values: string[]) => {
    setFilters((prev) => {
      // Ao mudar canais, descarta clientes do canal que não pertencem mais à seleção
      let nextClientes = prev.canalClientes || []
      if (values.length > 0 && nextClientes.length > 0) {
        const validClis = new Set(
          canalClientesOptions
            .filter((cc) => values.includes(cc.nome_canal))
            .map((cc) => cc.nome_cliente),
        )
        nextClientes = nextClientes.filter((cli) => validClis.has(cli))
      }
      return { ...prev, canal: values, canalClientes: nextClientes }
    })
  }

  // Visão Canais exibe SOMENTE os 2 totais da Faixa Comercial (pedido do Silvio):
  // "Valor Total (Bruto)" (total_nf_novo) e "Valor Líquido (NET)" (valor_liquido).
  const kpis = useMemo(() => {
    return {
      valorTotalBruto: data?.kpis?.totalNfNovo || 0,
      valorLiquido: data?.kpis?.valorLiquido || 0,
    }
  }, [data])

  // Multi-ano: 2+ anos nos Filtros Globais (ou janela dataDe→dataAte multi-ano)
  // ⇒ os 2 KPIs de valor também são exibidos por ano em barras verticais, com o
  // mesmo critério do backend (MAX por NF para o total bruto).
  const multiAno = useMemo(() => {
    const anosSel = (filtrosEfetivos?.ano || []).length
    if (anosSel > 1) return true
    if (anosSel > 0) return false
    if (filtrosEfetivos?.dataDe && filtrosEfetivos?.dataAte) {
      const yMin = Number(String(filtrosEfetivos.dataDe).slice(0, 4))
      const yMax = Number(String(filtrosEfetivos.dataAte).slice(0, 4))
      if (!isNaN(yMin) && !isNaN(yMax)) return yMax > yMin
    }
    return false
  }, [filtrosEfetivos])

  const porAnoValuesData = useMemo(() => {
    return (data?.porAno || [])
      .map((item) => ({
        ano: item.ano,
        [TITULO_VALOR_TOTAL_BRUTO]: Number(item.total_nf_novo) || 0,
        [TITULO_VALOR_LIQUIDO_NET]: Number(item.valor_liquido_total) || 0,
      }))
      .sort((a, b) => Number(a.ano) - Number(b.ano))
  }, [data])

  const chartVendasPorMes = data?.charts?.vendasPorMes || []
  const chartTopVendedores = data?.charts?.topVendedores || []
  const chartTopClientes = data?.charts?.topClientes || []
  const chartEstado = data?.charts?.estado || []
  const revendasFaturamento = data?.charts?.revendasFaturamento
  const chartGrupoItem = data?.charts?.grupoItem || []
  const chartVendasPorGrupoItemMensal = data?.charts?.vendasPorGrupoItemMensal || []

  // Cores padronizadas para grupos de itens
  const GRUPO_COLORS: Record<string, string> = {
    Equipamentos: '#0B6E99',
    Tintas: '#0D9488',
    Peças: '#F59E0B',
    Acessórios: '#8B5CF6',
    Outros: '#64748B',
    'Sem informação': '#94A3B8',
  }
  const FALLBACK_PALETTE = [
    '#0B6E99',
    '#0D9488',
    '#F59E0B',
    '#8B5CF6',
    '#EC4899',
    '#6366F1',
    '#14B8A6',
  ]

  // Dados transformados para o gráfico Venda Mensal por Grupo do Item (stacked bar)
  const { monthlyGroupData, uniqueGrupos } = useMemo(() => {
    const gruposSet = new Set<string>()
    const rows = chartVendasPorGrupoItemMensal.map((item) => {
      const row: Record<string, unknown> = {
        mes: item.mes,
        mesLabel: (() => {
          if (!item.mes) return ''
          const p = item.mes.split('-')
          if (p.length < 2) return item.mes
          const mo = parseInt(p[1], 10)
          if (isNaN(mo) || mo < 1 || mo > 12) return item.mes
          return MESES_CURTOS[mo - 1] + '/' + p[0].slice(2)
        })(),
      }
      let mesTotal = 0
      for (const g of item.grupos) {
        gruposSet.add(g.grupo)
        row[g.grupo] = g.total
        mesTotal += g.total
      }
      row._total = mesTotal
      return row
    })
    return {
      monthlyGroupData: rows,
      uniqueGrupos: Array.from(gruposSet),
    }
  }, [chartVendasPorGrupoItemMensal])

  // Relatório Consolidado de Vendas:
  // - Modo 'none': paginado via fetchVendasList (50 itens por página).
  // - Modos agrupados ('comissao' ou 'jp_class'): busca o conjunto COMPLETO via fetchVendasExport
  //   para que os subtotais acumulados dos grupos colapsados somem todas as vendas do período
  //   e coincidam exatamente com o Faturamento Total / Valor Líquido dos KPIs do topo.
  const [relatorioVendas, setRelatorioVendas] = useState<VendaConsolidada[]>([])
  const [relatorioTotal, setRelatorioTotal] = useState(0)
  const [relatorioPage, setRelatorioPage] = useState(1)
  const [relatorioLimit, setRelatorioLimit] = useState(50)
  const [relatorioSortField, setRelatorioSortField] = useState('data_lancamento')
  const [relatorioSortDir, setRelatorioSortDir] = useState<SortDirection>('desc')
  const [relatorioLoading, setRelatorioLoading] = useState(false)
  const [relatorioError, setRelatorioError] = useState<string | null>(null)
  const [relatorioGroupByMode, setRelatorioGroupByMode] = useState<RelatorioGroupByMode>('none')
  const [relatorioExporting, setRelatorioExporting] = useState(false)

  const relatorioRequestSeqRef = useRef(0)

  const loadRelatorioVendas = async () => {
    const seq = ++relatorioRequestSeqRef.current
    setRelatorioLoading(true)
    setRelatorioError(null)

    const isGroupedMode =
      relatorioGroupByMode === 'comissao' ||
      relatorioGroupByMode === 'jp_class' ||
      relatorioGroupByMode === 'nfe' ||
      relatorioGroupByMode === 'pedido'

    try {
      if (isGroupedMode) {
        // Busca completa do período para cálculo exato de subtotais nos grupos colapsados
        const res = await fetchVendasExport({
          sort: `${relatorioSortDir === 'desc' ? '-' : ''}${relatorioSortField}`,
          sortField: relatorioSortField,
          sortDirection: relatorioSortDir,
          filters: filtrosEfetivos as unknown as Record<string, unknown>,
          // Consolidação no backend: 1 linha por NF ou por Nº do Pedido
          groupByNfe: relatorioGroupByMode === 'nfe',
          groupByMode: relatorioGroupByMode === 'pedido' ? 'pedido' : undefined,
        })

        if (seq !== relatorioRequestSeqRef.current) return

        const items = res.items || []
        setRelatorioVendas(items)
        setRelatorioTotal(res.totalItems ?? items.length)
      } else {
        // Modo flat (não agrupado): paginação server-side padrão de 50 registros
        const res: VendasListResult = await fetchVendasList({
          page: relatorioPage,
          perPage: relatorioLimit,
          sort: `${relatorioSortDir === 'desc' ? '-' : ''}${relatorioSortField}`,
          filters: filtrosEfetivos as unknown as Record<string, unknown>,
        })

        if (seq !== relatorioRequestSeqRef.current) return

        setRelatorioVendas(res.items || [])
        setRelatorioTotal(res.totalItems || 0)
      }
    } catch (err: unknown) {
      if (seq !== relatorioRequestSeqRef.current) return
      console.error('[DashboardCanais:loadRelatorioVendas] Erro:', err)
      setRelatorioError(
        err instanceof Error ? err.message : 'Falha ao carregar relatório de vendas.',
      )
    } finally {
      if (seq === relatorioRequestSeqRef.current) {
        setRelatorioLoading(false)
      }
    }
  }

  // Recarrega relatório quando filtros, modo de agrupamento, página, limite ou ordenação mudam
  useEffect(() => {
    loadRelatorioVendas()
  }, [
    filtrosEfetivos,
    relatorioGroupByMode,
    relatorioPage,
    relatorioLimit,
    relatorioSortField,
    relatorioSortDir,
  ])

  // Resetar para a primeira página quando os filtros ou o modo de agrupamento mudam
  useEffect(() => {
    setRelatorioPage(1)
  }, [filtrosEfetivos, relatorioGroupByMode])

  const handleRelatorioSort = (field: string) => {
    if (relatorioSortField === field) {
      setRelatorioSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setRelatorioSortField(field)
      setRelatorioSortDir('desc')
    }
  }

  // Colapso por NF: alterna o modo nfe (refaz o fetch com groupByNfe no backend)
  const handleToggleGroupByNfe = () => {
    setRelatorioGroupByMode((prev) => (prev === 'nfe' ? 'none' : 'nfe'))
  }
  // Colapso por Pedido: alterna o modo pedido (refaz o fetch com groupByMode='pedido')
  const handleToggleGroupByPedido = () => {
    setRelatorioGroupByMode((prev) => (prev === 'pedido' ? 'none' : 'pedido'))
  }

  const handleRelatorioExport = async () => {
    if (relatorioExporting) return
    setRelatorioExporting(true)
    const isGroupedExport =
      relatorioGroupByMode === 'comissao' ||
      relatorioGroupByMode === 'jp_class' ||
      relatorioGroupByMode === 'nfe' ||
      relatorioGroupByMode === 'pedido'
    try {
      // Exporta o MESMO recorte exibido: filtros efetivos (local > global) e a
      // ordenação ativa; nos modos agrupados, 1 linha por NF/Pedido.
      const res = await fetchVendasExport({
        sort: `${relatorioSortDir === 'desc' ? '-' : ''}${relatorioSortField}`,
        sortField: relatorioSortField,
        sortDirection: relatorioSortDir,
        filters: filtrosEfetivos as unknown as Record<string, unknown>,
        groupByNfe: isGroupedExport && relatorioGroupByMode === 'nfe' ? true : undefined,
        groupByMode: isGroupedExport && relatorioGroupByMode === 'pedido' ? 'pedido' : undefined,
      })

      const items = res.items || []
      if (items.length === 0) {
        toast({
          title: 'Nada para exportar',
          description: 'Nenhum registro encontrado com os filtros atuais.',
        })
        return
      }

      exportToCSV(
        `relatorio_consolidado_vendas_${new Date().toISOString().slice(0, 10)}`,
        items as unknown as Record<string, unknown>[],
        RELATORIO_COLUMNS.map((c) => ({ key: c.key, label: c.label })),
      )
      toast({
        title: 'Exportação concluída',
        description: `${formatNumber(items.length)} registro(s) exportado(s) para CSV.`,
      })
    } catch (err) {
      console.error('[DashboardCanais:handleRelatorioExport] Erro ao exportar:', err)
      toast({
        variant: 'destructive',
        title: 'Erro ao exportar CSV',
        description:
          err instanceof Error
            ? err.message
            : 'Falha ao exportar o Relatório Consolidado de Vendas. Tente novamente.',
      })
    } finally {
      setRelatorioExporting(false)
    }
  }

  const isNoData =
    !loading && !error && data !== null && kpis.valorTotalBruto === 0 && kpis.valorLiquido === 0

  // Limpa APENAS os filtros locais de Canais — os filtros globais são gerenciados
  // na página Dashboard > Filtros Globais e não devem ser alterados daqui.
  const clearCanaisFilters = () => {
    setFilters((prev) => ({ ...prev, canal: [], canalClientes: [], deploy: [], inside: [] }))
  }

  const hasCanaisFilters =
    (filters.canal || []).length > 0 ||
    (filters.canalClientes || []).length > 0 ||
    (filters.deploy || []).length > 0 ||
    (filters.inside || []).length > 0

  // "Limpar Filtros" da página (estados de erro/sem dados): zera os filtros de
  // canais E os locais de período/documento (que voltam a seguir os globais)
  const handleClearFilters = () => {
    clearCanaisFilters()
    setFiltrosLocais({ ...EMPTY_CANAIS_FILTRO_LOCAL })
    clearCanaisFiltrosFromSession()
  }

  return (
    <div className="space-y-6 min-w-0 max-w-full">
      {/* Filtros locais da Visão Canais: Canal, Clientes, Deploy e Inside */}
      <Card className="rounded-xl border border-gray-200 bg-white shadow-xs">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <Label className="text-[11px] font-bold text-[#0B6E99] uppercase tracking-wide flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#0B6E99]" />
              Filtros de Canais
              {canalOptions.length > 0 && (
                <span className="text-[10px] text-slate-500 font-semibold bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200 normal-case">
                  {canalOptions.length} canais
                </span>
              )}
            </Label>
            {hasCanaisFilters && (
              <Button
                variant="outline"
                size="sm"
                onClick={clearCanaisFilters}
                className="border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-bold shrink-0 h-8 text-xs"
              >
                <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                Limpar Canais
              </Button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            <div>
              <Label className="text-[10px] font-bold text-slate-600 mb-1 block">
                Nome do Canal
              </Label>
              <MultiSelectDropdown
                label="Canal"
                options={canalOptions.map((c) => c.nome)}
                selected={filters.canal || []}
                onChange={handleCanalChange}
                placeholder="Todos os canais"
                highlight={(filters.canal || []).length > 0}
                getOptionLabel={(nome) => {
                  const opt = canalOptions.find((c) => c.nome === nome)
                  if (opt && opt.deploy) {
                    const depDesc =
                      opt.deploy === 'AGIS'
                        ? 'AGIS'
                        : opt.deploy === 'ROLAND'
                          ? 'Roland'
                          : opt.deploy
                    return `${nome} (${depDesc})`
                  }
                  return nome
                }}
              />
            </div>

            <div>
              <Label className="text-[10px] font-bold text-slate-600 mb-1 block">
                Clientes do Canal
              </Label>
              <MultiSelectDropdown
                label="Clientes"
                options={Array.from(new Set(clientesDoCanalOptions.map((cc) => cc.nome_cliente)))}
                selected={filters.canalClientes || []}
                onChange={(values) => setFilters((prev) => ({ ...prev, canalClientes: values }))}
                placeholder={
                  (filters.canal || []).length > 0
                    ? 'Todos os clientes do canal'
                    : 'Todos os clientes de canais'
                }
                highlight={(filters.canalClientes || []).length > 0}
                getOptionLabel={(cli) => {
                  const match = clientesDoCanalOptions.find((cc) => cc.nome_cliente === cli)
                  if (match && (filters.canal || []).length !== 1 && match.nome_canal) {
                    return `${cli} [${match.nome_canal}]`
                  }
                  return cli
                }}
              />
            </div>

            <div>
              <Label className="text-[10px] font-bold text-slate-600 mb-1 block">Deploy</Label>
              <MultiSelectDropdown
                label="Deploy"
                options={['AGIS', 'Roland', 'Nenhum']}
                selected={filters.deploy || []}
                onChange={(values) => setFilters((prev) => ({ ...prev, deploy: values }))}
                placeholder="Todos os deploys"
                highlight={(filters.deploy || []).length > 0}
                getOptionLabel={(dep) => {
                  if (dep === 'AGIS') return 'AGIS (revenda)'
                  if (dep === 'Roland') return 'Roland (direta)'
                  if (dep === 'Nenhum') return 'Nenhum (sem deploy)'
                  return dep
                }}
              />
            </div>

            <div>
              <Label className="text-[10px] font-bold text-slate-600 mb-1 block">Inside</Label>
              <MultiSelectDropdown
                label="Inside"
                options={insideOptions}
                selected={filters.inside || []}
                onChange={(values) => setFilters((prev) => ({ ...prev, inside: values }))}
                placeholder="Todos os inside"
                highlight={(filters.inside || []).length > 0}
              />
            </div>
          </div>

          <p className="text-[11px] text-slate-500 font-medium">
            Filtros locais da Visão Geral por Canais. Os demais filtros globais são definidos em
            Dashboard &gt; Filtros Globais (Setup).
          </p>
        </CardContent>
      </Card>

      {/* Filtros LOCAIS de Período e Documento (Ano, Mês, Data, Nota Fiscal e
          Pedido) — no mesmo molde dos filtros locais do JP-Class; preenchidos
          sobrepõem os Filtros Globais, vazios seguem o global */}
      <CanaisFiltrosLocaisBar
        filtros={filtrosLocais}
        onChange={setFiltrosLocais}
        onClear={() => {
          setFiltrosLocais({ ...EMPTY_CANAIS_FILTRO_LOCAL })
          clearCanaisFiltrosFromSession()
        }}
        anosDisponiveis={data?.filterOptions?.anos}
        disabled={loading}
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
              onClick={() => loadData(filtrosEfetivos)}
              className="bg-[#0B6E99] hover:bg-[#084F6E] text-white font-bold"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Tentar Novamente
            </Button>
          </div>
        </Card>
      ) : (
        <>
          {/* KPIs — Faixa Comercial: apenas os 2 totais oficiais (pedido do Silvio) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-4">
            <KpiCard
              title={TITULO_VALOR_TOTAL_BRUTO}
              value={kpis.valorTotalBruto}
              isCurrency
              icon={DollarSign}
              iconBgColor="bg-cyan-50"
              iconColor="text-[#0B6E99]"
            />
            <KpiCard
              title={TITULO_VALOR_LIQUIDO_NET}
              value={kpis.valorLiquido}
              isCurrency
              icon={TrendingUp}
              iconBgColor="bg-teal-50"
              iconColor="text-teal-600"
            />
          </div>
          {/* Multi-ano: barras verticais POR ANO com os 2 KPIs de valor (uma barra
              por ano, uma série colorida por métrica — mesmo critério do backend) */}
          {multiAno && porAnoValuesData.length > 1 && (
            <ChartCard
              title="Valores por Ano"
              description={`${TITULO_VALOR_TOTAL_BRUTO} e ${TITULO_VALOR_LIQUIDO_NET} — comparados ano a ano no período filtrado`}
              icon={BarChart2}
              iconColor="text-[#0B6E99]"
            >
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={porAnoValuesData}
                  margin={{ top: 10, right: 16, left: 0, bottom: 0 }}
                >
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
                    content={({ active, payload }) => {
                      if (!active || !payload || payload.length === 0) return null
                      const val = Number(payload[0]?.value) || 0
                      return (
                        <div className="rounded-lg border border-slate-700 bg-[#0F172A] px-3 py-2 text-xs shadow-lg">
                          <div className="font-semibold text-white">{payload[0]?.payload?.ano}</div>
                          <div className="mt-1 pl-4 text-slate-200">{formatCurrency(val)}</div>
                        </div>
                      )
                    }}
                  />
                  <Legend
                    verticalAlign="top"
                    height={36}
                    formatter={(value) => (
                      <span className="text-xs font-bold text-slate-700">{value}</span>
                    )}
                  />
                  <Bar
                    dataKey={TITULO_VALOR_TOTAL_BRUTO}
                    fill="#0B6E99"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={32}
                  />
                  <Bar
                    dataKey={TITULO_VALOR_LIQUIDO_NET}
                    fill="#0D9488"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={32}
                  />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          )}
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
          {/* Vendas por Grupo do Item & Venda Mensal por Grupo do Item */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Vendas por Grupo do Item */}
            <ChartCard
              title="Vendas por Grupo do Item"
              description={`Distribuição do ${TITULO_VALOR_TOTAL_BRUTO} por grupo consolidado`}
            >
              {chartGrupoItem.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs text-slate-400">
                  Nenhum dado disponível
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartGrupoItem}
                    margin={{ top: 10, right: 20, left: 0, bottom: 25 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                    <XAxis
                      dataKey="name"
                      tickLine={false}
                      axisLine={{ stroke: '#E2E8F0' }}
                      tick={{ fill: '#64748B', fontSize: 11 }}
                      interval={0}
                      angle={-20}
                      textAnchor="end"
                      height={40}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: '#64748B', fontSize: 11 }}
                      tickFormatter={(val) => `R$ ${(val / 1000).toFixed(0)}k`}
                    />
                    {/* Tooltip customizado: texto sempre claro sobre fundo escuro —
                        o tooltip padrão herda a cor da barra (Cell fill) no texto e
                        fica ilegível (ex. grupo TINTAS azul-escuro) */}
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload || payload.length === 0) return null
                        const entry = payload[0]?.payload
                        if (!entry) return null
                        return (
                          <div className="rounded-lg border border-slate-700 bg-[#0F172A] px-3 py-2 text-xs shadow-lg">
                            <div className="flex items-center gap-2">
                              <span
                                className="inline-block h-2 w-2 shrink-0 rounded-full"
                                style={{
                                  backgroundColor:
                                    GRUPO_COLORS[entry.name] ||
                                    FALLBACK_PALETTE[
                                      chartGrupoItem.findIndex((g) => g.name === entry.name) %
                                        FALLBACK_PALETTE.length
                                    ] ||
                                    '#0B6E99',
                                }}
                                aria-hidden="true"
                              />
                              <span className="font-semibold text-white">{entry.name}</span>
                            </div>
                            <div className="mt-1 pl-4 text-slate-200">
                              {TITULO_VALOR_TOTAL_BRUTO}: {formatCurrency(Number(entry.value) || 0)}
                            </div>
                          </div>
                        )
                      }}
                    />
                    <Bar dataKey="value" name={TITULO_VALOR_TOTAL_BRUTO} radius={[4, 4, 0, 0]}>
                      {chartGrupoItem.map((entry, index) => {
                        const color =
                          GRUPO_COLORS[entry.name] ||
                          FALLBACK_PALETTE[index % FALLBACK_PALETTE.length]
                        return <Cell key={`cell-grupo-${entry.name}`} fill={color} />
                      })}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            {/* Venda Mensal por Grupo do Item */}
            <ChartCard
              title="Venda Mensal por Grupo do Item"
              description={`Evolução mensal do ${TITULO_VALOR_TOTAL_BRUTO} por grupo de item (últimos 6 meses)`}
            >
              {monthlyGroupData.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs text-slate-400">
                  Nenhum dado disponível
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={monthlyGroupData}
                    margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                    <XAxis
                      dataKey="mesLabel"
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
                      formatter={(val: number | string | undefined, name: string) => [
                        formatCurrency(typeof val === 'number' ? val : Number(val)),
                        name,
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
                    {uniqueGrupos.map((grupo, gIdx) => {
                      const color =
                        GRUPO_COLORS[grupo] || FALLBACK_PALETTE[gIdx % FALLBACK_PALETTE.length]
                      return (
                        <Bar
                          key={grupo}
                          dataKey={grupo}
                          name={grupo}
                          stackId="a"
                          fill={color}
                          radius={gIdx === uniqueGrupos.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                        />
                      )
                    })}
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
          </div>
          {/* Vendas por Estado (UF) e Região com Mapa do Brasil e Revendas */}
          {/* Indicador de Metas Consolidadas (Canal, Deploy, Inside) */}
          <Card className="group relative rounded-xl border border-gray-200 bg-white shadow-xs transition-all duration-200 hover:border-slate-300">
            <CardHeader className="pb-3 border-b border-gray-100">
              <div className="flex items-start sm:items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-[#0B6E99]" />
                      Vendas por Estado (UF) &amp; Região — Visão Geral por Canais (
                      {TITULO_VALOR_TOTAL_BRUTO})
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
                        Vendas por Estado (UF) &amp; Região ({TITULO_VALOR_TOTAL_BRUTO})
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
          {/* Indicador de Metas Consolidadas (Canal, Deploy, Inside) */}
          <MetasIndicador
            filterMes={filtrosEfetivos.mes?.[0] || null}
            filterAno={filtrosEfetivos.ano?.[0] || null}
          />
          {/* Comparativo Mês Atual × Mês do Ano Anterior por Canal */}
          <ComparativoCanaisMesCard data={comparativoData} loading={loadingComparativo} />
          {/* Charts Grid: Top Vendedores & Top Clientes */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ChartCard
              title={`Top Vendedores (${TITULO_VALOR_TOTAL_BRUTO})`}
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
                  {/* Tooltip customizado: valor claro sobre fundo escuro — itemStyle
                      do tooltip padrão herda a cor da barra (Cell fill) */}
                  <Tooltip
                    cursor={{ fill: 'rgba(148, 163, 184, 0.15)' }}
                    content={({ active, payload }) => {
                      if (!active || !payload || payload.length === 0) return null
                      const val = Number(payload[0]?.value) || 0
                      return (
                        <div className="rounded-lg border border-slate-700 bg-[#0F172A] px-3 py-2 text-xs shadow-lg">
                          <div className="font-semibold text-white">
                            {payload[0]?.payload?.name}
                          </div>
                          <div className="mt-1 pl-4 text-slate-200">
                            Total: {formatCurrency(val)}
                          </div>
                        </div>
                      )
                    }}
                  />
                  <Bar dataKey="total" fill={COLOR_BLUE} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard
              title={`Top Clientes (${TITULO_VALOR_TOTAL_BRUTO})`}
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
                    cursor={{ fill: 'rgba(148, 163, 184, 0.15)' }}
                    content={({ active, payload }) => {
                      if (!active || !payload || payload.length === 0) return null
                      const val = Number(payload[0]?.value) || 0
                      return (
                        <div className="rounded-lg border border-slate-700 bg-[#0F172A] px-3 py-2 text-xs shadow-lg">
                          <div className="font-semibold text-white">
                            {payload[0]?.payload?.name}
                          </div>
                          <div className="mt-1 pl-4 text-slate-200">
                            Total: {formatCurrency(val)}
                          </div>
                        </div>
                      )
                    }}
                  />
                  <Bar dataKey="total" fill="#0D9488" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
          {/* Gráfico: Valor Líquido (NET) x Valor Total (Bruto) por Mês */}
          <div className="grid grid-cols-1 gap-6">
            <ChartCard
              title={`${TITULO_VALOR_LIQUIDO_NET} x ${TITULO_VALOR_TOTAL_BRUTO} por Mês`}
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
                    cursor={{ fill: 'rgba(148, 163, 184, 0.15)' }}
                    content={({ active, payload }) => {
                      if (!active || !payload || payload.length === 0) return null
                      const mes = payload[0]?.payload?.mes
                      return (
                        <div className="rounded-lg border border-slate-700 bg-[#0F172A] px-3 py-2 text-xs shadow-lg">
                          <div className="font-semibold text-white capitalize">{mes}</div>
                          <div className="mt-1 space-y-0.5">
                            {payload.map((p) => (
                              <div
                                key={String(p.dataKey)}
                                className="flex items-center justify-between gap-4"
                              >
                                <span className="flex items-center gap-1.5 text-slate-200">
                                  <span
                                    className="inline-block h-2 w-2 shrink-0 rounded-sm"
                                    style={{ backgroundColor: p.color || p.stroke }}
                                    aria-hidden="true"
                                  />
                                  {p.dataKey === 'bruto'
                                    ? TITULO_VALOR_TOTAL_BRUTO
                                    : TITULO_VALOR_LIQUIDO_NET}
                                </span>
                                <span className="font-bold text-white">
                                  {formatCurrency(Number(p.value) || 0)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    }}
                  />
                  <Legend
                    verticalAlign="top"
                    height={36}
                    formatter={(value) => (
                      <span className="text-xs font-bold text-slate-700 capitalize">
                        {value === 'bruto' ? TITULO_VALOR_TOTAL_BRUTO : TITULO_VALOR_LIQUIDO_NET}
                      </span>
                    )}
                  />
                  <Bar dataKey="bruto" name="bruto" fill={COLOR_BLUE} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="liquido" name="liquido" fill="#0D9488" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
          {/* Relatório Consolidado de Vendas */}
          <Card className="rounded-xl border border-gray-200 bg-white shadow-xs overflow-hidden">
            <CardHeader className="pb-3 border-b border-gray-100">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-[#0B6E99]" />
                    Relatório Consolidado de Vendas
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500 font-medium mt-1">
                    Listagem detalhada das vendas com paginação, ordenação e exportação respeitando
                    os filtros ativos
                  </CardDescription>
                </div>
                {relatorioTotal > 0 && (
                  <Badge
                    variant="outline"
                    className="text-xs font-bold text-slate-600 self-start sm:self-auto"
                  >
                    {relatorioTotal.toLocaleString('pt-BR')} registros
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {relatorioError ? (
                <div className="p-6 text-center text-sm text-rose-600 bg-rose-50/50">
                  <p className="font-semibold">{relatorioError}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={loadRelatorioVendas}
                    className="mt-3 text-xs"
                  >
                    Tentar novamente
                  </Button>
                </div>
              ) : (
                <VendasRelatorioTable
                  items={relatorioVendas}
                  loading={relatorioLoading}
                  totalItems={relatorioTotal}
                  page={relatorioPage}
                  pageSize={relatorioLimit}
                  totalPages={Math.max(1, Math.ceil(relatorioTotal / relatorioLimit))}
                  onPageChange={setRelatorioPage}
                  sortField={relatorioSortField}
                  sortDir={relatorioSortDir}
                  onSort={handleRelatorioSort}
                  isGroupedByNfe={relatorioGroupByMode === 'nfe'}
                  onToggleGroupByNfe={handleToggleGroupByNfe}
                  isGroupedByPedido={relatorioGroupByMode === 'pedido'}
                  onToggleGroupByPedido={handleToggleGroupByPedido}
                  storageKeyPrefix="relatorio_canais"
                  exporting={relatorioExporting}
                  onExport={handleRelatorioExport}
                  showOriginSummary={true}
                  groupByMode={relatorioGroupByMode}
                  onGroupByModeChange={setRelatorioGroupByMode}
                  defaultGroupByMode="none"
                  allowedGroupByModes={['none', 'jp_class', 'comissao', 'nfe', 'pedido']}
                />
              )}
            </CardContent>
          </Card>
          {/* Footer note */}
          <div className="flex items-center justify-between text-xs text-slate-400 pt-2 pb-6">
            <span className="flex items-center gap-1.5 font-medium">
              <RefreshCw className="w-3.5 h-3.5 text-[#0B6E99]" />
              Sincronização em tempo real ativa
            </span>
          </div>
        </>
      )}
    </div>
  )
}
