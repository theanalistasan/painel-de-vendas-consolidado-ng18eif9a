import pb from '@/lib/pocketbase/client'
import { safeAuthRefresh, ensureAuthToken } from '@/lib/pocketbase/auth-session'

export type UserRole = 'admin' | 'user'

export interface UserRecord {
  id: string
  email: string
  name?: string
  role?: UserRole
  active?: boolean
  created: string
  updated: string
}

export interface UsersListResult {
  items: UserRecord[]
  page: number
  perPage: number
  totalItems: number
  totalPages: number
}

export interface FetchUsersParams {
  page?: number
  perPage?: number
  search?: string
}

/**
 * Busca usuários paginados da coleção nativa `users`, com busca opcional
 * por nome ou email.
 */
export async function fetchUsers(params: FetchUsersParams): Promise<UsersListResult> {
  const page = params.page || 1
  const perPage = params.perPage || 20

  let filter: string | undefined
  if (params.search && params.search.trim()) {
    const term = params.search.trim()
    // Combina nome OU email — PocketBase filter usa ~ (contains)
    filter = `name ~ '${term}' || email ~ '${term}'`
  }

  // 1. Assegura que o token de autenticação esteja disponível antes da requisição
  await ensureAuthToken()

  const runQuery = async () =>
    pb.collection<UserRecord>('users').getList(page, perPage, {
      sort: '-created',
      filter,
    })

  let result
  try {
    result = await runQuery()
  } catch (err: unknown) {
    const status = (err as { status?: number })?.status
    if (status === 401 || status === 403) {
      // Token expirado ou rejeitado: tentar renovar uma vez via safeAuthRefresh
      try {
        const refreshed = await safeAuthRefresh()
        if (!refreshed || !pb.authStore.isValid) {
          throw new Error('Sessão expirada. Faça login novamente.')
        }
        result = await runQuery()
      } catch (refreshErr) {
        throw refreshErr || err
      }
    } else {
      throw err
    }
  }

  return {
    items: result.items || [],
    page: result.page,
    perPage: result.perPage,
    totalItems: result.totalItems,
    totalPages: result.totalPages,
  }
}

export interface CreateUserPayload {
  name: string
  email: string
  password: string
  role: UserRole
  active?: boolean
}

/**
 * Cria um novo usuário na coleção `users`.
 */
export async function createUser(payload: CreateUserPayload): Promise<UserRecord> {
  await ensureAuthToken()
  const run = () =>
    pb.collection<UserRecord>('users').create({
      name: payload.name,
      email: payload.email,
      password: payload.password,
      passwordConfirm: payload.password,
      role: payload.role,
      active: payload.active !== false,
      // O email DEVE ser visível nas listagens da tela de Gestão de Usuários;
      // sem isso o campo vem vazio e não dá para identificar/logar/buscar.
      emailVisibility: true,
    })

  try {
    return await run()
  } catch (err: unknown) {
    const status = (err as { status?: number })?.status
    if (status === 401 || status === 403) {
      const refreshed = await safeAuthRefresh()
      if (refreshed && pb.authStore.isValid) {
        return await run()
      }
    }
    throw err
  }
}

export interface UpdateUserPayload {
  name?: string
  email?: string
  role?: UserRole
  active?: boolean
  password?: string
}

/**
 * Atualiza um usuário existente. Se `password` for informado, troca a senha.
 */
export async function updateUser(id: string, payload: UpdateUserPayload): Promise<UserRecord> {
  await ensureAuthToken()
  const data: Record<string, unknown> = {}
  if (payload.name !== undefined) data.name = payload.name
  if (payload.email !== undefined) data.email = payload.email
  if (payload.role !== undefined) data.role = payload.role
  if (payload.active !== undefined) data.active = payload.active
  if (payload.password) {
    data.password = payload.password
    data.passwordConfirm = payload.password
  }
  // Garante que o email continue visível nas listagens (corrige registros
  // criados anteriormente com emailVisibility=false, ex: Nicolas Brito).
  data.emailVisibility = true

  const run = () => pb.collection<UserRecord>('users').update(id, data)
  try {
    return await run()
  } catch (err: unknown) {
    const status = (err as { status?: number })?.status
    if (status === 401 || status === 403) {
      const refreshed = await safeAuthRefresh()
      if (refreshed && pb.authStore.isValid) {
        return await run()
      }
    }
    throw err
  }
}

/**
 * Exclui um usuário pelo id.
 */
export async function deleteUser(id: string): Promise<void> {
  await ensureAuthToken()
  const run = () => pb.collection('users').delete(id)
  try {
    await run()
  } catch (err: unknown) {
    const status = (err as { status?: number })?.status
    if (status === 401 || status === 403) {
      const refreshed = await safeAuthRefresh()
      if (refreshed && pb.authStore.isValid) {
        await run()
        return
      }
    }
    throw err
  }
}

/**
 * Gera o link de convite para o email informado.
 * O link apenas preenche o email no campo de login (não é um token mágico).
 */
export function buildInviteLink(email: string): string {
  const base = window.location.origin
  return `${base}/login?invite=${encodeURIComponent(email)}`
}
