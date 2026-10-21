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

/**
 * Extrai o campo Grupo do item a partir de qualquer uma das propriedades conhecidas
 * (grupo_item, grupo ou itms_grp_nam), sem considerar valores pré-calculados de jp_class.
 */
export function extractGrupoItem(
  source:
    | string
    | {
        grupo_item?: string | null
        itms_grp_nam?: string | null
        grupo?: string | null
      }
    | null
    | undefined,
): string {
  if (!source) return ''
  if (typeof source === 'string') return source
  return (
    (source.grupo_item && source.grupo_item.trim()) ||
    (source.grupo && source.grupo.trim()) ||
    (source.itms_grp_nam && source.itms_grp_nam.trim()) ||
    ''
  )
}

export function getJpClass(
  rawOrItem:
    | string
    | {
        grupo_item?: string | null
        itms_grp_nam?: string | null
        grupo?: string | null
        jp_class?: string | null
      }
    | null
    | undefined,
): string {
  const raw =
    typeof rawOrItem === 'object' && rawOrItem !== null
      ? extractGrupoItem(rawOrItem)
      : typeof rawOrItem === 'string'
        ? rawOrItem
        : ''

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

  if (
    norm === 'SEM CLASSE' ||
    norm === 'SEM_CLASSE' ||
    norm === 'SEM INFORMACAO' ||
    norm === 'VAZIO'
  ) {
    return 'Sem classe'
  }

  // Qualquer outro valor de Grupo não mapeado recebe OTHERS (não mantém o original)
  return 'OTHERS'
}

/**
 * Retorna o grupo de JP-Class para fins de agrupamento na tabela.
 * Equivalente a getJpClass, garantindo 'HARD' | 'INKS' | 'OTHERS' | 'Sem classe'.
 */
export function getJpClassGroup(
  rawOrItem:
    | string
    | {
        grupo_item?: string | null
        itms_grp_nam?: string | null
        grupo?: string | null
      }
    | null
    | undefined,
): string {
  return getJpClass(rawOrItem)
}

/**
 * Retorna uma das 4 opções padronizadas de JP_CLASS_OPTIONS ('HARD' | 'INKS' | 'OTHERS' | 'Sem classe')
 */
export function getStandardJpClass(
  rawOrItem:
    | string
    | {
        grupo_item?: string | null
        itms_grp_nam?: string | null
        grupo?: string | null
      }
    | null
    | undefined,
): (typeof JP_CLASS_OPTIONS)[number] {
  const derived = getJpClass(rawOrItem)
  if (derived === 'HARD' || derived === 'INKS' || derived === 'OTHERS') {
    return derived
  }
  return 'Sem classe'
}

/**
 * Verifica se uma linha/item casa com a seleção de filtro JP-Class.
 * Suporta assinatura direta com (grupoItem, selectedClasses) ou legado (itemJpClass, grupoItem, selectedClasses).
 * "Sem classe" casa com itens sem correspondência (grupo vazio ou "Sem classe").
 */
export function matchesJpClassFilter(
  grupoOrJpClass:
    | string
    | {
        grupo_item?: string | null
        itms_grp_nam?: string | null
        grupo?: string | null
      }
    | null
    | undefined,
  grupoOrSelected?: string | null | undefined | string[],
  selectedClasses?: string[],
): boolean {
  let targetGrupo: string | null | undefined
  let targetClasses: string[] | undefined

  if (Array.isArray(grupoOrSelected)) {
    // Chamada direta: (grupoItem, selectedClasses)
    targetGrupo =
      typeof grupoOrJpClass === 'object' && grupoOrJpClass !== null
        ? extractGrupoItem(grupoOrJpClass)
        : typeof grupoOrJpClass === 'string'
          ? grupoOrJpClass
          : ''
    targetClasses = grupoOrSelected
  } else {
    // Chamada legada de 3 argumentos: (itemJpClass, grupoItem, selectedClasses)
    targetGrupo =
      grupoOrSelected !== undefined &&
      grupoOrSelected !== null &&
      String(grupoOrSelected).trim() !== ''
        ? String(grupoOrSelected)
        : typeof grupoOrJpClass === 'object' && grupoOrJpClass !== null
          ? extractGrupoItem(grupoOrJpClass)
          : typeof grupoOrJpClass === 'string'
            ? grupoOrJpClass
            : ''
    targetClasses = selectedClasses
  }

  if (!targetClasses || targetClasses.length === 0) return true
  const standard = getStandardJpClass(targetGrupo)
  return targetClasses.some((sel) => {
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
