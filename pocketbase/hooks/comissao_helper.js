// Helper de Regras de Comissionamento para Goja / PocketBase pb_hooks
// Compatível com ES5 / Goja (sem syntax TS, sem import/export).
//
// Regras de Não Comissionados:
// 1) Roland DG Brasil direta: vendedor_cliente / nome_vendedor inicia com "Roland DG Brasil >" (case-insensitive)
// 2) Autofaturamento / Venda para si mesmo ("dele para ele mesmo"):
//    - Código de cliente da revenda igual ao código do cliente comprador (quando código de revenda for resolvido)
//    - Campo composto vendedor_cliente ("VENDEDOR > CLIENTE") com vendedor normalizado == cliente normalizado
//    - nome_vendedor normalizado == nome_cliente normalizado
//
// Normalização de Razão Social / Empresa:
// - Converte para maiúsculas
// - Remove acentos
// - Substitui pontuações por espaço
// - Remove sufixos societários finais: LTDA, ME, EPP, EIRELI, SA, S/A, S.A, CIA, COMPANHIA

function removeAcentosHook(text) {
  if (!text) return ''
  try {
    if (typeof text.normalize === 'function') {
      return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    }
  } catch (_) {}
  // Fallback caso normalize NFD não esteja disponível em Goja
  var map = {
    Á: 'A',
    À: 'A',
    Ã: 'A',
    Â: 'A',
    Ä: 'A',
    É: 'E',
    È: 'E',
    Ê: 'E',
    Ë: 'E',
    Í: 'I',
    Ì: 'I',
    Î: 'I',
    Ï: 'I',
    Ó: 'O',
    Ò: 'O',
    Õ: 'O',
    Ô: 'O',
    Ö: 'O',
    Ú: 'U',
    Ù: 'U',
    Û: 'U',
    Ü: 'U',
    Ç: 'C',
    Ñ: 'N',
    á: 'A',
    à: 'A',
    ã: 'A',
    â: 'A',
    ä: 'A',
    é: 'E',
    è: 'E',
    ê: 'E',
    ë: 'E',
    í: 'I',
    ì: 'I',
    î: 'I',
    ï: 'I',
    ó: 'O',
    ò: 'O',
    õ: 'O',
    ô: 'O',
    ö: 'O',
    ú: 'U',
    ù: 'U',
    û: 'U',
    ü: 'U',
    ç: 'C',
    ñ: 'N',
  }
  return String(text).replace(/[ÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇÑáàãâäéèêëíìîïóòõôöúùûüçñ]/g, function (m) {
    return map[m] || m
  })
}

var SUFIXOS_SOCIETARIOS_HOOK = [
  'LTDA',
  'ME',
  'EPP',
  'EIRELI',
  'SA',
  'S/A',
  'S.A',
  'CIA',
  'COMPANHIA',
]

function normalizeNomeEmpresaHook(nome) {
  if (!nome) return ''
  var str = removeAcentosHook(String(nome)).toUpperCase()
  str = str.replace(/[.,/\\_\-()&]/g, ' ')
  var rawTokens = str.trim().split(/\s+/)
  var tokens = []
  for (var i = 0; i < rawTokens.length; i++) {
    if (rawTokens[i]) tokens.push(rawTokens[i])
  }

  var changed = true
  while (changed && tokens.length > 1) {
    var last = tokens[tokens.length - 1]
    var isSufixo = false
    for (var j = 0; j < SUFIXOS_SOCIETARIOS_HOOK.length; j++) {
      if (SUFIXOS_SOCIETARIOS_HOOK[j] === last) {
        isSufixo = true
        break
      }
    }
    if (isSufixo) {
      tokens.pop()
    } else {
      changed = false
    }
  }

  return tokens.join(' ')
}

function areNomesEmpresaIguaisHook(nomeA, nomeB) {
  var normA = normalizeNomeEmpresaHook(nomeA)
  var normB = normalizeNomeEmpresaHook(nomeB)
  if (!normA || !normB) return false
  return normA === normB
}

function isVendedorNaoComissionadoHook(venda) {
  if (!venda) return false
  if (venda.nao_comissionado === true) return true

  var rawVendedor = String(venda.vendedor_cliente || venda.nome_vendedor || '').trim()

  // 1) Roland DG Brasil direta
  if (rawVendedor.toLowerCase().indexOf('roland dg brasil >') === 0) {
    return true
  }

  // 2) Auto-faturamento por código de cliente da revenda x comprador
  var codRevenda = String(venda.codigo_cliente_revenda || '').trim()
  var codCliente = String(venda.codigo_cliente || '').trim()
  if (codRevenda && codCliente && codRevenda.toUpperCase() === codCliente.toUpperCase()) {
    return true
  }

  // 3) Auto-faturamento no campo composto vendedor_cliente ("VENDEDOR > CLIENTE")
  var comp = String(venda.vendedor_cliente || '').trim()
  if (comp.indexOf('>') >= 0) {
    var parts = comp.split('>')
    var parteVendedor = parts[0] || ''
    var parteCliente = parts.slice(1).join('>') || ''
    if (parteVendedor && parteCliente && areNomesEmpresaIguaisHook(parteVendedor, parteCliente)) {
      return true
    }
  }

  // 4) Auto-faturamento por nome_vendedor x nome_cliente normalizados
  if (venda.nome_vendedor && venda.nome_cliente) {
    if (areNomesEmpresaIguaisHook(venda.nome_vendedor, venda.nome_cliente)) {
      return true
    }
  }

  return false
}
