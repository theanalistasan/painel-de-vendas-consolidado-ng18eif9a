import React, { useMemo } from 'react'
import {
  PackageCheck,
  PackageX,
  TrendingUp,
  BarChart2,
  Calendar,
  AlertCircle,
  HelpCircle,
  Clock,
  Layers,
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
} from 'recharts'
import type { PedidoAberto } from '@/types/sales'
import { formatCurrency, formatNumber } from '@/lib/formatters'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import ChartCard from '@/components/ChartCard'

const ROLAND_BLUE = '#0B6E99'
const TEAL_ACCENT = '#0D9488'
const AMBER_ACCENT = '#D97706'
const SLATE_MUTED = '#64748B'

interface PedidosAbertosDashboardProps {
  pedidos: PedidoAberto[]
  isLoading?: boolean
}

interface CanalChartItem {
  canal: string
  valor: number
  pedidosQtd: number
  itensQtd: number
  isSemCanal?: boolean
  pct: number
}

interface MesChartItem {
  key: string // YYYY-MM
  label: string // MMM/AA
  pedidos: number
  valor: number
  itens: number
}

export default function PedidosAbertosDashboard({
  pedidos,
  isLoading = false,
}: PedidosAbertosDashboardProps) {
  // 1. Agrupamento por Nº Pedido e cálculo das visões de Estoque
  const estoqueStats = useMemo(() => {
    // Mapa: numero_pedido -> { valorTotal: number, hasEstoque: boolean, itemsCount: number }
    const ordersMap = new Map<
      string,
      {
        valorTotal: number
        hasEstoque: boolean
        itemsCount: number
        emEstoqueTotal: number
        emTransitoTotal: number
      }
    >()

    for (const item of pedidos) {
      const orderNum = (item.numero_pedido || item.id || '').trim()
      if (!orderNum) continue

      const valor = Number(item.valor_em_aberto) || 0
      const estoque = Number(item.em_estoque) || 0
      const transito = Number(item.em_transito) || 0

      let existing = ordersMap.get(orderNum)
      if (!existing) {
        existing = {
          valorTotal: 0,
          hasEstoque: false,
          itemsCount: 0,
          emEstoqueTotal: 0,
          emTransitoTotal: 0,
        }
        ordersMap.set(orderNum, existing)
      }

      existing.valorTotal += valor
      existing.itemsCount += 1
      existing.emEstoqueTotal += estoque
      existing.emTransitoTotal += transito
      if (estoque > 0) {
        existing.hasEstoque = true
      }
    }

    let comEstoquePedidos = 0
    let comEstoqueValor = 0
    let comEstoqueItens = 0

    let semEstoquePedidos = 0
    let semEstoqueValor = 0
    let semEstoqueItens = 0

    for (const order of ordersMap.values()) {
      if (order.hasEstoque) {
        comEstoquePedidos += 1
        comEstoqueValor += order.valorTotal
        comEstoqueItens += order.itemsCount
      } else {
        semEstoquePedidos += 1
        semEstoqueValor += order.valorTotal
        semEstoqueItens += order.itemsCount
      }
    }

    const totalPedidos = comEstoquePedidos + semEstoquePedidos
    const totalValor = comEstoqueValor + semEstoqueValor

    return {
      comEstoque: {
        pedidos: comEstoquePedidos,
        valor: comEstoqueValor,
        itens: comEstoqueItens,
        pctPedidos: totalPedidos > 0 ? Math.round((comEstoquePedidos / totalPedidos) * 100) : 0,
        pctValor: totalValor > 0 ? Math.round((comEstoqueValor / totalValor) * 100) : 0,
      },
      semEstoque: {
        pedidos: semEstoquePedidos,
        valor: semEstoqueValor,
        itens: semEstoqueItens,
        pctPedidos: totalPedidos > 0 ? Math.round((semEstoquePedidos / totalPedidos) * 100) : 0,
        pctValor: totalValor > 0 ? Math.round((semEstoqueValor / totalValor) * 100) : 0,
      },
      totalPedidos,
      totalValor,
    }
  }, [pedidos])

  // 2. Visão "Valor por Canal" e valor total das revendas sem canal
  const { canaisData, totalValorCanais, valorSemCanal, pctSemCanal } = useMemo(() => {
    // Mapa: canalKey -> { nome: string, valor: number, pedidosSet: Set<string>, itensCount: number, isSemCanal: boolean }
    const canalMap = new Map<
      string,
      {
        nome: string
        valor: number
        pedidosSet: Set<string>
        itensCount: number
        isSemCanal: boolean
      }
    >()

    let totalGeral = 0
    let valSemCanal = 0

    for (const item of pedidos) {
      const rawCanal = (item.nome_canal || '').trim()
      const isSemCanal = !rawCanal
      const canalKey = isSemCanal ? '__SEM_CANAL__' : rawCanal.toUpperCase()
      const canalNome = isSemCanal ? 'Sem Canal' : rawCanal
      const valor = Number(item.valor_em_aberto) || 0
      const orderNum = (item.numero_pedido || item.id || '').trim()

      totalGeral += valor
      if (isSemCanal) {
        valSemCanal += valor
      }

      let entry = canalMap.get(canalKey)
      if (!entry) {
        entry = {
          nome: canalNome,
          valor: 0,
          pedidosSet: new Set<string>(),
          itensCount: 0,
          isSemCanal,
        }
        canalMap.set(canalKey, entry)
      }

      entry.valor += valor
      entry.itensCount += 1
      if (orderNum) {
        entry.pedidosSet.add(orderNum)
      }
    }

    const items: CanalChartItem[] = []
    let semCanalEntry: CanalChartItem | null = null

    for (const entry of canalMap.values()) {
      const pct = totalGeral > 0 ? (entry.valor / totalGeral) * 100 : 0
      const item: CanalChartItem = {
        canal: entry.nome,
        valor: entry.valor,
        pedidosQtd: entry.pedidosSet.size,
        itensQtd: entry.itensCount,
        isSemCanal: entry.isSemCanal,
        pct: Math.round(pct),
      }
      if (entry.isSemCanal) {
        semCanalEntry = item
      } else {
        items.push(item)
      }
    }

    // Ordena os canais vinculados por maior valor em aberto
    items.sort((a, b) => b.valor - a.valor)

    // Se houver revendas sem canal, insere a entrada final "Sem Canal" destacada
    if (semCanalEntry) {
      items.push(semCanalEntry)
    }

    return {
      canaisData: items,
      totalValorCanais: totalGeral,
      valorSemCanal: valSemCanal,
      pctSemCanal: totalGeral > 0 ? Math.round((valSemCanal / totalGeral) * 100) : 0,
    }
  }, [pedidos])

  // 3. Visão "Pedidos Abertos por Mês" (cronológico por data_pedido)
  const mesesData: MesChartItem[] = useMemo(() => {
    // Mapa: YYYY-MM -> { key, label, pedidosSet: Set<string>, valor: number, itens: number }
    const map = new Map<
      string,
      {
        key: string
        label: string
        pedidosSet: Set<string>
        valor: number
        itens: number
      }
    >()

    const nomeMesesAbrev = [
      'Jan',
      'Fev',
      'Mar',
      'Abr',
      'Mai',
      'Jun',
      'Jul',
      'Ago',
      'Set',
      'Out',
      'Nov',
      'Dez',
    ]

    for (const item of pedidos) {
      if (!item.data_pedido) continue
      // Formato esperado: YYYY-MM-DD... ou ISO
      const rawDate = String(item.data_pedido).slice(0, 10)
      if (rawDate.length < 7) continue

      const yearMonth = rawDate.slice(0, 7) // "YYYY-MM"
      const [yearStr, monthStr] = yearMonth.split('-')
      const monthNum = parseInt(monthStr, 10)
      if (isNaN(monthNum) || monthNum < 1 || monthNum > 12) continue

      const label = `${nomeMesesAbrev[monthNum - 1]}/${yearStr.slice(2)}`
      const valor = Number(item.valor_em_aberto) || 0
      const orderNum = (item.numero_pedido || item.id || '').trim()

      let entry = map.get(yearMonth)
      if (!entry) {
        entry = {
          key: yearMonth,
          label,
          pedidosSet: new Set<string>(),
          valor: 0,
          itens: 0,
        }
        map.set(yearMonth, entry)
      }

      entry.valor += valor
      entry.itens += 1
      if (orderNum) {
        entry.pedidosSet.add(orderNum)
      }
    }

    // Ordenação cronológica crescente (YYYY-MM)
    const sortedKeys = Array.from(map.keys()).sort((a, b) => a.localeCompare(b))

    return sortedKeys.map((k) => {
      const entry = map.get(k)!
      return {
        key: entry.key,
        label: entry.label,
        pedidos: entry.pedidosSet.size || entry.itens,
        valor: entry.valor,
        itens: entry.itens,
      }
    })
  }, [pedidos])

  const hasData = pedidos.length > 0

  return (
    <div className="space-y-4">
      {/* Título da Seção de Dashboard */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-[#0B6E99]/10 text-[#0B6E99]">
            <BarChart2 className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-2">
              Dashboard de Pedidos em Aberto
              <Badge
                variant="outline"
                className="text-[10px] bg-slate-50 border-slate-200 text-slate-600 font-semibold"
              >
                {isLoading
                  ? 'Calculando...'
                  : `${formatNumber(estoqueStats.totalPedidos)} pedidos • ${formatCurrency(estoqueStats.totalValor)}`}
              </Badge>
            </h3>
            <p className="text-xs text-slate-500">
              Visão consolidada de disponibilidade de estoque, faturamento por canal e distribuição
              mensal
            </p>
          </div>
        </div>
      </div>

      {/* Grid Superior: Cards de Estoque (com estoque vs. sem estoque) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Card 1: Pedidos com Itens em Estoque */}
        <Card className="border border-emerald-200/80 bg-gradient-to-br from-white via-white to-emerald-50/40 shadow-xs rounded-xl overflow-hidden hover:border-emerald-300 transition-all">
          <CardHeader className="p-4 pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-emerald-100/70 text-emerald-700">
                  <PackageCheck className="w-5 h-5" />
                </div>
                <div>
                  <CardTitle className="text-sm font-bold text-slate-900">
                    Pedidos com Itens em Estoque
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500">
                    Ao menos uma linha com estoque disponível imediato
                  </CardDescription>
                </div>
              </div>
              <Badge
                variant="secondary"
                className="bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-bold"
              >
                {estoqueStats.comEstoque.pctPedidos}% dos pedidos
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-2">
            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-emerald-100/60">
              <div>
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  Pedidos
                </p>
                <div className="flex items-baseline gap-1.5 mt-0.5">
                  <span className="text-2xl font-black text-emerald-700">
                    {formatNumber(estoqueStats.comEstoque.pedidos)}
                  </span>
                  <span className="text-xs text-slate-400">
                    / {formatNumber(estoqueStats.totalPedidos)}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {formatNumber(estoqueStats.comEstoque.itens)} linha(s) de item
                </p>
              </div>

              <div className="border-l border-emerald-100/80 pl-3">
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  Valor em Aberto
                </p>
                <div className="mt-0.5">
                  <span className="text-lg sm:text-xl font-black text-slate-900 block truncate">
                    {formatCurrency(estoqueStats.comEstoque.valor)}
                  </span>
                </div>
                <p className="text-[11px] text-emerald-700 font-semibold mt-0.5">
                  {estoqueStats.comEstoque.pctValor}% do valor total em carteira
                </p>
              </div>
            </div>

            {/* Barra de progresso visual */}
            <div className="mt-3 pt-2">
              <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden flex">
                <div
                  className="bg-emerald-500 h-full transition-all duration-500 rounded-full"
                  style={{
                    width: `${Math.min(100, Math.max(0, estoqueStats.comEstoque.pctValor))}%`,
                  }}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Card 2: Pedidos sem Itens no Estoque */}
        <Card className="border border-amber-200/80 bg-gradient-to-br from-white via-white to-amber-50/40 shadow-xs rounded-xl overflow-hidden hover:border-amber-300 transition-all">
          <CardHeader className="p-4 pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-amber-100/70 text-amber-700">
                  <PackageX className="w-5 h-5" />
                </div>
                <div>
                  <CardTitle className="text-sm font-bold text-slate-900">
                    Pedidos sem Itens no Estoque
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500">
                    Nenhuma linha disponível em estoque (aguardando produção/importação)
                  </CardDescription>
                </div>
              </div>
              <Badge
                variant="secondary"
                className="bg-amber-100 text-amber-900 border border-amber-200 text-xs font-bold"
              >
                {estoqueStats.semEstoque.pctPedidos}% dos pedidos
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-2">
            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-amber-100/60">
              <div>
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  Pedidos
                </p>
                <div className="flex items-baseline gap-1.5 mt-0.5">
                  <span className="text-2xl font-black text-amber-700">
                    {formatNumber(estoqueStats.semEstoque.pedidos)}
                  </span>
                  <span className="text-xs text-slate-400">
                    / {formatNumber(estoqueStats.totalPedidos)}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {formatNumber(estoqueStats.semEstoque.itens)} linha(s) pendente(s)
                </p>
              </div>

              <div className="border-l border-amber-100/80 pl-3">
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  Valor em Aberto
                </p>
                <div className="mt-0.5">
                  <span className="text-lg sm:text-xl font-black text-slate-900 block truncate">
                    {formatCurrency(estoqueStats.semEstoque.valor)}
                  </span>
                </div>
                <p className="text-[11px] text-amber-800 font-semibold mt-0.5">
                  {estoqueStats.semEstoque.pctValor}% do valor total em carteira
                </p>
              </div>
            </div>

            {/* Barra de progresso visual */}
            <div className="mt-3 pt-2">
              <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden flex">
                <div
                  className="bg-amber-500 h-full transition-all duration-500 rounded-full"
                  style={{
                    width: `${Math.min(100, Math.max(0, estoqueStats.semEstoque.pctValor))}%`,
                  }}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Grid Inferior: Valor por Canal & Pedidos por Mês */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Gráfico / Lista Visual: Valor por Canal (com destaque para "Sem Canal") */}
        <Card className="rounded-xl border border-gray-200 bg-white shadow-xs overflow-hidden flex flex-col">
          <CardHeader className="p-4 pb-2 border-b border-slate-100">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-[#0B6E99]/10 text-[#0B6E99]">
                  <Layers className="w-4 h-4" />
                </div>
                <div>
                  <CardTitle className="text-sm font-bold text-slate-900">
                    Valor por Canal
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500">
                    Distribuição da carteira em aberto por canal da rede
                  </CardDescription>
                </div>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block">
                  Total Geral
                </span>
                <span className="text-xs font-black text-[#0B6E99]">
                  {formatCurrency(totalValorCanais)}
                </span>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-4 flex-1 flex flex-col">
            {!hasData || canaisData.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400">
                <AlertCircle className="w-8 h-8 text-slate-300 mb-1" />
                <p className="text-xs font-semibold text-slate-600">
                  Nenhum dado de canal encontrado no recorte
                </p>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[320px] overflow-y-auto pr-1">
                {canaisData.map((item, idx) => {
                  const maxValor = canaisData[0]?.valor || 1
                  const barWidth = Math.min(100, Math.max(3, (item.valor / maxValor) * 100))

                  return (
                    <div
                      key={item.canal + idx}
                      className={`p-2.5 rounded-lg border transition-colors ${
                        item.isSemCanal
                          ? 'bg-slate-50 border-slate-300/80'
                          : 'bg-white border-slate-100 hover:border-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs mb-1 gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {item.isSemCanal ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-black bg-slate-200 text-slate-800">
                              <HelpCircle className="w-3 h-3 text-slate-500" />
                              Sem Canal (Revendas sem vínculo)
                            </span>
                          ) : (
                            <span className="font-bold text-slate-800 truncate" title={item.canal}>
                              {item.canal}
                            </span>
                          )}
                          <span className="text-[10px] text-slate-400 whitespace-nowrap">
                            ({item.pedidosQtd} ped.)
                          </span>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[11px] font-semibold text-slate-500">
                            {item.pct}%
                          </span>
                          <span
                            className={`font-black ${
                              item.isSemCanal ? 'text-slate-800' : 'text-[#0B6E99]'
                            }`}
                          >
                            {formatCurrency(item.valor)}
                          </span>
                        </div>
                      </div>

                      {/* Barra de preenchimento */}
                      <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            item.isSemCanal
                              ? 'bg-gradient-to-r from-slate-400 to-slate-500'
                              : 'bg-gradient-to-r from-[#0B6E99] to-[#085273]'
                          }`}
                          style={{ width: `${barWidth}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Destaque / Rodapé com total de Revendas sem canal */}
            {valorSemCanal > 0 && (
              <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs bg-slate-50 p-2 rounded-lg">
                <span className="text-slate-600 font-medium flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-slate-400" />
                  Valor total das revendas sem canal:
                </span>
                <span className="font-extrabold text-slate-800">
                  {formatCurrency(valorSemCanal)}{' '}
                  <span className="text-[10px] text-slate-500 font-normal">({pctSemCanal}%)</span>
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Gráfico: Pedidos Abertos por Mês (Recharts BarChart ordenado cronologicamente) */}
        <ChartCard
          title="Pedidos Abertos por Mês"
          description="Evolução cronológica por data de emissão do pedido (SAP)"
          icon={Calendar}
          iconColor="text-[#0B6E99]"
        >
          {mesesData.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center p-8 text-center text-slate-400">
              <Calendar className="w-8 h-8 text-slate-300 mb-1" />
              <p className="text-xs font-semibold text-slate-600">
                Nenhum dado temporal encontrado
              </p>
              <p className="text-[11px] text-slate-400">
                Ajuste os filtros de período para visualizar
              </p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={mesesData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={{ stroke: '#E2E8F0' }}
                  tick={{ fill: SLATE_MUTED, fontSize: 11 }}
                />
                <YAxis
                  yAxisId="valor"
                  orientation="left"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: SLATE_MUTED, fontSize: 10 }}
                  tickFormatter={(val) => `R$ ${(val / 1000).toFixed(0)}k`}
                />
                <YAxis
                  yAxisId="pedidos"
                  orientation="right"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: SLATE_MUTED, fontSize: 10 }}
                  tickFormatter={(val) => `${val}`}
                />
                <Tooltip
                  formatter={(val: number | string | undefined, name: string) => {
                    const n = typeof val === 'number' ? val : Number(val) || 0
                    if (name === 'valor') {
                      return [formatCurrency(n), 'Valor em Aberto']
                    }
                    if (name === 'pedidos') {
                      return [`${formatNumber(n)} pedido(s)`, 'Pedidos Distintos']
                    }
                    return [n, name]
                  }}
                  contentStyle={{
                    backgroundColor: '#0F172A',
                    borderRadius: '8px',
                    border: '1px solid #334155',
                    color: '#fff',
                    fontSize: '12px',
                    padding: '8px 12px',
                  }}
                />
                <Legend
                  verticalAlign="top"
                  height={32}
                  formatter={(value) => (
                    <span className="text-xs font-bold text-slate-700">
                      {value === 'valor' ? 'Valor em Aberto (R$)' : 'Nº de Pedidos'}
                    </span>
                  )}
                />
                <Bar
                  yAxisId="valor"
                  dataKey="valor"
                  name="valor"
                  fill={ROLAND_BLUE}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={32}
                />
                <Bar
                  yAxisId="pedidos"
                  dataKey="pedidos"
                  name="pedidos"
                  fill={TEAL_ACCENT}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={20}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>
    </div>
  )
}
