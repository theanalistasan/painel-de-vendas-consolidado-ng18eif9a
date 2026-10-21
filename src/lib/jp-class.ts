/**
 * Normalização e De/Para de JP-Class
 *
 * Regras:
 * - TINTAS → INKS
 * - EQUIPAMENTOS → HARD
 * - PEÇAS → OTHERS
 * - ACESSÓRIOS → OTHERS (tratar também a grafia 'ASSESSÓRIOS' como OTHERS)
 * - Qualquer outro valor de Grupo NÃO mapeado recebe OTHERS (não mantém o original)
 * - Apenas itens com Grupo vazio/ausente recebem 'Sem classe'
 * - Normalizar antes do De/Para: trim, maiúsculas e remoção de acentos (ex.: "PEÇAS" e "PECAS" caem na mesma regra)
 */

export function normalizeText(text: string | null | undefined): string {
  if (!text) return ''
  return text
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
}

export function isMatchedJpClassRule(raw: string | null | undefined): boolean {
  const norm = normalizeText(raw)
  return (
    norm === 'TINTAS' ||
    norm === 'TINTA' ||
    norm === 'EQUIPAMENTOS' ||
    norm === 'EQUIPAMENTO' ||
    norm === 'PECAS' ||
    norm === 'PECA' ||
    norm === 'ACESSORIOS' ||
    norm === 'ACESSORIO' ||
    norm === 'ASSESSORIOS' ||
    norm === 'ASSESSORIO'
  )
}

export const JP_CLASS_OPTIONS = ['HARD', 'INKS', 'OTHERS', 'Sem classe'] as const
export type JpClassOption = (typeof JP_CLASS_OPTIONS)[number]

export function getJpClass(raw: string | null | undefined): string {
  if (!raw) return 'Sem classe'
  const trimmed = raw.trim()
  if (!trimmed) return 'Sem classe'

  const norm = normalizeText(trimmed)

  if (norm === 'HARD' || norm === 'EQUIPAMENTOS' || norm === 'EQUIPAMENTO') {
    return 'HARD'
  }
  if (norm === 'INKS' || norm === 'TINTAS' || norm === 'TINTA') {
    return 'INKS'
  }
  if (
    norm === 'OTHERS' ||
    norm === 'PECAS' ||
    norm === 'PECA' ||
    norm === 'ACESSORIOS' ||
    norm === 'ACESSORIO' ||
    norm === 'ASSESSORIOS' ||
    norm === 'ASSESSORIO'
  ) {
    return 'OTHERS'
  }

  if (norm === 'SEM CLASSE') {
    return 'Sem classe'
  }

  // Qualquer outro valor de Grupo não mapeado recebe OTHERS
  return 'OTHERS'
}

/**
 * Retorna o grupo de JP-Class para fins de agrupamento na tabela.
 * Equivalente a getJpClass, garantindo 'HARD' | 'INKS' | 'OTHERS' | 'Sem classe'.
 */
export function getJpClassGroup(raw: string | null | undefined): string {
  return getJpClass(raw)
}

/**
 * Retorna uma das 4 opções padronizadas de JP_CLASS_OPTIONS ('HARD' | 'INKS' | 'OTHERS' | 'Sem classe')
 */
export function getStandardJpClass(
  raw: string | null | undefined,
): (typeof JP_CLASS_OPTIONS)[number] {
  const derived = getJpClass(raw)
  if (derived === 'HARD' || derived === 'INKS' || derived === 'OTHERS') {
    return derived
  }
  return 'Sem classe'
}

/**
 * Verifica se uma linha/item casa com a seleção de filtro JP-Class.
 * "Sem classe" casa com itens sem correspondência (jp_class vazio ou "Sem classe").
 */
export function matchesJpClassFilter(
  itemJpClass: string | null | undefined,
  descricaoItem: string | null | undefined,
  selectedClasses: string[] | undefined,
): boolean {
  if (!selectedClasses || selectedClasses.length === 0) return true
  const raw = itemJpClass || getJpClass(descricaoItem)
  const standard = getStandardJpClass(raw)
  return selectedClasses.some((sel) => {
    const s = (sel || '').trim().toLowerCase()
    if (s === 'sem classe' || s === 'sem_classe' || s === 'sem informação' || s === 'vazio') {
      return standard === 'Sem classe'
    }
    return s === standard.toLowerCase()
  })
}

/** Cores de Badge para JP-Class */
export function getJpClassBadgeStyle(jpClass: string | null | undefined): {
  className: string
  bgHex?: string
} {
  const norm = (jpClass || '').toUpperCase().trim()
  if (norm === 'INKS') {
    return {
      className: 'bg-sky-50 text-sky-700 border-sky-300 font-bold',
    }
  }
  if (norm === 'HARD') {
    return {
      className: 'bg-amber-50 text-amber-800 border-amber-300 font-bold',
    }
  }
  if (norm === 'OTHERS') {
    return {
      className: 'bg-emerald-50 text-emerald-800 border-emerald-300 font-bold',
    }
  }
  // 'SEM CLASSE' ou vazio
  return {
    className: 'bg-slate-100 text-slate-500 border-slate-200 italic',
  }
}
