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
    const d = typeof value === 'string' ? new Date(value) : value
    if (isNaN(d.getTime())) return String(value)
    // Adjust timezone offset if UTC date
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

export function formatMonthYear(isoDate: string): string {
  if (!isoDate) return ''
  try {
    const d = new Date(isoDate)
    if (isNaN(d.getTime())) return ''
    const months = [
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
    ]
    return `${months[d.getUTCMonth()]}/${String(d.getUTCFullYear()).slice(2)}`
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
