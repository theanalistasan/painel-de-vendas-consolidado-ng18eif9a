import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SlidersHorizontal, RefreshCw, AlertTriangle, RotateCcw, FileText, Tag } from 'lucide-react'
import FilterBar from '@/components/FilterBar'
import ChartCard from '@/components/ChartCard'
import { fetchDashboardStats, type DashboardStatsResult } from '@/services/sales'
import type { FilterState } from '@/types/sales'
import {
  saveFiltersToSession,
  loadFiltersFromSession,
  hasSavedFiltersInSession,
  buildDynamicInitialFilters,
} from '@/lib/filter-persistence'
import {
  fetchTiposClienteOptions,
  fetchTiposClienteMap,
  buildTiposClienteStringMap,
} from '@/services/tiposCliente'
import { formatCurrency, formatCompactCurrency } from '@/lib/formatters'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from 'recharts'
import { DollarSign, Boxes, Percent } from 'lucide-react'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * Página de Filtros Globais (/dashboard/filtros).
 *
 * Centraliza TODOS os filtros globais hoje presentes nas barras da Visão Geral
 * e da Visão Canais. O estado é persistido no sessionStorage pelo mesmo service
 * usado pelas duas visões (filter-persistence), de modo que o que for definido
 * aqui passa a valer para a Visão Geral E para a Visão Canais.
 */
/**
 * Tooltip customizado do card "Valores Consolidados (KPIs das Visões)".
 *
 * O Tooltip padrão do Recharts herda a cor da barra (Cell fill) no texto do
 * item, o que deixa o conteúdo ilegível sobre o fundo escuro do tooltip
 * (ex.: título azul sobre tooltip azul-escuro). Aqui o texto fica sempre
 * claro (branco/quase-branco) e a cor da barra é indicada apenas por um
 * pequeno dot/marcador ao lado do título.
 */
function KpiValoresTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ payload?: { name?: string; value?: number; fill?: string } }>
}) {
  if (!active || !payload || payload.length === 0) return null
  const entry = payload[0]?.payload
  if (!entry) return null
  return (
    <div className="rounded-lg border border-slate-700 bg-[#0F172A] px-3 py-2 text-xs shadow-lg">
      <div className="flex items-center gap-2">
        <span
          className="inline-block h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: entry.fill || '#0B6E99' }}
          aria-hidden="true"
        />
        <span className="font-semibold text-white">{entry.name}</span>
      </div>
      <div className="mt-1 pl-4 text-slate-200">
        Valor : {formatCurrency(Number(entry.value) || 0)}
      </div>
    </div>
  )
}

