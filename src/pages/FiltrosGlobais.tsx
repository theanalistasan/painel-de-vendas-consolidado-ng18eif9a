import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SlidersHorizontal, RefreshCw, AlertTriangle } from 'lucide-react'
import FilterBar from '@/components/FilterBar'
import { fetchDashboardStats, type DashboardStatsResult } from '@/services/sales'
import type { FilterState } from '@/types/sales'
import {
  saveFiltersToSession,
  loadFiltersFromSession,
  hasSavedFiltersInSession,
  buildDynamicInitialFilters,
} from '@/lib/filter-persistence'
import { JP_CLASS_OPTIONS } from '@/lib/jp-class'
import {
  fetchTiposClienteOptions,
  fetchTiposClienteMap,
  buildTiposClienteStringMap,
} from '@/services/tiposCliente'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * Página de Filtros Globais (/dashboard/filtros).
 *
 * Centraliza TODOS os filtros globais hoje presentes nas barras da Visão Geral
 * e da Visão Canais. O estado é persistido no sessionStorage pelo mesmo service
 * usado pelas duas visões (filter-persistence), de modo que o que for definido
 * aqui passa a valer para a Visão Geral E para a Visão Canais.
 */
export default function FiltrosGlobais() {
  const [optionsData, setOptionsData] = useState<DashboardStatsResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tipoClienteOptions, setTipoClienteOptions] = useState<string[]>([])
  const [tiposClienteMap, setTiposClienteMap] = useState<Record<string, string>>({})

  const hadSavedFiltersAtMount = useRef(hasSavedFiltersInSession())
  const [filters, setFilters] = useState<FilterState>(() => loadFiltersFromSession())
  const [initializedFromBase, setInitializedFromBase] = useState(() => hasSavedFiltersInSession())

  // Persiste no mesmo espaço de sessão usado pelas duas visões
  useEffect(() => {
    if (hadSavedFiltersAtMount.current || initializedFromBase) {
      saveFiltersToSession(filters)
    }
  }, [filters, initializedFromBase])

  const filtersRef = useRef(filters)
  filtersRef.current = filters
  const initializedRef = useRef(initializedFromBase)
  initializedRef.current = initializedFromBase

  // Busca apenas as opções dinâmicas dos filtros (base vazia ⇒ listas vazias, sem quebrar)
  const loadOptions = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetchDashboardStats(
        filtersRef.current as unknown as Record<string, unknown>,
      )

      // Primeiro acesso sem sessão: aplica os filtros dinâmicos padrão da base
      if (!initializedRef.current && !hasSavedFiltersInSession() && res?.filterOptions) {
        const dynamicFilters = buildDynamicInitialFilters(res.filterOptions)
        setInitializedFromBase(true)
        saveFiltersToSession(dynamicFilters)
        setFilters(dynamicFilters)
      } else if (!initializedRef.current && res?.filterOptions) {
        setInitializedFromBase(true)
      }

      setOptionsData(res)
    } catch (err: unknown) {
      console.error('[FiltrosGlobais] Erro ao carregar opções de filtros:', err)
      setError(err instanceof Error ? err.message : 'Falha ao carregar opções de filtros.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadOptions()
  }, [loadOptions])

  useEffect(() => {
    let mounted = true
    Promise.all([fetchTiposClienteOptions(), fetchTiposClienteMap()])
      .then(([opts, rawMap]) => {
        if (!mounted) return
        if (Array.isArray(opts) && opts.length > 0) {
          setTipoClienteOptions(opts)
        }
        if (rawMap && typeof rawMap === 'object') {
          const stringMap = buildTiposClienteStringMap(rawMap)
          setTiposClienteMap(stringMap)
        }
      })
      .catch((err) => console.warn('Falha ao buscar dados de tipo de cliente:', err))
    return () => {
      mounted = false
    }
  }, [])

  const filterOptions = useMemo(() => {
    const baseOpts = optionsData?.filterOptions || {
      vendedorCliente: [],
      vendedor: [],
      grupoItem: [],
      estado: [],
      utilizacao: [],
      tipoDocumento: [],
      canais: [],
      canaisClientes: [],
      inside: [],
      anos: [],
      meses: [],
      dias: [],
    }
    return {
      ...baseOpts,
      jpClass: JP_CLASS_OPTIONS as unknown as string[],
      tipoCliente: (() => {
        const set = new Set<string>()
        if (baseOpts.tipoCliente) {
          baseOpts.tipoCliente.forEach((tc) => tc && set.add(tc.trim()))
        }
        tipoClienteOptions.forEach((tc) => tc && set.add(tc.trim()))
        Object.values(tiposClienteMap).forEach((tc) => tc && set.add(tc.trim()))
        return Array.from(set)
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b, 'pt-BR'))
      })(),
      isLoadingTipoCliente: false,
    }
  }, [optionsData, tipoClienteOptions, tiposClienteMap])

  return (
    <div className="space-y-6">
      {/* Cabeçalho explicativo */}
      <Card className="rounded-xl border border-gray-200 bg-white p-4 shadow-xs">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-xl bg-cyan-50 text-[#0B6E99] shrink-0">
            <SlidersHorizontal className="w-5 h-5" />
          </div>
          <div>
            <CardTitle className="text-base font-extrabold text-slate-900">
              Filtros Globais
            </CardTitle>
            <CardDescription className="text-xs text-slate-500 font-medium mt-0.5">
              Os filtros definidos aqui valem para o painel inteiro: aplicam-se à Visão Geral e à
              Visão Canais. Os filtros de Canais (Canal, Clientes, Deploy e Inside) ficam na Visão
              Canais.
            </CardDescription>
          </div>
        </div>
      </Card>

      {/* Aviso quando as opções dinâmicas não puderem ser carregadas (ex.: base vazia/timeout) */}
      {error && (
        <Card className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 shadow-xs">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-start gap-2 text-xs text-slate-600">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>
                Não foi possível carregar as opções dinâmicas dos filtros ({error}). Os filtros
                salvos nesta sessão continuam válidos.
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadOptions()}
              className="bg-white border-amber-300 text-slate-700 hover:bg-amber-100 font-bold gap-1.5 text-xs shadow-2xs h-8 shrink-0"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Tentar novamente
            </Button>
          </div>
        </Card>
      )}

      {/* Filtros globais (sem os filtros de Canais, que ficam na Visão Canais) */}
      {loading && !optionsData ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : (
        <FilterBar
          hideCanais
          filters={filters}
          setFilters={setFilters}
          options={filterOptions}
          isLoading={loading}
          loadingMessage="Atualizando opções de filtros..."
          onApplyFilters={() => {
            // Os filtros são aplicados automaticamente às visões via persistência de sessão
          }}
        />
      )}
    </div>
  )
}
