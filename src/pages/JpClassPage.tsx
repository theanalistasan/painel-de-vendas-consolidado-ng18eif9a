import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import {
  Calendar,
  Layers,
  RefreshCw,
  TrendingUp,
  SlidersHorizontal,
  FileSpreadsheet,
  Eraser,
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
import { MESES_PT_BR, formatCurrency, formatCompactCurrency, exportToCSV } from '@/lib/formatters'
import { MultiSelectDropdown } from '@/components/FilterBar'
import {
  loadFiltersFromSession,
  saveFiltersToSession,
  hasSavedFiltersInSession,
  hasValidPeriodFilters,
  EMPTY_JPCLASS_PERIODO,
  saveJpClassPeriodoToSession,
  type JpClassPeriodoLocal,
  FILTERS_CHANGED_EVENT,
} from '@/lib/filter-persistence'
import type { FilterState } from '@/types/sales'
import {
  TITULO_VALOR_TOTAL_BRUTO,
  TITULO_VALOR_LIQUIDO_NET,
  TITULO_VALOR_TOTAL_SEM_FRETE,
  TITULO_VALOR_MERCADORIA,
  TITULO_CUSTO_TOTAL,
  FAIXA_COMERCIAL_LABEL,
  FAIXA_CONTABIL_LABEL,
} from '@/lib/valor-titulos'
import {
  JpClassRelatorio,
  type VendaComSemana,
  type JpClassGroupBy,
} from '@/components/JpClassRelatorio'
import { JpClassDashboard } from '@/components/JpClassDashboard'
import { QuadroValoresFaixa } from '@/components/QuadroValoresFaixa'
import {
  fetchTiposClienteMap,
  buildTiposClienteStringMap,
  enrichVendaTipoCliente,
} from '@/services/tiposCliente'

/**
 * Preferência local de PERÍODO do JP-Class (padrão dos Filtros Globais):
 * listas de selecionados — anos[] e meses[] (ordem calendário Jan→Dez).
 * Persistida em sessionStorage sob a MESMA chave "jpclass_periodo" (campos
 * antigos single-select são descartados ao carregar).
 */
interface JpClassPeriodoSelecoes {
  anos: string[]
  meses: string[]
}

const JPCLASS_PERIODO_KEY = 'jpclass_periodo'

function loadPeriodoSelecoes(): JpClassPeriodoSelecoes {
  try {
    const raw = sessionStorage.getItem(JPCLASS_PERIODO_KEY)
    if (!raw) return { anos: [], meses: [] }
    const parsed = JSON.parse(raw) as Partial<JpClassPeriodoSelecoes> | null
    return {
      anos: Array.isArray(parsed?.anos) ? parsed.anos.filter((a) => typeof a === 'string') : [],
      meses: Array.isArray(parsed?.meses) ? parsed.meses.filter((m) => typeof m === 'string') : [],
    }
  } catch {
    return { anos: [], meses: [] }
  }
}

function savePeriodoSelecoes(sel: JpClassPeriodoSelecoes): void {
  try {
    sessionStorage.setItem(JPCLASS_PERIODO_KEY, JSON.stringify(sel))
  } catch {
    // sessionStorage não disponível — ignora silenciosamente
  }
}

export default function JpClassPage() {
  const navigate = useNavigate()
  const hoje = new Date()

  // Filtros GLOBAIS compartilhados (mesma sessão de Visão Geral / Visão Canais / Filtros Globais).
  // Servem de BASE para as opções dos seletores (anos, etc.) e para o padrão de
  // recálculo quando eles mudam (evento paineis_vendas_filters_changed, foco, storage).
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

  // Filtros LOCAIS do JP-Class, no MESMO PADRÃO dos Filtros Globais:
  // seleção múltipla ANO / MÊS (ordem calendário), marcando opções uma a um,
  // todas de uma vez, com busca textual.
  //
  // Dois níveis: PENDENTE (o que o usuário marca; a página NÃO recalcula) e
  // APLICADO (promovido pelo botão "Aplicar filtros"). Enquanto não clica,
  // dashboard/quadro por semana/relatório continuam com os valores atuais.
  // Ano/Mês APLICADOS definem o calendário de semanas (fetch servidor).
  const [anoSelecionados, setAnoSelecionados] = useState<string[]>([])
  const [mesesSelecionados, setMesesSelecionados] = useState<string[]>([])
  const [aplicado, setAplicado] = useState<JpClassPeriodoSelecoes>(() => loadPeriodoSelecoes())

  // Ref de leitura síncrona do aplicado (carregarVendas lê sem entrar nas deps —
  // o refetch é disparado pela mudança de semanas/dateRange).
  const aplicadoRef = useRef(aplicado)
  aplicadoRef.current = aplicado

  const aplicarFiltros = useCallback(() => {
    const proximo = {
      anos: [...anoSelecionados],
      meses: [...mesesSelecionados],
    }
    setAplicado(proximo)
    savePeriodoSelecoes({ anos: proximo.anos, meses: proximo.meses })
  }, [anoSelecionados, mesesSelecionados])

  // Limpar filtros: restaura os parâmetros padrões (ano atual e mês atual) e
  // APLICA na hora, atualizando quadro por semana, dashboard e relatório.
  const limparFiltros = useCallback(() => {
    const agora = new Date()
    const anoAtual = String(agora.getFullYear())
    const mesAtual = String(agora.getMonth() + 1)
    setAnoSelecionados([anoAtual])
    setMesesSelecionados([mesAtual])
    const proximo = { anos: [anoAtual], meses: [mesAtual] }
    setAplicado(proximo)
    savePeriodoSelecoes({ anos: proximo.anos, meses: proximo.meses })
  }, [])

  // Indicador de filtros pendentes: seleção difere do que já está aplicado
  const filtrosPendentes =
    JSON.stringify([anoSelecionados, mesesSelecionados]) !==
    JSON.stringify([aplicado.anos, aplicado.meses])

  // Anos disponíveis no filtro local: janela dinâmica da BASE ATIVA (Filtros
  // Globais), sem fallback hardcoded — base zerada = lista vazia.
  const anosDisponiveis = useMemo(() => {
    const anos = filters.ano
      .map((a) => parseInt(String(a), 10))
      .filter((a) => !isNaN(a) && a > 2000)
    return [...new Set(anos)].sort((a, b) => b - a)
  }, [filters.ano])

  // Opções de Ano/Mês/vendedor>cliente (com rótulos) para os MultiSelectDropdown:
  // meses SEMPRE em ordem calendário (Janeiro→Dezembro) — nunca alfabético.
  const opcoesAno = useMemo(
    () => anosDisponiveis.map((a) => ({ valor: String(a), label: String(a) })),
    [anosDisponiveis],
  )
  const opcoesMes = useMemo(
    () => MESES_PT_BR.map((nome, i) => ({ valor: String(i + 1), label: nome })),
    [],
  )

  const getAnoLabel = useCallback(
    (valor: string) => opcoesAno.find((o) => o.valor === valor)?.label ?? valor,
    [opcoesAno],
  )
  const getMesLabel = useCallback(
    (valor: string) => opcoesMes.find((o) => o.valor === valor)?.label ?? valor,
    [opcoesMes],
  )

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

  // Período EFETIVO de cálculo do calendário de semanas:
  // - Um ÚNICO ano APLICADO selecionado = esse ano; senão o 1º ano da janela dinâmica
  //   (padrão geral); sem anos = ano corrente.
  // - Meses APLICADOS selecionados: em MULTI-MÊS o quadro/dashboard/relatório são
  //   alimentados pelo fetch por faixa de datas (a semana de cada linha é derivada da
  //   data_lancamento — semanas seg–dom iniciando na 1ª segunda de CADA mês
  //   selecionado); sem meses selecionados = mês corrente.
  const periodoCalendario = useMemo(() => {
    const anoUnico = aplicado.anos.length === 1 ? parseInt(aplicado.anos[0], 10) : NaN
    const anoDefault = filters.ano.length > 0 ? parseInt(filters.ano[0], 10) : NaN
    const ano =
      !isNaN(anoUnico) && anoUnico > 2000
        ? anoUnico
        : !isNaN(anoDefault) && anoDefault > 2000
          ? anoDefault
          : hoje.getFullYear()
    const meses = aplicado.meses
      .map((m) => parseInt(m, 10))
      .filter((m) => m >= 1 && m <= 12)
      .sort((a, b) => a - b)
    const mes = meses.length === 1 ? meses[0] : hoje.getMonth() + 1
    return { ano, meses, mes }
  }, [aplicado.anos, aplicado.meses, filters.ano, hoje])

  const { ano, mes, meses: mesesSelecionadosAplicados } = periodoCalendario

  // Semanas do(s) mês(es) aplicado(s) — para MULTI-MÊS, a união das semanas de cada
  // mês (semanas seg–dom, iniciando na 1ª segunda, última incompleta descartada).
  const semanas = useMemo<SemanaMes[]>(() => {
    const lista = mesesSelecionadosAplicados.length > 0 ? mesesSelecionadosAplicados : [mes]
    const out: SemanaMes[] = []
    const vistos = new Set<string>()
    for (const m of lista) {
      for (const s of getSemanasDoMes(ano, m)) {
        if (vistos.has(s.inicioStr)) continue
        vistos.add(s.inicioStr)
        out.push(s)
      }
    }
    // Manter em ordem de data (união dos meses em ordem calendário já vem ordenada)
    return out
  }, [ano, mes, mesesSelecionadosAplicados])

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
    const periodosAplicados = aplicadoRef.current
    const mesesAplicados = periodosAplicados.meses
      .map((m) => parseInt(m, 10))
      .filter((m) => m >= 1 && m <= 12)

    // Payload servidor: PRIORIDADE dos filtros locais de período (multi-select)
    // sobre os globais — sem interseção global+local.
    const periodoPayload: Record<string, unknown> = {}
    if (periodosAplicados.anos.length > 0) {
      periodoPayload.ano = [...periodosAplicados.anos]
    }
    if (mesesAplicados.length > 0) {
      // Backend (vendas_export.js) casa por LIKE '%-MM-%' na data_lancamento —
      // múltiplos meses já são suportados como string[] (OR).
      periodoPayload.mes = mesesAplicados.map(String)
    }

    setLoading(true)
    setError(null)

    try {
      // Reutiliza o endpoint oficial de vendas com os Filtros Globais + recorte de semanas.
      const res = await fetchVendasExport({
        filters: {
          ...(activeFilters as unknown as Record<string, unknown>),
          ...periodoPayload,
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
  }, [dateRange, semanas, tiposClienteMap])

  useEffect(() => {
    carregarVendas()
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [carregarVendas])

  // Quadro de valores por semana (Fase 5): os 5 indicadores (Bruto, NET, Sem Frete,
  // Mercadoria, Custo Total) — agregados a partir das linhas carregadas
  // (rawVendas: todas as linhas do período aplicado, sem recorte adicional).
  const valoresPorSemana = useMemo(() => {
    return agregarValoresPorSemana(rawVendas, semanas)
  }, [rawVendas, semanas])

  // Totais do quadro (soma das semanas = mês consolidado, pois dias fora do calendário não entram)
  const totaisQuadroSemanas = useMemo(() => {
    return valoresPorSemana.reduce(
      (acc, s) => ({
        valorTotalBruto: acc.valorTotalBruto + s.valorTotalBruto,
        valorLiquidoTotal: acc.valorLiquidoTotal + s.valorLiquidoTotal,
        valorTotalNfSemFrete: acc.valorTotalNfSemFrete + s.valorTotalNfSemFrete,
        valorTotalMercadoria: acc.valorTotalMercadoria + s.valorTotalMercadoria,
        custoTotal: acc.custoTotal + s.custoTotal,
        linhas: acc.linhas + s.linhas,
      }),
      {
        valorTotalBruto: 0,
        valorLiquidoTotal: 0,
        valorTotalNfSemFrete: 0,
        valorTotalMercadoria: 0,
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
      { key: 'total_nf_novo', label: `${TITULO_VALOR_TOTAL_BRUTO} (R$)` },
      { key: 'total_linha', label: `${TITULO_VALOR_MERCADORIA} (R$)` },
      { key: 'valor_liquido', label: `${TITULO_VALOR_LIQUIDO_NET} (R$)` },
      { key: 'total_nf_sem_frete', label: `${TITULO_VALOR_TOTAL_SEM_FRETE} (R$)` },
      { key: 'custo_total', label: `${TITULO_CUSTO_TOTAL} (R$)` },
    ]
    exportToCSV(`vendas_jp_class_${ano}_${String(mes).padStart(2, '0')}`, rawVendas, columns)
  }

  const mesNome = MESES_PT_BR[mes - 1]
  // Indicador visual de prioridade: quando o local está ativo, destaca no cabeçalho
  const usandoPeriodoLocal = aplicado.anos.length > 0 || aplicado.meses.length > 0

  return (
    <div className="space-y-6">
      {/* Barra de filtros do módulo: linha de informações em cima, filtros em duas linhas abaixo */}
      <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-xs space-y-3">
        {/* Linha de cima — informações do período (largura livre, texto horizontal) */}
        <div className="flex items-center gap-x-3 gap-y-1 flex-wrap min-w-0">
          <SlidersHorizontal className="w-4 h-4 text-[#0B6E99] shrink-0" />
          <span className="text-sm font-bold text-slate-900 whitespace-nowrap">
            Período de Análise:{' '}
            {mesesSelecionadosAplicados.length > 1
              ? `${mesesSelecionadosAplicados.length} meses de ${ano}`
              : `${mesNome} de ${ano}`}
          </span>
          {usandoPeriodoLocal && (
            <Badge className="bg-[#0B6E99] text-white text-[10px] font-bold px-2 py-0.5 whitespace-nowrap">
              filtro local
            </Badge>
          )}
          <span className="text-xs text-slate-500">
            Semanas calculadas de segunda a domingo, iniciando na 1ª segunda-feira
            {usandoPeriodoLocal &&
              ' — período definido pelo filtro LOCAL deste módulo (sobrepõe os Filtros Globais)'}
          </span>
        </div>

        {/* Linha 1 dos filtros — Ano e Mês (multi-seleção, padrão Filtros Globais) */}
        <div className="flex items-center gap-2 flex-wrap">
          <MultiSelectDropdown
            label="Ano"
            options={opcoesAno.map((o) => o.valor)}
            selected={anoSelecionados}
            onChange={setAnoSelecionados}
            getOptionLabel={getAnoLabel}
            placeholder="Todos (janela dinâmica)"
            emptyMessage="Nenhum ano disponível na base ativa"
            triggerClassName="w-[190px]"
          />
          <MultiSelectDropdown
            label="Mês"
            options={opcoesMes.map((o) => o.valor)}
            selected={mesesSelecionados}
            onChange={setMesesSelecionados}
            getOptionLabel={getMesLabel}
            placeholder="Todos (global)"
            emptyMessage="Nenhum mês"
            triggerClassName="w-[200px]"
          />
        </div>

        {/* Linha 2 dos filtros — ações */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            onClick={aplicarFiltros}
            disabled={loading || !filtrosPendentes}
            className="text-xs font-semibold gap-1.5 h-8 bg-[#0B6E99] hover:bg-[#095a7d] text-white"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Aplicar filtros</span>
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={limparFiltros}
            disabled={loading}
            className="text-xs font-semibold gap-1.5 h-8 bg-white"
          >
            <Eraser className="w-3.5 h-3.5 text-rose-600" />
            <span>Limpar filtros</span>
          </Button>

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
            disabled={loading || rawVendas.length === 0}
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
                  key={s.inicioStr}
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

      {/* Quadro de Valores por Semana (Fase 5) — dividido em Visão Comercial e Visão Contábil */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-2xs overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-[#0B6E99]" />
          <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            Valores por Semana — {mesNome} de {ano}
          </h3>
        </div>

        {/* Bloco 1 — Visão Comercial: Valor Total (Bruto) e Valor Líquido (NET) */}
        <QuadroValoresFaixa
          faixaLabel={FAIXA_COMERCIAL_LABEL}
          semanasCount={semanas.length}
          colunas={[
            { titulo: TITULO_VALOR_TOTAL_BRUTO, campo: 'valorTotalBruto' },
            { titulo: TITULO_VALOR_LIQUIDO_NET, campo: 'valorLiquidoTotal' },
          ]}
          valoresPorSemana={valoresPorSemana}
          totais={totaisQuadroSemanas}
          valorCompacto={valorCompacto}
        />

        {/* Bloco 2 — Visão Contábil: Valor Total (Sem Frete), Valor Mercadoria e Custo Total */}
        <QuadroValoresFaixa
          faixaLabel={FAIXA_CONTABIL_LABEL}
          semanasCount={semanas.length}
          colunas={[
            { titulo: TITULO_VALOR_TOTAL_SEM_FRETE, campo: 'valorTotalNfSemFrete' },
            { titulo: TITULO_VALOR_MERCADORIA, campo: 'valorTotalMercadoria' },
            { titulo: TITULO_CUSTO_TOTAL, campo: 'custoTotal' },
          ]}
          valoresPorSemana={valoresPorSemana}
          totais={totaisQuadroSemanas}
          valorCompacto={valorCompacto}
        />
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
        <JpClassDashboard items={rawVendas} />
      </div>

      {/* Relatório de Vendas por Semanas com Ordenação e Agrupamentos Colapsáveis */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
            <FileSpreadsheet className="w-3.5 h-3.5 text-[#0B6E99]" />
            Relatório de Vendas por Semanas ({rawVendas.length} registros)
          </h3>
        </div>

        <JpClassRelatorio
          items={rawVendas}
          loading={loading}
          groupBy={groupBy}
          onGroupByChange={setGroupBy}
        />
      </div>
    </div>
  )
}
