/**
 * Utilitários de formatação e CSV em padrão pt-BR
 */

export function formatCurrency(value: number | undefined | null): string {
  if (value === undefined || value === null || isNaN(value)) return 'R$ 0,00'
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

export function formatNumber(value: number | undefined | null, decimals = 0): string {
  if (value === undefined || value === null || isNaN(value)) return '0'
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value)
}

export function formatDate(value: string | Date | undefined | null): string {
  if (!value) return '-'
  try {
    // Se for string no formato ISO (YYYY-MM-DD...), formata direto para evitar conversões indesejadas
    if (typeof value === 'string') {
      const match = value.match(/^(\d{4})[-/](\d{2})[-/](\d{2})/)
      if (match) {
        const [, y, m, d] = match
        return `${d}/${m}/${y}`
      }
      // Se for string dd/mm/yyyy
      const brMatch = value.match(/^(\d{2})[/\-.](\d{2})[/\-.](\d{4})/)
      if (brMatch) {
        const [, d, m, y] = brMatch
        return `${d}/${m}/${y}`
      }
    }
    const d = typeof value === 'string' ? new Date(value) : value
    if (isNaN(d.getTime())) return String(value)
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'UTC',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(d)
  } catch (_) {
    return String(value)
  }
}

export function formatDateTime(value: string | Date | undefined | null): string {
  if (!value) return '-'
  try {
    const d = typeof value === 'string' ? new Date(value) : value
    if (isNaN(d.getTime())) return String(value)
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d)
  } catch (_) {
    return String(value)
  }
}

export const MESES_PT_BR = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
] as const

export const MESES_CURTOS = [
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
] as const

/**
 * Parse uma data que pode vir em formato brasileiro (dd/mm/yyyy) ou ISO (yyyy-mm-dd),
 * podendo conter ou não horário. Retorna um objeto Date válido em horário local (meio-dia UTC)
 * ou null se inválida/vazia.
 */
export function parseDataLancamento(value: string | undefined | null): Date | null {
  if (!value) return null
  const str = String(value).trim()
  if (!str) return null

  // ISO: yyyy-mm-dd[Thh:mm:ss...] ou yyyy/mm/dd
  const isoMatch = str.match(/^(\d{4})[-/](\d{2})[-/](\d{2})(.*)$/)
  if (isoMatch) {
    const [, y, m, d] = isoMatch
    const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), 12, 0, 0))
    return isNaN(date.getTime()) ? null : date
  }

  // Brasileiro: dd/mm/yyyy[ hh:mm:ss] ou mm/dd/yyyy caso p2 > 12
  const brMatch = str.match(/^(\d{2})[/\-.](\d{2})[/\-.](\d{4})(.*)$/)
  if (brMatch) {
    let p1 = Number(brMatch[1])
    let p2 = Number(brMatch[2])
    const y = Number(brMatch[3])

    let d = p1
    let m = p2
    if (p2 > 12 && p1 <= 12) {
      m = p1
      d = p2
    }

    const date = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
    return isNaN(date.getTime()) ? null : date
  }

  // Fallback: deixa o Date tentar
  const fallback = new Date(str)
  return isNaN(fallback.getTime()) ? null : fallback
}

/**
 * Extrai o ano (4 dígitos) de uma data de lançamento (BR ou ISO).
 */
export function extractAno(value: string | undefined | null): number | null {
  const d = parseDataLancamento(value)
  if (!d) return null
  return d.getUTCFullYear()
}

/**
 * Extrai o mês (1-12) de uma data de lançamento (BR ou ISO).
 */
export function extractMes(value: string | undefined | null): number | null {
  const d = parseDataLancamento(value)
  if (!d) return null
  return d.getUTCMonth() + 1
}

/**
 * Extrai o dia (1-31) de uma data de lançamento (BR ou ISO).
 */
export function extractDia(value: string | undefined | null): number | null {
  const d = parseDataLancamento(value)
  if (!d) return null
  return d.getUTCDate()
}

export function nomeMes(numero: number): string {
  return MESES_PT_BR[numero - 1] || String(numero)
}

export function formatMonthYear(isoDate: string): string {
  if (!isoDate) return ''
  try {
    const d = new Date(isoDate)
    if (isNaN(d.getTime())) return ''
    return `${MESES_CURTOS[d.getUTCMonth()]}/${String(d.getUTCFullYear()).slice(2)}`
  } catch (_) {
    return isoDate
  }
}

/**
 * Cores temáticas para grupos de produtos
 */
