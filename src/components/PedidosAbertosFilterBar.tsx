import React, { useState, useRef, useEffect, useMemo } from 'react'
import { Check, ChevronDown, X, Filter, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { CanalOption, CanalClienteOption } from '@/types/sales'
import { cn } from '@/lib/utils'

export interface PedidosAbertosFilters {
  canal: string[]
  canalClientes: string[]
  deploy: string[]
  inside: string[]
  ehCanal?: 'todos' | 'sim' | 'nao' | ''
}

export const EMPTY_PEDIDOS_ABERTOS_FILTERS: PedidosAbertosFilters = {
  canal: [],
  canalClientes: [],
  deploy: [],
  inside: [],
  ehCanal: 'todos',
}

interface PedidosAbertosFilterBarProps {
  filters: PedidosAbertosFilters
  setFilters: React.Dispatch<React.SetStateAction<PedidosAbertosFilters>>
  options: {
    canais?: CanalOption[]
    canaisClientes?: CanalClienteOption[]
    inside?: string[]
  }
  onApplyFilters?: (appliedFilters: PedidosAbertosFilters) => void
  isLoading?: boolean
  loadingMessage?: string
}

// Reusable MultiSelect Dropdown
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

export default function PedidosAbertosFilterBar({
  filters,
  setFilters,
  options,
  onApplyFilters,
  isLoading = false,
  loadingMessage = 'Atualizando...',
}: PedidosAbertosFilterBarProps) {
  const [localFilters, setLocalFilters] = useState<PedidosAbertosFilters>(filters)

  useEffect(() => {
    setLocalFilters(filters)
  }, [filters])

  const hasPendingChanges = useMemo(() => {
    return JSON.stringify(localFilters) !== JSON.stringify(filters)
  }, [localFilters, filters])

  const activeFiltersCount = useMemo(() => {
    return (
      (filters.canal?.length || 0) +
      (filters.canalClientes?.length || 0) +
      (filters.deploy?.length || 0) +
      (filters.inside?.length || 0) +
      (filters.ehCanal && filters.ehCanal !== 'todos' ? 1 : 0)
    )
  }, [filters])

  const handleApply = () => {
    setFilters(localFilters)
    if (onApplyFilters) {
      onApplyFilters(localFilters)
    }
  }

  const clearAllFilters = () => {
    setLocalFilters(EMPTY_PEDIDOS_ABERTOS_FILTERS)
    setFilters(EMPTY_PEDIDOS_ABERTOS_FILTERS)
    if (onApplyFilters) {
      onApplyFilters(EMPTY_PEDIDOS_ABERTOS_FILTERS)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6 transition-all shadow-xs">
      {/* Header com Título e Ações */}
      <div className="flex flex-wrap items-center justify-between pb-3 border-b border-slate-100 gap-2">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-amber-50 text-amber-700">
            <Filter className="w-4 h-4" />
          </div>
          <div>
            <span className="text-sm font-bold text-slate-900">Filtros de Pedidos em Aberto</span>
            {activeFiltersCount > 0 && (
              <Badge
                variant="secondary"
                className="ml-2 bg-amber-100 text-amber-900 text-[11px] font-bold"
              >
                {activeFiltersCount} ativo{activeFiltersCount > 1 ? 's' : ''}
              </Badge>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
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
        </div>
      </div>

      {/* Quadro de Filtros por Canais (Nome do Canal, Clientes do Canal, Deploy, Inside) */}
      <div className="pt-3">
        <div className="bg-gradient-to-r from-slate-50 to-cyan-50/40 p-3 rounded-xl border border-cyan-100">
          <div className="flex items-center justify-between mb-2">
            <Label className="text-[11px] font-bold text-[#0B6E99] flex items-center gap-1.5 uppercase tracking-wide">
              <span className="w-2 h-2 rounded-full bg-[#0B6E99]" />
              Filtros por Canais
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
                (localFilters.inside && localFilters.inside.length > 0) ||
                (localFilters.ehCanal && localFilters.ehCanal !== 'todos')) && (
                <button
                  type="button"
                  onClick={() =>
                    setLocalFilters((prev) => ({
                      ...prev,
                      canal: [],
                      canalClientes: [],
                      deploy: [],
                      inside: [],
                      ehCanal: 'todos',
                    }))
                  }
                  className="text-[10px] text-rose-600 hover:underline font-bold"
                >
                  Limpar canais
                </button>
              )}
            </div>
          </div>

          {/* Seletor "É Canal": Todos / Sim / Não */}
          <div className="mb-3 p-2 bg-white/80 rounded-lg border border-cyan-100 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-700">É Canal:</span>
              <div className="inline-flex rounded-lg bg-slate-100 p-0.5 gap-0.5 border border-slate-200">
                <button
                  type="button"
                  onClick={() => setLocalFilters((prev) => ({ ...prev, ehCanal: 'todos' }))}
                  className={cn(
                    'px-2.5 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer',
                    !localFilters.ehCanal || localFilters.ehCanal === 'todos'
                      ? 'bg-[#0B6E99] text-white shadow-xs font-bold'
                      : 'text-slate-600 hover:text-slate-900',
                  )}
                >
                  Todos
                </button>
                <button
                  type="button"
                  onClick={() => setLocalFilters((prev) => ({ ...prev, ehCanal: 'sim' }))}
                  className={cn(
                    'px-2.5 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer',
                    localFilters.ehCanal === 'sim'
                      ? 'bg-emerald-600 text-white shadow-xs font-bold'
                      : 'text-slate-600 hover:text-slate-900',
                  )}
                >
                  Sim (Canal)
                </button>
                <button
                  type="button"
                  onClick={() => setLocalFilters((prev) => ({ ...prev, ehCanal: 'nao' }))}
                  className={cn(
                    'px-2.5 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer',
                    localFilters.ehCanal === 'nao'
                      ? 'bg-slate-700 text-white shadow-xs font-bold'
                      : 'text-slate-600 hover:text-slate-900',
                  )}
                >
                  Não (Direto / Outros)
                </button>
              </div>
            </div>
            {localFilters.ehCanal && localFilters.ehCanal !== 'todos' && (
              <span className="text-[11px] font-semibold text-[#0B6E99]">
                Filtrando apenas clientes{' '}
                {localFilters.ehCanal === 'sim' ? 'com canal ativo' : 'sem canal'}
              </span>
            )}
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
      </div>
    </div>
  )
}
