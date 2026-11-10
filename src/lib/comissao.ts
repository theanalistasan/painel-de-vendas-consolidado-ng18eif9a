/**
 * Regras de Classificação de Comissionados vs Não Comissionados
 *
 * Utilizado pelo Relatório Consolidado de Vendas da Visão Canais (/dashboard/canais)
 * e alinhado com o backend (pocketbase/hooks/vendas_list.js e vendas_export.js).
 *
 * Regras de Não Comissionados:
 * 1) Vendas da Roland DG Brasil direta:
 *    vendedor_cliente ou nome_vendedor inicia com "Roland DG Brasil >" (case-insensitive).
 * 2) Autofaturamento / Venda para si mesmo ("dele para ele mesmo"):
 *    - Flag booleana `nao_comissionado === true` vinda do backend.
 *    - Código de cliente da revenda igual ao código do cliente comprador (`codigo_cliente_revenda === codigo_cliente`).
 *    - No campo composto `vendedor_cliente` ("VENDEDOR > CLIENTE"): vendedor normalizado == cliente normalizado.
 *    - Nome do vendedor normalizado == nome do cliente normalizado.
 *
 * Normalização de Razão Social / Nome de Empresa:
 * Ignora maiúsculas/minúsculas, acentos, pontuações, espaços múltiplos e sufixos
 * societários comuns no Brasil (LTDA, LTDA., ME, EPP, EIRELI, S/A, S.A., S.A, SA, CIA, COMPANHIA).
 * Exemplo real: "CH SUPRIMENTOS PARA COMUNICACAO VISUAL" vs "CH SUPRIMENTOS PARA COMUNICACAO VISUAL LTDA".
 */

export const PREFIXO_NAO_COMISSIONADO = 'Roland DG Brasil > '

/**
 * Remove acentos de uma string
 */
export function removeAcentos(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

/**
 * Lista de sufixos societários comuns no Brasil, que frequentemente aparecem
 * no cadastro do cliente mas são omitidos no nome do vendedor (ou vice-versa).
 */
const SUFIXOS_SOCIETARIOS = ['LTDA', 'ME', 'EPP', 'EIRELI', 'SA', 'S/A', 'S.A', 'CIA', 'COMPANHIA']

/**
 * Normaliza um nome de empresa/vendedor/cliente para comparação de equivalência:
 * - converte para maiúsculas
 * - remove acentos
 * - substitui pontuações por espaço (ex: "S.A.", "LTDA.", "EIRELI - ME")
 * - remove sufixos societários no final ou como tokens isolados finais
 * - condensa espaços múltiplos e faz trim
 */
export function normalizeNomeEmpresa(nome: string | null | undefined): string {
  if (!nome) return ''

  // 1. Remove acentos e converte para maiúsculas
  let str = removeAcentos(String(nome)).toUpperCase()

  // 2. Substitui pontuação (pontos, vírgulas, barras, traços, sublinhados) por espaço
  // Mantém letras e números
  str = str.replace(/[.,/\\_\-()&]/g, ' ')

  // 3. Normaliza espaços internos
  let tokens = str.trim().split(/\s+/).filter(Boolean)

  // 4. Remove repetidamente sufixos societários que estejam no final da lista de tokens
  // Exemplo: "LTDA ME" -> remove ME, depois remove LTDA
  let changed = true
  while (changed && tokens.length > 1) {
    const lastToken = tokens[tokens.length - 1]
    if (SUFIXOS_SOCIETARIOS.includes(lastToken)) {
      tokens.pop()
    } else {
      changed = false
    }
  }

  return tokens.join(' ')
}

/**
 * Verifica se dois nomes representam a mesma empresa/entidade comercial.
 */
export function areNomesEmpresaIguais(
  nomeA: string | null | undefined,
  nomeB: string | null | undefined,
): boolean {
  const normA = normalizeNomeEmpresa(nomeA)
  const normB = normalizeNomeEmpresa(nomeB)
  if (!normA || !normB) return false
  return normA === normB
}

export interface VendaComissaoFields {
  vendedor_cliente?: string | null
  nome_vendedor?: string | null
  nome_cliente?: string | null
  codigo_cliente?: string | null
  codigo_cliente_revenda?: string | null
  nao_comissionado?: boolean | null
}

/**
 * Classifica a venda entre Comissionado e Não Comissionado.
 * Invariante estrita: cada venda é classificada exclusivamente como Comissionado ou Não Comissionado.
 */
export function isVendedorNaoComissionado(venda: VendaComissaoFields): boolean {
  // Flag explícita (ex: já computada pelo backend)
  if (venda.nao_comissionado === true) {
    return true
  }

  const rawVendedor = (venda.vendedor_cliente || venda.nome_vendedor || '').trim()

  // 1) Regra Roland DG Brasil direta: vendedor inicia com "Roland DG Brasil >" (case-insensitive)
  if (rawVendedor.toLowerCase().startsWith('roland dg brasil >')) {
    return true
  }

  // 2) Auto-faturamento por código de cliente da revenda x comprador
  const codRevenda = (venda.codigo_cliente_revenda || '').trim()
  const codCliente = (venda.codigo_cliente || '').trim()
  if (codRevenda && codCliente && codRevenda.toUpperCase() === codCliente.toUpperCase()) {
    return true
  }

  // 3) Auto-faturamento no campo composto `vendedor_cliente` ("VENDEDOR > CLIENTE")
  const comp = (venda.vendedor_cliente || '').trim()
  if (comp.includes('>')) {
    const parts = comp.split('>')
    const parteVendedor = parts[0] || ''
    const parteCliente = parts.slice(1).join('>') || ''
    if (parteVendedor && parteCliente && areNomesEmpresaIguais(parteVendedor, parteCliente)) {
      return true
    }
  }

  // 4) Auto-faturamento por nome_vendedor x nome_cliente normalizados
  if (venda.nome_vendedor && venda.nome_cliente) {
    if (areNomesEmpresaIguais(venda.nome_vendedor, venda.nome_cliente)) {
      return true
    }
  }

  return false
}

// Alias semântico para maior clareza de uso
export const isVendaNaoComissionada = isVendedorNaoComissionado
