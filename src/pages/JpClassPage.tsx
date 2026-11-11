import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import {
  Calendar,
  Layers,
  RefreshCw,
  TrendingUp,
  SlidersHorizontal,
  FileSpreadsheet,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { fetchVendasExport } from '@/services/sales'
import {
  getSemanasDoMes,
  encontrarSemanaDaData,
  agregarValoresPorSemana,
  type SemanaMes,
} from '@/lib/semanas'
import { useNavigate } from 'react-router-dom'
import { getJpClass } from '@/lib/jp-class'
import {
  MESES_PT_BR,
  formatCurrency,
  formatCompactCurrency,
  formatNumber,
  exportToCSV,
} from '@/lib/formatters'
import {
  loadFiltersFromSession,
  saveFiltersToSession,
  hasSavedFiltersInSession,
  hasValidPeriodFilters,
  loadJpClassPeriodoFromSession,
  saveJpClassPeriodoToSession,
  type JpClassPeriodoLocal,
  FILTERS_CHANGED_EVENT,
} from '@/lib/filter-persistence'
import type { FilterState } from '@/types/sales'
import {
  JpClassRelatorio,
  type VendaComSemana,
  type JpClassGroupBy,
} from '@/components/JpClassRelatorio'
import { JpClassDashboard } from '@/components/JpClassDashboard'
import {
  fetchTiposClienteMap,
  buildTiposClienteStringMap,
  enrichVendaTipoCliente,
} from '@/services/tiposCliente'

export default function JpClassPage() {
  const navigate = useNavigate()
  const hoje = new Date()

  // Filtros GLOBAIS compartilhados (mesma sessão de Visão Geral / Visão Canais / Filtros Globais).
  // O módulo JP-Class não possui mais filtros próprios: ele REFLETE os Filtros Globais
  // e recalcula quando eles mudam (evento paineis_vendas_filters_changed, foco, storage).
  const [filters, setFilters] = useState<FilterState>(() => {
    const loaded = loadFiltersFromSession()
    if (!hasSavedFiltersInSession()) {
      saveFiltersToSession(loaded)
    }
    return loaded
  })

  const filtersRef = useRef<FilterState>(filters)
  filtersRef.current = filters

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rawVendas, setRawVendas] = useState<VendaComSemana[]>([])
  const [tiposClienteMap, setTiposClienteMap] = useState<Record<string, string>>({})

  const [groupBy, setGroupBy] = useState<JpClassGroupBy>('hierarquia')
  const [filtroSemana, setFiltroSemana] = useState<number | 'todas'>('todas')

  // Filtro LOCAL de Ano/Mês do JP-Class (sessionStorage, chave "jpclass_periodo").
  // PRIORIDADE sobre os Filtros Globais: campo preenchido sobrepõe o valor global;
  // campo vazio ("") = segue o valor dos Filtros Globais.
  const [periodoLocal, setPeriodoLocal] = useState<JpClassPeriodoLocal>(() =>
    loadJpClassPeriodoFromSession(),
  )

  const handlePeriodoLocalChange = useCallback((campo: 'ano' | 'mes', valor: string) => {
    setPeriodoLocal((prev) => {
      const next: JpClassPeriodoLocal = { ...prev, [campo]: valor }
      saveJpClassPeriodoToSession(next)
      return next
    })
  }, [])

  // Anos disponíveis no filtro local: janela dinâmica da base ativa
  // (ano atual + 2 anteriores, ex.: 2024–2026).
  const anoAtualSistema = hoje.getFullYear()
  const anosDisponiveis = useMemo(() => {
    return [anoAtualSistema, anoAtualSistema - 1, anoAtualSistema - 2]
  }, [anoAtualSistema])

  // Período de análise (ano/mês) EFETIVO:
  // 1º) Ano/Mês local do JP-Class, quando preenchidos;
  // 2º) Filtros Globais (ano/mes) quando o campo local correspondente está vazio;
  // 3º) Padrão geral: mês corrente do sistema.
  const periodo = useMemo(() => {
    let globalAno: number | null = null
    let globalMes: number | null = null
    if (hasValidPeriodFilters(filters)) {
      const y = parseInt(filters.ano[0], 10)
      const m = parseInt(filters.mes[0], 10)
      if (!isNaN(y) && y > 2000) globalAno = y
      if (!isNaN(m) && m >= 1 && m <= 12) globalMes = m
    }

    const localAno = periodoLocal.ano ? parseInt(periodoLocal.ano, 10) : NaN
    const localMes = periodoLocal.mes ? parseInt(periodoLocal.mes, 10) : NaN

    const anoEfetivo =
      !isNaN(localAno) && localAno > 2000 ? localAno : (globalAno ?? hoje.getFullYear())
    const mesEfetivo =
      !isNaN(localMes) && localMes >= 1 && localMes <= 12
        ? localMes
        : (globalMes ?? hoje.getMonth() + 1)

    return { ano: anoEfetivo, mes: mesEfetivo }
  }, [filters.ano, filters.mes, periodoLocal.ano, periodoLocal.mes, anoAtualSistema])
  const { ano, mes } = periodo

  // Ref de leitura síncrona do período efetivo para o fetch (evita refetch
  // desnecessário disparado por inclusão do objeto `periodo` nas dependências
  // de carregarVendas — as semanas/dateRange já capturam a mudança de período).
  const periodoRef = useRef(periodo)
  periodoRef.current = periodo

  // Na primeira carga sem preferência salva em sessão, aplica os padrões globais estáticos
  // (Fase 2: tipoDocumento ['NF'], mês corrente). Os defaults dinâmicos já são gravados
  // em sessão pelas telas Visão Geral / Visão Canais / Filtros Globais.

  // Carrega mapa de tipos_cliente para enriquecer o tipo de cliente
  // (código PN -> nome do tipo, mesmo padrão das outras páginas)
  useEffect(() => {
    let mounted = true
    fetchTiposClienteMap()
      .then((resMap) => {
        if (mounted && resMap && typeof resMap === 'object') {
          setTiposClienteMap(buildTiposClienteStringMap(resMap))
        }
      })
      .catch((err) => {
        console.warn('Erro ao carregar dados de tipos_cliente no JP-Class:', err)
      })
    return () => {
      mounted = false
    }
  }, [])

  // Sincroniza os filtros com o sessionStorage de forma reativa:
  // recarrega ao focar na janela, ao disparar evento de alteração/limpeza
  // ou evento storage nativo — o mesmo padrão de Visão Geral / Visão Canais.
  const syncFiltersFromSession = useCallback(() => {
    const latest = loadFiltersFromSession()
    const currentSerialized = JSON.stringify(filtersRef.current)
    const latestSerialized = JSON.stringify(latest)

    if (currentSerialized !== latestSerialized) {
      setFilters(latest)
    }
  }, [])

  useEffect(() => {
    const handleFiltersChanged = (e?: Event) => {
      const customEvent = e as CustomEvent<FilterState | null> | undefined
      if (customEvent?.detail) {
        const nextFilters = customEvent.detail
        if (JSON.stringify(filtersRef.current) !== JSON.stringify(nextFilters)) {
          setFilters(nextFilters)
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
  }, [syncFiltersFromSession])

  const abortControllerRef = useRef<AbortController | null>(null)

  // Semanas calculadas estritamente de acordo com a regra de negócio
  // (seg–dom; Semana 1 = 1ª segunda-feira do mês; dias anteriores ficam fora;
  // última semana incompleta é descartada).
  const semanas = useMemo<SemanaMes[]>(() => {
    return getSemanasDoMes(ano, mes)
  }, [ano, mes])

  // Limite de datas para buscar vendas (da primeira semana até a última semana completa)
  const dateRange = useMemo(() => {
    if (semanas.length === 0) return null
    const dataDe = semanas[0].inicioStr
    const dataAte = semanas[semanas.length - 1].fimStr
    return { dataDe, dataAte }
  }, [semanas])

  // Carrega vendas da base consolidada (mesma base de Visão Geral / Canais)
  // aplicando os Filtros Globais NO SERVIDOR (mesmos campos f.* do dashboard/stats
  // e do relatório de vendas) + o recorte do calendário de semanas.
  const carregarVendas = useCallback(async () => {
    if (!dateRange) {
      setRawVendas([])
      return
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    const controller = new AbortController()
    abortControllerRef.current = controller

    const activeFilters = filtersRef.current
    const periodoAtual = periodoRef.current

    setLoading(true)
    setError(null)

    try {
      // Reutiliza o endpoint oficial de vendas com os Filtros Globais + recorte de semanas.
      // PRIORIDADE DO FILTRO LOCAL: o ano/mês EFETIVO (local sobrepõe o global)
      // substitui os valores globais no payload — sem isso, o backend aplicaria
      // os dois períodos (global E local) em interseção, e um mês/ano local
      // diferente do global devolveria vazio.
      const res = await fetchVendasExport({
        filters: {
          ...(activeFilters as unknown as Record<string, unknown>),
          ano: [String(periodoAtual.ano)],
          mes: [String(periodoAtual.mes)],
          dataDe: dateRange.dataDe,
          dataAte: dateRange.dataAte,
        },
        signal: controller.signal,
      })

      // Mapeia cada venda para a respectiva semana pela data_lancamento
      const comSemanas: VendaComSemana[] = []

      for (const item of res.items || []) {
        const sem = encontrarSemanaDaData(item.data_lancamento, semanas)
        if (sem) {
          // JP-Class SEMPRE derivado ao vivo a partir do Grupo do item
          // (grupo_item ou itms_grp_nam): TINTAS→INKS, EQUIPAMENTOS→HARD,
          // DGS (6 grupos)→DGS, demais→OTHERS
          const grupoValor = (item.grupo_item || item.itms_grp_nam || '').trim()
          const derivedJpClass = getJpClass(item)
          comSemanas.push({
            ...item,
            grupo_item: grupoValor || item.grupo_item || '',
            semanaNumero: sem.numero,
            semanaNome: sem.nome,
            jpClass: derivedJpClass,
          })
        }
      }

      // Enriquecer tipo_cliente usando tiposClienteMap como fallback se vier vazio do backend
      const comTiposCliente = comSemanas.map((v) => enrichVendaTipoCliente(v, tiposClienteMap))

      setRawVendas(comTiposCliente)
    } catch (err: unknown) {
      if ((err as Error)?.name === 'AbortError' || String(err).includes('aborted')) {
        return
      }
      console.error('Erro ao carregar vendas para JP-Class:', err)
      setError(
        err instanceof Error && err.message
          ? `Falha ao carregar as vendas do período: ${err.message}`
          : 'Falha ao carregar as vendas do período. Tente novamente.',
      )
    } finally {
      setLoading(false)
    }
  }, [dateRange, semanas, tiposClienteMap, periodoLocal.ano, periodoLocal.mes])

  useEffect(() => {
    carregarVendas()
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [carregarVendas])

  // Vendas filtradas por semana (se o usuário selecionar uma semana específica nos KPIs)
  const vendasExibidas = useMemo(() => {
    if (filtroSemana === 'todas') return rawVendas
    return rawVendas.filter((v) => v.semanaNumero === filtroSemana)
  }, [rawVendas, filtroSemana])

  // KPIs consolidados por semana (refletem os Filtros Globais aplicados no servidor)
  const kpisPorSemana = useMemo(() => {
    return semanas.map((sem) => {
      const vendasSemana = rawVendas.filter((v) => v.semanaNumero === sem.numero)
      const faturamento = vendasSemana.reduce((acc, v) => acc + (Number(v.total_linha) || 0), 0)
      const valorLiquido = vendasSemana.reduce((acc, v) => acc + (Number(v.valor_liquido) || 0), 0)
      const quantidade = vendasSemana.reduce((acc, v) => acc + (Number(v.quantidade) || 0), 0)
      const linhas = vendasSemana.length

      return {
        semana: sem,
        faturamento,
        valorLiquido,
        quantidade,
        linhas,
      }
    })
  }, [semanas, rawVendas])

  // Totalizador geral do mês (reflete os Filtros Globais aplicados no servidor)
  const totalGeral = useMemo(() => {
    const faturamento = rawVendas.reduce((acc, v) => acc + (Number(v.total_linha) || 0), 0)
    const valorLiquido = rawVendas.reduce((acc, v) => acc + (Number(v.valor_liquido) || 0), 0)
    const quantidade = rawVendas.reduce((acc, v) => acc + (Number(v.quantidade) || 0), 0)
    return {
      faturamento,
      valorLiquido,
      quantidade,
      linhas: rawVendas.length,
    }
  }, [rawVendas])

  // Quadro de valores por semana (Fase 5): Valor Total Mercadoria, Valor Líquido Total,
  // Valor Total NF sem frete e Custo Total — agregados a partir das MESMAS linhas já
  // carregadas (rawVendas), respeitando os Filtros Globais e recalculando ao limpar.
  const valoresPorSemana = useMemo(() => {
    return agregarValoresPorSemana(rawVendas, semanas)
  }, [rawVendas, semanas])

  // Totais do quadro (soma das semanas = mês consolidado, pois dias fora do calendário não entram)
  const totaisQuadroSemanas = useMemo(() => {
    return valoresPorSemana.reduce(
      (acc, s) => ({
        valorTotalMercadoria: acc.valorTotalMercadoria + s.valorTotalMercadoria,
        valorLiquidoTotal: acc.valorLiquidoTotal + s.valorLiquidoTotal,
        valorTotalNfSemFrete: acc.valorTotalNfSemFrete + s.valorTotalNfSemFrete,
        custoTotal: acc.custoTotal + s.custoTotal,
        linhas: acc.linhas + s.linhas,
      }),
      {
        valorTotalMercadoria: 0,
        valorLiquidoTotal: 0,
        valorTotalNfSemFrete: 0,
        custoTotal: 0,
        linhas: 0,
      },
    )
  }, [valoresPorSemana])

  const valorCompacto = (v: number) =>
    Math.abs(v) >= 100000 ? formatCompactCurrency(v) : formatCurrency(v)

  // Exportação rápida para CSV
  const handleExportCsv = () => {
    const columns = [
      { key: 'semanaNome', label: 'Semana' },
      { key: 'data_lancamento', label: 'Data Lançamento' },
      { key: 'numero_nfe', label: 'Nr. NF' },
      { key: 'jpClass', label: 'JP-Class' },
      { key: 'grupo_item', label: 'Grupo' },
      { key: 'tipo_documento', label: 'Tipo Documento' },
      { key: 'codigo_item', label: 'Código Item' },
      { key: 'descricao_item', label: 'Descrição Item' },
      { key: 'nome_cliente', label: 'Cliente' },
      { key: 'tipo_cliente', label: 'Tipo Cliente' },
      { key: 'quantidade', label: 'Quantidade' },
      { key: 'total_linha', label: 'Total da Linha (R$)' },
      { key: 'valor_liquido', label: 'Valor Líquido (R$)' },
    ]
    exportToCSV(`vendas_jp_class_${ano}_${String(mes).padStart(2, '0')}`, vendasExibidas, columns)
  }

  const mesNome = MESES_PT_BR[mes - 1]
  // Indicador visual de prioridade: quando o local está ativo, destaca no cabeçalho
  const usandoAnoLocal = !!periodoLocal.ano
  const usandoMesLocal = !!periodoLocal.mes

  return (
    <div className="space-y-6">
      {/* Banner informativo: Filtros Globais geridos na página dedicada /dashboard/filtros */}
      <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-lg bg-[#0B6E99]/10 text-[#0B6E99]">
              <SlidersHorizontal className="w-5 h-5" />
            </span>
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Período de Análise: {mesNome} de {ano}
                {(usandoAnoLocal || usandoMesLocal) && (
                  <Badge className="ml-2 bg-[#0B6E99] text-white text-[10px] font-bold align-middle">
                    filtro local
                  </Badge>
                )}
              </h2>
              <p className="text-xs text-slate-500">
                Semanas calculadas de segunda a domingo iniciando na 1ª segunda-feira
                {(usandoAnoLocal || usandoMesLocal) &&
                  ' — período definido pelo filtro LOCAL deste módulo (sobrepõe os Filtros Globais)'}
              </p>
            </div>
          </div>
        </div>

        {/* Filtro LOCAL de Ano/Mês do JP-Class (prioridade sobre os Filtros Globais) */}
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
            <span>Ano</span>
            <select
              value={periodoLocal.ano}
              onChange={(e) => handlePeriodoLocalChange('ano', e.target.value)}
              disabled={loading}
              className="h-8 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-800 shadow-2xs focus:border-[#0B6E99] focus:outline-none focus:ring-1 focus:ring-[#0B6E99]/30"
            >
              <option value="">Global (do painel)</option>
              {anosDisponiveis.map((a) => (
                <option key={a} value={String(a)}>
                  {a}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
            <span>Mês</span>
            <select
              value={periodoLocal.mes}
              onChange={(e) => handlePeriodoLocalChange('mes', e.target.value)}
              disabled={loading}
              className="h-8 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-800 shadow-2xs focus:border-[#0B6E99] focus:outline-none focus:ring-1 focus:ring-[#0B6E99]/30"
            >
              <option value="">Todos (global)</option>
              {MESES_PT_BR.map((nome, idx) => (
                <option key={idx + 1} value={String(idx + 1)}>
                  {nome}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Ações */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/dashboard/filtros')}
            className="text-xs font-semibold gap-1.5 h-8 bg-white"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500" />
            <span>Filtros Globais</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={carregarVendas}
            disabled={loading}
            className="text-xs font-semibold gap-1.5 h-8 bg-white"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#0B6E99] ${loading ? 'animate-spin' : ''}`} />
            <span>Atualizar</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCsv}
            disabled={loading || vendasExibidas.length === 0}
            className="text-xs font-semibold gap-1.5 h-8 bg-white"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            <span>Exportar CSV</span>
          </Button>
        </div>
      </div>

      {/* Alerta de erro */}
      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center justify-between gap-3">
          <span>{error}</span>
          <Button
            variant="outline"
            size="sm"
            onClick={carregarVendas}
            className="text-xs bg-white text-red-700 border-red-300 h-7"
          >
            Tentar novamente
          </Button>
        </div>
      )}

      {/* Alerta amigável caso o período selecionado não possua vendas */}
      {!loading && !error && rawVendas.length === 0 && (
        <div className="p-4 rounded-xl bg-amber-50/80 border border-amber-200 text-amber-900 text-xs">
          <p className="font-bold">
            Nenhuma venda registrada nas semanas de {mesNome} de {ano} com os Filtros Globais
            atuais.
          </p>
          <p className="text-amber-700 text-[11px]">
            A base consolidada não possui vendas para o intervalo/recorte selecionado ou o mês ainda
            não foi faturado. Ajuste os Filtros Globais em Dashboard → Filtros Globais.
          </p>
        </div>
      )}

      {/* Regra de calendário em banner informativo */}
      {semanas.length > 0 && (
        <div className="bg-sky-50/70 border border-sky-200/80 rounded-xl p-3.5 flex items-start gap-3 text-xs text-sky-950">
          <Calendar className="w-4 h-4 text-[#0B6E99] shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-bold text-[#0B6E99]">
              Calendário de Semanas de {mesNome} de {ano}:
            </span>
            <div className="flex flex-wrap gap-2 text-[11px] text-slate-700">
              {semanas.map((s) => (
                <span
                  key={s.numero}
                  className="px-2 py-0.5 rounded-md bg-white border border-sky-200 shadow-2xs font-medium"
                >
                  <strong className="text-slate-900">{s.nome}:</strong> {s.inicioFormatado} a{' '}
                  {s.fimFormatado} ({s.dias} dias)
                </span>
              ))}
            </div>
            <p className="text-[10px] text-slate-500">
              * Vendas anteriores a {semanas[0]?.inicioFormatado} ficam fora da contagem das
              semanas. Cada semana vai de segunda a domingo.
            </p>
          </div>
        </div>
      )}

      {/* KPIs / Totalizadores por Semana */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
            <TrendingUp className="w-4 h-4 text-[#0B6E99]" />
            KPIs & Totalizadores por Semana
          </h3>
          {filtroSemana !== 'todas' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setFiltroSemana('todas')}
              className="text-xs text-[#0B6E99] hover:underline h-7 px-2"
            >
              Limpar filtro de semana (ver todas)
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
          {/* Card Totalizador Geral */}
          <div
            onClick={() => setFiltroSemana('todas')}
            className={`cursor-pointer transition-all rounded-xl border p-4 bg-white shadow-2xs hover:shadow-xs ${
              filtroSemana === 'todas'
                ? 'border-[#0B6E99] ring-2 ring-[#0B6E99]/20'
                : 'border-slate-200'
            }`}
          >
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
              <span className="font-bold text-slate-700">Mês Consolidado</span>
              <Badge variant="outline" className="text-[10px] bg-slate-100 font-bold">
                {semanas.length} semanas
              </Badge>
            </div>
            <div className="text-lg font-black text-slate-900 tabular-nums">
              {formatCurrency(totalGeral.faturamento)}
            </div>
            <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
              <span>Qtde: {formatNumber(totalGeral.quantidade)} un.</span>
              <span>{totalGeral.linhas} linhas</span>
            </div>
          </div>

          {/* Cards por Semana */}
          {kpisPorSemana.map((kpi) => {
            const isSelected = filtroSemana === kpi.semana.numero
            return (
              <div
                key={kpi.semana.numero}
                onClick={() =>
                  setFiltroSemana((prev) =>
                    prev === kpi.semana.numero ? 'todas' : kpi.semana.numero,
                  )
                }
                className={`cursor-pointer transition-all rounded-xl border p-4 bg-white shadow-2xs hover:shadow-xs ${
                  isSelected
                    ? 'border-[#0B6E99] ring-2 ring-[#0B6E99]/20 bg-sky-50/20'
                    : 'border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                  <span className="font-bold text-slate-800">{kpi.semana.nome}</span>
                  <span className="text-[10px] text-slate-400">
                    {kpi.semana.inicioFormatado} a {kpi.semana.fimFormatado}
                  </span>
                </div>
                <div className="text-base font-extrabold text-[#0B6E99] tabular-nums">
                  {formatCurrency(kpi.faturamento)}
                </div>
                <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                  <span>Qtde: {formatNumber(kpi.quantidade)}</span>
                  <span>{kpi.linhas} linhas</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Quadro de Valores por Semana (Fase 5) — após o quadro MÊS consolidado */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-2xs overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-[#0B6E99]" />
          <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            Valores por Semana — {mesNome} de {ano}
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              {/* Linha superior: métricas em colunas */}
              <tr className="bg-slate-50 text-slate-600">
                <th className="px-4 py-2 text-left font-bold border-b border-slate-200">Semana</th>
                <th className="px-4 py-2 text-right font-bold border-b border-slate-200">
                  Valor Total Mercadoria
                </th>
                <th className="px-4 py-2 text-right font-bold border-b border-slate-200">
                  Valor Líquido Total
                </th>
                <th className="px-4 py-2 text-right font-bold border-b border-slate-200">
                  Valor Total NF sem frete
                </th>
                <th className="px-4 py-2 text-right font-bold border-b border-slate-200">
                  Custo Total
                </th>
              </tr>
            </thead>
            <tbody>
              {/* Linha abaixo: Semana 1, 2, 3, 4, 5 (apenas as semanas existentes no mês) */}
              {valoresPorSemana.map((v) => (
                <tr key={v.semana.numero} className="hover:bg-slate-50/60">
                  <td className="px-4 py-2.5 font-semibold text-slate-700 border-b border-slate-100 whitespace-nowrap">
                    {v.semana.nome}
                    <span className="ml-1.5 text-[10px] font-normal text-slate-400">
                      ({v.semana.inicioFormatado} a {v.semana.fimFormatado})
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-900 border-b border-slate-100">
                    {valorCompacto(v.valorTotalMercadoria)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-900 border-b border-slate-100">
                    {valorCompacto(v.valorLiquidoTotal)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-900 border-b border-slate-100">
                    {valorCompacto(v.valorTotalNfSemFrete)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-900 border-b border-slate-100">
                    {valorCompacto(v.custoTotal)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 font-bold">
                <td className="px-4 py-2.5 text-slate-800">Total do Mês</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-slate-900">
                  {formatCurrency(totaisQuadroSemanas.valorTotalMercadoria)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-slate-900">
                  {formatCurrency(totaisQuadroSemanas.valorLiquidoTotal)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-slate-900">
                  {formatCurrency(totaisQuadroSemanas.valorTotalNfSemFrete)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-slate-900">
                  {formatCurrency(totaisQuadroSemanas.custoTotal)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
        {semanas.length === 0 && (
          <div className="px-4 py-3 text-[11px] text-slate-500">
            Nenhuma semana completa no período selecionado.
          </div>
        )}
      </div>

      {/* Dashboard do Módulo (Recortes por JP-Class, Tipo de Cliente com Subtotais, Grupo e Item) */}
      <div className="w-full min-w-0">
        <div className="mb-3">
          <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
            <Layers className="w-4 h-4 text-[#0B6E99]" />
            Dashboard — Recortes por JP-Class, Tipo de Cliente, Grupo e Item
          </h3>
        </div>
        <JpClassDashboard items={vendasExibidas} />
      </div>

      {/* Relatório de Vendas por Semanas com Ordenação e Agrupamentos Colapsáveis */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
            <FileSpreadsheet className="w-4 h-4 text-[#0B6E99]" />
            Relatório de Vendas por Semanas ({vendasExibidas.length} registros)
          </h3>
          {filtroSemana !== 'todas' && (
            <Badge className="bg-[#0B6E99] text-white text-xs">
              Filtrado por: Semana {filtroSemana}
            </Badge>
          )}
        </div>

        <JpClassRelatorio
          items={vendasExibidas}
          loading={loading}
          groupBy={groupBy}
          onGroupByChange={setGroupBy}
        />
      </div>
    </div>
  )
}
