import { useState } from 'react'
import type { SortDir } from '@/lib/sort'

export interface UseTableSortResult<K> {
  /** Campo ativo de ordenação, ou `null` quando nenhuma ordenação está ativa. */
  field: K | null
  /** Direção da ordenação ativa. */
  dir: SortDir
  /** Alterna o ciclo de ordenação para o campo dado. */
  toggle: (field: K) => void
  /** Restaura o estado padrão (sem ordenação ativa). */
  reset: () => void
}

/**
 * Hook de ordenação de tabela com ciclo de 3 estados por coluna:
 *
 * 1º clique  → ascendente (A→Z, menor→maior)
 * 2º clique  → descendente (Z→A, maior→menor)
 * 3º clique  → remove ordenação (volta ao padrão)
 *
 * A ordenação em si é aplicada no frontend (via `sortData`); este hook
 * apenas gerencia o estado (campo + direção) e o ciclo de cliques.
 */
export function useTableSort<K extends string>(
  defaultField: K | null = null,
  defaultDir: SortDir = 'asc',
): UseTableSortResult<K> {
  const [state, setState] = useState<{ field: K | null; dir: SortDir }>({
    field: defaultField,
    dir: defaultDir,
  })

  const toggle = (next: K) => {
    setState((prev) => {
      // Campo diferente: começa em ascendente.
      if (prev.field !== next) return { field: next, dir: 'asc' }
      // Mesmo campo: asc -> desc -> sem ordenação.
      if (prev.dir === 'asc') return { field: next, dir: 'desc' }
      return { field: null, dir: 'asc' }
    })
  }

  const reset = () => setState({ field: defaultField, dir: defaultDir })

  return { field: state.field, dir: state.dir, toggle, reset }
}
