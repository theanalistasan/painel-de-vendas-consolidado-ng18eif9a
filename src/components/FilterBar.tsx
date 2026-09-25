import React, { useState, useRef, useEffect, useMemo } from 'react'
import { Check, ChevronDown, X, Filter, Loader2 } from 'lucide-react'
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
import type { FilterState, CanalOption, CanalClienteOption } from '@/types/sales'
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
    canais?: CanalOption[]
    canaisClientes?: CanalClienteOption[]
    inside?: string[]
    anos: number[]
    meses: number[]
    dias: number[]
  }
  showSearch?: boolean
  onApplyFilters?: (appliedFilters: FilterState) => void
  isLoading?: boolean
  loadingMessage?: string
}

// Reusable MultiSelect Dropdown with Roland DG Accent
function MultiSelectDropdown({
  label,
  options,
  selected,
  onChange,
  placeholder,
  highlight = false,
  getOptionLabel,
}: {
  label: string
  options: string[]
  selected: string[]
  onChange: (values: string[]) => void
  placeholder: string
  highlight?: boolean
  getOptionLabel?: (option: string) => string
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
    return cleanOptions.filter((opt) => {
      const displayLabel = getOptionLabel ? getOptionLabel(opt) : opt
      return opt.toLowerCase().includes(s) || displayLabel.toLowerCase().includes(s)
    })
  }, [cleanOptions, search, getOptionLabel])

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
          'flex items-center justify-between w-full h-10 px-3 py-2 text-xs rounded-lg border bg-white transition-colors text-left focus:outline-hidden focus:ring-2 focus:ring-[#0B6E99]/40',
          selected.length > 0
            ? 'border-[#0B6E99]/60 font-semibold text-slate-900 bg-cyan-50/30'
            : 'border-gray-200 text-slate-600 hover:border-slate-300',
          highlight && 'border-[#0B6E99] ring-1 ring-[#0B6E99]/30',
        )}
      >
        <div className="flex items-center gap-1.5 truncate pr-2">
          <span className="font-bold text-slate-700">{label}:</span>
          {selected.length === 0 ? (
            <span className="text-slate-400 font-normal">{placeholder}</span>
          ) : (
            <span className="text-[#0B6E99] font-bold truncate">
              {selected.length === 1
                ? getOptionLabel
                  ? getOptionLabel(selected[0])
                  : selected[0]
                : `${selected.length} selecionados`}
            </span>
          )}
        </div>
        <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1.5 w-72 max-w-[90vw] bg-white border border-gray-200 rounded-xl shadow-lg z-50 p-2 text-xs animate-in fade-in-50 zoom-in-95 duration-150">
          <div className="mb-2">
            <Input
              type="text"
              placeholder={`Pesquisar ${label.toLowerCase()}...`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 text-xs rounded-md border-gray-200 focus-visible:ring-[#0B6E99]"
              autoFocus
            />
          </div>

          <div className="flex items-center justify-between px-1 py-1 border-b border-slate-100 mb-1 text-[11px] text-slate-500 font-medium">
            <button
              type="button"
              onClick={selectAll}
              className="text-[#0B6E99] hover:underline font-bold"
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
                      'flex items-center justify-between w-full px-2.5 py-1.5 rounded-md text-left transition-colors font-medium',
                      isSelected
                        ? 'bg-cyan-50 text-cyan-950 font-bold'
                        : 'text-slate-700 hover:bg-slate-100',
                    )}
                  >
                    <span className="truncate pr-2">
                      {getOptionLabel ? getOptionLabel(option) : option}
                    </span>
                    <div
                      className={cn(
                        'w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors',
                        isSelected
                          ? 'bg-[#0B6E99] border-[#0B6E99] text-white'
                          : 'border-gray-300 bg-white',
                      )}
                    >
                      {' '}
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
  isLoading = false,
  loadingMessage = 'Atualizando...',
}: FilterBarProps) {
  const [collapsed, setCollapsed] = useState(false)

  const [localFilters, setLocalFilters] = useState<FilterState>(filters)

  useEffect(() => {
    setLocalFilters(filters)
  }, [filters])

  const hasPendingChanges = useMemo(() => {
    return JSON.stringify(localFilters) !== JSON.stringify(filters)
  }, [localFilters, filters])

  const activeFiltersCount = useMemo(() => {
    return (
      (filters.base && filters.base !== 'ambos' ? 1 : 0) +
      (filters.dataDe ? 1 : 0) +
      (filters.dataAte ? 1 : 0) +
      (filters.canal?.length || 0) +
      (filters.canalClientes?.length || 0) +
      (filters.deploy?.length || 0) +
      (filters.inside?.length || 0) +
      filters.vendedorCliente.length +
      filters.vendedor.length +
      filters.grupoItem.length +
      filters.estado.length +
      filters.utilizacao.length +
      filters.tipoDocumento.length +
      (filters.search ? 1 : 0) +
      filters.ano.length +
      filters.mes.length +
      filters.dia.length +
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
      base: 'ambos',
      dataDe: '',
      dataAte: '',
      vendedorCliente: [],
      vendedor: [],
      grupoItem: [],
      estado: [],
      utilizacao: [],
      tipoDocumento: [],
      canal: [],
      canalClientes: [],
      deploy: [],
      inside: [],
      search: '',
      ano: [],
      mes: [],
      dia: [],
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

    if (type === 'base') {
      nextState = { ...nextState, base: 'ambos' }
    } else if (
      type === 'dataDe' ||
      type === 'dataAte' ||
      type === 'search' ||
      type === 'tipoDevolucao'
    ) {
      nextState = { ...nextState, [type]: '' }
    } else if (
      value &&
      (type === 'ano' ||
        type === 'mes' ||
        type === 'dia' ||
        type === 'vendedorCliente' ||
        type === 'vendedor' ||
        type === 'grupoItem' ||
        type === 'estado' ||
        type === 'utilizacao' ||
        type === 'canal' ||
        type === 'canalClientes' ||
        type === 'deploy' ||
        type === 'inside' ||
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

  const allActivePills = useMemo<ActivePill[]>(() => {
    const list: ActivePill[] = []

    if (filters.base && filters.base !== 'ambos') {
      const baseLabel = filters.base === 'racnew' ? 'RacNew' : 'NetSales'
      list.push({
        id: 'base',
        label: `Base: ${baseLabel}`,
        type: 'base',
        bgClass: 'bg-cyan-50 border-cyan-200 text-cyan-950 font-semibold',
      })
    }

    if (filters.dataDe) {
      list.push({
        id: 'dataDe',
        label: `De: ${filters.dataDe}`,
        type: 'dataDe',
        bgClass: 'bg-slate-50 border-slate-200 text-slate-700 font-medium',
      })
    }
    if (filters.dataAte) {
      list.push({
        id: 'dataAte',
        label: `Até: ${filters.dataAte}`,
        type: 'dataAte',
        bgClass: 'bg-slate-50 border-slate-200 text-slate-700 font-medium',
      })
    }

    filters.ano.forEach((item) => {
      list.push({
        id: `ano-${item}`,
        label: `Ano: ${item}`,
        type: 'ano',
        value: item,
        bgClass: 'bg-cyan-50 border-cyan-200 text-cyan-950 font-semibold',
      })
    })

    filters.mes.forEach((item) => {
      const numMes = Number(item)
      const labelMes = !isNaN(numMes) && numMes >= 1 && numMes <= 12 ? nomeMes(numMes) : item
      list.push({
        id: `mes-${item}`,
        label: `Mês: ${labelMes}`,
        type: 'mes',
        value: item,
        bgClass: 'bg-cyan-50 border-cyan-200 text-cyan-950 font-semibold',
      })
    })

    filters.dia.forEach((item) => {
      list.push({
        id: `dia-${item}`,
        label: `Dia: ${String(item).padStart(2, '0')}`,
        type: 'dia',
        value: item,
        bgClass: 'bg-cyan-50 border-cyan-200 text-cyan-950 font-semibold',
      })
    })

    filters.vendedorCliente.forEach((item) => {
      list.push({
        id: `vendedorCliente-${item}`,
        label: item,
        type: 'vendedorCliente',
        value: item,
        bgClass: 'bg-cyan-50 border-cyan-200 text-cyan-950 font-semibold',
      })
    })

    filters.vendedor.forEach((item) => {
      list.push({
        id: `vendedor-${item}`,
        label: `Vendedor: ${item}`,
        type: 'vendedor',
        value: item,
        bgClass: 'bg-slate-50 border-slate-200 text-slate-700 font-medium',
      })
    })

    filters.grupoItem.forEach((item) => {
      list.push({
        id: `grupoItem-${item}`,
        label: `Grupo: ${item}`,
        type: 'grupoItem',
        value: item,
        bgClass: 'bg-slate-50 border-slate-200 text-slate-700 font-medium',
      })
    })

    filters.estado.forEach((item) => {
      list.push({
        id: `estado-${item}`,
        label: `UF: ${item}`,
        type: 'estado',
        value: item,
        bgClass: 'bg-slate-50 border-slate-200 text-slate-700 font-medium',
      })
    })

    filters.utilizacao.forEach((item) => {
      list.push({
        id: `utilizacao-${item}`,
        label: `Uso: ${item}`,
        type: 'utilizacao',
        value: item,
        bgClass: 'bg-slate-50 border-slate-200 text-slate-700 font-medium',
      })
    })

    filters.tipoDocumento.forEach((item) => {
      list.push({
        id: `tipoDocumento-${item}`,
        label: `Doc: ${item}`,
        type: 'tipoDocumento',
        value: item,
        bgClass: 'bg-cyan-50 border-cyan-200 text-cyan-950 font-semibold',
      })
    })

    if (Array.isArray(filters.canal)) {
      filters.canal.forEach((item) => {
        const deployInfo = (options.canais || []).find((c) => c.nome === item)?.deploy
        const deployBadge = deployInfo ? ` [${deployInfo}]` : ''
        list.push({
          id: `canal-${item}`,
          label: `Canal: ${item}${deployBadge}`,
          type: 'canal',
          value: item,
          bgClass: 'bg-[#0B6E99]/10 border-[#0B6E99]/30 text-[#084F6E] font-bold',
        })
      })
    }

    if (Array.isArray(filters.canalClientes)) {
      filters.canalClientes.forEach((item) => {
        list.push({
          id: `canalCliente-${item}`,
          label: `Cliente do Canal: ${item}`,
          type: 'canalClientes',
          value: item,
          bgClass: 'bg-emerald-50 border-emerald-200 text-emerald-900 font-semibold',
        })
      })
    }

    if (Array.isArray(filters.deploy)) {
      filters.deploy.forEach((item) => {
        list.push({
          id: `deploy-${item}`,
          label: `Deploy: ${item}`,
          type: 'deploy',
          value: item,
          bgClass: 'bg-indigo-50 border-indigo-200 text-indigo-900 font-semibold',
        })
      })
    }

    if (Array.isArray(filters.inside)) {
      filters.inside.forEach((item) => {
        list.push({
          id: `inside-${item}`,
          label: `Inside: ${item}`,
          type: 'inside',
          value: item,
          bgClass: 'bg-teal-50 border-teal-200 text-teal-900 font-semibold',
        })
      })
    }

    if (filters.search) {
      list.push({
        id: 'search',
        label: `Busca: "${filters.search}"`,
        type: 'search',
        bgClass: 'bg-cyan-50 border-cyan-200 text-cyan-900 font-medium',
      })
    }

    if (filters.tipoDevolucao) {
      list.push({
        id: 'tipoDevolucao',
        label: `Devolução: ${filters.tipoDevolucao}`,
        type: 'tipoDevolucao',
        bgClass: 'bg-rose-50 border-rose-200 text-rose-900 font-medium',
      })
    }

    return list
  }, [filters])

  const MAX_VISIBLE_PILLS = 5
  const visiblePills = allActivePills.slice(0, MAX_VISIBLE_PILLS)
  const remainingPills = allActivePills.slice(MAX_VISIBLE_PILLS)

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6 transition-all">
      {/* Header com Título e Contador Roland DG */}
      <div className="flex flex-wrap items-center justify-between pb-3 border-b border-slate-100 gap-2">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-cyan-50 text-[#0B6E99]">
            <Filter className="w-4 h-4" />
          </div>
          <div>
            <span className="text-sm font-bold text-slate-900">Filtros Globais</span>
            {activeFiltersCount > 0 && (
              <Badge
                variant="secondary"
                className="ml-2 bg-cyan-100 text-cyan-900 text-[11px] font-bold"
              >
                {activeFiltersCount} ativo{activeFiltersCount > 1 ? 's' : ''}
              </Badge>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Botão Aplicar Filtros com destaque visual Roland DG quando há mudanças pendentes */}
          <Button
            type="button"
            size="sm"
            onClick={handleApply}
            disabled={isLoading}
            className={cn(
              'h-8 px-4 text-xs font-bold rounded-lg transition-all',
              isLoading
                ? 'bg-[#0B6E99] text-white cursor-not-allowed opacity-90'
                : hasPendingChanges
                  ? 'bg-[#0B6E99] hover:bg-[#084F6E] text-white ring-2 ring-[#0B6E99]/30 animate-pulse'
                  : 'bg-slate-900 hover:bg-slate-800 text-white',
            )}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                {loadingMessage}
              </>
            ) : (
              <>
                Aplicar Filtros
                {hasPendingChanges && (
                  <span className="ml-1.5 text-[10px] bg-white/20 px-1 rounded">●</span>
                )}
              </>
            )}
          </Button>

          {activeFiltersCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearAllFilters}
              disabled={isLoading}
              className={cn(
                'text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 h-8 px-2.5 rounded-lg font-semibold',
                isLoading && 'cursor-not-allowed opacity-50',
              )}
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
            <Label className="text-[11px] font-bold text-slate-500 mb-1 block">
              Data de Lançamento (De)
            </Label>
            <Input
              type="date"
              value={localFilters.dataDe}
              onChange={(e) => setLocalFilters((prev) => ({ ...prev, dataDe: e.target.value }))}
              className="h-10 text-xs rounded-lg border-gray-200 focus-visible:ring-[#0B6E99]"
            />
          </div>
          <div>
            <Label className="text-[11px] font-bold text-slate-500 mb-1 block">
              Data de Lançamento (Até)
            </Label>
            <Input
              type="date"
              value={localFilters.dataAte}
              onChange={(e) => setLocalFilters((prev) => ({ ...prev, dataAte: e.target.value }))}
              className="h-10 text-xs rounded-lg border-gray-200 focus-visible:ring-[#0B6E99]"
            />
          </div>
        </div>

        {/* Ano / Mês / Dia */}
        <div className="grid grid-cols-3 gap-2">
          <div>
            <Label className="text-[11px] font-bold text-slate-500 mb-1 block">Ano</Label>
            <MultiSelectDropdown
              label="Ano"
              options={options.anos.map(String)}
              selected={localFilters.ano}
              onChange={(values) => setLocalFilters((prev) => ({ ...prev, ano: values }))}
              placeholder="Todos"
              highlight={localFilters.ano.length > 0}
            />
          </div>
          <div>
            <Label className="text-[11px] font-bold text-slate-500 mb-1 block">Mês</Label>
            <MultiSelectDropdown
              label="Mês"
              options={options.meses.map(String)}
              selected={localFilters.mes}
              onChange={(values) => setLocalFilters((prev) => ({ ...prev, mes: values }))}
              placeholder="Todos"
              highlight={localFilters.mes.length > 0}
              getOptionLabel={(val) => {
                const n = Number(val)
                return !isNaN(n) && n >= 1 && n <= 12 ? MESES_PT_BR[n - 1] || val : val
              }}
            />
          </div>
          <div>
            <Label className="text-[11px] font-bold text-slate-500 mb-1 block">Dia</Label>
            <MultiSelectDropdown
              label="Dia"
              options={options.dias.map((d) => String(d).padStart(2, '0'))}
              selected={localFilters.dia}
              onChange={(values) => setLocalFilters((prev) => ({ ...prev, dia: values }))}
              placeholder="Todos"
              highlight={localFilters.dia.length > 0}
            />
          </div>
        </div>

        {/* Vendedor > Cliente (Principal) */}
        <div>
          <Label className="text-[11px] font-bold text-slate-500 mb-1 block">
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
          <Label className="text-[11px] font-bold text-slate-500 mb-1 block">Vendedor</Label>
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
          <Label className="text-[11px] font-bold text-slate-500 mb-1 block">Grupo do Item</Label>
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
          <Label className="text-[11px] font-bold text-slate-500 mb-1 block">Estado (UF)</Label>
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
          <Label className="text-[11px] font-bold text-slate-500 mb-1 block">
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

      {/* Linha 2: Canal (destaque), Seleção de Bases, Utilização e Busca */}
      <div
        className={cn(
          'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 pt-3',
          collapsed && 'hidden lg:grid',
        )}
      >
        {/* Bloco de Filtros: Canais (Quatro filtros: Canal, Clientes, Deploy, Inside) */}
        <div className="sm:col-span-2 xl:col-span-4 bg-gradient-to-r from-slate-50 to-cyan-50/40 p-2.5 rounded-xl border border-cyan-100">
          <div className="flex items-center justify-between mb-2">
            <Label className="text-[11px] font-bold text-[#0B6E99] flex items-center gap-1.5 uppercase tracking-wide">
              <span className="w-2 h-2 rounded-full bg-[#0B6E99]" />
              Canais
            </Label>
            <div className="flex items-center gap-2">
              {options.canais && options.canais.length > 0 && (
                <span className="text-[10px] text-slate-500 font-semibold bg-white/80 px-1.5 py-0.5 rounded border border-slate-200">
                  {options.canais.length} canais
                </span>
              )}
              {options.inside && options.inside.length > 0 && (
                <span className="text-[10px] text-teal-700 font-semibold bg-teal-50/80 px-1.5 py-0.5 rounded border border-teal-200">
                  {options.inside.length} inside
                </span>
              )}
              {((localFilters.canal && localFilters.canal.length > 0) ||
                (localFilters.canalClientes && localFilters.canalClientes.length > 0) ||
                (localFilters.deploy && localFilters.deploy.length > 0) ||
                (localFilters.inside && localFilters.inside.length > 0)) && (
                <button
                  type="button"
                  onClick={() =>
                    setLocalFilters((prev) => ({
                      ...prev,
                      canal: [],
                      canalClientes: [],
                      deploy: [],
                      inside: [],
                    }))
                  }
                  className="text-[10px] text-rose-600 hover:underline font-bold"
                >
                  Limpar canais
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">
            {/* 1. Nome do Canal */}
            <div>
              <Label className="text-[10px] font-bold text-slate-600 mb-1 block">
                Nome do Canal
              </Label>
              <MultiSelectDropdown
                label="Canal"
                options={(options.canais || []).map((c) => c.nome)}
                selected={localFilters.canal || []}
                onChange={(values) => {
                  setLocalFilters((prev) => {
                    // Se desmarcou canal, limpa clientes do canal que não pertencem mais aos canais selecionados
                    const nextCanal = values
                    let nextClientes = prev.canalClientes || []
                    if (nextCanal.length > 0 && nextClientes.length > 0 && options.canaisClientes) {
                      const validClis = new Set(
                        options.canaisClientes
                          .filter((cc) => nextCanal.includes(cc.nome_canal))
                          .map((cc) => cc.nome_cliente),
                      )
                      nextClientes = nextClientes.filter((cli) => validClis.has(cli))
                    }
                    return { ...prev, canal: nextCanal, canalClientes: nextClientes }
                  })
                }}
                placeholder="Todos os canais"
                highlight={(localFilters.canal || []).length > 0}
                getOptionLabel={(nome) => {
                  const opt = (options.canais || []).find((c) => c.nome === nome)
                  if (opt && opt.deploy) {
                    const depDesc =
                      opt.deploy === 'AGIS'
                        ? 'AGIS'
                        : opt.deploy === 'ROLAND'
                          ? 'Roland'
                          : opt.deploy
                    return `${nome} (${depDesc})`
                  }
                  return nome
                }}
              />
            </div>

            {/* 2. Clientes do Canal */}
            <div>
              <Label className="text-[10px] font-bold text-slate-600 mb-1 block">
                Clientes do Canal
              </Label>
              {(() => {
                const allCanalClis = options.canaisClientes || []
                const selectedCanalNames = localFilters.canal || []
                const filteredClis =
                  selectedCanalNames.length > 0
                    ? allCanalClis.filter((cc) => selectedCanalNames.includes(cc.nome_canal))
                    : allCanalClis

                const cliNames = Array.from(new Set(filteredClis.map((cc) => cc.nome_cliente)))

                return (
                  <MultiSelectDropdown
                    label="Clientes"
                    options={cliNames}
                    selected={localFilters.canalClientes || []}
                    onChange={(values) =>
                      setLocalFilters((prev) => ({ ...prev, canalClientes: values }))
                    }
                    placeholder={
                      selectedCanalNames.length > 0
                        ? 'Todos os clientes do canal'
                        : 'Todos os clientes de canais'
                    }
                    highlight={(localFilters.canalClientes || []).length > 0}
                    getOptionLabel={(cli) => {
                      const match = filteredClis.find((cc) => cc.nome_cliente === cli)
                      if (match && selectedCanalNames.length !== 1 && match.nome_canal) {
                        return `${cli} [${match.nome_canal}]`
                      }
                      return cli
                    }}
                  />
                )
              })()}
            </div>

            {/* 3. Deploy: AGIS, Roland, Nenhum */}
            <div>
              <Label className="text-[10px] font-bold text-slate-600 mb-1 block">Deploy</Label>
              <MultiSelectDropdown
                label="Deploy"
                options={['AGIS', 'Roland', 'Nenhum']}
                selected={localFilters.deploy || []}
                onChange={(values) => setLocalFilters((prev) => ({ ...prev, deploy: values }))}
                placeholder="Todos os deploys"
                highlight={(localFilters.deploy || []).length > 0}
                getOptionLabel={(dep) => {
                  if (dep === 'AGIS') return 'AGIS (revenda)'
                  if (dep === 'Roland') return 'Roland (direta)'
                  if (dep === 'Nenhum') return 'Nenhum (sem deploy)'
                  return dep
                }}
              />
            </div>

            {/* 4. Inside */}
            <div>
              <Label className="text-[10px] font-bold text-slate-600 mb-1 block">Inside</Label>
              <MultiSelectDropdown
                label="Inside"
                options={options.inside || []}
                selected={localFilters.inside || []}
                onChange={(values) => setLocalFilters((prev) => ({ ...prev, inside: values }))}
                placeholder="Todos os inside"
                highlight={(localFilters.inside || []).length > 0}
              />
            </div>
          </div>
        </div>
        {/* Seleção de Bases */}
        <div>
          <Label className="text-[11px] font-bold text-slate-500 mb-1 block">
            Seleção de Bases
          </Label>
          <Select
            value={localFilters.base || 'ambos'}
            onValueChange={(v: 'ambos' | 'racnew' | 'netsales') =>
              setLocalFilters((prev) => ({ ...prev, base: v }))
            }
          >
            <SelectTrigger
              className={cn(
                'h-10 text-xs rounded-lg',
                localFilters.base && localFilters.base !== 'ambos'
                  ? 'border-[#0B6E99]/60 font-bold text-slate-900 bg-cyan-50/30'
                  : 'border-gray-200 text-slate-600',
              )}
            >
              <SelectValue placeholder="Ambos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ambos" className="text-xs font-medium">
                Ambos
              </SelectItem>
              <SelectItem value="racnew" className="text-xs font-medium">
                RacNew
              </SelectItem>
              <SelectItem value="netsales" className="text-xs font-medium">
                NetSales
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="sm:col-span-2">
          <Label className="text-[11px] font-bold text-slate-500 mb-1 block">Utilização</Label>
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
          <Label className="text-[11px] font-bold text-slate-500 mb-1 block">
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
                  ? 'border-[#0B6E99]/60 font-bold text-slate-900 bg-cyan-50/30'
                  : 'border-gray-200 text-slate-600',
              )}
            >
              <SelectValue placeholder="Todas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all" className="text-xs font-medium">
                Todas
              </SelectItem>
              {DEVOLUCAO_TIPOS.map((tipo) => (
                <SelectItem key={tipo} value={tipo} className="text-xs font-medium">
                  {tipo}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {showSearch ? (
          <div className="sm:col-span-2">
            <Label className="text-[11px] font-bold text-slate-500 mb-1 block">
              Busca Textual (Cliente, Item, Nº NFe, SAP)
            </Label>
            <div className="relative">
              <Input
                type="text"
                placeholder="Ex.: DIAMANTE, GS-24, 56316..."
                value={localFilters.search}
                onChange={(e) => setLocalFilters((prev) => ({ ...prev, search: e.target.value }))}
                className="h-10 text-xs rounded-lg border-gray-200 focus-visible:ring-[#0B6E99] pr-8"
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
        ) : null}
      </div>

      {/* Seção de Pílulas de Filtros Ativos Roland DG */}
      {allActivePills.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pt-3 mt-3 border-t border-slate-100">
          <span className="text-[11px] font-bold text-slate-400 mr-1">Filtros ativos:</span>

          {visiblePills.map((pill) => (
            <Badge
              key={pill.id}
              variant="outline"
              className={cn(
                'text-xs pl-2.5 pr-1 py-1 rounded-full flex items-center gap-1 font-semibold',
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

          {remainingPills.length > 0 && (
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2.5 text-xs rounded-full border-cyan-200 bg-cyan-50 text-cyan-800 hover:bg-cyan-100 font-bold gap-1"
                >
                  <span>
                    +{remainingPills.length} filtro{remainingPills.length > 1 ? 's' : ''}
                  </span>
                  <ChevronDown className="w-3 h-3" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-3 text-xs border-gray-200" align="start">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-2">
                  <span className="font-bold text-slate-800">
                    Outros {remainingPills.length} filtros ativos
                  </span>
                  <span className="text-[11px] text-slate-400 font-medium">
                    Total: {allActivePills.length}
                  </span>
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
