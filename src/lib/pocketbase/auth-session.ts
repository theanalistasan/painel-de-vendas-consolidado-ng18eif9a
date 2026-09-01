import pb from '@/lib/pocketbase/client'
import type { RecordAuthResponse, RecordModel } from 'pocketbase'

let refreshPromise: Promise<RecordAuthResponse<RecordModel> | null> | null = null

/**
 * Executes a synchronized, deduplicated authRefresh call.
 * If another refresh is already in-flight, it returns the same promise instead of triggering a concurrent request.
 * If the error is network/offline/aborted or non-401/403, it does NOT wipe the authStore.
 * If the server explicitly rejects authentication with 401/403, it clears the authStore.
 */
const REFRESH_TIMEOUT_MS = 6000

/**
 * Helper to run a promise with a hard timeout.
 * Prevents requests from hanging indefinitely on network stalls/dead connections.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, timeoutMsg: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(timeoutMsg))
    }, ms)
  })

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer) clearTimeout(timer)
  })
}

/**
 * Executes a synchronized, deduplicated authRefresh call.
 * If another refresh is already in-flight, it returns the same promise instead of triggering a concurrent request.
 * Applies a strict timeout so callers never hang waiting for response.
 * If the server explicitly rejects authentication with 401/403, it clears the authStore.
 * If the error is network/offline/timeout or non-401/403, it does NOT wipe the authStore.
 */
export async function safeAuthRefresh(): Promise<RecordAuthResponse<RecordModel> | null> {
  if (!pb.authStore.isValid) {
    return null
  }

  if (refreshPromise) {
    return refreshPromise
  }

  refreshPromise = (async () => {
    try {
      const res = await withTimeout(
        pb.collection('users').authRefresh(),
        REFRESH_TIMEOUT_MS,
        'authRefresh timeout exceeded',
      )
      return res
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status
      const isExplicitAuthFailure = status === 401 || status === 403

      if (isExplicitAuthFailure) {
        console.warn('Sessão expirada ou revogada (401/403). Limpando credenciais locais.', err)
        pb.authStore.clear()
      } else {
        console.warn(
          'Falha temporária ao renovar token (rede/timeout/instabilidade). Mantendo sessão local:',
          err,
        )
      }
      throw err
    } finally {
      refreshPromise = null
    }
  })()

  return refreshPromise
}
