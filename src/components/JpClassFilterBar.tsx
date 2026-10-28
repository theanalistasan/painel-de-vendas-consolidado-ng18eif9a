import React, { useState, useEffect, useMemo } from 'react'
import { Filter, X, ChevronDown, RotateCcw, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { MultiSelectDropdown } from '@/components/FilterBar'
import { cn } from '@/lib/utils'
import { DEFAULT_GRUPOS_ITEM_JP_CLASS } from '@/lib/jp-class'

export interface JpClassFilterState {
  grupoItem: string[]
  tipoDocumento: string[]
  tipoCliente: string[]
  canal: string[]
  deploy: string[]
  utilizacao: string[]
  tipoDevolucao: string[]
  jpClass: string[]
}

export const EMPTY_JP_CLASS_FILTERS: JpClassFilterState = {
  grupoItem: [],
  tipoDocumento: [],
  tipoCliente: [],
  canal: [],
  deploy: [],
  utilizacao: [],
  tipoDevolucao: [],
  jpClass: [],
}

/** Padrão inicial de filtragem com os 4 grupos pré-selecionados */
export const DEFAULT_JP_CLASS_FILTERS: JpClassFilterState = {
  grupoItem: [...DEFAULT_GRUPOS_ITEM_JP_CLASS],
  tipoDocumento: ['NF de Saída'],
  tipoCliente: [],
  canal: [],
  deploy: [],
  utilizacao: ['VENDA DE MERCADORIA', 'VENDA CONSUMO'],
  tipoDevolucao: [],
  jpClass: [],
}

export interface JpClassFilterBarProps {
  filters: JpClassFilterState
  setFilters: React.Dispatch<React.SetStateAction<JpClassFilterState>>
  options: {
    grupoItem: string[]
    tipoDocumento: string[]
    tipoCliente: string[]
    canal: string[]
    deploy: string[]
    utilizacao: string[]
    tipoDevolucao: string[]
    jpClass: string[]
    isLoadingTipoCliente?: boolean
  }
  onApplyFilters?: (appliedFilters: JpClassFilterState) => void
  onResetToDefault?: () => void
  isLoading?: boolean
}

interface ActivePill {
  id: string
  label: string
  type: keyof JpClassFilterState
  value: string
  bgClass: string
}

export function JpClassFilterBar({
  filters,
  setFilters,
  options,
  onApplyFilters,
  onResetToDefault,
  isLoading = false,
}: JpClassFilterBarProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [localFilters, setLocalFilters] = useState<JpClassFilterState>(filters)

  useEffect(() => {
    setLocalFilters(filters)
  }, [filters])

  const hasPendingChanges = useMemo(() => {
    return JSON.stringify(localFilters) !== JSON.stringify(filters)
  }, [localFilters, filters])

  const activeFiltersCount = useMemo(() => {
    return (
      localFilters.grupoItem.length +
      localFilters.tipoDocumento.length +
      localFilters.tipoCliente.length +
      localFilters.canal.length +
      localFilters.deploy.length +
      localFilters.utilizacao.length +
      localFilters.tipoDevolucao.length +
      localFilters.jpClass.length
    )
  }, [localFilters])

  const handleApply = () => {
    setFilters(localFilters)
    if (onApplyFilters) {
      onApplyFilters(localFilters)
    }
  }

  const handleClearAll = () => {
    setLocalFilters(EMPTY_JP_CLASS_FILTERS)
    setFilters(EMPTY_JP_CLASS_FILTERS)
    if (onApplyFilters) {
      onApplyFilters(EMPTY_JP_CLASS_FILTERS)
    }
  }

  const handleResetDefault = () => {
    if (onResetToDefault) {
      onResetToDefault()
    } else {
      setLocalFilters(DEFAULT_JP_CLASS_FILTERS)
      setFilters(DEFAULT_JP_CLASS_FILTERS)
      if (onApplyFilters) {
        onApplyFilters(DEFAULT_JP_CLASS_FILTERS)
      }
    }
  }

  const removeSingleFilter = (type: keyof JpClassFilterState, value: string) => {
    const nextState: JpClassFilterState = {
      ...filters,
      [type]: filters[type].filter((item) => item !== value),
    }
    setLocalFilters(nextState)
    setFilters(nextState)
    if (onApplyFilters) {
      onApplyFilters(nextState)
    }
  }

  const allActivePills = useMemo<ActivePill[]>(() => {
    const list: ActivePill[] = []

    filters.grupoItem.forEach((val) => {
      list.push({
        id: `grupo-${val}`,
        label: `Grupo: ${val}`,
        type: 'grupoItem',
        value: val,
        bgClass: 'bg-slate-50 border-slate-200 text-slate-700 font-medium',
      })
    })

    filters.tipoDocumento.forEach((val) => {
      list.push({
        id: `doc-${val}`,
        label: `Doc: ${val}`,
        type: 'tipoDocumento',
        value: val,
        bgClass: 'bg-cyan-50 border-cyan-200 text-cyan-950 font-semibold',
      })
    })

    filters.tipoCliente.forEach((val) => {
      list.push({
        id: `tc-${val}`,
        label: `Tipo: ${val}`,
        type: 'tipoCliente',
        value: val,
        bgClass: 'bg-purple-50 border-purple-200 text-purple-900 font-semibold',
      })
    })

    filters.canal.forEach((val) => {
      list.push({
        id: `canal-${val}`,
        label: `Canal: ${val}`,
        type: 'canal',
        value: val,
        bgClass: 'bg-[#0B6E99]/10 border-[#0B6E99]/30 text-[#084F6E] font-bold',
      })
    })

    filters.deploy.forEach((val) => {
      list.push({
        id: `deploy-${val}`,
        label: `Deploy: ${val}`,
        type: 'deploy',
        value: val,
        bgClass: 'bg-indigo-50 border-indigo-200 text-indigo-900 font-semibold',
      })
    })

    filters.utilizacao.forEach((val) => {
      list.push({
        id: `util-${val}`,
        label: `Uso: ${val}`,
        type: 'utilizacao',
        value: val,
        bgClass: 'bg-slate-50 border-slate-200 text-slate-700 font-medium',
      })
    })

    filters.tipoDevolucao.forEach((val) => {
      list.push({
        id: `dev-${val}`,
        label: `Devolução: ${val}`,
        type: 'tipoDevolucao',
        value: val,
        bgClass: 'bg-rose-50 border-rose-200 text-rose-900 font-medium',
      })
    })

    filters.jpClass.forEach((val) => {
      list.push({
        id: `jp-${val}`,
        label: `JP-Class: ${val}`,
        type: 'jpClass',
        value: val,
        bgClass: 'bg-sky-50 border-sky-300 text-sky-900 font-bold',
      })
    })

    return list
  }, [filters])

  const MAX_VISIBLE_PILLS = 6
  const visiblePills = allActivePills.slice(0, MAX_VISIBLE_PILLS)
  const remainingPills = allActivePills.slice(MAX_VISIBLE_PILLS)

  return (
    <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-xs transition-all">
      {/* Header com Título e Ações */}
      <div className="flex flex-wrap items-center justify-between pb-3 border-b border-slate-100 gap-2">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-cyan-50 text-[#0B6E99]">
            <Filter className="w-4 h-4" />
          </div>
          <div>
            <span className="text-sm font-bold text-slate-900">Filtros do Relatório JP-Class</span>
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

        <div className="flex items-center gap-2 flex-wrap">
          {/* Botão Aplicar Filtros com destaque se houver alterações pendentes */}
          <Button
            type="button"
            size="sm"
            onClick={handleApply}
            disabled={isLoading}
            className={cn(
              'h-8 px-4 text-xs font-bold rounded-lg transition-all',
              hasPendingChanges
                ? 'bg-[#0B6E99] hover:bg-[#084F6E] text-white ring-2 ring-[#0B6E99]/30 animate-pulse'
                : 'bg-slate-900 hover:bg-slate-800 text-white',
            )}
          >
            Aplicar Filtros
            {hasPendingChanges && (
              <span className="ml-1.5 text-[10px] bg-white/20 px-1 rounded">●</span>
            )}
          </Button>

          {/* Botão Restaurar Padrão Visão Geral / Canais */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleResetDefault}
            disabled={isLoading}
            className="h-8 px-2.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border-slate-200 gap-1"
            title="Restaurar critério padrão de filtragem (Visão Geral / Visão Canais)"
          >
            <RotateCcw className="w-3.5 h-3.5 text-[#0B6E99]" />
            <span>Padrão Geral</span>
          </Button>

          {/* Botão Limpar Filtros */}
          {activeFiltersCount > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleClearAll}
              disabled={isLoading}
              className="text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 h-8 px-2.5 rounded-lg font-semibold"
            >
              <X className="w-3.5 h-3.5 mr-1" />
              Limpar todos
            </Button>
          )}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setCollapsed(!collapsed)}
            className="text-xs text-slate-600 lg:hidden h-8"
          >
            {collapsed ? 'Expandir' : 'Recolher'}
          </Button>
        </div>
      </div>

      {/* Grid com os 7 filtros + filtro JP-Class */}
      <div
        className={cn(
          'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-3',
          collapsed && 'hidden lg:grid',
        )}
      >
        {/* 1. Grupo do Item */}
        <div>
          <Label className="text-[11px] font-bold text-slate-600 mb-1 block">
            (1) Grupo do Item
          </Label>
          <MultiSelectDropdown
            label="Grupo"
            options={options.grupoItem}
            selected={localFilters.grupoItem}
            onChange={(values) => setLocalFilters((prev) => ({ ...prev, grupoItem: values }))}
            placeholder="Todos os grupos"
            highlight={localFilters.grupoItem.length > 0}
          />
        </div>

        {/* 2. Tipo de Documento */}
        <div>
          <Label className="text-[11px] font-bold text-slate-600 mb-1 block">
            (2) Tipo de Documento
          </Label>
          <MultiSelectDropdown
            label="Documento"
            options={options.tipoDocumento}
            selected={localFilters.tipoDocumento}
            onChange={(values) => setLocalFilters((prev) => ({ ...prev, tipoDocumento: values }))}
            placeholder="Todos os documentos"
            highlight={localFilters.tipoDocumento.length > 0}
          />
        </div>

        {/* 3. Tipo de Cliente */}
        <div>
          <Label className="text-[11px] font-bold text-slate-600 mb-1 block">
            (3) Tipo de Cliente
          </Label>
          <MultiSelectDropdown
            label="Tipo Cliente"
            options={options.tipoCliente}
            selected={localFilters.tipoCliente}
            onChange={(values) => setLocalFilters((prev) => ({ ...prev, tipoCliente: values }))}
            placeholder="Todos os tipos"
            highlight={localFilters.tipoCliente.length > 0}
            isLoading={options.isLoadingTipoCliente}
            getOptionLabel={(val) => (val === '-' ? '- (Sem classificação)' : val)}
          />
        </div>

        {/* 4. Canais */}
        <div>
          <Label className="text-[11px] font-bold text-slate-600 mb-1 block">(4) Canais</Label>
          <MultiSelectDropdown
            label="Canal"
            options={options.canal}
            selected={localFilters.canal}
            onChange={(values) => setLocalFilters((prev) => ({ ...prev, canal: values }))}
            placeholder="Todos os canais"
            highlight={localFilters.canal.length > 0}
          />
        </div>

        {/* 5. Deploy (Canal de Faturamento) */}
        <div>
          <Label className="text-[11px] font-bold text-slate-600 mb-1 block">
            (5) Deploy (Faturamento)
          </Label>
          <MultiSelectDropdown
            label="Deploy"
            options={options.deploy}
            selected={localFilters.deploy}
            onChange={(values) => setLocalFilters((prev) => ({ ...prev, deploy: values }))}
            placeholder="Todos os deploys"
            highlight={localFilters.deploy.length > 0}
            getOptionLabel={(dep) => {
              if (dep === 'AGIS') return 'AGIS (revenda)'
              if (dep === 'Roland') return 'Roland (direta)'
              if (dep === 'Nenhum') return 'Nenhum (sem deploy)'
              return dep
            }}
          />
        </div>

        {/* 6. Utilização */}
        <div>
          <Label className="text-[11px] font-bold text-slate-600 mb-1 block">(6) Utilização</Label>
          <MultiSelectDropdown
            label="Utilização"
            options={options.utilizacao}
            selected={localFilters.utilizacao}
            onChange={(values) => setLocalFilters((prev) => ({ ...prev, utilizacao: values }))}
            placeholder="Todas as utilizações"
            highlight={localFilters.utilizacao.length > 0}
          />
        </div>

        {/* 7. Tipo de Devolução */}
        <div>
          <Label className="text-[11px] font-bold text-slate-600 mb-1 block">
            (7) Tipo de Devolução
          </Label>
          <MultiSelectDropdown
            label="Devolução"
            options={options.tipoDevolucao}
            selected={localFilters.tipoDevolucao}
            onChange={(values) => setLocalFilters((prev) => ({ ...prev, tipoDevolucao: values }))}
            placeholder="Todas (inclui ou filtra devoluções)"
            highlight={localFilters.tipoDevolucao.length > 0}
          />
        </div>

        {/* 8. JP-Class (Filtro existente mantido e integrado) */}
        <div>
          <Label className="text-[11px] font-bold text-slate-600 mb-1 block">Classe JP-Class</Label>
          <MultiSelectDropdown
            label="JP-Class"
            options={options.jpClass}
            selected={localFilters.jpClass}
            onChange={(values) => setLocalFilters((prev) => ({ ...prev, jpClass: values }))}
            placeholder="Todas as classes"
            highlight={localFilters.jpClass.length > 0}
          />
        </div>
      </div>

      {/* Seção de Pílulas de Filtros Ativos */}
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
                title="Remover filtro"
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
