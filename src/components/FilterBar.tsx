import React, { useState, useRef, useEffect } from 'react'
import { Check, ChevronDown, X, Filter } from 'lucide-react'
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
    anos: number[]
    meses: number[]
    dias: number[]
  }
  showSearch?: boolean
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

  const filteredOptions = options.filter((opt) => opt.toLowerCase().includes(search.toLowerCase()))

  const toggleOption = (option: string) => {
    if (selected.includes(option)) {
      onChange(selected.filter((item) => item !== option))
    } else {
      onChange([...selected, option])
    }
  }

  const selectAll = () => {
    onChange(options)
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
                    <span className="truncate pr-2">{option || '(Vazio)'}</span>
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

export default function FilterBar({
  filters,
  setFilters,
  options,
  showSearch = false,
}: FilterBarProps) {
  const [collapsed, setCollapsed] = useState(false)

  const activeFiltersCount =
    (filters.dataDe ? 1 : 0) +
    (filters.dataAte ? 1 : 0) +
    filters.vendedorCliente.length +
    filters.vendedor.length +
    filters.grupoItem.length +
    filters.estado.length +
    filters.utilizacao.length +
    (filters.search ? 1 : 0) +
    (filters.ano ? 1 : 0) +
    (filters.mes ? 1 : 0) +
    (filters.dia ? 1 : 0) +
    (filters.tipoDevolucao ? 1 : 0)

  const clearAllFilters = () => {
    setFilters({
      dataDe: '',
      dataAte: '',
      vendedorCliente: [],
      vendedor: [],
      grupoItem: [],
      estado: [],
      utilizacao: [],
      search: '',
      ano: '',
      mes: '',
      dia: '',
      tipoDevolucao: '',
    })
  }

  const removeSingleFilter = (type: keyof FilterState, value?: string) => {
    if (
      type === 'dataDe' ||
      type === 'dataAte' ||
      type === 'search' ||
      type === 'ano' ||
      type === 'mes' ||
      type === 'dia' ||
      type === 'tipoDevolucao'
    ) {
      setFilters((prev) => ({ ...prev, [type]: '' }))
    } else if (value && Array.isArray(filters[type])) {
      setFilters((prev) => ({
        ...prev,
        [type]: (prev[type] as string[]).filter((item) => item !== value),
      }))
    }
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs p-4 mb-6 transition-all">
      {/* Header with Title and Clear button */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
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

      {/* Filter Controls Grid */}
      <div
        className={cn(
          'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 pt-3',
          collapsed && 'hidden lg:grid',
        )}
      >
        {/* Date De / Ate */}
        <div className="sm:col-span-2 grid grid-cols-2 gap-2">
          <div>
            <Label className="text-[11px] font-semibold text-slate-500 mb-1 block">
              Data de Lançamento (De)
            </Label>
            <Input
              type="date"
              value={filters.dataDe}
              onChange={(e) => setFilters((prev) => ({ ...prev, dataDe: e.target.value }))}
              className="h-10 text-xs rounded-lg border-slate-200"
            />
          </div>
          <div>
            <Label className="text-[11px] font-semibold text-slate-500 mb-1 block">
              Data de Lançamento (Até)
            </Label>
            <Input
              type="date"
              value={filters.dataAte}
              onChange={(e) => setFilters((prev) => ({ ...prev, dataAte: e.target.value }))}
              className="h-10 text-xs rounded-lg border-slate-200"
            />
          </div>
        </div>

        {/* Ano / Mês / Dia (Data de Lançamento) */}
        <div className="grid grid-cols-3 gap-2">
          <div>
            <Label className="text-[11px] font-semibold text-slate-500 mb-1 block">Ano</Label>
            <Select
              value={filters.ano}
              onValueChange={(v) =>
                setFilters((prev) => ({ ...prev, ano: v === '__all' ? '' : v }))
              }
            >
              <SelectTrigger
                className={cn(
                  'h-10 text-xs rounded-lg',
                  filters.ano
                    ? 'border-indigo-400 font-medium text-slate-900 bg-indigo-50/20'
                    : 'border-slate-200 text-slate-600',
                )}
              >
                <SelectValue placeholder="Ano" />
              </SelectTrigger>
              <SelectContent>
                {options.anos.length === 0 && (
                  <SelectItem value="__none" disabled>
                    Sem dados
                  </SelectItem>
                )}
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
              value={filters.mes}
              onValueChange={(v) =>
                setFilters((prev) => ({ ...prev, mes: v === '__all' ? '' : v }))
              }
            >
              <SelectTrigger
                className={cn(
                  'h-10 text-xs rounded-lg',
                  filters.mes
                    ? 'border-indigo-400 font-medium text-slate-900 bg-indigo-50/20'
                    : 'border-slate-200 text-slate-600',
                )}
              >
                <SelectValue placeholder="Mês" />
              </SelectTrigger>
              <SelectContent>
                {options.meses.length === 0 && (
                  <SelectItem value="__none" disabled>
                    Sem dados
                  </SelectItem>
                )}
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
              value={filters.dia}
              onValueChange={(v) =>
                setFilters((prev) => ({ ...prev, dia: v === '__all' ? '' : v }))
              }
            >
              <SelectTrigger
                className={cn(
                  'h-10 text-xs rounded-lg',
                  filters.dia
                    ? 'border-indigo-400 font-medium text-slate-900 bg-indigo-50/20'
                    : 'border-slate-200 text-slate-600',
                )}
              >
                <SelectValue placeholder="Dia" />
              </SelectTrigger>
              <SelectContent>
                {options.dias.length === 0 && (
                  <SelectItem value="__none" disabled>
                    Sem dados
                  </SelectItem>
                )}
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
            selected={filters.vendedorCliente}
            onChange={(values) => setFilters((prev) => ({ ...prev, vendedorCliente: values }))}
            placeholder="Todos"
            highlight={filters.vendedorCliente.length > 0}
          />
        </div>

        {/* Vendedor */}
        <div>
          <Label className="text-[11px] font-semibold text-slate-500 mb-1 block">Vendedor</Label>
          <MultiSelectDropdown
            label="Vendedor"
            options={options.vendedor}
            selected={filters.vendedor}
            onChange={(values) => setFilters((prev) => ({ ...prev, vendedor: values }))}
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
            selected={filters.grupoItem}
            onChange={(values) => setFilters((prev) => ({ ...prev, grupoItem: values }))}
            placeholder="Todos"
          />
        </div>

        {/* Estado */}
        <div>
          <Label className="text-[11px] font-semibold text-slate-500 mb-1 block">Estado (UF)</Label>
          <MultiSelectDropdown
            label="Estado"
            options={options.estado}
            selected={filters.estado}
            onChange={(values) => setFilters((prev) => ({ ...prev, estado: values }))}
            placeholder="Todos"
          />
        </div>
      </div>

      {/* Row 2: Utilizacao and Optional Search */}
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
            selected={filters.utilizacao}
            onChange={(values) => setFilters((prev) => ({ ...prev, utilizacao: values }))}
            placeholder="Todas utilizações"
          />
        </div>

        {/* Tipo de Devolução */}
        <div>
          <Label className="text-[11px] font-semibold text-slate-500 mb-1 block">
            Tipo de Devolução
          </Label>
          <Select
            value={filters.tipoDevolucao || '__all'}
            onValueChange={(v) =>
              setFilters((prev) => ({ ...prev, tipoDevolucao: v === '__all' ? '' : v }))
            }
          >
            <SelectTrigger
              className={cn(
                'h-10 text-xs rounded-lg',
                filters.tipoDevolucao
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
                value={filters.search}
                onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
                className="h-10 text-xs rounded-lg border-slate-200 pr-8"
              />
              {filters.search && (
                <button
                  type="button"
                  onClick={() => setFilters((prev) => ({ ...prev, search: '' }))}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Active Pills List */}
      {activeFiltersCount > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pt-3 mt-3 border-t border-slate-100">
          <span className="text-[11px] font-medium text-slate-400 mr-1">Filtros ativos:</span>

          {filters.dataDe && (
            <Badge
              variant="outline"
              className="bg-slate-50 border-slate-200 text-slate-700 text-xs pl-2.5 pr-1 py-1 rounded-full flex items-center gap-1"
            >
              <span>De: {filters.dataDe}</span>
              <button
                type="button"
                onClick={() => removeSingleFilter('dataDe')}
                className="p-0.5 rounded-full hover:bg-slate-200 text-slate-500"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          )}

          {filters.dataAte && (
            <Badge
              variant="outline"
              className="bg-slate-50 border-slate-200 text-slate-700 text-xs pl-2.5 pr-1 py-1 rounded-full flex items-center gap-1"
            >
              <span>Até: {filters.dataAte}</span>
              <button
                type="button"
                onClick={() => removeSingleFilter('dataAte')}
                className="p-0.5 rounded-full hover:bg-slate-200 text-slate-500"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          )}

          {filters.vendedorCliente.map((item) => (
            <Badge
              key={item}
              variant="outline"
              className="bg-indigo-50 border-indigo-200 text-indigo-900 text-xs pl-2.5 pr-1 py-1 rounded-full flex items-center gap-1"
            >
              <span className="max-w-[200px] truncate">{item}</span>
              <button
                type="button"
                onClick={() => removeSingleFilter('vendedorCliente', item)}
                className="p-0.5 rounded-full hover:bg-indigo-200 text-indigo-700"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          ))}

          {filters.vendedor.map((item) => (
            <Badge
              key={item}
              variant="outline"
              className="bg-slate-50 border-slate-200 text-slate-700 text-xs pl-2.5 pr-1 py-1 rounded-full flex items-center gap-1"
            >
              <span>Vendedor: {item}</span>
              <button
                type="button"
                onClick={() => removeSingleFilter('vendedor', item)}
                className="p-0.5 rounded-full hover:bg-slate-200 text-slate-500"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          ))}

          {filters.grupoItem.map((item) => (
            <Badge
              key={item}
              variant="outline"
              className="bg-slate-50 border-slate-200 text-slate-700 text-xs pl-2.5 pr-1 py-1 rounded-full flex items-center gap-1"
            >
              <span>Grupo: {item}</span>
              <button
                type="button"
                onClick={() => removeSingleFilter('grupoItem', item)}
                className="p-0.5 rounded-full hover:bg-slate-200 text-slate-500"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          ))}

          {filters.estado.map((item) => (
            <Badge
              key={item}
              variant="outline"
              className="bg-slate-50 border-slate-200 text-slate-700 text-xs pl-2.5 pr-1 py-1 rounded-full flex items-center gap-1"
            >
              <span>UF: {item}</span>
              <button
                type="button"
                onClick={() => removeSingleFilter('estado', item)}
                className="p-0.5 rounded-full hover:bg-slate-200 text-slate-500"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          ))}

          {filters.utilizacao.map((item) => (
            <Badge
              key={item}
              variant="outline"
              className="bg-slate-50 border-slate-200 text-slate-700 text-xs pl-2.5 pr-1 py-1 rounded-full flex items-center gap-1"
            >
              <span>Uso: {item}</span>
              <button
                type="button"
                onClick={() => removeSingleFilter('utilizacao', item)}
                className="p-0.5 rounded-full hover:bg-slate-200 text-slate-500"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          ))}

          {filters.search && (
            <Badge
              variant="outline"
              className="bg-amber-50 border-amber-200 text-amber-900 text-xs pl-2.5 pr-1 py-1 rounded-full flex items-center gap-1"
            >
              <span>Busca: "{filters.search}"</span>
              <button
                type="button"
                onClick={() => removeSingleFilter('search')}
                className="p-0.5 rounded-full hover:bg-amber-200 text-amber-700"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          )}

          {filters.ano && (
            <Badge
              variant="outline"
              className="bg-indigo-50 border-indigo-200 text-indigo-900 text-xs pl-2.5 pr-1 py-1 rounded-full flex items-center gap-1"
            >
              <span>Ano: {filters.ano}</span>
              <button
                type="button"
                onClick={() => removeSingleFilter('ano')}
                className="p-0.5 rounded-full hover:bg-indigo-200 text-indigo-700"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          )}

          {filters.mes && (
            <Badge
              variant="outline"
              className="bg-indigo-50 border-indigo-200 text-indigo-900 text-xs pl-2.5 pr-1 py-1 rounded-full flex items-center gap-1"
            >
              <span>Mês: {nomeMes(Number(filters.mes))}</span>
              <button
                type="button"
                onClick={() => removeSingleFilter('mes')}
                className="p-0.5 rounded-full hover:bg-indigo-200 text-indigo-700"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          )}

          {filters.dia && (
            <Badge
              variant="outline"
              className="bg-indigo-50 border-indigo-200 text-indigo-900 text-xs pl-2.5 pr-1 py-1 rounded-full flex items-center gap-1"
            >
              <span>Dia: {String(filters.dia).padStart(2, '0')}</span>
              <button
                type="button"
                onClick={() => removeSingleFilter('dia')}
                className="p-0.5 rounded-full hover:bg-indigo-200 text-indigo-700"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          )}

          {filters.tipoDevolucao && (
            <Badge
              variant="outline"
              className="bg-rose-50 border-rose-200 text-rose-900 text-xs pl-2.5 pr-1 py-1 rounded-full flex items-center gap-1"
            >
              <span>Devolução: {filters.tipoDevolucao}</span>
              <button
                type="button"
                onClick={() => removeSingleFilter('tipoDevolucao')}
                className="p-0.5 rounded-full hover:bg-rose-200 text-rose-700"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          )}
        </div>
      )}
    </div>
  )
}
