import React, { useState, useRef, useEffect, useMemo } from 'react'
import { Check, ChevronDown, X, Filter, Layers } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { FilterState } from '@/types/sales'
import { DEVOLUCAO_TIPOS } from '@/types/sales'
import { MESES_PT_BR, nomeMes } from '@/lib/formatters'
import { cn } from '@/lib/utils'

interface FilterBarProps {
  filters: FilterState
  setFilters: React.Dispatch<React.SetStateAction<FilterState>>
  options: {
    vendedorCliente: string[]
    vendedor: string[]
    grupoItem: string[]
    estado: string[]
    utilizacao: string[]
    tipoDocumento: string[]
    anos: number[]
    meses: number[]
    dias: number[]
  }
  showSearch?: boolean
  onApplyFilters?: (appliedFilters: FilterState) => void
}

// Reusable MultiSelect Dropdown
function MultiSelectDropdown({
  label,
  options,
  selected,
  onChange,
  placeholder,
  highlight = false,
}: {
  label: string
  options: string[]
  selected: string[]
  onChange: (values: string[]) => void
  placeholder: string
  highlight?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Garantir remoção permanente de "-Nenhum vendedor / comprador-", strings vazias/nulas e obter valores ÚNICOS
  const cleanOptions = useMemo(() => {
    const set = new Set<string>()
    for (const opt of options) {
      if (!opt) continue
      const trimmed = opt.trim()
      if (!trimmed) continue
      if (
        trimmed === '-Nenhum vendedor / comprador-' ||
        trimmed.startsWith('-Nenhum vendedor / comprador-')
      ) {
        continue
      }
      set.add(trimmed)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [options])

  const filteredOptions = useMemo(() => {
    if (!search) return cleanOptions
    const s = search.toLowerCase()
    return cleanOptions.filter((opt) => opt.toLowerCase().includes(s))
  }, [cleanOptions, search])

  const toggleOption = (option: string) => {
    if (selected.includes(option)) {
      onChange(selected.filter((item) => item !== option))
    } else {
      onChange([...selected, option])
    }
  }

  const selectAll = () => {
    onChange(filteredOptions)
  }

  const clearAll = () => {
    onChange([])
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          'flex items-center justify-between w-full h-10 px-3 py-2 text-xs rounded-lg border bg-white transition-colors text-left shadow-2xs focus:outline-hidden focus:ring-2 focus:ring-indigo-500/40',
          selected.length > 0
            ? 'border-indigo-400 font-medium text-slate-900 bg-indigo-50/20'
            : 'border-slate-200 text-slate-600 hover:border-slate-300',
          highlight && 'border-indigo-500 ring-1 ring-indigo-500/30',
        )}
      >
        <div className="flex items-center gap-1.5 truncate pr-2">
          <span className="font-semibold text-slate-700">{label}:</span>
          {selected.length === 0 ? (
            <span className="text-slate-400 font-normal">{placeholder}</span>
          ) : (
            <span className="text-indigo-700 font-medium truncate">
              {selected.length === 1 ? selected[0] : `${selected.length} selecionados`}
            </span>
          )}
        </div>
        <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1.5 w-72 max-w-[90vw] bg-white border border-slate-200 rounded-xl shadow-xl z-50 p-2 text-xs animate-in fade-in-50 zoom-in-95 duration-150">
          <div className="mb-2">
            <Input
              type="text"
              placeholder={`Pesquisar ${label.toLowerCase()}...`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 text-xs rounded-md border-slate-200"
              autoFocus
            />
          </div>

          <div className="flex items-center justify-between px-1 py-1 border-b border-slate-100 mb-1 text-[11px] text-slate-500">
            <button
              type="button"
              onClick={selectAll}
              className="text-indigo-600 hover:underline font-medium"
            >
              Selecionar todos
            </button>
            <button
              type="button"
              onClick={clearAll}
              className="text-slate-500 hover:text-slate-800"
            >
              Limpar
            </button>
          </div>

          <div className="max-h-56 overflow-y-auto space-y-0.5">
            {filteredOptions.length === 0 ? (
              <p className="p-2 text-center text-slate-400 text-xs">Nenhum resultado</p>
            ) : (
              filteredOptions.map((option) => {
                const isSelected = selected.includes(option)
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => toggleOption(option)}
                    className={cn(
                      'flex items-center justify-between w-full px-2.5 py-1.5 rounded-md text-left transition-colors',
                      isSelected
                        ? 'bg-indigo-50 text-indigo-900 font-medium'
                        : 'text-slate-700 hover:bg-slate-100',
                    )}
                  >
                    <span className="truncate pr-2">{option}</span>
                    <div
                      className={cn(
                        'w-4 h-4 rounded-sm border flex items-center justify-center shrink-0',
                        isSelected
                          ? 'bg-indigo-600 border-indigo-600 text-white'
                          : 'border-slate-300 bg-white',
                      )}
                    >
                      {isSelected && <Check className="w-3 h-3" />}
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}

interface ActivePill {
  id: string
  label: string
  type: keyof FilterState
  value?: string
  bgClass: string
}

export default function FilterBar({
  filters,
  setFilters,
  options,
  showSearch = false,
  onApplyFilters,
}: FilterBarProps) {
  const [collapsed, setCollapsed] = useState(false)

  // Estado local para edições pendentes antes do botão "Aplicar Filtros"
  const [localFilters, setLocalFilters] = useState<FilterState>(filters)

  // Sincroniza estado local se o componente pai atualizar `filters` externamente
  useEffect(() => {
    setLocalFilters(filters)
  }, [filters])

  // Identifica se há alterações pendentes
  const hasPendingChanges = useMemo(() => {
    return JSON.stringify(localFilters) !== JSON.stringify(filters)
  }, [localFilters, filters])

  // Contagem total de itens/valores ativos nos filtros aplicados atualmente
  const activeFiltersCount = useMemo(() => {
    return (
      (filters.dataDe ? 1 : 0) +
      (filters.dataAte ? 1 : 0) +
      filters.vendedorCliente.length +
      filters.vendedor.length +
      filters.grupoItem.length +
      filters.estado.length +
      filters.utilizacao.length +
      filters.tipoDocumento.length +
      (filters.search ? 1 : 0) +
      (filters.ano ? 1 : 0) +
      (filters.mes ? 1 : 0) +
      (filters.dia ? 1 : 0) +
      (filters.tipoDevolucao ? 1 : 0)
    )
  }, [filters])

  const handleApply = () => {
    setFilters(localFilters)
    if (onApplyFilters) {
      onApplyFilters(localFilters)
    }
  }

  const clearAllFilters = () => {
    const emptyState: FilterState = {
      dataDe: '',
      dataAte: '',
      vendedorCliente: [],
      vendedor: [],
      grupoItem: [],
      estado: [],
      utilizacao: [],
      tipoDocumento: [],
      search: '',
      ano: '',
      mes: '',
      dia: '',
      tipoDevolucao: '',
    }
    setLocalFilters(emptyState)
    setFilters(emptyState)
    if (onApplyFilters) {
      onApplyFilters(emptyState)
    }
  }

  const removeSingleFilter = (type: keyof FilterState, value?: string) => {
    let nextState: FilterState = { ...filters }

    if (
      type === 'dataDe' ||
      type === 'dataAte' ||
      type === 'search' ||
      type === 'ano' ||
      type === 'mes' ||
      type === 'dia' ||
      type === 'tipoDevolucao'
    ) {
      nextState = { ...nextState, [type]: '' }
    } else if (
      value &&
      (type === 'vendedorCliente' ||
        type === 'vendedor' ||
        type === 'grupoItem' ||
        type === 'estado' ||
        type === 'utilizacao' ||
        type === 'tipoDocumento')
    ) {
      nextState = {
        ...nextState,
        [type]: (filters[type] as string[]).filter((item) => item !== value),
      }
    }

    setLocalFilters(nextState)
    setFilters(nextState)
    if (onApplyFilters) {
      onApplyFilters(nextState)
    }
  }

  // Gera lista completa de pílulas para visualização contida (máx 5 pílulas)
  const allActivePills = useMemo<ActivePill[]>(() => {
    const list: ActivePill[] = []

    if (filters.dataDe) {
      list.push({
        id: 'dataDe',
        label: `De: ${filters.dataDe}`,
        type: 'dataDe',
        bgClass: 'bg-slate-50 border-slate-200 text-slate-700',
      })
    }
    if (filters.dataAte) {
      list.push({
        id: 'dataAte',
        label: `Até: ${filters.dataAte}`,
        type: 'dataAte',
        bgClass: 'bg-slate-50 border-slate-200 text-slate-700',
      })
    }
    if (filters.ano) {
      list.push({
        id: 'ano',
        label: `Ano: ${filters.ano}`,
        type: 'ano',
        bgClass: 'bg-indigo-50 border-indigo-200 text-indigo-900',
      })
    }
    if (filters.mes) {
      list.push({
        id: 'mes',
        label: `Mês: ${nomeMes(Number(filters.mes))}`,
        type: 'mes',
        bgClass: 'bg-indigo-50 border-indigo-200 text-indigo-900',
      })
    }
    if (filters.dia) {
      list.push({
        id: 'dia',
        label: `Dia: ${String(filters.dia).padStart(2, '0')}`,
        type: 'dia',
        bgClass: 'bg-indigo-50 border-indigo-200 text-indigo-900',
      })
    }

    filters.vendedorCliente.forEach((item) => {
      list.push({
        id: `vendedorCliente-${item}`,
        label: item,
        type: 'vendedorCliente',
        value: item,
        bgClass: 'bg-indigo-50 border-indigo-200 text-indigo-900',
      })
    })

    filters.vendedor.forEach((item) => {
      list.push({
        id: `vendedor-${item}`,
        label: `Vendedor: ${item}`,
        type: 'vendedor',
        value: item,
        bgClass: 'bg-slate-50 border-slate-200 text-slate-700',
      })
    })

    filters.grupoItem.forEach((item) => {
      list.push({
        id: `grupoItem-${item}`,
        label: `Grupo: ${item}`,
        type: 'grupoItem',
        value: item,
        bgClass: 'bg-slate-50 border-slate-200 text-slate-700',
      })
    })

    filters.estado.forEach((item) => {
      list.push({
        id: `estado-${item}`,
        label: `UF: ${item}`,
        type: 'estado',
        value: item,
        bgClass: 'bg-slate-50 border-slate-200 text-slate-700',
      })
    })

    filters.utilizacao.forEach((item) => {
      list.push({
        id: `utilizacao-${item}`,
        label: `Uso: ${item}`,
        type: 'utilizacao',
        value: item,
        bgClass: 'bg-slate-50 border-slate-200 text-slate-700',
      })
    })

    filters.tipoDocumento.forEach((item) => {
      list.push({
        id: `tipoDocumento-${item}`,
        label: `Doc: ${item}`,
        type: 'tipoDocumento',
        value: item,
        bgClass: 'bg-indigo-50 border-indigo-200 text-indigo-900',
      })
    })

    if (filters.search) {
      list.push({
        id: 'search',
        label: `Busca: "${filters.search}"`,
        type: 'search',
        bgClass: 'bg-amber-50 border-amber-200 text-amber-900',
      })
    }

    if (filters.tipoDevolucao) {
      list.push({
        id: 'tipoDevolucao',
        label: `Devolução: ${filters.tipoDevolucao}`,
        type: 'tipoDevolucao',
        bgClass: 'bg-rose-50 border-rose-200 text-rose-900',
      })
    }

    return list
  }, [filters])

  const MAX_VISIBLE_PILLS = 5
  const visiblePills = allActivePills.slice(0, MAX_VISIBLE_PILLS)
  const remainingPills = allActivePills.slice(MAX_VISIBLE_PILLS)

  return (
    <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs p-4 mb-6 transition-all">
      {/* Header com Título, Contador Autoridade de Filtros Ativos e Ações */}
      <div className="flex flex-wrap items-center justify-between pb-3 border-b border-slate-100 gap-2">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600">
            <Filter className="w-4 h-4" />
          </div>
          <div>
            <span className="text-sm font-semibold text-slate-900">Filtros Globais</span>
            {activeFiltersCount > 0 && (
              <Badge
                variant="secondary"
                className="ml-2 bg-indigo-100 text-indigo-800 text-[11px] font-semibold"
              >
                {activeFiltersCount} ativo{activeFiltersCount > 1 ? 's' : ''}
              </Badge>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Botão Aplicar Filtros com destaque visual quando há mudanças pendentes */}
          <Button
            type="button"
            size="sm"
            onClick={handleApply}
            className={cn(
              'h-8 px-4 text-xs font-medium rounded-lg transition-all',
              hasPendingChanges
                ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-md ring-2 ring-indigo-500/30 animate-pulse'
                : 'bg-slate-900 hover:bg-slate-800 text-white',
            )}
          >
            Aplicar Filtros
            {hasPendingChanges && (
              <span className="ml-1.5 text-[10px] bg-white/20 px-1 rounded">●</span>
            )}
          </Button>

          {activeFiltersCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearAllFilters}
              className="text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 h-8 px-2.5 rounded-lg"
            >
              <X className="w-3.5 h-3.5 mr-1" />
              Limpar filtros
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCollapsed(!collapsed)}
            className="text-xs text-slate-600 lg:hidden h-8"
          >
            {collapsed ? 'Expandir' : 'Recolher'}
          </Button>
        </div>
      </div>

      {/* Grid dos Filtros */}
      <div
        className={cn(
          'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 pt-3',
          collapsed && 'hidden lg:grid',
        )}
      >
        {/* Data De / Até */}
        <div className="sm:col-span-2 grid grid-cols-2 gap-2">
          <div>
            <Label className="text-[11px] font-semibold text-slate-500 mb-1 block">
              Data de Lançamento (De)
            </Label>
            <Input
              type="date"
              value={localFilters.dataDe}
              onChange={(e) => setLocalFilters((prev) => ({ ...prev, dataDe: e.target.value }))}
              className="h-10 text-xs rounded-lg border-slate-200"
            />
          </div>
          <div>
            <Label className="text-[11px] font-semibold text-slate-500 mb-1 block">
              Data de Lançamento (Até)
            </Label>
            <Input
              type="date"
              value={localFilters.dataAte}
              onChange={(e) => setLocalFilters((prev) => ({ ...prev, dataAte: e.target.value }))}
              className="h-10 text-xs rounded-lg border-slate-200"
            />
          </div>
        </div>

        {/* Ano / Mês / Dia */}
        <div className="grid grid-cols-3 gap-2">
          <div>
            <Label className="text-[11px] font-semibold text-slate-500 mb-1 block">Ano</Label>
            <Select
              value={localFilters.ano || '__all'}
              onValueChange={(v) =>
                setLocalFilters((prev) => ({ ...prev, ano: v === '__all' ? '' : v }))
              }
            >
              <SelectTrigger
                className={cn(
                  'h-10 text-xs rounded-lg',
                  localFilters.ano
                    ? 'border-indigo-400 font-medium text-slate-900 bg-indigo-50/20'
                    : 'border-slate-200 text-slate-600',
                )}
              >
                <SelectValue placeholder="Ano" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all" className="text-xs">
                  Todos
                </SelectItem>
                {options.anos.map((ano) => (
                  <SelectItem key={ano} value={String(ano)} className="text-xs">
                    {ano}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[11px] font-semibold text-slate-500 mb-1 block">Mês</Label>
            <Select
              value={localFilters.mes || '__all'}
              onValueChange={(v) =>
                setLocalFilters((prev) => ({ ...prev, mes: v === '__all' ? '' : v }))
              }
            >
              <SelectTrigger
                className={cn(
                  'h-10 text-xs rounded-lg',
                  localFilters.mes
                    ? 'border-indigo-400 font-medium text-slate-900 bg-indigo-50/20'
                    : 'border-slate-200 text-slate-600',
                )}
              >
                <SelectValue placeholder="Mês" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all" className="text-xs">
                  Todos
                </SelectItem>
                {options.meses.map((m) => (
                  <SelectItem key={m} value={String(m)} className="text-xs">
                    {MESES_PT_BR[m - 1]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[11px] font-semibold text-slate-500 mb-1 block">Dia</Label>
            <Select
              value={localFilters.dia || '__all'}
              onValueChange={(v) =>
                setLocalFilters((prev) => ({ ...prev, dia: v === '__all' ? '' : v }))
              }
            >
              <SelectTrigger
                className={cn(
                  'h-10 text-xs rounded-lg',
                  localFilters.dia
                    ? 'border-indigo-400 font-medium text-slate-900 bg-indigo-50/20'
                    : 'border-slate-200 text-slate-600',
                )}
              >
                <SelectValue placeholder="Dia" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all" className="text-xs">
                  Todos
                </SelectItem>
                {options.dias.map((d) => (
                  <SelectItem key={d} value={String(d)} className="text-xs">
                    {String(d).padStart(2, '0')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Vendedor > Cliente (Principal) */}
        <div>
          <Label className="text-[11px] font-semibold text-slate-500 mb-1 block">
            Vendedor &gt; Cliente
          </Label>
          <MultiSelectDropdown
            label="Vendedor > Cliente"
            options={options.vendedorCliente}
            selected={localFilters.vendedorCliente}
            onChange={(values) => setLocalFilters((prev) => ({ ...prev, vendedorCliente: values }))}
            placeholder="Todos"
            highlight={localFilters.vendedorCliente.length > 0}
          />
        </div>

        {/* Vendedor */}
        <div>
          <Label className="text-[11px] font-semibold text-slate-500 mb-1 block">Vendedor</Label>
          <MultiSelectDropdown
            label="Vendedor"
            options={options.vendedor}
            selected={localFilters.vendedor}
            onChange={(values) => setLocalFilters((prev) => ({ ...prev, vendedor: values }))}
            placeholder="Todos"
          />
        </div>

        {/* Grupo do Item */}
        <div>
          <Label className="text-[11px] font-semibold text-slate-500 mb-1 block">
            Grupo do Item
          </Label>
          <MultiSelectDropdown
            label="Grupo"
            options={options.grupoItem}
            selected={localFilters.grupoItem}
            onChange={(values) => setLocalFilters((prev) => ({ ...prev, grupoItem: values }))}
            placeholder="Todos"
          />
        </div>

        {/* Estado */}
        <div>
          <Label className="text-[11px] font-semibold text-slate-500 mb-1 block">Estado (UF)</Label>
          <MultiSelectDropdown
            label="Estado"
            options={options.estado}
            selected={localFilters.estado}
            onChange={(values) => setLocalFilters((prev) => ({ ...prev, estado: values }))}
            placeholder="Todos"
          />
        </div>

        {/* Tipo de Documento */}
        <div>
          <Label className="text-[11px] font-semibold text-slate-500 mb-1 block">
            Tipo de Documento
          </Label>
          <MultiSelectDropdown
            label="Documento"
            options={options.tipoDocumento || []}
            selected={localFilters.tipoDocumento}
            onChange={(values) => setLocalFilters((prev) => ({ ...prev, tipoDocumento: values }))}
            placeholder="Todos"
            highlight={localFilters.tipoDocumento.length > 0}
          />
        </div>
      </div>

      {/* Linha 2: Utilização e Busca Opcional */}
      <div
        className={cn(
          'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 pt-3',
          collapsed && 'hidden lg:grid',
        )}
      >
        <div className="sm:col-span-2">
          <Label className="text-[11px] font-semibold text-slate-500 mb-1 block">Utilização</Label>
          <MultiSelectDropdown
            label="Utilização"
            options={options.utilizacao}
            selected={localFilters.utilizacao}
            onChange={(values) => setLocalFilters((prev) => ({ ...prev, utilizacao: values }))}
            placeholder="Todas utilizações"
          />
        </div>

        {/* Tipo de Devolução */}
        <div>
          <Label className="text-[11px] font-semibold text-slate-500 mb-1 block">
            Tipo de Devolução
          </Label>
          <Select
            value={localFilters.tipoDevolucao || '__all'}
            onValueChange={(v) =>
              setLocalFilters((prev) => ({ ...prev, tipoDevolucao: v === '__all' ? '' : v }))
            }
          >
            <SelectTrigger
              className={cn(
                'h-10 text-xs rounded-lg',
                localFilters.tipoDevolucao
                  ? 'border-indigo-400 font-medium text-slate-900 bg-indigo-50/20'
                  : 'border-slate-200 text-slate-600',
              )}
            >
              <SelectValue placeholder="Todas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all" className="text-xs">
                Todas
              </SelectItem>
              {DEVOLUCAO_TIPOS.map((tipo) => (
                <SelectItem key={tipo} value={tipo} className="text-xs">
                  {tipo}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {showSearch && (
          <div className="sm:col-span-3">
            <Label className="text-[11px] font-semibold text-slate-500 mb-1 block">
              Busca Textual (Cliente, Item, Nº NFe, SAP)
            </Label>
            <div className="relative">
              <Input
                type="text"
                placeholder="Ex.: DIAMANTE, GS-24, 56316..."
                value={localFilters.search}
                onChange={(e) => setLocalFilters((prev) => ({ ...prev, search: e.target.value }))}
                className="h-10 text-xs rounded-lg border-slate-200 pr-8"
              />
              {localFilters.search && (
                <button
                  type="button"
                  onClick={() => setLocalFilters((prev) => ({ ...prev, search: '' }))}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Seção de Pílulas de Filtros Ativos (CONTAINED - Máximo 5 pílulas visíveis + Resumo/Popover "Ver todos") */}
      {allActivePills.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pt-3 mt-3 border-t border-slate-100">
          <span className="text-[11px] font-medium text-slate-400 mr-1">Filtros ativos:</span>

          {/* Primeiras 5 pílulas */}
          {visiblePills.map((pill) => (
            <Badge
              key={pill.id}
              variant="outline"
              className={cn(
                'text-xs pl-2.5 pr-1 py-1 rounded-full flex items-center gap-1 font-normal shadow-2xs',
                pill.bgClass,
              )}
            >
              <span className="max-w-[200px] truncate">{pill.label}</span>
              <button
                type="button"
                onClick={() => removeSingleFilter(pill.type, pill.value)}
                className="p-0.5 rounded-full hover:bg-black/10 text-slate-500 hover:text-slate-800 transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          ))}

          {/* Botão/Popover para mais pílulas quando houver mais de 5 */}
          {remainingPills.length > 0 && (
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2.5 text-xs rounded-full border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-semibold gap-1"
                >
                  <span>
                    +{remainingPills.length} filtro{remainingPills.length > 1 ? 's' : ''}
                  </span>
                  <ChevronDown className="w-3 h-3" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-3 text-xs" align="start">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-2">
                  <span className="font-semibold text-slate-800">
                    Outros {remainingPills.length} filtros ativos
                  </span>
                  <span className="text-[11px] text-slate-400">Total: {allActivePills.length}</span>
                </div>
                <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
                  {remainingPills.map((pill) => (
                    <div
                      key={pill.id}
                      className={cn(
                        'flex items-center justify-between p-1.5 rounded-md border text-xs',
                        pill.bgClass,
                      )}
                    >
                      <span className="truncate pr-2">{pill.label}</span>
                      <button
                        type="button"
                        onClick={() => removeSingleFilter(pill.type, pill.value)}
                        className="p-0.5 rounded-full hover:bg-black/10 text-slate-500 hover:text-slate-800 shrink-0"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          )}
        </div>
      )}
    </div>
  )
}
