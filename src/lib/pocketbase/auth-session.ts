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
  // Se não houver token nem registro, não há como renovar
  if (!pb.authStore.token && !pb.authStore.record) {
    return null
  }

  // Se já houver um refresh ativo em andamento, aguardar a mesma promise
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
        notifySessionExpired()
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

/**
 * Dispara o redirecionamento global para login quando a sessão expira
 */
let isRedirectingToLogin = false
export function notifySessionExpired(message = 'Sua sessão expirou. Faça login novamente.') {
  if (isRedirectingToLogin) return
  isRedirectingToLogin = true

  try {
    sessionStorage.setItem('session_expired_message', message)
  } catch {
    // ignore
  }

  try {
    const currentPath = window.location.pathname + window.location.search
    if (!window.location.pathname.startsWith('/login')) {
      sessionStorage.setItem('redirect_after_login', currentPath)
      window.location.href = `/login?expired=1`
    }
  } catch {
    // ignore
  } finally {
    setTimeout(() => {
      isRedirectingToLogin = false
    }, 3000)
  }
}

/**
 * Retorna uma promise que resolve assim que o authStore do PocketBase tiver um token válido.
 * Se o token estiver expirado mas presente, tenta renová-lo silenciosamente antes de falhar.
 * Se a renovação falhar, redireciona amigavelmente ao login.
 */
export async function ensureAuthToken(maxWaitMs = 3000): Promise<string> {
  if (pb.authStore.isValid && pb.authStore.token) {
    return pb.authStore.token
  }

  // Se existe token mas isValid está falso, tenta renovar imediatamente
  if (pb.authStore.token) {
    try {
      const refreshed = await safeAuthRefresh()
      if (refreshed?.token && pb.authStore.isValid) {
        return pb.authStore.token
      }
    } catch {
      notifySessionExpired('Sua sessão expirou. Faça login novamente.')
      throw new Error('Sua sessão expirou. Redirecionando para login...')
    }
  }

  const start = Date.now()
  return new Promise<string>((resolve, reject) => {
    const check = async () => {
      if (pb.authStore.isValid && pb.authStore.token) {
        resolve(pb.authStore.token)
        return
      }
      if (Date.now() - start >= maxWaitMs) {
        if (!pb.authStore.token) {
          notifySessionExpired('Sua sessão expirou. Faça login novamente.')
          reject(new Error('Sessão não autenticada. Redirecionando para login...'))
        } else {
          // Tenta renovar uma última vez
          try {
            const refreshed = await safeAuthRefresh()
            if (refreshed?.token && pb.authStore.isValid) {
              resolve(pb.authStore.token)
              return
            }
          } catch {
            // falhou
          }
          notifySessionExpired('Sua sessão expirou. Faça login novamente.')
          reject(new Error('Sua sessão expirou. Redirecionando para login...'))
        }
        return
      }
      setTimeout(check, 50)
    }
    check()
  })
}

/**
 * Executa uma operação com renovação automática de autenticação caso receba 401/403.
 * Se a renovação for bem-sucedida, repete a chamada uma vez silenciosamente.
 * Se a renovação falhar, redireciona ao login com mensagem amigável.
 */
export async function withAuthRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (err: unknown) {
    const status = (err as { status?: number })?.status
    const isAuthError = status === 401 || status === 403

    if (isAuthError) {
      try {
        const refreshed = await safeAuthRefresh()
        if (refreshed && pb.authStore.isValid) {
          return await fn()
        }
      } catch (refreshErr) {
        notifySessionExpired('Sua sessão expirou. Faça login novamente.')
        throw new Error('Sua sessão expirou. Redirecionando para login...')
      }
      notifySessionExpired('Sua sessão expirou. Faça login novamente.')
      throw new Error('Sua sessão expirou. Redirecionando para login...')
    }

    throw err
  }
}
