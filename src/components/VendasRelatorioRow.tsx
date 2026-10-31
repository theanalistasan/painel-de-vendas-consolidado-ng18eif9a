import React from 'react'
import { ChevronDown, ChevronRight as ChevronRightIcon } from 'lucide-react'
import type { VendaConsolidada } from '@/types/sales'
import { formatCurrency, formatNumber, formatDate, getGrupoColor } from '@/lib/formatters'
import { getJpClass, getJpClassBadgeStyle } from '@/lib/jp-class'
import { Badge } from '@/components/ui/badge'
import { Database, FileText } from 'lucide-react'
import { ColumnDef, DEFAULT_COLUMN_WIDTHS } from './VendasRelatorioTable'

export interface VendasRelatorioRowProps {
  item: VendaConsolidada & { itens_qtd?: number }
  itemIdx: number
  nfeKey: string
  displayNfe: string
  groupItemsLength: number
  hasMultiple: boolean
  isCollapsed: boolean
  isGroupedByNfe: boolean
  columns: ColumnDef[]
  columnWidths: Record<string, number>
  expandedCols: Record<string, boolean>
  onToggleCollapseNfe: (nfeKey: string) => void
}

function VendasRelatorioRowComponent({
  item,
  itemIdx,
  nfeKey,
  displayNfe,
  groupItemsLength,
  hasMultiple,
  isCollapsed,
  isGroupedByNfe,
  columns,
  columnWidths,
  expandedCols,
  onToggleCollapseNfe,
}: VendasRelatorioRowProps) {
  const isFirstOfGroup = itemIdx === 0
  const isGrouped = hasMultiple

  return (
    <tr
      className={`transition-colors group ${
        isGrouped && isFirstOfGroup && isCollapsed
          ? 'bg-cyan-50/30 font-medium'
          : isGrouped && !isCollapsed
            ? 'hover:bg-slate-50/80'
            : 'hover:bg-cyan-50/10'
      }`}
    >
      {/* Botão de Expandir / Colapsar Grupo NFe */}
      <td className="py-2 px-2 text-center align-middle border-r border-slate-100 w-9 min-w-[36px]">
        {isGrouped && isFirstOfGroup ? (
          <button
            type="button"
            onClick={() => onToggleCollapseNfe(nfeKey)}
            className="p-1 rounded hover:bg-cyan-100 text-[#0B6E99] focus:outline-hidden transition-colors"
            title={
              isCollapsed
                ? `Expandir NF ${displayNfe} (${groupItemsLength} itens)`
                : `Colapsar NF ${displayNfe}`
            }
          >
            {isCollapsed ? (
              <ChevronRightIcon className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>
        ) : isGrouped ? (
          <span className="inline-block w-2 h-0.5 bg-slate-200 rounded-full mx-auto" />
        ) : null}
      </td>

      {/* Renderização de cada coluna na ordem exata solicitada */}
      {columns.map((col) => {
        const isExpanded = !!expandedCols[col.key]
        const width = columnWidths[col.key] || DEFAULT_COLUMN_WIDTHS[col.key] || 150
        const cellStyle: React.CSSProperties = {
          width: isExpanded ? 'auto' : `${width}px`,
          minWidth: `${Math.min(width, 80)}px`,
          maxWidth: isExpanded ? 'none' : `${Math.max(width, 260)}px`,
        }

        switch (col.key) {
          // 1. Data de Lançamento
          case 'data_lancamento':
            return (
              <td
                key={col.key}
                style={cellStyle}
                className="py-2 px-3 font-medium text-slate-700 border-r border-slate-100"
              >
                <div
                  className={isExpanded ? '' : 'truncate'}
                  title={formatDate(item.data_lancamento)}
                >
                  {formatDate(item.data_lancamento)}
                </div>
              </td>
            )

          // 2. Nr. NF
          case 'numero_nfe':
            return (
              <td
                key={col.key}
                style={cellStyle}
                className="py-2 px-3 font-mono font-semibold text-slate-900 border-r border-slate-100"
              >
                <div
                  className={`flex items-center gap-1.5 ${isExpanded ? '' : 'truncate'}`}
                  title={item.numero_nfe || '-'}
                >
                  <span className="truncate">{item.numero_nfe || '-'}</span>
                  {isGrouped && isFirstOfGroup && isCollapsed && (
                    <Badge
                      variant="secondary"
                      className="text-[9px] px-1.5 py-0 h-4 bg-cyan-100 text-cyan-900 hover:bg-cyan-100 border-none font-sans font-bold shrink-0"
                    >
                      +{groupItemsLength - 1}
                    </Badge>
                  )}
                  {isGroupedByNfe && item.itens_qtd && item.itens_qtd > 1 ? (
                    <Badge
                      variant="secondary"
                      className="text-[9px] px-1.5 py-0 h-4 bg-cyan-100 text-cyan-900 border-none font-sans font-bold shrink-0"
                      title={`${item.itens_qtd} itens na Nota Fiscal`}
                    >
                      +{item.itens_qtd - 1}
                    </Badge>
                  ) : isGroupedByNfe ? (
                    <Badge
                      variant="outline"
                      className="text-[8px] px-1 py-0 h-3.5 bg-slate-100 text-slate-600 border-slate-200 shrink-0 font-sans"
                    >
                      NF
                    </Badge>
                  ) : null}
                </div>
              </td>
            )

          // 3. Tipo de Documento
          case 'tipo_documento':
            return (
              <td
                key={col.key}
                style={cellStyle}
                className="py-2 px-3 text-slate-700 border-r border-slate-100"
              >
                <div
                  className={isExpanded ? 'whitespace-normal break-words' : 'truncate'}
                  title={item.tipo_documento || '-'}
                >
                  {item.tipo_documento || '-'}
                </div>
              </td>
            )

          // 4. Cliente (Nome do Cliente)
          case 'nome_cliente':
            return (
              <td
                key={col.key}
                style={cellStyle}
                className="py-2 px-3 font-semibold text-slate-900 border-r border-slate-100"
              >
                <div
                  className={isExpanded ? 'whitespace-normal break-words' : 'truncate'}
                  title={item.nome_cliente || '-'}
                >
                  {item.nome_cliente || '-'}
                </div>
              </td>
            )

          // 5. Vendedor (Vendedor > Cliente ou Nome Vendedor)
          case 'vendedor_cliente':
            return (
              <td
                key={col.key}
                style={cellStyle}
                className="py-2 px-3 text-slate-900 font-medium bg-slate-50/40 border-r border-slate-100"
              >
                <div
                  className={isExpanded ? 'whitespace-normal break-words' : 'truncate'}
                  title={item.vendedor_cliente || item.nome_vendedor || '-'}
                >
                  {item.vendedor_cliente || item.nome_vendedor || '-'}
                </div>
              </td>
            )

          // 6. Item (Descrição do Item com Cód. opcional)
          case 'descricao_item':
            return (
              <td
                key={col.key}
                style={cellStyle}
                className="py-2 px-3 text-slate-700 border-r border-slate-100"
              >
                <div
                  className={isExpanded ? 'whitespace-normal break-words' : 'truncate'}
                  title={item.descricao_item || item.codigo_item || '-'}
                >
                  {item.descricao_item || (item.codigo_item ? `Cód. ${item.codigo_item}` : '-')}
                </div>
              </td>
            )

          // JP-Class derivado via getJpClass sobre o Grupo (grupo_item)
          case 'jp_class': {
            const jpClassVal = getJpClass(item.grupo_item)
            const badgeStyle = getJpClassBadgeStyle(jpClassVal)
            return (
              <td key={col.key} style={cellStyle} className="py-2 px-3 border-r border-slate-100">
                {jpClassVal ? (
                  <Badge
                    variant="outline"
                    className={`text-[10px] px-2 py-0.5 truncate max-w-full ${badgeStyle.className}`}
                    title={jpClassVal}
                  >
                    {jpClassVal}
                  </Badge>
                ) : (
                  <span className="text-slate-400">-</span>
                )}
              </td>
            )
          }

          // 7. Qtde (Quantidade)
          case 'quantidade':
            return (
              <td
                key={col.key}
                style={cellStyle}
                className="py-2 px-3 text-center font-medium text-slate-800 border-r border-slate-100"
              >
                <div className={isExpanded ? '' : 'truncate'}>{formatNumber(item.quantidade)}</div>
              </td>
            )

          // 8. Grupo (Grupo do Item)
          case 'grupo_item':
            return (
              <td key={col.key} style={cellStyle} className="py-2 px-3 border-r border-slate-100">
                {item.grupo_item ? (
                  <Badge
                    className="text-[10px] font-semibold text-white px-2 py-0.5 truncate max-w-full"
                    style={{
                      backgroundColor: getGrupoColor(item.grupo_item),
                    }}
                    title={item.grupo_item}
                  >
                    {item.grupo_item}
                  </Badge>
                ) : (
                  <span className="text-slate-400">-</span>
                )}
              </td>
            )

          // 9. Total da Linha (Valor Mercadoria)
          case 'total_linha':
            return (
              <td
                key={col.key}
                style={cellStyle}
                className="py-2 px-3 text-right font-bold text-slate-900 tabular-nums bg-cyan-50/20 border-r border-slate-100"
              >
                <div className={isExpanded ? '' : 'truncate'}>
                  {formatCurrency(item.total_linha)}
                </div>
              </td>
            )

          // 10. Utilização
          case 'utilizacao':
            return (
              <td
                key={col.key}
                style={cellStyle}
                className="py-2 px-3 text-slate-700 border-r border-slate-100"
              >
                <div
                  className={isExpanded ? 'whitespace-normal break-words' : 'truncate'}
                  title={item.utilizacao || '-'}
                >
                  {item.utilizacao || '-'}
                </div>
              </td>
            )

          // Colunas complementares
          case 'numero_sap':
            return (
              <td
                key={col.key}
                style={cellStyle}
                className="py-2 px-3 font-mono text-slate-600 border-r border-slate-100"
              >
                <div className={isExpanded ? '' : 'truncate'} title={item.numero_sap || '-'}>
                  {item.numero_sap || '-'}
                </div>
              </td>
            )
          case 'codigo_cliente':
            return (
              <td
                key={col.key}
                style={cellStyle}
                className="py-2 px-3 font-mono text-slate-700 border-r border-slate-100"
              >
                <div className={isExpanded ? '' : 'truncate'} title={item.codigo_cliente || '-'}>
                  {item.codigo_cliente || '-'}
                </div>
              </td>
            )
          case 'nome_vendedor':
            return (
              <td
                key={col.key}
                style={cellStyle}
                className="py-2 px-3 text-slate-700 border-r border-slate-100"
              >
                <div
                  className={isExpanded ? 'whitespace-normal break-words' : 'truncate'}
                  title={item.nome_vendedor || '-'}
                >
                  {item.nome_vendedor || '-'}
                </div>
              </td>
            )
          case 'codigo_item':
            return (
              <td
                key={col.key}
                style={cellStyle}
                className="py-2 px-3 font-mono font-semibold text-slate-900 border-r border-slate-100"
              >
                <div className={isExpanded ? '' : 'truncate'} title={item.codigo_item || '-'}>
                  {item.codigo_item || '-'}
                </div>
              </td>
            )
          case 'preco_item':
            return (
              <td
                key={col.key}
                style={cellStyle}
                className="py-2 px-3 text-right font-medium text-slate-700 tabular-nums border-r border-slate-100"
              >
                <div className={isExpanded ? '' : 'truncate'}>
                  {formatCurrency(item.preco_item)}
                </div>
              </td>
            )
          case 'preco_unitario':
            return (
              <td
                key={col.key}
                style={cellStyle}
                className="py-2 px-3 text-right font-medium text-slate-700 tabular-nums border-r border-slate-100"
              >
                <div className={isExpanded ? '' : 'truncate'}>
                  {formatCurrency(item.preco_unitario)}
                </div>
              </td>
            )
          case 'total_nf_sem_frete':
            return (
              <td
                key={col.key}
                style={cellStyle}
                className="py-2 px-3 text-right font-medium text-slate-700 tabular-nums border-r border-slate-100"
              >
                <div className={isExpanded ? '' : 'truncate'}>
                  {formatCurrency(item.total_nf_sem_frete)}
                </div>
              </td>
            )
          case 'valor_liquido':
            return (
              <td
                key={col.key}
                style={cellStyle}
                className="py-2 px-3 text-right font-bold text-teal-700 tabular-nums border-r border-slate-100"
              >
                <div className={isExpanded ? '' : 'truncate'}>
                  {formatCurrency(item.valor_liquido)}
                </div>
              </td>
            )
          case 'cmv':
            return (
              <td
                key={col.key}
                style={cellStyle}
                className="py-2 px-3 text-right text-slate-700 tabular-nums border-r border-slate-100"
              >
                <div className={isExpanded ? '' : 'truncate'}>{formatCurrency(item.cmv)}</div>
              </td>
            )
          case 'lucro_bruto':
            return (
              <td
                key={col.key}
                style={cellStyle}
                className="py-2 px-3 text-right font-semibold text-slate-900 tabular-nums border-r border-slate-100"
              >
                <div className={isExpanded ? '' : 'truncate'}>
                  {formatCurrency(item.lucro_bruto)}
                </div>
              </td>
            )
          case 'margem_lucro':
            return (
              <td
                key={col.key}
                style={cellStyle}
                className="py-2 px-3 text-right font-medium text-slate-700 tabular-nums border-r border-slate-100"
              >
                <div className={isExpanded ? '' : 'truncate'}>
                  {item.margem_lucro !== undefined && item.margem_lucro !== null
                    ? `${item.margem_lucro.toFixed(2)}%`
                    : '-'}
                </div>
              </td>
            )
          case 'uf':
            return (
              <td
                key={col.key}
                style={cellStyle}
                className="py-2 px-3 text-center border-r border-slate-100"
              >
                {item.uf ? (
                  <Badge
                    variant="outline"
                    className="text-[10px] font-mono font-semibold bg-slate-50 text-slate-700 border-slate-200 px-1.5 py-0"
                  >
                    {item.uf}
                  </Badge>
                ) : (
                  <span className="text-slate-400">-</span>
                )}
              </td>
            )
          case 'cidade':
            return (
              <td
                key={col.key}
                style={cellStyle}
                className="py-2 px-3 text-slate-700 border-r border-slate-100"
              >
                <div
                  className={isExpanded ? 'whitespace-normal break-words' : 'truncate'}
                  title={item.cidade || '-'}
                >
                  {item.cidade || '-'}
                </div>
              </td>
            )
          case 'canal':
            return (
              <td
                key={col.key}
                style={cellStyle}
                className="py-2 px-3 text-slate-700 border-r border-slate-100"
              >
                <div
                  className={isExpanded ? 'whitespace-normal break-words' : 'truncate'}
                  title={item.canal || '-'}
                >
                  {item.canal || '-'}
                </div>
              </td>
            )
          case 'status_cadastro':
            return (
              <td
                key={col.key}
                style={cellStyle}
                className="py-2 px-3 text-slate-700 border-r border-slate-100"
              >
                <div className={isExpanded ? '' : 'truncate'} title={item.status_cadastro || '-'}>
                  {item.status_cadastro ? (
                    <Badge
                      variant="outline"
                      className="text-[10px] font-medium bg-slate-50 text-slate-700 border-slate-200"
                    >
                      {item.status_cadastro}
                    </Badge>
                  ) : (
                    '-'
                  )}
                </div>
              </td>
            )
          case 'tipo_cliente': {
            const tc = (item.tipo_cliente || '').trim()
            const displayVal = tc && tc !== '-' ? tc : '-'
            return (
              <td
                key={col.key}
                style={cellStyle}
                className="py-2 px-3 text-slate-700 border-r border-slate-100"
              >
                <div
                  className={isExpanded ? 'whitespace-normal break-words' : 'truncate'}
                  title={displayVal}
                >
                  {displayVal !== '-' ? (
                    <Badge
                      variant="outline"
                      className="text-[10px] font-medium bg-indigo-50 text-indigo-700 border-indigo-200"
                    >
                      {displayVal}
                    </Badge>
                  ) : (
                    <span className="text-slate-400">-</span>
                  )}
                </div>
              </td>
            )
          }
          case 'tipo_pn':
            return (
              <td
                key={col.key}
                style={cellStyle}
                className="py-2 px-3 text-slate-700 border-r border-slate-100"
              >
                <div
                  className={isExpanded ? 'whitespace-normal break-words' : 'truncate'}
                  title={item.tipo_pn || '-'}
                >
                  {item.tipo_pn || '-'}
                </div>
              </td>
            )
          case 'origem':
            return (
              <td key={col.key} style={cellStyle} className="py-2 px-3 border-r border-slate-100">
                {item.tem_netsales && item.tem_racnew ? (
                  <Badge
                    variant="outline"
                    className="text-[10px] font-semibold bg-emerald-50 text-emerald-700 border-emerald-200 px-2 py-0.5 inline-flex items-center gap-1"
                  >
                    Consolidado
                  </Badge>
                ) : item.tem_netsales ? (
                  <Badge
                    variant="outline"
                    className="text-[10px] font-semibold bg-indigo-50/70 text-indigo-700 border-indigo-200/80 px-2 py-0.5 inline-flex items-center gap-1"
                  >
                    <Database className="w-3 h-3 text-indigo-600" />
                    <span>NetSales</span>
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="text-[10px] font-semibold bg-cyan-100 text-cyan-800 border-cyan-300 px-2 py-0.5 inline-flex items-center gap-1"
                  >
                    <FileText className="w-3 h-3 text-cyan-700" />
                    <span>RacNew</span>
                  </Badge>
                )}
              </td>
            )
          default:
            return (
              <td
                key={col.key}
                style={cellStyle}
                className="py-2 px-3 text-slate-700 border-r border-slate-100"
              >
                <div className={isExpanded ? 'whitespace-normal break-words' : 'truncate'}>
                  {String((item as unknown as Record<string, unknown>)[col.key] ?? '-')}
                </div>
              </td>
            )
        }
      })}
    </tr>
  )
}

export const VendasRelatorioRow = React.memo(VendasRelatorioRowComponent)
