import React from 'react'
import { ChevronDown, ChevronRight as ChevronRightIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatNumber } from '@/lib/formatters'

export interface JpClassGroupHeaderProps {
  groupKey: string
  title: string
  isCollapsed: boolean
  badgeClassName: string
  count: number
  totalQuantidade: number
  subtotal: number
  subtotalLiquido: number
  columnsCount: number
  onToggleCollapse: (groupKey: string) => void
}

function JpClassGroupHeaderComponent({
  groupKey,
  title,
  isCollapsed,
  badgeClassName,
  count,
  totalQuantidade,
  subtotal,
  subtotalLiquido,
  columnsCount,
  onToggleCollapse,
}: JpClassGroupHeaderProps) {
  return (
    <tr
      onClick={() => onToggleCollapse(groupKey)}
      className={`cursor-pointer transition-colors border-y border-slate-200/80 font-semibold select-none ${
        isCollapsed
          ? 'bg-slate-50/90 hover:bg-slate-100/80 text-slate-800'
          : 'bg-cyan-50/60 hover:bg-cyan-100/50 text-slate-900'
      }`}
      title={
        isCollapsed
          ? `Clique para expandir o grupo ${title}`
          : `Clique para recolher o grupo ${title}`
      }
    >
      {/* Toggle chevron */}
      <td className="py-2 px-2 text-center align-middle border-r border-slate-200/60 w-9 min-w-[36px]">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onToggleCollapse(groupKey)
          }}
          className="p-1 rounded hover:bg-cyan-200/60 text-[#0B6E99] focus:outline-hidden transition-colors"
          title={isCollapsed ? `Expandir grupo ${title}` : `Recolher grupo ${title}`}
        >
          {isCollapsed ? (
            <ChevronRightIcon className="w-4 h-4 text-slate-500" />
          ) : (
            <ChevronDown className="w-4 h-4 text-[#0B6E99]" />
          )}
        </button>
      </td>

      {/* Conteúdo consolidado do Grupo JP-Class */}
      <td colSpan={columnsCount} className="py-2.5 px-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Badge da categoria JP-Class */}
            <Badge
              variant="outline"
              className={`text-xs px-2.5 py-0.5 font-bold tracking-wide ${badgeClassName}`}
            >
              {title}
            </Badge>

            <span className="text-[11px] text-slate-400 font-normal">•</span>

            {/* Contagem de linhas */}
            <Badge
              variant="secondary"
              className="text-[11px] bg-slate-200/80 text-slate-700 font-bold px-2 py-0.5"
            >
              {count} {count === 1 ? 'linha' : 'linhas'}
            </Badge>

            {/* Quantidade total de itens */}
            {totalQuantidade > 0 && (
              <Badge
                variant="outline"
                className="text-[11px] bg-white text-slate-700 border-slate-300 font-semibold px-2 py-0.5"
                title="Quantidade total de peças/itens neste grupo"
              >
                Qtde total: {formatNumber(totalQuantidade)}
              </Badge>
            )}

            <span className="text-[11px] text-slate-400 font-normal">•</span>

            {/* Subtotal Total da Linha */}
            <span className="text-xs text-slate-600 font-medium">Subtotal:</span>
            <Badge
              variant="outline"
              className="text-xs bg-emerald-50 text-emerald-800 border-emerald-300 font-extrabold px-2.5 py-0.5"
              title={`Subtotal (Total da Linha) do grupo ${title}: ${formatCurrency(subtotal)}`}
            >
              {formatCurrency(subtotal)}
            </Badge>

            {/* Subtotal Líquido se houver */}
            {subtotalLiquido > 0 && subtotalLiquido !== subtotal && (
              <Badge
                variant="outline"
                className="text-[11px] bg-teal-50 text-teal-800 border-teal-200 font-semibold px-2 py-0.5"
                title={`Valor Líquido do grupo: ${formatCurrency(subtotalLiquido)}`}
              >
                Líq: {formatCurrency(subtotalLiquido)}
              </Badge>
            )}
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

export const JpClassGroupHeader = React.memo(JpClassGroupHeaderComponent)
