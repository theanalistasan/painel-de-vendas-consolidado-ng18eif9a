import React from 'react'
import { ChevronDown, ChevronRight as ChevronRightIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatNumber } from '@/lib/formatters'

export interface ComissaoGroupHeaderProps {
  groupKey: 'comissionados' | 'nao_comissionados'
  title: string
  gIndex: number
  isCollapsed: boolean
  isComissionado: boolean
  count: number
  vendedoresCount: number
  totalQuantidade: number
  subtotal: number
  subtotalLiquido: number
  columnsCount: number
  onToggleCollapse: (groupKey: string) => void
}

function ComissaoGroupHeaderComponent({
  groupKey,
  title,
  gIndex,
  isCollapsed,
  isComissionado,
  count,
  vendedoresCount,
  totalQuantidade,
  subtotal,
  subtotalLiquido,
  columnsCount,
  onToggleCollapse,
}: ComissaoGroupHeaderProps) {
  return (
    <tr
      onClick={() => onToggleCollapse(groupKey)}
      className={`cursor-pointer transition-colors border-y-2 select-none font-bold ${
        isCollapsed
          ? 'bg-slate-100/90 hover:bg-slate-200/80 border-slate-300 text-slate-800'
          : isComissionado
            ? 'bg-sky-50/90 hover:bg-sky-100/80 border-sky-300 text-slate-900'
            : 'bg-amber-50/80 hover:bg-amber-100/70 border-amber-300 text-slate-900'
      }`}
      title={isCollapsed ? `Clique para expandir ${title}` : `Clique para colapsar ${title}`}
    >
      {/* Toggle chevron */}
      <td className="py-2.5 px-2 text-center align-middle border-r border-slate-200/80 w-9 min-w-[36px]">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onToggleCollapse(groupKey)
          }}
          className="p-1 rounded hover:bg-black/5 text-[#0B6E99] focus:outline-hidden transition-colors"
          title={isCollapsed ? `Expandir grupo ${title}` : `Recolher grupo ${title}`}
        >
          {isCollapsed ? (
            <ChevronRightIcon className="w-4 h-4 text-slate-600" />
          ) : (
            <ChevronDown className="w-4 h-4 text-[#0B6E99]" />
          )}
        </button>
      </td>

      {/* Conteúdo consolidado com métricas acumuladas no padrão JP-Class */}
      <td colSpan={columnsCount} className="py-2.5 px-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Indicador Numérico e Nome do Grupo */}
            <span className="text-[11px] font-mono uppercase tracking-wider text-slate-500 bg-white/80 px-1.5 py-0.5 rounded border border-slate-200">
              Grupo {gIndex + 1}
            </span>

            <Badge
              variant="outline"
              className={`text-xs px-2.5 py-0.5 font-extrabold shadow-2xs ${
                isComissionado
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                  : 'bg-indigo-50 text-indigo-800 border-indigo-300'
              }`}
            >
              {title}
            </Badge>

            {/* Contagem de linhas e vendedores */}
            <Badge
              variant="secondary"
              className="text-[11px] bg-slate-200/90 text-slate-700 font-bold px-2 py-0.5"
            >
              {count} {count === 1 ? 'linha' : 'linhas'}
              {vendedoresCount > 0 &&
                ` • ${vendedoresCount} ${vendedoresCount === 1 ? 'vendedor' : 'vendedores'}`}
            </Badge>

            <span className="text-[11px] text-slate-400 font-normal">•</span>

            {/* Somatório de Quantidade */}
            <Badge
              variant="outline"
              className="text-[11px] bg-white text-slate-700 border-slate-300 font-semibold px-2 py-0.5"
              title="Quantidade total de peças/itens neste grupo"
            >
              Qtde: {formatNumber(totalQuantidade)}
            </Badge>

            <span className="text-[11px] text-slate-400 font-normal">•</span>

            {/* Somatório de Total da Linha (Total Vendas) */}
            <span className="text-xs text-slate-600 font-semibold">Total de Vendas:</span>
            <Badge
              variant="outline"
              className="text-xs bg-emerald-50 text-emerald-800 border-emerald-300 font-black px-2.5 py-0.5"
              title={`Total de Vendas do grupo ${title}: ${formatCurrency(subtotal)}`}
            >
              {formatCurrency(subtotal)}
            </Badge>

            {/* Somatório de Valor Líquido */}
            <span className="text-xs text-slate-600 font-semibold">Valor Líquido:</span>
            <Badge
              variant="outline"
              className="text-xs bg-teal-50 text-teal-800 border-teal-300 font-black px-2.5 py-0.5"
              title={`Valor Líquido do grupo ${title}: ${formatCurrency(subtotalLiquido)}`}
            >
              {formatCurrency(subtotalLiquido)}
            </Badge>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-[#0B6E99]">
              {isCollapsed ? 'Colapsado' : 'Expandido'}
            </span>
            <span className="text-[10px] text-slate-400 font-medium">
              {isCollapsed ? 'Expandir ▼' : 'Recolher ▲'}
            </span>
          </div>
        </div>
      </td>
    </tr>
  )
}

export const ComissaoGroupHeader = React.memo(ComissaoGroupHeaderComponent)
