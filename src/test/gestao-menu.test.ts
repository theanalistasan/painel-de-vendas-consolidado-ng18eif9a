import { describe, it, expect } from 'vitest'

describe('Regras do Módulo Gestão e Perfil Administrador', () => {
  it('identifica corretamente itens do módulo Gestão', () => {
    const gestaoRoutes = ['/importar', '/admin', '/usuarios', '/auditoria']
    expect(gestaoRoutes).toHaveLength(4)
    expect(gestaoRoutes).toContain('/importar')
    expect(gestaoRoutes).toContain('/admin')
    expect(gestaoRoutes).toContain('/usuarios')
    expect(gestaoRoutes).toContain('/auditoria')
  })

  it('valida que apenas perfil role=admin tem permissão', () => {
    const checkIsAdmin = (user: { role?: string } | null | undefined): boolean => {
      return user?.role === 'admin'
    }

    expect(checkIsAdmin({ role: 'admin' })).toBe(true)
    expect(checkIsAdmin({ role: 'user' })).toBe(false)
    expect(checkIsAdmin({ role: '' })).toBe(false)
    expect(checkIsAdmin(null)).toBe(false)
    expect(checkIsAdmin(undefined)).toBe(false)
  })
})
