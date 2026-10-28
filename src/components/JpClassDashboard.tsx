import React, { useMemo, useState } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts'
import ChartCard from '@/components/ChartCard'
import { formatCurrency, formatCompactCurrency, formatNumber } from '@/lib/formatters'
import { getJpClass } from '@/lib/jp-class'
import type { VendaComSemana } from '@/components/JpClassRelatorio'
import { Users, PieChart as PieChartIcon, BarChart3, Package, Layers } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

export interface JpClassDashboardProps {
  items: VendaComSemana[]
  /** Mapa auxiliar código_cliente -> tipo_cliente para garantir resolução com fallback caso necessário */
  tiposClienteMap?: Record<string, string>
}

const JP_CLASS_COLORS: Record<string, string> = {
  HARD: '#D97706', // Âmbar
  INKS: '#0284C7', // Azul Céu
  OTHERS: '#059669', // Esmeralda
  'Sem classe': '#94A3B8', // Slate
}

const PALETTE_COLORS = [
  '#0B6E99',
  '#1895A8',
  '#6366F1',
  '#EC4899',
  '#F59E0B',
  '#10B981',
  '#8B5CF6',
  '#64748B',
  '#F97316',
  '#14B8A6',
]

type MetricMode = 'faturamento' | 'quantidade'

