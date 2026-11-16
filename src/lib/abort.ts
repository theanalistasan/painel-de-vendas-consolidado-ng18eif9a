/**
 * Detecção de erro de requisição ABORTADA.
 *
 * O SDK do PocketBase NÃO devolve um `AbortError` quando o fetch é abortado
 * pelo nosso próprio AbortController: ele embrulha o erro num
 * `ClientResponseError` com `status = 0`, `name = 'ClientResponseError'` e a
 * mensagem "The request was aborted (most likely autocancelled; ...)".
 * Comparar apenas `err.name === 'AbortError'` NÃO reconhece esse caso: a tela
 * tratava um cancelamento esperado como falha e exibia o toast
 * "Não foi possível carregar o relatório de itens faltantes".
 *
 * Uso típico: ao navegar entre páginas e voltar, o efeito dispara de novo e
 * aborta a requisição anterior. Isso é normal e não deve virar erro.
 */

type AbortLike =
  | {
      name?: unknown
      status?: unknown
      message?: unknown
      code?: unknown
      isAbort?: unknown
    }
  | null
  | undefined

/** true quando o erro representa uma requisição cancelada (e não uma falha real). */
export function isAbortLikeError(err: AbortLike, signal?: AbortSignal | null): boolean {
  if (signal?.aborted) return true
  if (!err) return false

  const name = typeof err.name === 'string' ? err.name : ''
  if (name === 'AbortError') return true

  // ClientResponseError do PocketBase com status 0 = requisição abortada/cancelada.
  if (err.status === 0 || err.status === '0') return true
  if (err.isAbort === true) return true

  const msg = typeof err.message === 'string' ? err.message.toLowerCase() : ''
  if (msg.includes('aborted') || msg.includes('autocancelled') || msg.includes('autocanceled')) {
    return true
  }
  if (msg.includes('cancelled') || msg.includes('canceled')) return true

  // Alguns navegadores expõem o abort por código.
  if (String(err.code || '') === 'ABORT_ERR' || String(err.code || '') === '20') return true

  return false
}
