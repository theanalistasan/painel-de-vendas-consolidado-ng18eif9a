import React, { useMemo } from 'react'
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

export interface JpClassDashboardProps {
  items: VendaComSemana[]
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

export function JpClassDashboard({ items }: JpClassDashboardProps) {
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

  // 2. Recorte por Grupo de Produto
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

  // 3. Recorte por Item (Top 10 Itens mais vendidos)
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
      name: name.length > 25 ? `${name.slice(0, 25)}...` : name,
      fullName: name,
      codigo: data.codigo,
      faturamento: data.faturamento,
      quantidade: data.quantidade,
    }))

    return list.sort((a, b) => b.faturamento - a.faturamento).slice(0, 10)
  }, [items])

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* 1. Vendas por JP-Class (Donut) */}
      <ChartCard
        title="Vendas por JP-Class"
        description="Distribuição do faturamento por classe padronizada"
      >
        {dataJpClass.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-xs text-slate-400">
            Sem dados no período
          </div>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={dataJpClass}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={2}
                >
                  {dataJpClass.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => [formatCurrency(value), 'Faturamento']} />
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

      {/* 2. Vendas por Grupo (Barras Verticais) */}
      <ChartCard
        title="Vendas por Grupo de Produto"
        description="Top grupos por faturamento consolidado"
      >
        {dataGrupo.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-xs text-slate-400">
            Sem dados no período
          </div>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dataGrupo} margin={{ top: 10, right: 10, left: -15, bottom: 25 }}>
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
                <Tooltip formatter={(val: number) => [formatCurrency(val), 'Faturamento']} />
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

      {/* 3. Vendas por Item (Top 10 Barras Horizontais) */}
      <ChartCard title="Top 10 Itens Vendidos" description="Itens com maior faturamento no período">
        {dataTopItens.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-xs text-slate-400">
            Sem dados no período
          </div>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                layout="vertical"
                data={dataTopItens}
                margin={{ top: 5, right: 15, left: 10, bottom: 5 }}
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
                  width={110}
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
                />
                <Bar dataKey="faturamento" fill="#0B6E99" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartCard>
    </div>
  )
}
