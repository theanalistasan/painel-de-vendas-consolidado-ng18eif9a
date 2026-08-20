import React, { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { BarChart3, Lock, Mail, ArrowRight, ShieldCheck } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'

export default function Login() {
  const [email, setEmail] = useState('silvio.mattos@rolanddg.com.br')
  const [password, setPassword] = useState('Roland@1234')
  const [emailError, setEmailError] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [loading, setLoading] = useState(false)

  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const { toast } = useToast()

  const from = (location.state as { from?: { pathname?: string } })?.from?.pathname || '/'

  // Link de convite (?invite=EMAIL) apenas preenche o e-mail — não é um token mágico.
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const inviteEmail = params.get('invite')
    if (inviteEmail) {
      setEmail(inviteEmail)
    }
  }, [location.search])

  const validate = () => {
    let isValid = true
    setEmailError('')
    setPasswordError('')

    if (!email.trim()) {
      setEmailError('O e-mail é obrigatório.')
      isValid = false
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setEmailError('Insira um formato de e-mail válido.')
      isValid = false
    }

    if (!password) {
      setPasswordError('A senha é obrigatória.')
      isValid = false
    } else if (password.length < 6) {
      setPasswordError('A senha deve ter no mínimo 6 caracteres.')
      isValid = false
    }

    return isValid
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return

    setLoading(true)
    try {
      await login(email.trim(), password)
      toast({
        title: 'Bem-vindo ao Painel de Vendas',
        description: 'Login realizado com sucesso.',
      })
      navigate(from, { replace: true })
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'E-mail ou senha inválidos'
      toast({
        variant: 'destructive',
        title: 'Falha na autenticação',
        description: errorMsg.includes('Failed to authenticate')
          ? 'E-mail ou senha incorretos. Verifique suas credenciais.'
          : errorMsg,
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-indigo-900 via-slate-900 to-slate-950">
      <div className="w-full max-w-md">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-indigo-600 shadow-xl shadow-indigo-600/30 text-white mb-3">
            <BarChart3 className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Painel de Vendas</h1>
          <p className="text-sm text-indigo-200/80 mt-1">
            Consolidação de Bases: RacNew, NetSales & Produtos
          </p>
        </div>

        {/* Login Card */}
        <Card className="border-0 shadow-2xl bg-white/95 backdrop-blur-sm rounded-2xl">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-xl font-bold text-slate-900">Acessar Conta</CardTitle>
            <CardDescription className="text-slate-500">
              Entre com suas credenciais para visualizar o painel
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs font-semibold text-slate-700">
                  E-mail corporativo
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value)
                      if (emailError) setEmailError('')
                    }}
                    placeholder="seu.nome@rolanddg.com.br"
                    className={`pl-9 rounded-lg border-slate-200 focus-visible:ring-indigo-500 ${
                      emailError ? 'border-red-500 focus-visible:ring-red-500' : ''
                    }`}
                  />
                </div>
                {emailError && <p className="text-xs text-red-500 font-medium">{emailError}</p>}
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-xs font-semibold text-slate-700">
                    Senha
                  </Label>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value)
                      if (passwordError) setPasswordError('')
                    }}
                    placeholder="••••••••"
                    className={`pl-9 rounded-lg border-slate-200 focus-visible:ring-indigo-500 ${
                      passwordError ? 'border-red-500 focus-visible:ring-red-500' : ''
                    }`}
                  />
                </div>
                {passwordError && (
                  <p className="text-xs text-red-500 font-medium">{passwordError}</p>
                )}
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 rounded-lg shadow-sm transition-all duration-150 flex items-center justify-center gap-2 group mt-2"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Autenticando...</span>
                  </>
                ) : (
                  <>
                    <span>Entrar no Painel</span>
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                  </>
                )}
              </Button>
            </form>

            <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-center gap-1.5 text-xs text-slate-500">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Ambiente seguro com criptografia de ponta a ponta</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
