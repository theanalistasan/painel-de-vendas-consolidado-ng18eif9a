/**
 * Derivação de "Grupo do Item" (filtro novo de Pedidos em Aberto) a partir do
 * texto bruto do campo grupo_item da coleção pedidos_abertos.
 *
 * NÃO reutiliza os rótulos INKS/HARD/OTHERS de jp-class.ts — são categorias
 * diferentes, com opções próprias: Tintas, Acessórios, Peças, Equipamentos, Outros.
 * Alinhado ao filtro Grupo do Item dos Filtros Globais (jp-class): Tintas = INK* (ex. "INK VERSAOBJECT UV VD") ou TINTA*.
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
  if (norm.startsWith('INK')) return 'Tintas' // regra INK* do usuário: tudo que começa com INK é Tinta
  if (norm.includes('TINTA')) return 'Tintas' // cobre TINTA / TINTAS
  if (norm.includes('ACESSOR') || norm.includes('ACCESS')) return 'Acessórios' // acessorios / accessories
  if (norm.includes('PECA')) return 'Peças' // peça / peca / peças / pecas
  if (norm.startsWith('EQUIP') || norm.includes('EQUIPAMENTO')) return 'Equipamentos' // equipamento / equipamentos
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