export const GRUPO_COLORS: Record<string, string> = {
  EQUIPAMENTOS: '#4F46E5', // Indigo
  TINTAS: '#0D9488', // Teal
  ACESSÓRIOS: '#F59E0B', // Amber
  ACESSORIOS: '#F59E0B',
  SOFTWARE: '#8B5CF6', // Purple
  PEÇAS: '#EF4444', // Red
  PECAS: '#EF4444',
  SERVIÇOS: '#3B82F6', // Blue
  SERVICOS: '#3B82F6',
  OUTROS: '#64748B', // Slate
}

export function getGrupoColor(grupo: string): string {
  const normalized = (grupo || '').toUpperCase().trim()
  return GRUPO_COLORS[normalized] || '#8B5CF6'
}

/**
 * Parser de arquivos XLSX (Excel) usando SheetJS.
 * Lê o ArrayBuffer e devolve um array de objetos { coluna: valor },
 * convertendo todos os valores para string (compatível com parseCSV).
 */
export async function parseXLSX(data: ArrayBuffer): Promise<Record<string, string>[]> {
  const XLSX = await import('xlsx')
  const workbook = XLSX.read(data, { type: 'array', cellDates: true })
  const firstSheetName = workbook.SheetNames[0]
  if (!firstSheetName) return []
  const sheet = workbook.Sheets[firstSheetName]
  // raw:false força o XLSX a formatar datas/números como strings conforme a formatação da célula
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
    raw: false,
  })
  return json.map((row) => {
    const out: Record<string, string> = {}
    for (const key of Object.keys(row)) {
      const v = row[key]
      if (v === null || v === undefined) {
        out[key] = ''
      } else if (v instanceof Date) {
        // Formata Date vindo do XLSX diretamente em DD/MM/YYYY para evitar distorção de fuso
        const day = String(v.getUTCDate()).padStart(2, '0')
        const month = String(v.getUTCMonth() + 1).padStart(2, '0')
        const year = v.getUTCFullYear()
        out[key] = `${day}/${month}/${year}`
      } else {
        out[key] = String(v).trim()
      }
    }
    return out
  })
}

/**
 * Parser de arquivos CSV flexível (detecta delimitador ; ou ,)
 */
export function parseCSV(csvText: string): Record<string, string>[] {
  const cleanText = csvText.replace(/^\uFEFF/, '').trim()
  if (!cleanText) return []

  const lines = cleanText.split(/\r?\n/)
  if (lines.length === 0) return []

  const firstLine = lines[0]
  const semicolonCount = (firstLine.match(/;/g) || []).length
  const commaCount = (firstLine.match(/,/g) || []).length
  const tabCount = (firstLine.match(/\t/g) || []).length

  let delimiter = ';'
  if (tabCount > semicolonCount && tabCount > commaCount) {
    delimiter = '\t'
  } else if (commaCount > semicolonCount) {
    delimiter = ','
  }

  // Helper to split row respecting quotes
  const splitRow = (rowStr: string): string[] => {
    const result: string[] = []
    let current = ''
    let inQuotes = false

    for (let i = 0; i < rowStr.length; i++) {
      const char = rowStr[i]
      if (char === '"') {
        if (inQuotes && rowStr[i + 1] === '"') {
          current += '"'
          i++
        } else {
          inQuotes = !inQuotes
        }
      } else if (char === delimiter && !inQuotes) {
        result.push(current.trim())
        current = ''
      } else {
        current += char
      }
    }
    result.push(current.trim())
    return result
  }

  const headers = splitRow(lines[0]).map((h) => h.replace(/^["']|["']$/g, '').trim())

  const rows: Record<string, string>[] = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const values = splitRow(line)
    const obj: Record<string, string> = {}
    headers.forEach((header, index) => {
      let val = values[index] ?? ''
      val = val.replace(/^["']|["']$/g, '').trim()
      obj[header] = val
    })
    rows.push(obj)
  }

  return rows
}

/**
 * Exporta array de objetos para CSV com BOM UTF-8, separador `;` e decimal `,`
 */
export function exportToCSV(
  filename: string,
  rows: Record<string, unknown>[],
  columns: { key: string; label: string }[],
) {
  const headerRow = columns.map((c) => `"${c.label.replace(/"/g, '""')}"`).join(';')

  const dataRows = rows.map((row) => {
    return columns
      .map((col) => {
        const val = row[col.key]
        if (val === undefined || val === null) return '""'
        if (typeof val === 'number') {
          // Format with comma as decimal
          return `"${val.toString().replace('.', ',')}"`
        }
        if (typeof val === 'string' && val.match(/^\d{4}-\d{2}-\d{2}/)) {
          return `"${formatDate(val)}"`
        }
        return `"${String(val).replace(/"/g, '""')}"`
      })
      .join(';')
  })

  const csvContent = '\uFEFF' + [headerRow, ...dataRows].join('\r\n')
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.setAttribute('href', url)
  link.setAttribute('download', filename.endsWith('.csv') ? filename : `${filename}.csv`)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