export default function FiltrosGlobais() {
  const [optionsData, setOptionsData] = useState<DashboardStatsResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Último resultado bem-sucedido: usado como fallback quando a consulta falha
  // (ex.: timeout) — evita tela de erro e mantém as opções já conhecidas.
  const lastGoodOptionsRef = useRef<DashboardStatsResult | null>(null)
  const [tipoClienteOptions, setTipoClienteOptions] = useState<string[]>([])
  const [tiposClienteMap, setTiposClienteMap] = useState<Record<string, string>>({})

  const hadSavedFiltersAtMount = useRef(hasSavedFiltersInSession())
  const [filters, setFilters] = useState<FilterState>(() => {
    const loaded = loadFiltersFromSession()
    if (!hasSavedFiltersInSession()) {
      saveFiltersToSession(loaded)
    }
    return loaded
  })
  const [initializedFromBase, setInitializedFromBase] = useState(true)

  // Persiste no mesmo espaço de sessão usado pelas duas visões
  useEffect(() => {
    saveFiltersToSession(filters)
  }, [filters])

  const filtersRef = useRef(filters)
  filtersRef.current = filters
  const initializedRef = useRef(initializedFromBase)
  initializedRef.current = initializedFromBase

  // Restaurar os filtros globais ao padrão (commit 0.0.264): período = mês corrente
  // (ou último ano disponível na base, se o corrente não existir) e demais seleções
  // voltam ao estado inicial — o mesmo critério do botão "Padrão Geral" do JP-Class.
  // A persistência em sessão acontece pelo useEffect que grava `filters`.
  const handleResetToDefault = useCallback(() => {
    const defaultFilters = buildDynamicInitialFilters(optionsData?.filterOptions)
    setFilters(defaultFilters)
  }, [optionsData])

  // Busca apenas as opções dinâmicas dos filtros (base vazia ⇒ listas vazias, sem quebrar)
  const loadOptions = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetchDashboardStats(
        filtersRef.current as unknown as Record<string, unknown>,
      )

      // Primeiro acesso sem sessão: aplica os filtros dinâmicos padrão da base
      if (!initializedRef.current && !hasSavedFiltersInSession() && res?.filterOptions) {
        const dynamicFilters = buildDynamicInitialFilters(res.filterOptions)
        setInitializedFromBase(true)
        saveFiltersToSession(dynamicFilters)
        setFilters(dynamicFilters)
      } else if (!initializedRef.current && res?.filterOptions) {
        setInitializedFromBase(true)
      }

      setOptionsData(res)
      lastGoodOptionsRef.current = res
    } catch (err: unknown) {
      console.error('[FiltrosGlobais] Erro ao carregar opções de filtros:', err)
      // Estabilidade: se já existe um resultado anterior, mantém as opções na tela
      // em vez de mostrar o cartão de erro (o "Tentar novamente" reaproveita o cache).
      if (lastGoodOptionsRef.current) {
        setOptionsData(lastGoodOptionsRef.current)
        setError(null)
      } else {
        setError(err instanceof Error ? err.message : 'Falha ao carregar opções de filtros.')
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadOptions()
  }, [loadOptions, filters])

  useEffect(() => {
    let mounted = true
    Promise.all([fetchTiposClienteOptions(), fetchTiposClienteMap()])
      .then(([opts, rawMap]) => {
        if (!mounted) return
        if (Array.isArray(opts) && opts.length > 0) {
          setTipoClienteOptions(opts)
        }
        if (rawMap && typeof rawMap === 'object') {
          const stringMap = buildTiposClienteStringMap(rawMap)
          setTiposClienteMap(stringMap)
        }
      })
      .catch((err) => console.warn('Falha ao buscar dados de tipo de cliente:', err))
    return () => {
      mounted = false
    }
  }, [])

  const filterOptions = useMemo(() => {
    const baseOpts = optionsData?.filterOptions || {
      vendedorCliente: [],
      vendedor: [],
      grupoItem: [],
      estado: [],
      utilizacao: [],
      tipoDocumento: [],
      canais: [],
      canaisClientes: [],
      inside: [],
      anos: [],
      meses: [],
      dias: [],
    }
    return {
      ...baseOpts,
      tipoCliente: (() => {
        const set = new Set<string>()
        if (baseOpts.tipoCliente) {
          baseOpts.tipoCliente.forEach((tc) => tc && set.add(tc.trim()))
        }
        tipoClienteOptions.forEach((tc) => tc && set.add(tc.trim()))
        Object.values(tiposClienteMap).forEach((tc) => tc && set.add(tc.trim()))
        return Array.from(set)
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b, 'pt-BR'))
      })(),
      isLoadingTipoCliente: false,
    }
  }, [optionsData, tipoClienteOptions, tiposClienteMap])

  // Gráfico "Faturamento por Tipo de Documento": DERIVA da seleção ativa do filtro
  // Tipo de documento. Com a seleção padrão ['NF'], mostra só a NF; quando o usuário
  // seleciona outros tipos (DEVNF, NFCOMDEV, ...), eles entram no gráfico.
  // NFCOMDEV traz o valor em valor_liquido/total_nf_novo (total_linha = 0) e DEVNF é
  // negativo (estorno), por isso o backend devolve o maior entre SUM(total_linha) e
  // SUM(valor_liquido) por tipo — exibimos essa série.
  const chartTipoDocumentoData = useMemo(() => {
    const list = optionsData?.charts?.tipoDocumento || []
    return list
      .map((item) => ({
        name: (item.name || '').trim() || 'Sem classificação',
        value: Number(item.value) || 0,
      }))
      .filter((item) => item.value > 0)
      .sort((a, b) => b.value - a.value)
  }, [optionsData])

  const chartUtilizacaoData = useMemo(() => {
    const list = optionsData?.charts?.utilizacao || []
    return list
      .map((item) => ({
        name: (item.name || '').trim() || 'Sem classificação',
        value: Number(item.value) || 0,
      }))
      .filter((item) => item.value > 0)
      .sort((a, b) => b.value - a.value)
  }, [optionsData])

  // Fase 3: 4 valores de KPI das visões (Geral/Canais) em barras horizontais.
  // Vêm do mesmo endpoint dashboard/stats que já alimenta a página — os valores
  // chegam já filtrados pelos Filtros Globais ativos e recalculam ao limpar
  // (loadOptions roda a cada mudança de `filters`).
  const kpiValuesData = useMemo(() => {
    const kpis = optionsData?.kpis
    if (!kpis) return []
    // Títulos/métricas ALINHADOS com o quadro do JP-Class (/jp-class):
    // Valor Total Mercadoria = total_linha; Valor Líquido Total = valor_liquido;
    // Valor Total NF sem frete = total_nf_sem_frete (MAX por NF); Custo Total = custo_total.
    return [
      {
        name: 'Valor Total Mercadoria',
        value: Number(kpis.faturamento) || 0,
        fill: '#0B6E99',
      },
      {
        name: 'Valor Líquido Total',
        value: Number(kpis.valorLiquido) || 0,
        fill: '#0D9488',
      },
      {
        name: 'Valor Total NF sem frete',
        value: Number(kpis.totalNfSemFrete) || 0,
        fill: '#F59E0B',
      },
      {
        name: 'Custo Total',
        value: Number(kpis.custoTotal) || 0,
        fill: '#8B5CF6',
      },
    ]
  }, [optionsData])

  const tooltipContentStyle: React.CSSProperties = {
    backgroundColor: '#0F172A',
    borderColor: '#334155',
    color: '#FFFFFF',
    borderRadius: '0.5rem',
    fontSize: '0.75rem',
    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho explicativo */}
      <Card className="rounded-xl border border-gray-200 bg-white p-4 shadow-xs">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-xl bg-cyan-50 text-[#0B6E99] shrink-0">
              <SlidersHorizontal className="w-5 h-5" />
            </div>
            <div>
              <CardTitle className="text-base font-extrabold text-slate-900">
                Filtros Globais
              </CardTitle>
              <CardDescription className="text-xs text-slate-500 font-medium mt-0.5">
                Os filtros definidos aqui valem para o painel inteiro: aplicam-se à Visão Geral, à
                Visão Canais e ao Relatório JP-Class. Os filtros de Canais (Canal, Clientes, Deploy
                e Inside) ficam na Visão Canais.
              </CardDescription>
            </div>
          </div>

          {/* Botão Restaurar Padrão Geral */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleResetToDefault}
            className="h-8 px-2.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border-slate-200 gap-1 shrink-0"
            title="Restaurar critério padrão de filtragem (Visão Geral / Visão Canais)"
          >
            <RotateCcw className="w-3.5 h-3.5 text-[#0B6E99]" />
            <span>Padrão Geral</span>
          </Button>
        </div>
      </Card>

      {/* Aviso quando as opções dinâmicas não puderem ser carregadas (ex.: base vazia/timeout) */}
      {error && (
        <Card className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 shadow-xs">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-start gap-2 text-xs text-slate-600">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>
                Não foi possível carregar as opções dinâmicas dos filtros ({error}). Os filtros
                salvos nesta sessão continuam válidos.
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadOptions()}
              className="bg-white border-amber-300 text-slate-700 hover:bg-amber-100 font-bold gap-1.5 text-xs shadow-2xs h-8 shrink-0"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Tentar novamente
            </Button>
          </div>
        </Card>
      )}

      {/* Filtros globais (sem os filtros de Canais, que ficam na Visão Canais) */}
      {loading && !optionsData ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : (
        <FilterBar
          hideCanais
          filters={filters}
          setFilters={setFilters}
          options={filterOptions}
          isLoading={loading}
          loadingMessage="Atualizando opções de filtros..."
          onApplyFilters={() => {
            // Os filtros são aplicados automaticamente às visões via persistência de sessão
          }}
        />
      )}

      {/* Dois gráficos solicitados: Tipo de Documento e Utilização respeitando os filtros ativos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Gráfico 1: Valor Total por Tipo de Documento */}
        <ChartCard
          title="Faturamento por Tipo de Documento"
          description="Valor total acumulado no período filtrado por tipo de documento"
          icon={FileText}
          iconColor="text-[#0B6E99]"
        >
          {loading && !optionsData ? (
            <div className="h-full flex items-center justify-center">
              <Skeleton className="h-64 w-full rounded-lg" />
            </div>
          ) : chartTipoDocumentoData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-xs text-slate-400">
              Nenhum dado encontrado para o período/filtros selecionados
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartTipoDocumentoData}
                layout="vertical"
                margin={{ top: 10, right: 24, left: 10, bottom: 10 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" horizontal={false} />
                <XAxis
                  type="number"
                  tickLine={false}
                  axisLine={{ stroke: '#E2E8F0' }}
                  tick={{ fill: '#64748B', fontSize: 11 }}
                  tickFormatter={(val) => {
                    const n = Number(val)
                    if (Math.abs(n) >= 1_000_000) return `R$ ${(n / 1_000_000).toFixed(1)}M`
                    if (Math.abs(n) >= 1_000) return `R$ ${(n / 1_000).toFixed(0)}k`
                    return `R$ ${n}`
                  }}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tickLine={false}
                  axisLine={{ stroke: '#E2E8F0' }}
                  tick={{ fill: '#334155', fontSize: 11, fontWeight: 600 }}
                  width={130}
                />
                <Tooltip
                  formatter={(val: number | string | undefined) => [
                    formatCurrency(Number(val) || 0),
                    'Valor Total',
                  ]}
                  contentStyle={tooltipContentStyle}
                />
                <Bar
                  dataKey="value"
                  name="Valor Total"
                  fill="#0B6E99"
                  radius={[0, 4, 4, 0]}
                  maxBarSize={28}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* Gráfico 2: Valor Total por Utilização */}
        <ChartCard
          title="Faturamento por Utilização"
          description="Valor total acumulado no período filtrado por utilização"
          icon={Tag}
          iconColor="text-teal-600"
        >
          {loading && !optionsData ? (
            <div className="h-full flex items-center justify-center">
              <Skeleton className="h-64 w-full rounded-lg" />
            </div>
          ) : chartUtilizacaoData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-xs text-slate-400">
              Nenhum dado encontrado para o período/filtros selecionados
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartUtilizacaoData}
                layout="vertical"
                margin={{ top: 10, right: 24, left: 10, bottom: 10 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" horizontal={false} />
                <XAxis
                  type="number"
                  tickLine={false}
                  axisLine={{ stroke: '#E2E8F0' }}
                  tick={{ fill: '#64748B', fontSize: 11 }}
                  tickFormatter={(val) => {
                    const n = Number(val)
                    if (Math.abs(n) >= 1_000_000) return `R$ ${(n / 1_000_000).toFixed(1)}M`
                    if (Math.abs(n) >= 1_000) return `R$ ${(n / 1_000).toFixed(0)}k`
                    return `R$ ${n}`
                  }}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tickLine={false}
                  axisLine={{ stroke: '#E2E8F0' }}
                  tick={{ fill: '#334155', fontSize: 11, fontWeight: 600 }}
                  width={130}
                />
                <Tooltip
                  formatter={(val: number | string | undefined) => [
                    formatCurrency(Number(val) || 0),
                    'Valor Total',
                  ]}
                  contentStyle={tooltipContentStyle}
                />
                <Bar
                  dataKey="value"
                  name="Valor Total"
                  fill="#0D9488"
                  radius={[0, 4, 4, 0]}
                  maxBarSize={28}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* Fase 3: 4 valores de KPI em barras horizontais (um por métrica,
          comparáveis entre si no mesmo eixo), logo abaixo dos dashs existentes */}
      <ChartCard
        title="Valores Consolidados (KPIs das Visões)"
        description="Valor Total de Mercadorias, Valor Líquido Total, Valor Total NF sem frete e Valor Total da NF — no período/filtros ativos"
        icon={DollarSign}
        iconColor="text-[#0B6E99]"
      >
        {loading && !optionsData ? (
          <div className="h-full flex items-center justify-center">
            <Skeleton className="h-64 w-full rounded-lg" />
          </div>
        ) : kpiValuesData.every((item) => item.value === 0) ? (
          <div className="h-full flex items-center justify-center text-xs text-slate-400">
            Nenhum dado encontrado para o período/filtros selecionados
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={kpiValuesData}
              layout="vertical"
              margin={{ top: 10, right: 140, left: 10, bottom: 10 }}
              barCategoryGap="25%"
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" horizontal={false} />
              <XAxis
                type="number"
                tickLine={false}
                axisLine={{ stroke: '#E2E8F0' }}
                tick={{ fill: '#64748B', fontSize: 11 }}
                tickFormatter={(val) => {
                  const n = Number(val)
                  if (Math.abs(n) >= 1_000_000) return `R$ ${(n / 1_000_000).toFixed(1)}M`
                  if (Math.abs(n) >= 1_000) return `R$ ${(n / 1_000).toFixed(0)}k`
                  return `R$ ${n}`
                }}
              />
              <YAxis
                type="category"
                dataKey="name"
                tickLine={false}
                axisLine={{ stroke: '#E2E8F0' }}
                tick={{ fill: '#334155', fontSize: 11, fontWeight: 600 }}
                width={185}
              />
              <Tooltip
                cursor={{ fill: 'rgba(148, 163, 184, 0.15)' }}
                content={<KpiValoresTooltip />}
              />
              <Bar
                dataKey="value"
                name="Valor"
                radius={[0, 4, 4, 0]}
                maxBarSize={30}
                label={{
                  position: 'right',
                  formatter: (value: number) => formatCompactCurrency(Number(value) || 0),
                  fill: '#334155',
                  fontSize: 11,
                  fontWeight: 700,
                }}
              >
                {kpiValuesData.map((item) => (
                  <Cell key={item.name} fill={item.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>
    </div>
  )
}
