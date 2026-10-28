import React, { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import { formatCurrency, formatCompactCurrency } from '@/lib/formatters'
import { CanalComparativoItem, CanaisComparativoResult } from '@/services/sales'
import {
  GitCompare,
  TrendingUp,
  TrendingDown,
  Building2,
  Calendar,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  Info,
} from 'lucide-react'

interface ComparativoCanaisMesCardProps {
  data: CanaisComparativoResult | null
  loading?: boolean
}

export function ComparativoCanaisMesCard({ data, loading }: ComparativoCanaisMesCardProps) {
  const [viewMode, setViewMode] = useState<'chart' | 'table'>('chart')

  if (loading) {
    return (
      <Card className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm animate-pulse">
        <div className="h-6 bg-slate-100 rounded w-1/3 mb-4" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="h-24 bg-slate-50 rounded-xl" />
          <div className="h-24 bg-slate-50 rounded-xl" />
          <div className="h-24 bg-slate-50 rounded-xl" />
        </div>
        <div className="h-72 bg-slate-50 rounded-xl" />
      </Card>
    )
  }

  if (!data || !data.canais || data.canais.length === 0) {
    return (
      <Card className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-2">
          <GitCompare className="w-5 h-5 text-[#0B6E99]" />
          <h3 className="text-base font-extrabold text-slate-900">
            Comparativo Mês Atual × Mês do Ano Anterior
          </h3>
        </div>
        <p className="text-xs text-slate-500">
          Nenhum dado encontrado para o período e filtros selecionados.
        </p>
      </Card>
    )
  }

  const {
    mesLabelAtual,
    mesLabelAnterior,
    mesNomeCompletoAtual,
    mesNomeCompletoAnterior,
    totalAtual,
    totalAnterior,
    diffTotal,
    variacaoTotal,
    canais,
  } = data

  const isPositiveGrowth = diffTotal >= 0

  // Prepara dados para o gráfico de barras agrupadas
  // Exibimos todos os canais que têm faturamento no mês atual ou anterior
  const chartData = canais.map((c) => ({
    name: c.canal,
    atual: c.faturamentoAtual,
    anterior: c.faturamentoAnterior,
    diff: c.diff,
    variacao: c.variacaoPercentual,
    clientesAtual: c.clientesAtual,
    clientesAnterior: c.clientesAnterior,
  }))

  return (
    <Card className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden min-w-0">
      {/* Header do Bloco */}
      <CardHeader className="pb-4 border-b border-slate-100 bg-gradient-to-r from-slate-50/70 via-white to-cyan-50/30">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="p-1.5 rounded-lg bg-cyan-100/70 text-[#0B6E99]">
                <GitCompare className="w-4 h-4 text-[#0B6E99]" />
              </span>
              <CardTitle className="text-base sm:text-lg font-extrabold text-slate-900 tracking-tight">
                Comparativo por Canal: {mesNomeCompletoAtual} × {mesNomeCompletoAnterior}
              </CardTitle>
              <Badge
                variant="outline"
                className="bg-white border-cyan-200 text-[#0B6E99] font-bold text-xs"
              >
                Ano a Ano (YoY)
              </Badge>
            </div>
            <CardDescription className="text-xs text-slate-500 font-medium mt-1">
              Faturamento consolidado canal a canal confrontando o mês atual ({mesLabelAtual}) com o
              mesmo mês do ano anterior ({mesLabelAnterior}).
            </CardDescription>
          </div>

          {/* Toggle de Visualização (Gráfico x Tabela Resumo) */}
          <div className="flex items-center gap-1.5 self-start sm:self-center shrink-0 bg-slate-100 p-1 rounded-lg">
            <button
              type="button"
              onClick={() => setViewMode('chart')}
              className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${
                viewMode === 'chart'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Gráfico Comparativo
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${
                viewMode === 'table'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Detalhamento dos Canais
            </button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-5 sm:p-6 space-y-6">
        {/* Cards de Destaque: Totais Mês Atual vs Mês Anterior-Ano */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Card Mês Atual */}
          <div className="rounded-xl border border-cyan-100 bg-gradient-to-br from-cyan-50/50 to-white p-4 relative overflow-hidden shadow-sm">
            <div className="flex items-center justify-between text-xs font-bold text-cyan-900 uppercase tracking-wider mb-1">
              <span className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-[#0B6E99]" />
                Mês Atual ({mesLabelAtual})
              </span>
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#0B6E99]" />
            </div>
            <div className="text-xl sm:text-2xl font-black text-slate-900 mt-2 tracking-tight">
              {formatCurrency(totalAtual)}
            </div>
            <div className="text-xs text-slate-500 font-medium mt-1 flex items-center gap-1.5">
              <span>
                {canais.filter((c) => c.faturamentoAtual > 0).length} canais com faturamento
              </span>
            </div>
          </div>

          {/* Card Mês Anterior (Ano Anterior) */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 relative overflow-hidden shadow-sm">
            <div className="flex items-center justify-between text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
              <span className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-500" />
                Mês Anterior ({mesLabelAnterior})
              </span>
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-slate-400" />
            </div>
            <div className="text-xl sm:text-2xl font-black text-slate-700 mt-2 tracking-tight">
              {formatCurrency(totalAnterior)}
            </div>
            <div className="text-xs text-slate-500 font-medium mt-1 flex items-center gap-1.5">
              <span>
                {canais.filter((c) => c.faturamentoAnterior > 0).length} canais com faturamento
              </span>
            </div>
          </div>

          {/* Card Variação % e Absoluta */}
          <div
            className={`rounded-xl border p-4 relative overflow-hidden shadow-sm sm:col-span-2 lg:col-span-1 ${
              isPositiveGrowth
                ? 'border-emerald-200 bg-gradient-to-br from-emerald-50/60 to-white'
                : 'border-rose-200 bg-gradient-to-br from-rose-50/60 to-white'
            }`}
          >
            <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider mb-1">
              <span
                className={`flex items-center gap-1.5 ${
                  isPositiveGrowth ? 'text-emerald-800' : 'text-rose-800'
                }`}
              >
                {isPositiveGrowth ? (
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                ) : (
                  <TrendingDown className="w-3.5 h-3.5 text-rose-600" />
                )}
                Variação YoY
              </span>
              {variacaoTotal !== null && (
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-extrabold ${
                    isPositiveGrowth
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-rose-100 text-rose-800'
                  }`}
                >
                  {isPositiveGrowth ? (
                    <ArrowUpRight className="w-3.5 h-3.5 mr-0.5" />
                  ) : (
                    <ArrowDownRight className="w-3.5 h-3.5 mr-0.5" />
                  )}
                  {variacaoTotal > 0 ? `+${variacaoTotal}%` : `${variacaoTotal}%`}
                </span>
              )}
            </div>
            <div
              className={`text-xl sm:text-2xl font-black mt-2 tracking-tight ${
                isPositiveGrowth ? 'text-emerald-950' : 'text-rose-950'
              }`}
            >
              {diffTotal >= 0 ? `+${formatCurrency(diffTotal)}` : formatCurrency(diffTotal)}
            </div>
            <div className="text-xs text-slate-500 font-medium mt-1">
              {totalAnterior > 0
                ? `Comparação direta sobre base de ${mesLabelAnterior}`
                : 'Sem base faturada no ano anterior'}
            </div>
          </div>
        </div>

        {/* Visualização: Gráfico de Barras Agrupadas */}
        {viewMode === 'chart' ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-500 pb-1">
              <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-[#0B6E99]" />
                Distribuição por Canal de Vendas (Barras Agrupadas)
              </span>
              <span className="text-[11px] text-slate-400">Valores em R$ (Reais)</span>
            </div>

            <div className="h-80 sm:h-96 w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 15, right: 20, left: 10, bottom: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tickLine={false}
                    axisLine={{ stroke: '#E2E8F0' }}
                    tick={{ fill: '#334155', fontSize: 11, fontWeight: 600 }}
                    interval={0}
                    angle={-25}
                    textAnchor="end"
                    height={50}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: '#64748B', fontSize: 11 }}
                    tickFormatter={(val) => `R$ ${(val / 1000).toFixed(0)}k`}
                  />
                  {/* Tooltip claro, contrastado e com tipografia legível para evitar bugs visuais */}
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload || !payload.length) return null
                      const d = payload[0].payload
                      return (
                        <div className="bg-white border border-slate-200 shadow-xl rounded-xl p-3.5 min-w-[240px] text-xs">
                          <div className="font-extrabold text-slate-900 border-b border-slate-100 pb-2 mb-2 flex items-center justify-between">
                            <span className="truncate pr-2">{d.name}</span>
                            {d.variacao !== null && (
                              <span
                                className={`px-2 py-0.5 rounded text-[11px] font-bold shrink-0 ${
                                  d.variacao >= 0
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    : 'bg-rose-50 text-rose-700 border border-rose-200'
                                }`}
                              >
                                {d.variacao > 0 ? `+${d.variacao}%` : `${d.variacao}%`}
                              </span>
                            )}
                          </div>
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="flex items-center gap-1.5 text-slate-600 font-medium">
                                <span className="w-2.5 h-2.5 rounded-sm bg-[#0B6E99]" />
                                {mesLabelAtual}:
                              </span>
                              <span className="font-bold text-slate-900">
                                {formatCurrency(d.atual)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="flex items-center gap-1.5 text-slate-600 font-medium">
                                <span className="w-2.5 h-2.5 rounded-sm bg-slate-400" />
                                {mesLabelAnterior}:
                              </span>
                              <span className="font-bold text-slate-700">
                                {formatCurrency(d.anterior)}
                              </span>
                            </div>
                            <div className="border-t border-slate-100 pt-1.5 mt-1 flex items-center justify-between font-bold">
                              <span className="text-slate-500">Diferença:</span>
                              <span className={d.diff >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                                {d.diff >= 0
                                  ? `+${formatCurrency(d.diff)}`
                                  : formatCurrency(d.diff)}
                              </span>
                            </div>
                          </div>
                        </div>
                      )
                    }}
                  />
                  <Legend
                    verticalAlign="top"
                    align="right"
                    wrapperStyle={{ paddingBottom: 12 }}
                    formatter={(value) => {
                      return (
                        <span className="text-xs font-bold text-slate-700 mr-2">
                          {value === 'atual'
                            ? `Mês Atual (${mesLabelAtual})`
                            : `Mês Anterior (${mesLabelAnterior})`}
                        </span>
                      )
                    }}
                  />
                  <Bar
                    dataKey="atual"
                    name="atual"
                    fill="#0B6E99"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={40}
                  />
                  <Bar
                    dataKey="anterior"
                    name="anterior"
                    fill="#94A3B8"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={40}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : (
          /* Visualização: Tabela Detalhada com ordenação e variações */
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold">
                    <th className="py-2.5 px-3">Canal</th>
                    <th className="py-2.5 px-3 text-right">Faturamento {mesLabelAtual}</th>
                    <th className="py-2.5 px-3 text-right">Faturamento {mesLabelAnterior}</th>
                    <th className="py-2.5 px-3 text-right">Diferença (R$)</th>
                    <th className="py-2.5 px-3 text-right">Variação (%)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {canais.map((c, idx) => {
                    const isCanalPos = c.diff >= 0
                    return (
                      <tr key={idx} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-2.5 px-3 font-bold text-slate-900 flex items-center gap-2">
                          <Building2 className="w-3.5 h-3.5 text-slate-400" />
                          <span>{c.canal}</span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-extrabold text-slate-900">
                          {formatCurrency(c.faturamentoAtual)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-semibold text-slate-600">
                          {formatCurrency(c.faturamentoAnterior)}
                        </td>
                        <td
                          className={`py-2.5 px-3 text-right font-bold ${
                            isCanalPos ? 'text-emerald-600' : 'text-rose-600'
                          }`}
                        >
                          {c.diff >= 0 ? `+${formatCurrency(c.diff)}` : formatCurrency(c.diff)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold">
                          {c.variacaoPercentual !== null ? (
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] ${
                                isCanalPos
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : 'bg-rose-50 text-rose-700 border border-rose-200'
                              }`}
                            >
                              {c.variacaoPercentual > 0
                                ? `+${c.variacaoPercentual}%`
                                : `${c.variacaoPercentual}%`}
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-100/70 border-t-2 border-slate-200 font-extrabold text-slate-900">
                    <td className="py-2.5 px-3 uppercase tracking-wider text-xs">
                      Total Consolidado
                    </td>
                    <td className="py-2.5 px-3 text-right">{formatCurrency(totalAtual)}</td>
                    <td className="py-2.5 px-3 text-right text-slate-700">
                      {formatCurrency(totalAnterior)}
                    </td>
                    <td
                      className={`py-2.5 px-3 text-right ${
                        isPositiveGrowth ? 'text-emerald-700' : 'text-rose-700'
                      }`}
                    >
                      {diffTotal >= 0 ? `+${formatCurrency(diffTotal)}` : formatCurrency(diffTotal)}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      {variacaoTotal !== null ? (
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs ${
                            isPositiveGrowth
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {variacaoTotal > 0 ? `+${variacaoTotal}%` : `${variacaoTotal}%`}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* Rodapé Informativo */}
        <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
          <Info className="w-4 h-4 text-[#0B6E99] shrink-0" />
          <span>
            Os dados comparativos refletem as vendas consolidadas (RacNew + NetSales) atribuídas aos
            canais oficiais de faturamento, respeitando os filtros ativos de canais, clientes e
            vendedores.
          </span>
        </div>
      </CardContent>
    </Card>
  )
}
export default ComparativoCanaisMesCard
