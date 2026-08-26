import React, { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Lock, Mail, AlertCircle, Loader2, ArrowRight } from 'lucide-react'
import RolandLogo from '@/components/RolandLogo'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  // Redireciona para onde o usuário tentou ir originalmente, ou para o Dashboard '/'
  const from = (location.state as { from?: { pathname?: string } })?.from?.pathname || '/'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      await login(email, password)
      navigate(from, { replace: true })
    } catch (err: unknown) {
      console.error('Falha de login:', err)
      const message =
        err instanceof Error ? err.message : 'Credenciais inválidas. Verifique seu e-mail e senha.'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0F172A] p-4 relative overflow-hidden">
      {/* Background Subtle Gradient Overlay */}
      <div className="absolute inset-0 bg-radial-at-t from-slate-900 via-[#0F172A] to-black opacity-90" />
      <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-[#0B6E99]/10 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-[#0B6E99]/5 blur-3xl pointer-events-none" />

      <div className="w-full max-w-md relative z-10">
        {/* Top Brand Logo */}
        <div className="text-center mb-8 flex flex-col items-center">
          <div className="flex justify-center mb-2">
            <RolandLogo variant="white" showSubtitle={false} />
          </div>
          <p className="text-sm text-slate-400 font-medium mt-1">
            Painel Consolidado de Vendas &amp; Inteligência Comercial
          </p>
        </div>

        <Card className="border border-slate-800 bg-slate-900/90 text-slate-100 rounded-2xl shadow-2xl backdrop-blur-md">
          <CardHeader className="space-y-1.5 pb-4">
            <CardTitle className="text-xl font-extrabold text-white text-center tracking-tight">
              Acesso ao Sistema
            </CardTitle>
            <CardDescription className="text-xs text-slate-400 text-center font-medium">
              Entre com suas credenciais corporativas autorizadas
            </CardDescription>
          </CardHeader>
          <CardContent>
            {error && (
              <Alert
                variant="destructive"
                className="mb-4 bg-rose-950/50 border-rose-800 text-rose-200 text-xs"
              >
                <AlertCircle className="h-4 w-4 text-rose-400" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs font-bold text-slate-300">
                  E-mail corporativo
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="usuario@rolanddg.com.br"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    className="pl-9 bg-slate-950/60 border-slate-800 text-white placeholder:text-slate-500 focus-visible:ring-[#0B6E99] h-10 text-xs rounded-xl"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-xs font-bold text-slate-300">
                  Senha de acesso
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    className="pl-9 bg-slate-950/60 border-slate-800 text-white placeholder:text-slate-500 focus-visible:ring-[#0B6E99] h-10 text-xs rounded-xl"
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="w-full bg-[#0B6E99] hover:bg-[#084F6E] text-white font-bold h-10 rounded-xl transition-all shadow-md mt-2 flex items-center justify-center gap-2"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Autenticando...</span>
                  </>
                ) : (
                  <>
                    <span>Entrar no Painel</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </Button>
            </form>

            <div className="mt-6 pt-4 border-t border-slate-800 text-center">
              <p className="text-[11px] text-slate-400">
                Roland DG Brasil • Uso exclusivo interno e autorizado
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
