import React, { useState, useEffect, useMemo, useRef } from 'react'
import {
  Calendar,
  Layers,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  TrendingUp,
  Package,
  DollarSign,
  CalendarDays,
  FileSpreadsheet,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import KpiCard from '@/components/KpiCard'
import { fetchVendasExport } from '@/services/sales'
import {
  getSemanasDoMes,
  encontrarSemanaDaData,
  normalizarParaDataISO,
  type SemanaMes,
} from '@/lib/semanas'
import { getJpClass } from '@/lib/jp-class'
import { MESES_PT_BR, formatCurrency, formatNumber, exportToCSV } from '@/lib/formatters'
import { loadFiltersFromSession } from '@/lib/filter-persistence'
import pb from '@/lib/pocketbase/client'
import {
  JpClassRelatorio,
  type VendaComSemana,
  type JpClassGroupBy,
} from '@/components/JpClassRelatorio'
import { JpClassDashboard } from '@/components/JpClassDashboard'
import {
  JpClassFilterBar,
  type JpClassFilterState,
  DEFAULT_JP_CLASS_FILTERS,
  EMPTY_JP_CLASS_FILTERS,
} from '@/components/JpClassFilterBar'
import { fetchTiposClienteMap, fetchTiposClienteOptions } from '@/services/tiposCliente'
import { DEVOLUCAO_TIPOS } from '@/types/sales'

export default function JpClassPage() {
  const hoje = new Date()

  // Determina o ano/mês inicial inteligente:
  // 1. Se houver filtros salvos na sessão com ano e mês válidos, usa-os
  // 2. Caso contrário, se o mês atual for posterior a setembro/2026, fallback padrão para 2026 / 9 (último mês com dados)
  const [ano, setAno] = useState<number>(() => {
    try {
      const saved = loadFiltersFromSession()
      if (saved.ano && saved.ano.length > 0) {
        const parsedAno = parseInt(saved.ano[0], 10)
        if (!isNaN(parsedAno) && parsedAno > 2000) return parsedAno
      }
    } catch {
      /* intentionally ignored */
    }
    return hoje.getFullYear()
  })

  const [mes, setMes] = useState<number>(() => {
    try {
      const saved = loadFiltersFromSession()
      if (saved.mes && saved.mes.length > 0) {
        const parsedMes = parseInt(saved.mes[0], 10)
        if (!isNaN(parsedMes) && parsedMes >= 1 && parsedMes <= 12) return parsedMes
      }
    } catch {
      /* intentionally ignored */
    }
    // Se o mês atual do sistema for outubro ou superior em 2026 e a base só tiver até setembro,
    // o padrão seguro é setembro (9)
    if (hoje.getFullYear() === 2026 && hoje.getMonth() + 1 > 9) {
      return 9
    }
    return hoje.getMonth() + 1
  })

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rawVendas, setRawVendas] = useState<VendaComSemana[]>([])
  const [tiposClienteMap, setTiposClienteMap] = useState<Record<string, string>>({})
  const [tipoClienteOptions, setTipoClienteOptions] = useState<string[]>([])
  const [loadingTiposCliente, setLoadingTiposCliente] = useState(false)
  const [groupBy, setGroupBy] = useState<JpClassGroupBy>('hierarquia')
  const [filtroSemana, setFiltroSemana] = useState<number | 'todas'>('todas')
  const [ultimoPeriodoDisponivel, setUltimoPeriodoDisponivel] = useState<{
    ano: number
    mes: number
  } | null>(null)

  // 7 filtros multi-select + JP-Class com critério de padrão inicial idêntico ao Visão Geral e Visão Canais
  const [filters, setFilters] = useState<JpClassFilterState>(() => {
    try {
      const saved = loadFiltersFromSession()
      return {
        grupoItem:
          saved.grupoItem && saved.grupoItem.length > 0
            ? saved.grupoItem
            : DEFAULT_JP_CLASS_FILTERS.grupoItem,
        tipoDocumento:
          saved.tipoDocumento && saved.tipoDocumento.length > 0
            ? saved.tipoDocumento
            : DEFAULT_JP_CLASS_FILTERS.tipoDocumento,
        tipoCliente: saved.tipoCliente || [],
        canal: saved.canal || [],
        deploy: saved.deploy || [],
        utilizacao:
          saved.utilizacao && saved.utilizacao.length > 0
            ? saved.utilizacao
            : DEFAULT_JP_CLASS_FILTERS.utilizacao,
        tipoDevolucao: saved.tipoDevolucao ? [saved.tipoDevolucao] : [],
        jpClass: saved.jpClass || [],
      }
    } catch {
      return DEFAULT_JP_CLASS_FILTERS
    }
  })

  // Carrega opções e mapa de tipos_cliente para enriquecer o tipo de cliente (código PN -> nome do tipo, mesmo padrão das outras páginas)
  useEffect(() => {
    let mounted = true
    const carregarTiposCliente = async () => {
      setLoadingTiposCliente(true)
      try {
        const [opts, resMap] = await Promise.all([
          fetchTiposClienteOptions(),
          fetchTiposClienteMap(),
        ])
        if (mounted) {
          if (Array.isArray(opts) && opts.length > 0) {
            setTipoClienteOptions(opts)
          }
          if (resMap && typeof resMap === 'object') {
            const stringMap: Record<string, string> = {}
            for (const [cod, info] of Object.entries(resMap)) {
              const tipo = info?.tipo_cliente?.trim()
              if (tipo) {
                stringMap[cod.toUpperCase()] = tipo
              }
            }
            setTiposClienteMap(stringMap)
          }
        }
      } catch (err) {
        console.warn('Erro ao carregar dados de tipos_cliente no JP-Class:', err)
      } finally {
        if (mounted) setLoadingTiposCliente(false)
      }
    }
    carregarTiposCliente()
    return () => {
      mounted = false
    }
  }, [])

  const abortControllerRef = useRef<AbortController | null>(null)

  // Descobre dinamicamente o último período com vendas na base caso o usuário esteja em um mês vazio
  useEffect(() => {
    let mounted = true
    const detectarUltimoPeriodo = async () => {
      try {
        // Tenta buscar o registro mais recente em vendas
        const latest = await pb.collection('vendas').getList(1, 1, {
          sort: '-data_lancamento',
          fields: 'data_lancamento',
          requestKey: 'jp_class_detect_latest',
        })
        if (!mounted) return
        if (latest.items && latest.items.length > 0 && latest.items[0].data_lancamento) {
          const iso = normalizarParaDataISO(latest.items[0].data_lancamento)
          if (iso) {
            const parts = iso.split('-')
            const y = parseInt(parts[0], 10)
            const m = parseInt(parts[1], 10)
            if (!isNaN(y) && !isNaN(m)) {
              setUltimoPeriodoDisponivel({ ano: y, mes: m })
            }
          }
        }
      } catch (_) {
        // Se falhar a detecção, fallback padrão seguro é 2026 / 9 (Setembro)
        if (mounted) {
          setUltimoPeriodoDisponivel({ ano: 2026, mes: 9 })
        }
      }
    }
    detectarUltimoPeriodo()
    return () => {
      mounted = false
    }
  }, [])

  // Semanas calculadas estritamente de acordo com a regra de negócio
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
  const carregarVendas = async () => {
    if (!dateRange) {
      setRawVendas([])
      return
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    const controller = new AbortController()
    abortControllerRef.current = controller

    setLoading(true)
    setError(null)

    try {
      // Reutiliza o endpoint oficial de vendas com o filtro de datas do calendário de semanas
      const res = await fetchVendasExport({
        filters: {
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
          // JP-Class SEMPRE derivado ao vivo a partir do Grupo do item (grupo_item ou itms_grp_nam),
          // eliminando qualquer valor pré-calculado antigo de item.jp_class
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
      const comTiposCliente = comSemanas.map((v) => {
        let tc = (v.tipo_cliente || '').trim()
        if (!tc && v.codigo_cliente) {
          const codUpper = v.codigo_cliente.trim().toUpperCase()
          tc = tiposClienteMap[codUpper] || '-'
        } else if (!tc) {
          tc = '-'
        }
        return {
          ...v,
          tipo_cliente: tc,
        }
      })

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
  }

  useEffect(() => {
    carregarVendas()
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [ano, mes, dateRange, tiposClienteMap])

  // Opções dinâmicas para os dropdowns de filtro baseadas nas vendas carregadas no mês
  const filterOptions = useMemo(() => {
    const gruposSet = new Set<string>()
    const tiposDocSet = new Set<string>()
    const tiposCliSet = new Set<string>()
    const canaisSet = new Set<string>()
    const deploysSet = new Set<string>()
    const utilizacoesSet = new Set<string>()
    const devolucoesSet = new Set<string>()

    // Valores padrão sempre presentes para facilitar a seleção
    gruposSet.add('EQUIPAMENTOS')
    gruposSet.add('ACESSÓRIOS')
    gruposSet.add('TINTAS')
    gruposSet.add('PEÇAS')

    tiposDocSet.add('NF de Saída')
    tiposDocSet.add('Dev. NF')
    tiposDocSet.add('Dev. Entrega')

    deploysSet.add('AGIS')
    deploysSet.add('Roland')
    deploysSet.add('Nenhum')

    utilizacoesSet.add('VENDA DE MERCADORIA')
    utilizacoesSet.add('VENDA CONSUMO')

    DEVOLUCAO_TIPOS.forEach((d) => devolucoesSet.add(d))

    for (const v of rawVendas) {
      if (v.grupo_item && v.grupo_item.trim()) gruposSet.add(v.grupo_item.trim())
      if (v.itms_grp_nam && v.itms_grp_nam.trim()) gruposSet.add(v.itms_grp_nam.trim())
      if (v.tipo_documento && v.tipo_documento.trim()) tiposDocSet.add(v.tipo_documento.trim())

      const tc = (v.tipo_cliente || '').trim() || '-'
      tiposCliSet.add(tc)

      // Canais
      const canalNome = (v.vendedor_cliente || v.vendedor_revenda || v.vendedor || '').trim()
      if (canalNome && !canalNome.toUpperCase().includes('SEM VENDEDOR')) {
        canaisSet.add(canalNome)
      }

      // Deploy
      const dep = (v.revenda || '').trim()
      if (dep) deploysSet.add(dep)

      // Utilização
      const util = (v.utilizacao || v.usage || '').trim()
      if (util) utilizacoesSet.add(util)

      // Devoluções
      if (
        v.tipo_documento &&
        (DEVOLUCAO_TIPOS as readonly string[]).includes(v.tipo_documento.trim())
      ) {
        devolucoesSet.add(v.tipo_documento.trim())
      }
    }

    // Se temos opções da coleção ou do mapa, adiciona para que o usuário possa escolher
    tipoClienteOptions.forEach((tc) => {
      if (tc && tc.trim()) tiposCliSet.add(tc.trim())
    })
    Object.values(tiposClienteMap).forEach((tc) => {
      if (tc && tc.trim()) tiposCliSet.add(tc.trim())
    })

    return {
      grupoItem: Array.from(gruposSet)
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, 'pt-BR')),
      tipoDocumento: Array.from(tiposDocSet)
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, 'pt-BR')),
      tipoCliente: Array.from(tiposCliSet)
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, 'pt-BR')),
      canal: Array.from(canaisSet)
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, 'pt-BR')),
      deploy: Array.from(deploysSet)
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, 'pt-BR')),
      utilizacao: Array.from(utilizacoesSet)
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, 'pt-BR')),
      tipoDevolucao: Array.from(devolucoesSet)
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, 'pt-BR')),
      jpClass: ['INKS', 'HARD', 'OTHERS', 'Sem classe'],
      isLoadingTipoCliente: loadingTiposCliente,
    }
  }, [rawVendas, tiposClienteMap, tipoClienteOptions, loadingTiposCliente])

  // Aplicação dos 7 filtros multi-select + JP-Class (mesmo critério de Visão Geral / Canais)
  const vendasFiltradasPorCriterios = useMemo(() => {
    return rawVendas.filter((v) => {
      // (1) Grupo do Item
      if (filters.grupoItem.length > 0) {
        const grp = (v.grupo_item || v.itms_grp_nam || '').trim()
        if (!filters.grupoItem.includes(grp)) return false
      }

      // (2) Tipo de Documento
      if (filters.tipoDocumento.length > 0) {
        const td = (v.tipo_documento || '').trim()
        if (!filters.tipoDocumento.includes(td)) return false
      }

      // (3) Tipo de Cliente
      if (filters.tipoCliente.length > 0) {
        const tc = (v.tipo_cliente || '').trim() || '-'
        if (!filters.tipoCliente.includes(tc)) return false
      }

      // (4) Canais
      if (filters.canal.length > 0) {
        const canalNome = (v.vendedor_cliente || v.vendedor_revenda || v.vendedor || '').trim()
        if (!filters.canal.includes(canalNome)) return false
      }

      // (5) Deploy (Canal de Faturamento)
      if (filters.deploy.length > 0) {
        const depRaw = (v.revenda || '').trim().toUpperCase()
        let dep = 'Nenhum'
        if (depRaw.includes('AGIS')) dep = 'AGIS'
        else if (depRaw.includes('ROLAND')) dep = 'Roland'
        else if (depRaw) dep = (v.revenda || '').trim()

        if (!filters.deploy.includes(dep)) return false
      }

      // (6) Utilização
      if (filters.utilizacao.length > 0) {
        const util = (v.utilizacao || v.usage || '').trim()
        if (!filters.utilizacao.includes(util)) return false
      }

      // (7) Tipo de Devolução
      if (filters.tipoDevolucao.length > 0) {
        const td = (v.tipo_documento || '').trim()
        if (!filters.tipoDevolucao.includes(td)) return false
      }

      // (8) JP-Class
      if (filters.jpClass.length > 0) {
        const jpc = (v.jpClass || getJpClass(v)).trim()
        if (!filters.jpClass.includes(jpc)) return false
      }

      return true
    })
  }, [rawVendas, filters])

  // Vendas filtradas por semana (se o usuário selecionar uma semana específica nos KPIs)
  const vendasExibidas = useMemo(() => {
    if (filtroSemana === 'todas') return vendasFiltradasPorCriterios
    return vendasFiltradasPorCriterios.filter((v) => v.semanaNumero === filtroSemana)
  }, [vendasFiltradasPorCriterios, filtroSemana])

  // KPIs consolidados por semana (refletem os 7 filtros + JP-Class aplicados)
  const kpisPorSemana = useMemo(() => {
    return semanas.map((sem) => {
      const vendasSemana = vendasFiltradasPorCriterios.filter((v) => v.semanaNumero === sem.numero)
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
  }, [semanas, vendasFiltradasPorCriterios])

  // Totalizador geral do mês (reflete os 7 filtros + JP-Class aplicados)
  const totalGeral = useMemo(() => {
    const faturamento = vendasFiltradasPorCriterios.reduce(
      (acc, v) => acc + (Number(v.total_linha) || 0),
      0,
    )
    const valorLiquido = vendasFiltradasPorCriterios.reduce(
      (acc, v) => acc + (Number(v.valor_liquido) || 0),
      0,
    )
    const quantidade = vendasFiltradasPorCriterios.reduce(
      (acc, v) => acc + (Number(v.quantidade) || 0),
      0,
    )
    return {
      faturamento,
      valorLiquido,
      quantidade,
      linhas: vendasFiltradasPorCriterios.length,
    }
  }, [vendasFiltradasPorCriterios])

  // Anos disponíveis para seleção (ano atual +/- 5 anos)
  const anosDisponiveis = useMemo(() => {
    const list: number[] = []
    const currentYear = hoje.getFullYear()
    for (let y = currentYear - 3; y <= currentYear + 2; y++) {
      list.push(y)
    }
    return list
  }, [hoje])

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

  return (
    <div className="space-y-6">
      {/* Barra de Filtro de Período (Mês e Ano) e Ações */}
      <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-lg bg-[#0B6E99]/10 text-[#0B6E99]">
              <Calendar className="w-5 h-5" />
            </span>
            <div>
              <h2 className="text-sm font-bold text-slate-900">Período de Análise (Mês/Ano)</h2>
              <p className="text-xs text-slate-500">
                Semanas calculadas de segunda a domingo iniciando na 1ª segunda-feira
              </p>
            </div>
          </div>

          {/* Seletores de Mês e Ano */}
          <div className="flex items-center gap-2">
            <select
              value={mes}
              onChange={(e) => setMes(Number(e.target.value))}
              className="text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-slate-800 focus:outline-hidden focus:border-[#0B6E99]"
            >
              {MESES_PT_BR.map((m, idx) => (
                <option key={m} value={idx + 1}>
                  {m}
                </option>
              ))}
            </select>

            <select
              value={ano}
              onChange={(e) => setAno(Number(e.target.value))}
              className="text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-slate-800 focus:outline-hidden focus:border-[#0B6E99]"
            >
              {anosDisponiveis.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Ações da Barra de Período */}
        <div className="flex items-center gap-2">
          {ultimoPeriodoDisponivel &&
            (ano !== ultimoPeriodoDisponivel.ano || mes !== ultimoPeriodoDisponivel.mes) && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setAno(ultimoPeriodoDisponivel.ano)
                  setMes(ultimoPeriodoDisponivel.mes)
                }}
                disabled={loading}
                className="text-xs font-semibold gap-1.5 h-8 bg-sky-50/60 border-sky-200 text-[#0B6E99] hover:bg-sky-100/60"
                title={`Ir para ${MESES_PT_BR[ultimoPeriodoDisponivel.mes - 1]} de ${ultimoPeriodoDisponivel.ano} (último mês com dados na base)`}
              >
                <Calendar className="w-3.5 h-3.5 text-[#0B6E99]" />
                <span>
                  Último c/ dados: {MESES_PT_BR[ultimoPeriodoDisponivel.mes - 1]?.slice(0, 3)}/
                  {ultimoPeriodoDisponivel.ano}
                </span>
              </Button>
            )}

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

      {/* Barra com os 7 Filtros Multi-Select + JP-Class */}
      <JpClassFilterBar
        filters={filters}
        setFilters={setFilters}
        options={filterOptions}
        onResetToDefault={() => setFilters(DEFAULT_JP_CLASS_FILTERS)}
        isLoading={loading}
      />

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

      {/* Alerta amigável caso o mês selecionado não possua vendas */}
      {!loading && !error && rawVendas.length === 0 && (
        <div className="p-4 rounded-xl bg-amber-50/80 border border-amber-200 text-amber-900 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <p className="font-bold">
              Nenhuma venda registrada nas semanas de {mesNome} de {ano}.
            </p>
            <p className="text-amber-700 text-[11px]">
              A base consolidada não possui vendas para o intervalo selecionado ou o mês ainda não
              foi faturado.
              {ultimoPeriodoDisponivel && (
                <>
                  {' '}
                  O último período com vendas consolidado na base é{' '}
                  <strong>
                    {MESES_PT_BR[ultimoPeriodoDisponivel.mes - 1]} de {ultimoPeriodoDisponivel.ano}
                  </strong>
                  .
                </>
              )}
            </p>
          </div>
          {ultimoPeriodoDisponivel &&
            (ano !== ultimoPeriodoDisponivel.ano || mes !== ultimoPeriodoDisponivel.mes) && (
              <Button
                size="sm"
                onClick={() => {
                  setAno(ultimoPeriodoDisponivel.ano)
                  setMes(ultimoPeriodoDisponivel.mes)
                }}
                className="bg-[#0B6E99] hover:bg-[#09577a] text-white text-xs font-semibold h-8 shrink-0"
              >
                Visualizar {MESES_PT_BR[ultimoPeriodoDisponivel.mes - 1]} de{' '}
                {ultimoPeriodoDisponivel.ano}
              </Button>
            )}
        </div>
      )}

      {/* Regra de calendário em banner informativo */}
      {semanas.length > 0 && (
        <div className="bg-sky-50/70 border border-sky-200/80 rounded-xl p-3.5 flex items-start gap-3 text-xs text-sky-950">
          <CalendarDays className="w-4 h-4 text-[#0B6E99] shrink-0 mt-0.5" />
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

      {/* Dashboard do Módulo (3 Recortes: JP-Class, Grupo, Item) */}
      <div>
        <div className="mb-3">
          <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
            <Layers className="w-4 h-4 text-[#0B6E99]" />
            Dashboard — Recortes por JP-Class, Grupo e Item
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
          semanas={semanas}
          loading={loading}
          groupBy={groupBy}
          onGroupByChange={setGroupBy}
        />
      </div>
    </div>
  )
}
