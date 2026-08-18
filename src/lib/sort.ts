/**
 * Utilitários de ordenação de tabelas no frontend.
 *
 * A ordenação é feita sobre os dados já carregados (não chama o backend),
 * respeitando filtros e paginação existentes — apenas reordena o que já
 * está em memória.
 */

export type SortDir = 'asc' | 'desc'

/** Verifica se um valor deve ser tratado como "vazio" para ordenação. */
export function isEmptyValue(v: unknown): boolean {
  return v === null || v === undefined || v === ''
}

/**
 * Comparador genérico para ordenação.
 * - Números: comparação numérica direta.
 * - Strings (texto e datas ISO): `localeCompare` pt-BR. Datas em formato
 *   ISO (yyyy-mm-dd[ hh:mm:ss]) ordenam lexicograficamente = cronologicamente.
 */
export function compareValues(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b
  const sa = a === null || a === undefined ? '' : String(a)
  const sb = b === null || b === undefined ? '' : String(b)
  return sa.localeCompare(sb, 'pt-BR')
}

/**
 * Ordena uma lista de objetos por um campo, no frontend.
 *
 * - `field` nulo retorna a lista sem ordenar (estado "padrão").
 * - `dir` 'asc' | 'desc'.
 * - Valores vazios/nulos vão sempre para o final, independente da direção.
 *
 * Retorna uma nova lista (não muta a original).
 */
export function sortData<T>(items: T[], field: keyof T | null, dir: SortDir): T[] {
  if (!field) return items
  const withValue: T[] = []
  const withoutValue: T[] = []
  for (const it of items) {
    if (isEmptyValue(it[field])) withoutValue.push(it)
    else withValue.push(it)
  }
  withValue.sort((a, b) => {
    const cmp = compareValues(a[field], b[field])
    return dir === 'asc' ? cmp : -cmp
  })
  return [...withValue, ...withoutValue]
}
