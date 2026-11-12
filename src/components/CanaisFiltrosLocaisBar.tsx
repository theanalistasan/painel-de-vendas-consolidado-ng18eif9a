import { useMemo } from 'react'
import { RotateCcw } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { MESES_PT_BR } from '@/lib/formatters'
import { type CanaisFiltroLocal, EMPTY_CANAIS_FILTRO_LOCAL } from '@/lib/filter-persistence'
import type { FilterState } from '@/types/sales'

/**
 * Monta os filtros EFETIVOS da Visão Canais aplicando a precedência:
 * filtro LOCAL preenchido SOBREPÕE o valor do Filtro Global correspondente;
 * campo local vazio ('') = segue o Filtro Global (mesma regra do JP-Class).
 */
export function buildCanaisFiltrosEfetivos(
  globais: FilterState,
  locais: CanaisFiltroLocal,
): FilterState {
  const efetivos: FilterState = { ...globais }
  if (locais.ano) efetivos.ano = [locais.ano]
  if (locais.mes) efetivos.mes = [locais.mes]
  if (locais.dataDe) efetivos.dataDe = locais.dataDe
  if (locais.dataAte) efetivos.dataAte = locais.dataAte
  if (locais.numeroNfe) efetivos.numeroNfe = locais.numeroNfe
  if (locais.numeroPedido) efetivos.numeroPedido = locais.numeroPedido
  return efetivos
}

/** Algum filtro local da Visão Canais está preenchido? */
export function hasCanaisFiltrosLocais(locais: CanaisFiltroLocal): boolean {
  return (
    !!locais.ano ||
    !!locais.mes ||
    !!locais.dataDe ||
    !!locais.dataAte ||
    !!locais.numeroNfe ||
    !!locais.numeroPedido
  )
}

const selectClass =
  'h-8 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-800 shadow-2xs focus:border-[#0B6E99] focus:outline-none focus:ring-1 focus:ring-[#0B6E99]/30'

const inputClass =
  'h-8 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-800 shadow-2xs placeholder:text-slate-400 placeholder:font-normal focus:border-[#0B6E99] focus:outline-none focus:ring-1 focus:ring-[#0B6E99]/30'

interface CanaisFiltrosLocaisBarProps {
  filtros: CanaisFiltroLocal
  onChange: (next: CanaisFiltroLocal) => void
  onClear: () => void
  /** Anos disponíveis (janela dinâmica da base); fallback: ano corrente − 2 */
  anosDisponiveis?: number[]
  disabled?: boolean
}

/**
 * Barra de filtros LOCAIS da Visão Canais: Ano, Mês, Data (faixa), Nota Fiscal
 * e Pedido — no mesmo molde dos filtros locais do JP-Class (selects no topo).
 * Filtro preenchido sobrepõe o Filtro Global; vazio = segue o global.
 * Anos e meses vêm SEMPRE da base ativa: sem fallback fixo de anos; meses em
 * ordem do calendário (Janeiro→Dezembro) com "Todos" primeiro.
 */
export function CanaisFiltrosLocaisBar({
  filtros,
  onChange,
  onClear,
  anosDisponiveis,
  disabled,
}: CanaisFiltrosLocaisBarProps) {
  // Sem fallback hardcoded: com a base zerada o select de Ano fica só com
  // "Global (do painel)" — opções refletem EXCLUSIVAMENTE a base ativa.
  const anos = useMemo(
    () => (anosDisponiveis ? [...anosDisponiveis].sort((a, b) => b - a) : []),
    [anosDisponiveis],
  )

  const handleField = (campo: keyof CanaisFiltroLocal, valor: string) => {
    onChange({ ...filtros, [campo]: valor })
  }

  return (
    <Card className="rounded-xl border border-cyan-200 bg-cyan-50/40 shadow-xs">
      <CardContent className="p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label className="text-[11px] font-bold text-[#0B6E99] uppercase tracking-wide flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#0B6E99]" />
            Filtros de Período e Documento (locais)
            {hasCanaisFiltrosLocais(filtros) && (
              <Badge className="bg-[#0B6E99] text-white text-[10px] font-bold normal-case">
                filtro local ativo — sobrepõe os Filtros Globais
              </Badge>
            )}
          </Label>
          {hasCanaisFiltrosLocais(filtros) && (
            <Button
              variant="outline"
              size="sm"
              onClick={onClear}
              disabled={disabled}
              className="border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-bold shrink-0 h-8 text-xs"
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
              Limpar Filtros Locais
            </Button>
          )}
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
            <span>Ano</span>
            <select
              value={filtros.ano}
              onChange={(e) => handleField('ano', e.target.value)}
              disabled={disabled}
              className={selectClass}
            >
              <option value="">Global (do painel)</option>
              {anos.map((a) => (
                <option key={a} value={String(a)}>
                  {a}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
            <span>Mês</span>
            <select
              value={filtros.mes}
              onChange={(e) => handleField('mes', e.target.value)}
              disabled={disabled}
              className={selectClass}
            >
              <option value="">Todos (global)</option>
              {MESES_PT_BR.map((nome, i) => (
                <option key={i + 1} value={String(i + 1)}>
                  {nome}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
            <span>Data de</span>
            <input
              type="date"
              value={filtros.dataDe}
              onChange={(e) => handleField('dataDe', e.target.value)}
              disabled={disabled}
              className={selectClass}
            />
          </label>

          <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
            <span>Data até</span>
            <input
              type="date"
              value={filtros.dataAte}
              onChange={(e) => handleField('dataAte', e.target.value)}
              disabled={disabled}
              className={selectClass}
            />
          </label>

          <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
            <span>Nota Fiscal</span>
            <input
              type="text"
              value={filtros.numeroNfe}
              onChange={(e) => handleField('numeroNfe', e.target.value)}
              disabled={disabled}
              placeholder="Nº da NF"
              className={`${inputClass} w-36`}
            />
          </label>

          <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
            <span>Pedido</span>
            <input
              type="text"
              value={filtros.numeroPedido}
              onChange={(e) => handleField('numeroPedido', e.target.value)}
              disabled={disabled}
              placeholder="Nº do pedido"
              className={`${inputClass} w-36`}
            />
          </label>
        </div>

        <p className="text-[11px] text-slate-500 font-medium">
          Campo preenchido sobrepõe o Filtro Global correspondente nesta visão; campo vazio segue o
          global. Nota Fiscal e Pedido buscam por número (contém).
        </p>
      </CardContent>
    </Card>
  )
}
