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
import { getSemanasDoMes, encontrarSemanaDaData, type SemanaMes } from '@/lib/semanas'
import { getJpClass } from '@/lib/jp-class'
import { MESES_PT_BR, formatCurrency, formatNumber, exportToCSV } from '@/lib/formatters'
import {
  JpClassRelatorio,
  type VendaComSemana,
  type JpClassGroupBy,
} from '@/components/JpClassRelatorio'
import { JpClassDashboard } from '@/components/JpClassDashboard'

export default function JpClassPage() {
  const hoje = new Date()
  const [ano, setAno] = useState<number>(hoje.getFullYear())
  const [mes, setMes] = useState<number>(hoje.getMonth() + 1)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rawVendas, setRawVendas] = useState<VendaComSemana[]>([])
  const [groupBy, setGroupBy] = useState<JpClassGroupBy>('none')
  const [filtroSemana, setFiltroSemana] = useState<number | 'todas'>('todas')

  const abortControllerRef = useRef<AbortController | null>(null)

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
          const derivedJpClass = getJpClass(grupoValor)
          comSemanas.push({
            ...item,
            grupo_item: grupoValor || item.grupo_item || '',
            semanaNumero: sem.numero,
            semanaNome: sem.nome,
            jpClass: derivedJpClass,
          })
        }
      }

      setRawVendas(comSemanas)
    } catch (err: unknown) {
      if ((err as Error)?.name === 'AbortError' || String(err).includes('aborted')) {
        return
      }
      console.error('Erro ao carregar vendas para JP-Class:', err)
      setError('Falha ao carregar as vendas do período. Tente novamente.')
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
  }, [ano, mes, dateRange])

  // Vendas filtradas por semana (se o usuário selecionar uma semana específica nos KPIs)
  const vendasExibidas = useMemo(() => {
    if (filtroSemana === 'todas') return rawVendas
    return rawVendas.filter((v) => v.semanaNumero === filtroSemana)
  }, [rawVendas, filtroSemana])

  // KPIs consolidados por semana
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

  // Totalizador geral do mês
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
      { key: 'codigo_item', label: 'Código Item' },
      { key: 'descricao_item', label: 'Descrição Item' },
      { key: 'nome_cliente', label: 'Cliente' },
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
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs">
          {error}
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
