/**
 * Derivação de "Grupo do Item" (filtro novo de Pedidos em Aberto) a partir do
 * texto bruto do campo grupo_item da coleção pedidos_abertos.
 *
 * NÃO reutiliza os rótulos INKS/HARD/OTHERS de jp-class.ts — são categorias
 * diferentes, com opções próprias: Tintas, Acessórios, Peças, Equipamentos, Outros.
 */

export const GRUPO_ITEM_FILTER_OPTIONS = [
  'Tintas',
  'Acessórios',
  'Peças',
  'Equipamentos',
  'Outros',
] as const

export type GrupoItemFilterCategory = (typeof GRUPO_ITEM_FILTER_OPTIONS)[number]

/**
 * Mapeia o texto bruto do grupo do item para uma das categorias fixas do filtro,
 * por palavras-chave (case-insensitive, ignora acentos). Todo o resto → Outros.
 */
export function deriveGrupoItemCategoria(grupoItemRaw: unknown): GrupoItemFilterCategory {
  const norm = String(grupoItemRaw ?? '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

  if (!norm) return 'Outros'
  if (norm.includes('TINTA')) return 'Tintas' // cobre TINTA / TINTAS
  if (norm.includes('ACESSOR')) return 'Acessórios' // acessorios / accessories
  if (norm.includes('PECA')) return 'Peças' // peça / peca / peças / pecas
  if (norm.includes('EQUIP')) return 'Equipamentos' // equipamento / equipamentos / equip
  return 'Outros'
}

/** True quando a categoria derivada está entre as selecionadas no filtro. */
export function matchesGrupoItemFilter(
  grupoItemRaw: unknown,
  selected: string[] | undefined | null,
): boolean {
  if (!selected || selected.length === 0) return true
  return selected.includes(deriveGrupoItemCategoria(grupoItemRaw))
}
