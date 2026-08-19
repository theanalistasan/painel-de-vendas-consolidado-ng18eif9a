import pb from '@/lib/pocketbase/client'

export type UserRole = 'admin' | 'user'

export interface UserRecord {
  id: string
  email: string
  name: string
  role: UserRole
  active: boolean
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

  const result = await pb.collection<UserRecord>('users').getList(page, perPage, {
    sort: '-created',
    filter,
  })

  return {
    items: result.items,
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
  return pb.collection<UserRecord>('users').create({
    name: payload.name,
    email: payload.email,
    password: payload.password,
    passwordConfirm: payload.password,
    role: payload.role,
    active: payload.active !== false,
  })
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
  const data: Record<string, unknown> = {}
  if (payload.name !== undefined) data.name = payload.name
  if (payload.email !== undefined) data.email = payload.email
  if (payload.role !== undefined) data.role = payload.role
  if (payload.active !== undefined) data.active = payload.active
  if (payload.password) {
    data.password = payload.password
    data.passwordConfirm = payload.password
  }
  return pb.collection<UserRecord>('users').update(id, data)
}

/**
 * Exclui um usuário pelo id.
 */
export async function deleteUser(id: string): Promise<void> {
  await pb.collection('users').delete(id)
}

/**
 * Gera o link de convite para o email informado.
 * O link apenas preenche o email no campo de login (não é um token mágico).
 */
export function buildInviteLink(email: string): string {
  const base = window.location.origin
  return `${base}/login?invite=${encodeURIComponent(email)}`
}