export function JpClassDashboard({ items, tiposClienteMap = {} }: JpClassDashboardProps) {
  const [metricModeTipoCliente, setMetricModeTipoCliente] = useState<MetricMode>('faturamento')

  // 1. Recorte por JP-Class
  const dataJpClass = useMemo(() => {
    const map = new Map<string, { faturamento: number; quantidade: number }>()

    for (const it of items) {
      // Derivar SEMPRE ao vivo a partir do Grupo do item, eliminando qualquer legado
      const cls = getJpClass(it.grupo_item || it.itms_grp_nam)
      const cur = map.get(cls) || { faturamento: 0, quantidade: 0 }
      cur.faturamento += Number(it.total_linha) || 0
      cur.quantidade += Number(it.quantidade) || 0
      map.set(cls, cur)
    }

    const totalFaturamento = Array.from(map.values()).reduce((acc, v) => acc + v.faturamento, 0)

    const list = Array.from(map.entries()).map(([name, data]) => {
      const percent = totalFaturamento > 0 ? (data.faturamento / totalFaturamento) * 100 : 0
      return {
        name,
        value: data.faturamento,
        faturamento: data.faturamento,
        quantidade: data.quantidade,
        percent: Math.round(percent),
        color: JP_CLASS_COLORS[name] || '#64748B',
      }
    })

    return list.sort((a, b) => b.value - a.value)
  }, [items])

  // 2. Recorte por Tipo de Cliente com SUBTOTAIS por classe JP-Class (HARD, INKS, OTHERS)
  const dataTipoCliente = useMemo(() => {
    interface Subtotais {
      hardFaturamento: number
      hardQuantidade: number
      inksFaturamento: number
      inksQuantidade: number
      othersFaturamento: number
      othersQuantidade: number
      semClasseFaturamento: number
      semClasseQuantidade: number
      totalFaturamento: number
      totalQuantidade: number
    }

    const map = new Map<string, Subtotais>()

    for (const it of items) {
      // Tipo de cliente com fallback existente: tipo_cliente -> mapa tipos_cliente via código_cliente -> '-'
      let tc = (it.tipo_cliente || '').trim()
      if ((!tc || tc === '-') && it.codigo_cliente) {
        const codUpper = it.codigo_cliente.trim().toUpperCase()
        tc = tiposClienteMap[codUpper] || tc || '-'
      }
      if (!tc) tc = '-'

      const cls = getJpClass(it.grupo_item || it.itms_grp_nam)
      const cur = map.get(tc) || {
        hardFaturamento: 0,
        hardQuantidade: 0,
        inksFaturamento: 0,
        inksQuantidade: 0,
        othersFaturamento: 0,
        othersQuantidade: 0,
        semClasseFaturamento: 0,
        semClasseQuantidade: 0,
        totalFaturamento: 0,
        totalQuantidade: 0,
      }

      const fat = Number(it.total_linha) || 0
      const qtd = Number(it.quantidade) || 0

      if (cls === 'HARD') {
        cur.hardFaturamento += fat
        cur.hardQuantidade += qtd
      } else if (cls === 'INKS') {
        cur.inksFaturamento += fat
        cur.inksQuantidade += qtd
      } else if (cls === 'OTHERS') {
        cur.othersFaturamento += fat
        cur.othersQuantidade += qtd
      } else {
        cur.semClasseFaturamento += fat
        cur.semClasseQuantidade += qtd
      }

      cur.totalFaturamento += fat
      cur.totalQuantidade += qtd
      map.set(tc, cur)
    }

    // Ordenar por faturamento total decrescente
    const list = Array.from(map.entries()).map(([tipoCliente, sub]) => ({
      tipoCliente,
      name: tipoCliente,
      ...sub,
    }))

    return list.sort((a, b) => b.totalFaturamento - a.totalFaturamento)
  }, [items, tiposClienteMap])

  // Totais agregados gerais do recorte de tipo de cliente
  const totaisTipoCliente = useMemo(() => {
    return dataTipoCliente.reduce(
      (acc, cur) => ({
        faturamento: acc.faturamento + cur.totalFaturamento,
        quantidade: acc.quantidade + cur.totalQuantidade,
        hardFat: acc.hardFat + cur.hardFaturamento,
        inksFat: acc.inksFat + cur.inksFaturamento,
        othersFat: acc.othersFat + cur.othersFaturamento,
        semClasseFat: acc.semClasseFat + cur.semClasseFaturamento,
        hardQtd: acc.hardQtd + cur.hardQuantidade,
        inksQtd: acc.inksQtd + cur.inksQuantidade,
        othersQtd: acc.othersQtd + cur.othersQuantidade,
        semClasseQtd: acc.semClasseQtd + cur.semClasseQuantidade,
      }),
      {
        faturamento: 0,
        quantidade: 0,
        hardFat: 0,
        inksFat: 0,
        othersFat: 0,
        semClasseFat: 0,
        hardQtd: 0,
        inksQtd: 0,
        othersQtd: 0,
        semClasseQtd: 0,
      },
    )
  }, [dataTipoCliente])

  // 3. Recorte por Grupo de Produto
  const dataGrupo = useMemo(() => {
    const map = new Map<string, { faturamento: number; quantidade: number }>()

    for (const it of items) {
      const grp = (it.grupo_item || it.itms_grp_nam || '(Sem Grupo)').trim()
      const cur = map.get(grp) || { faturamento: 0, quantidade: 0 }
      cur.faturamento += Number(it.total_linha) || 0
      cur.quantidade += Number(it.quantidade) || 0
      map.set(grp, cur)
    }

    const list = Array.from(map.entries()).map(([name, data], idx) => ({
      name,
      faturamento: data.faturamento,
      quantidade: data.quantidade,
      color: PALETTE_COLORS[idx % PALETTE_COLORS.length],
    }))

    return list.sort((a, b) => b.faturamento - a.faturamento).slice(0, 10)
  }, [items])

  // 4. Recorte por Item (Top 10 Itens mais vendidos)
  const dataTopItens = useMemo(() => {
    const map = new Map<string, { faturamento: number; quantidade: number; codigo: string }>()

    for (const it of items) {
      const nome = (it.descricao_item || it.codigo_item || '(Item sem nome)').trim()
      const cur = map.get(nome) || {
        faturamento: 0,
        quantidade: 0,
        codigo: it.codigo_item || '',
      }
      cur.faturamento += Number(it.total_linha) || 0
      cur.quantidade += Number(it.quantidade) || 0
      map.set(nome, cur)
    }

    const list = Array.from(map.entries()).map(([name, data]) => ({
      name: name.length > 30 ? `${name.slice(0, 30)}...` : name,
      fullName: name,
      codigo: data.codigo,
      faturamento: data.faturamento,
      quantidade: data.quantidade,
    }))

    return list.sort((a, b) => b.faturamento - a.faturamento).slice(0, 10)
  }, [items])

  return (
    <div className="space-y-6 w-full min-w-0">
      {/* LINHA 1: Dois gráficos principais de análise executiva ocupando toda a tela (50/50 em telas médias/grandes) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 w-full min-w-0">
        {/* 1. Vendas por JP-Class (Donut responsivo em largura total do container) */}
        <ChartCard
          title="Vendas por JP-Class"
          description="Distribuição do faturamento por classe padronizada"
          icon={PieChartIcon}
          iconColor="text-[#0B6E99]"
        >
          {dataJpClass.length === 0 ? (
            <div className="h-full w-full flex items-center justify-center text-xs text-slate-400">
              Sem dados no período
            </div>
          ) : (
            <div className="h-full w-full min-h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={dataJpClass}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="48%"
                    innerRadius={60}
                    outerRadius={95}
                    paddingAngle={3}
                  >
                    {dataJpClass.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number) => [formatCurrency(value), 'Faturamento']}
                    contentStyle={{
                      backgroundColor: '#0F172A',
                      borderRadius: '8px',
                      border: '1px solid #334155',
                      color: '#fff',
                      fontSize: '12px',
                    }}
                    labelStyle={{ color: '#FFFFFF', fontWeight: 700 }}
                    itemStyle={{ color: '#F1F5F9' }}
                  />
                  <Legend
                    verticalAlign="bottom"
                    formatter={(val, entry: { payload?: { percent?: number } }) => {
                      const pct = entry.payload?.percent ?? 0
                      return `${val} (${pct}%)`
                    }}
                    wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>

        {/* 2. NOVO PAINEL: Vendas por Tipo de Cliente com Subtotais por HARD, INKS e OTHERS */}
        <ChartCard
          title="Vendas por Tipo de Cliente (Subtotais JP-Class)"
          description="Faturamento e quantidade segmentados por Tipo de Cliente com decomposição HARD, INKS e OTHERS"
          icon={Users}
          iconColor="text-[#0B6E99]"
          action={
            <div className="inline-flex rounded-lg bg-slate-100 p-0.5 text-[11px] font-bold">
              <button
                type="button"
                onClick={() => setMetricModeTipoCliente('faturamento')}
                className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                  metricModeTipoCliente === 'faturamento'
                    ? 'bg-white text-[#0B6E99] shadow-2xs font-extrabold'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
                title="Visualizar em Valor Monetário (R$)"
              >
                R$ Faturamento
              </button>
              <button
                type="button"
                onClick={() => setMetricModeTipoCliente('quantidade')}
                className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                  metricModeTipoCliente === 'quantidade'
                    ? 'bg-white text-[#0B6E99] shadow-2xs font-extrabold'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
                title="Visualizar em Quantidade de Unidades"
              >
                Qtde (un)
              </button>
            </div>
          }
        >
          {dataTipoCliente.length === 0 ? (
            <div className="h-full w-full flex items-center justify-center text-xs text-slate-400">
              Sem dados no período
            </div>
          ) : (
            <div className="h-full w-full min-h-[280px] flex flex-col">
              <div className="flex-1 min-h-0 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={dataTipoCliente}
                    layout="vertical"
                    margin={{ top: 10, right: 25, left: 10, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#F1F5F9" />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 10, fill: '#64748B' }}
                      tickFormatter={(val) =>
                        metricModeTipoCliente === 'faturamento'
                          ? formatCompactCurrency(val)
                          : formatNumber(val)
                      }
                    />
                    <YAxis
                      type="category"
                      dataKey="tipoCliente"
                      tick={{ fontSize: 11, fill: '#334155', fontWeight: 600 }}
                      width={120}
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload || payload.length === 0) return null
                        const row = payload[0]?.payload as (typeof dataTipoCliente)[0]
                        if (!row) return null

                        const isFat = metricModeTipoCliente === 'faturamento'
                        const total = isFat ? row.totalFaturamento : row.totalQuantidade
                        const hardVal = isFat ? row.hardFaturamento : row.hardQuantidade
                        const inksVal = isFat ? row.inksFaturamento : row.inksQuantidade
                        const othersVal = isFat ? row.othersFaturamento : row.othersQuantidade
                        const semClasseVal = isFat
                          ? row.semClasseFaturamento
                          : row.semClasseQuantidade

                        const formatVal = (v: number) =>
                          isFat ? formatCurrency(v) : `${formatNumber(v)} un.`

                        return (
                          <div className="rounded-lg bg-slate-900 px-3 py-2.5 text-xs text-white border border-slate-700 shadow-xl min-w-[220px]">
                            <div className="font-bold text-slate-100 pb-1.5 mb-1.5 border-b border-slate-700/80 flex items-center justify-between">
                              <span>{row.tipoCliente}</span>
                              <span className="text-cyan-300 font-extrabold">
                                {formatVal(total)}
                              </span>
                            </div>
                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-amber-300">
                                <span className="flex items-center gap-1.5">
                                  <span className="w-2 h-2 rounded-full bg-[#D97706]" />
                                  HARD:
                                </span>
                                <span className="font-semibold">{formatVal(hardVal)}</span>
                              </div>
                              <div className="flex items-center justify-between text-sky-300">
                                <span className="flex items-center gap-1.5">
                                  <span className="w-2 h-2 rounded-full bg-[#0284C7]" />
                                  INKS:
                                </span>
                                <span className="font-semibold">{formatVal(inksVal)}</span>
                              </div>
                              <div className="flex items-center justify-between text-emerald-300">
                                <span className="flex items-center gap-1.5">
                                  <span className="w-2 h-2 rounded-full bg-[#059669]" />
                                  OTHERS:
                                </span>
                                <span className="font-semibold">{formatVal(othersVal)}</span>
                              </div>
                              {semClasseVal > 0 && (
                                <div className="flex items-center justify-between text-slate-400 text-[11px] pt-1 border-t border-slate-800">
                                  <span className="flex items-center gap-1.5">
                                    <span className="w-2 h-2 rounded-full bg-[#94A3B8]" />
                                    Sem classe:
                                  </span>
                                  <span>{formatVal(semClasseVal)}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      }}
                    />
                    <Legend
                      verticalAlign="top"
                      height={32}
                      content={() => (
                        <div className="flex items-center justify-center gap-4 pb-2 text-xs">
                          <div className="flex items-center gap-1.5 font-bold text-amber-700">
                            <span className="w-2.5 h-2.5 rounded-xs bg-[#D97706]" />
                            <span>HARD</span>
                          </div>
                          <div className="flex items-center gap-1.5 font-bold text-sky-700">
                            <span className="w-2.5 h-2.5 rounded-xs bg-[#0284C7]" />
                            <span>INKS</span>
                          </div>
                          <div className="flex items-center gap-1.5 font-bold text-emerald-700">
                            <span className="w-2.5 h-2.5 rounded-xs bg-[#059669]" />
                            <span>OTHERS</span>
                          </div>
                          {totaisTipoCliente.semClasseFat > 0 && (
                            <div className="flex items-center gap-1.5 font-medium text-slate-500">
                              <span className="w-2.5 h-2.5 rounded-xs bg-[#94A3B8]" />
                              <span>Sem classe</span>
                            </div>
                          )}
                        </div>
                      )}
                    />
                    {/* Barras empilhadas com subtotais por HARD, INKS, OTHERS e Sem classe */}
                    <Bar
                      dataKey={
                        metricModeTipoCliente === 'faturamento'
                          ? 'hardFaturamento'
                          : 'hardQuantidade'
                      }
                      name="HARD"
                      stackId="jpClassStack"
                      fill={JP_CLASS_COLORS.HARD}
                    />
                    <Bar
                      dataKey={
                        metricModeTipoCliente === 'faturamento'
                          ? 'inksFaturamento'
                          : 'inksQuantidade'
                      }
                      name="INKS"
                      stackId="jpClassStack"
                      fill={JP_CLASS_COLORS.INKS}
                    />
                    <Bar
                      dataKey={
                        metricModeTipoCliente === 'faturamento'
                          ? 'othersFaturamento'
                          : 'othersQuantidade'
                      }
                      name="OTHERS"
                      stackId="jpClassStack"
                      fill={JP_CLASS_COLORS.OTHERS}
                      radius={totaisTipoCliente.semClasseFat > 0 ? [0, 0, 0, 0] : [0, 4, 4, 0]}
                    />
                    {totaisTipoCliente.semClasseFat > 0 && (
                      <Bar
                        dataKey={
                          metricModeTipoCliente === 'faturamento'
                            ? 'semClasseFaturamento'
                            : 'semClasseQuantidade'
                        }
                        name="Sem classe"
                        stackId="jpClassStack"
                        fill={JP_CLASS_COLORS['Sem classe']}
                        radius={[0, 4, 4, 0]}
                      />
                    )}
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Subtotais consolidados rápidos por classe */}
              <div className="mt-2 pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600">
                <div className="flex items-center gap-3">
                  <span className="font-bold text-slate-700">Subtotais globais:</span>
                  <span className="text-amber-700 font-semibold">
                    HARD:{' '}
                    {metricModeTipoCliente === 'faturamento'
                      ? formatCompactCurrency(totaisTipoCliente.hardFat)
                      : `${formatNumber(totaisTipoCliente.hardQtd)} un`}
                  </span>
                  <span className="text-sky-700 font-semibold">
                    INKS:{' '}
                    {metricModeTipoCliente === 'faturamento'
                      ? formatCompactCurrency(totaisTipoCliente.inksFat)
                      : `${formatNumber(totaisTipoCliente.inksQtd)} un`}
                  </span>
                  <span className="text-emerald-700 font-semibold">
                    OTHERS:{' '}
                    {metricModeTipoCliente === 'faturamento'
                      ? formatCompactCurrency(totaisTipoCliente.othersFat)
                      : `${formatNumber(totaisTipoCliente.othersQtd)} un`}
                  </span>
                  {totaisTipoCliente.semClasseFat > 0 && (
                    <span className="text-slate-500">
                      Sem classe:{' '}
                      {metricModeTipoCliente === 'faturamento'
                        ? formatCompactCurrency(totaisTipoCliente.semClasseFat)
                        : `${formatNumber(totaisTipoCliente.semClasseQtd)} un`}
                    </span>
                  )}
                </div>
                <Badge variant="outline" className="bg-slate-50 font-bold text-[10px]">
                  {dataTipoCliente.length} tipos de cliente
                </Badge>
              </div>
            </div>
          )}
        </ChartCard>
      </div>

      {/* LINHA 2: Vendas por Grupo de Produto e Top 10 Itens Vendidos (50/50 em telas médias/grandes) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 w-full min-w-0">
        {/* 3. Vendas por Grupo (Barras Verticais) */}
        <ChartCard
          title="Vendas por Grupo de Produto"
          description="Top grupos por faturamento consolidado"
          icon={BarChart3}
          iconColor="text-[#0B6E99]"
        >
          {dataGrupo.length === 0 ? (
            <div className="h-full w-full flex items-center justify-center text-xs text-slate-400">
              Sem dados no período
            </div>
          ) : (
            <div className="h-full w-full min-h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dataGrupo} margin={{ top: 10, right: 15, left: -10, bottom: 25 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 10, fill: '#64748B' }}
                    angle={-25}
                    textAnchor="end"
                    interval={0}
                    height={45}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: '#64748B' }}
                    tickFormatter={(val) => formatCompactCurrency(val)}
                  />
                  <Tooltip
                    formatter={(val: number) => [formatCurrency(val), 'Faturamento']}
                    contentStyle={{
                      backgroundColor: '#0F172A',
                      borderRadius: '8px',
                      border: '1px solid #334155',
                      color: '#fff',
                      fontSize: '12px',
                    }}
                    labelStyle={{ color: '#FFFFFF', fontWeight: 700 }}
                    itemStyle={{ color: '#F1F5F9' }}
                  />
                  <Bar dataKey="faturamento" radius={[4, 4, 0, 0]}>
                    {dataGrupo.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>

        {/* 4. Vendas por Item (Top 10 Barras Horizontais) */}
        <ChartCard
          title="Top 10 Itens Vendidos"
          description="Itens com maior faturamento no período"
          icon={Package}
          iconColor="text-[#0B6E99]"
        >
          {dataTopItens.length === 0 ? (
            <div className="h-full w-full flex items-center justify-center text-xs text-slate-400">
              Sem dados no período
            </div>
          ) : (
            <div className="h-full w-full min-h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  layout="vertical"
                  data={dataTopItens}
                  margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E2E8F0" />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 10, fill: '#64748B' }}
                    tickFormatter={(val) => formatCompactCurrency(val)}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fontSize: 10, fill: '#475569' }}
                    width={130}
                  />
                  <Tooltip
                    formatter={(
                      val: number,
                      _name,
                      props: { payload?: { fullName?: string; quantidade?: number } },
                    ) => [
                      `${formatCurrency(val)} (${formatNumber(props.payload?.quantidade || 0)} un.)`,
                      props.payload?.fullName || 'Item',
                    ]}
                    contentStyle={{
                      backgroundColor: '#0F172A',
                      borderRadius: '8px',
                      border: '1px solid #334155',
                      color: '#fff',
                      fontSize: '12px',
                    }}
                    labelStyle={{ color: '#FFFFFF', fontWeight: 700 }}
                    itemStyle={{ color: '#F1F5F9' }}
                  />
                  <Bar dataKey="faturamento" fill="#0B6E99" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>
      </div>
    </div>
  )
}
