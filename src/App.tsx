/* Main App Component - Handles routing (using react-router-dom), query client and other providers - use this file to add all routes */
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from '@/components/ui/toaster'
import { Toaster as Sonner } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AuthProvider } from '@/context/AuthContext'
import GuardedRoute from '@/components/GuardedRoute'
import DashboardGeral from './pages/DashboardGeral'
import DashboardCanais from './pages/DashboardCanais'
import Vendas from './pages/Vendas'
import PedidosAbertos from './pages/PedidosAbertos'
import Canais from './pages/Canais'
import Importar from './pages/Importar'
import Admin from './pages/Admin'
import Usuarios from './pages/Usuarios'
import Auditoria from './pages/Auditoria'
import Login from './pages/Login'
import NotFound from './pages/NotFound'
import Layout from './components/Layout'

const App = () => (
  <BrowserRouter>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <Routes>
          <Route path="/login" element={<Login />} />

          {/* Authenticated Routes with Layout */}
          <Route element={<Layout />}>
            <Route path="/" element={<DashboardGeral />} />
            <Route path="/dashboard/geral" element={<DashboardGeral />} />
            <Route path="/dashboard/canais" element={<DashboardCanais />} />
            <Route path="/vendas" element={<Vendas />} />
            <Route path="/pedidos-abertos" element={<PedidosAbertos />} />
            {/* Módulo de Manutenção de Canais aberto a todos os perfis autenticados */}
            <Route path="/canais" element={<Canais />} />
            {/* Rotas protegidas por senha de administrador (AdminGuard) */}
            <Route
              path="/importar"
              element={
                <GuardedRoute page="importar">
                  <Importar />
                </GuardedRoute>
              }
            />
            <Route
              path="/admin"
              element={
                <GuardedRoute page="admin">
                  <Admin />
                </GuardedRoute>
              }
            />
            <Route
              path="/usuarios"
              element={
                <GuardedRoute page="usuarios">
                  <Usuarios />
                </GuardedRoute>
              }
            />
            <Route
              path="/auditoria"
              element={
                <GuardedRoute page="auditoria">
                  <Auditoria />
                </GuardedRoute>
              }
            />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </TooltipProvider>
    </AuthProvider>
  </BrowserRouter>
)

export default App
