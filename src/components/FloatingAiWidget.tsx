import React, { useState, useRef, useEffect } from 'react'
import {
  Bot,
  X,
  Send,
  Loader2,
  Trash2,
  Sparkles,
  Maximize2,
  Minimize2,
  ShieldCheck,
  ChevronDown,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/context/AuthContext'
import pb from '@/lib/pocketbase/client'
import { streamAgentChat, AgentCitation } from '@/lib/skipAi'
import { cn } from '@/lib/utils'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  citations?: AgentCitation[]
  toolRunning?: string | null
}

const SUGGESTED_PROMPTS = [
  'Qual o faturamento total em 2026?',
  'Quais canais têm metas cadastradas?',
  'Quais itens têm pedidos em aberto sem estoque?',
  'Quais são os principais clientes por faturamento?',
]

export const FloatingAiWidget: React.FC = () => {
  const { user } = useAuth()
  const [isOpen, setIsOpen] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const [inputMessage, setInputMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(() => {
    try {
      return localStorage.getItem('roland_ai_conv_id') || null
    } catch {
      return null
    }
  })

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = localStorage.getItem('roland_ai_messages')
      if (saved) {
        return JSON.parse(saved)
      }
    } catch {
      // ignore
    }
    return [
      {
        id: 'welcome',
        role: 'assistant',
        content:
          'Olá! Sou o Assistente Inteligente do Painel Roland DG. Posso consultar e responder sobre vendas consolidadas, pedidos em aberto, estoque, canais e metas. Como posso te ajudar hoje?',
        timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      },
    ]
  })

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  // Persistir mensagens no localStorage
  useEffect(() => {
    try {
      localStorage.setItem('roland_ai_messages', JSON.stringify(messages))
    } catch {
      // ignore
    }
  }, [messages])

  // Salvar conversationId
  useEffect(() => {
    if (conversationId) {
      try {
        localStorage.setItem('roland_ai_conv_id', conversationId)
      } catch {
        // ignore
      }
    }
  }, [conversationId])

  // Scroll automático
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, isOpen])

  // Não renderizar se não autenticado
  if (!user) {
    return null
  }

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputMessage).trim()
    if (!text || loading) return

    const userMessage: ChatMessage = {
      id: 'usr_' + Date.now(),
      role: 'user',
      content: text,
      timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    }

    const assistantMsgId = 'ast_' + (Date.now() + 1)
    const assistantPlaceholder: ChatMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      toolRunning: null,
    }

    setMessages((prev) => [...prev, userMessage, assistantPlaceholder])
    setInputMessage('')
    setLoading(true)

    const controller = new AbortController()
    abortControllerRef.current = controller

    try {
      const token = pb.authStore.token
      const res = await fetch(`${pb.baseUrl}/backend/v1/chat/agent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          message: text,
          conversationId: conversationId || undefined,
        }),
        signal: controller.signal,
      })

      let currentCitations: AgentCitation[] | undefined

      const result = await streamAgentChat(res, {
        signal: controller.signal,
        onChunk: (_delta, accumulated) => {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMsgId ? { ...msg, content: accumulated, toolRunning: null } : msg,
            ),
          )
        },
        onToolCallStart: (info) => {
          const toolLabel =
            info.name === 'vendas'
              ? 'Consultando vendas...'
              : info.name === 'pedidos_abertos'
                ? 'Consultando pedidos em aberto...'
                : info.name === 'estoque_sap'
                  ? 'Consultando posição de estoque...'
                  : info.name === 'canais_metas'
                    ? 'Consultando metas...'
                    : info.name === 'canais_clientes'
                      ? 'Consultando revendas e canais...'
                      : `Consultando dados (${info.name})...`

          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMsgId ? { ...msg, toolRunning: toolLabel } : msg,
            ),
          )
        },
        onToolCallDone: () => {
          setMessages((prev) =>
            prev.map((msg) => (msg.id === assistantMsgId ? { ...msg, toolRunning: null } : msg)),
          )
        },
        onCitations: (citations) => {
          currentCitations = citations
          setMessages((prev) =>
            prev.map((msg) => (msg.id === assistantMsgId ? { ...msg, citations } : msg)),
          )
        },
        onError: (errMsg) => {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMsgId
                ? {
                    ...msg,
                    content: msg.content || `Ocorreu um erro ao processar sua pergunta: ${errMsg}`,
                    toolRunning: null,
                  }
                : msg,
            ),
          )
        },
      })

      if (result.conversation_id) {
        setConversationId(result.conversation_id)
      }

      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMsgId
            ? {
                ...msg,
                content: result.content || msg.content || 'Resposta concluída.',
                citations: currentCitations || result.citations,
                toolRunning: null,
              }
            : msg,
        ),
      )
    } catch (err: unknown) {
      if ((err as Error)?.name !== 'AbortError') {
        const errorText = (err as Error)?.message || 'Erro ao conectar com o assistente.'
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMsgId
              ? {
                  ...msg,
                  content:
                    msg.content ||
                    `Desculpe, ocorreu uma falha ao consultar o assistente: ${errorText}`,
                  toolRunning: null,
                }
              : msg,
          ),
        )
      }
    } finally {
      setLoading(false)
      abortControllerRef.current = null
    }
  }

  const handleClearHistory = () => {
    if (loading && abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    setConversationId(null)
    try {
      localStorage.removeItem('roland_ai_conv_id')
      localStorage.removeItem('roland_ai_messages')
    } catch {
      // ignore
    }
    setMessages([
      {
        id: 'welcome_' + Date.now(),
        role: 'assistant',
        content:
          'Conversa reiniciada. Pode perguntar sobre vendas, pedidos, estoque ou canais quando quiser.',
        timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      },
    ])
  }

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end">
      {/* Janela de Chat */}
      {isOpen && (
        <div
          className={cn(
            'flex flex-col rounded-2xl border border-slate-700/60 bg-slate-900/95 shadow-2xl backdrop-blur-xl transition-all duration-200 ease-out mb-3 overflow-hidden',
            isExpanded
              ? 'w-[92vw] sm:w-[680px] h-[82vh] max-h-[820px]'
              : 'w-[92vw] sm:w-[420px] h-[560px] max-h-[80vh]',
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-gradient-to-r from-slate-900 via-indigo-950/60 to-slate-900">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-blue-500 flex items-center justify-center shadow-lg shadow-indigo-500/20 text-white">
                <Bot className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-slate-100 text-sm leading-tight">
                    Assistente Roland DG
                  </h3>
                  <Badge
                    variant="outline"
                    className="text-[10px] px-1.5 py-0 border-indigo-500/40 text-indigo-300 bg-indigo-500/10 font-medium"
                  >
                    Skip AI
                  </Badge>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span>Conectado às coleções da aplicação</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1 text-slate-400">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 hover:text-slate-200 hover:bg-slate-800"
                onClick={handleClearHistory}
                title="Limpar histórico da conversa"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 hover:text-slate-200 hover:bg-slate-800 hidden sm:flex"
                onClick={() => setIsExpanded(!isExpanded)}
                title={isExpanded ? 'Diminuir' : 'Expandir'}
              >
                {isExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 hover:text-slate-200 hover:bg-slate-800"
                onClick={() => setIsOpen(false)}
                title="Fechar painel"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Aviso informativo de somente leitura */}
          <div className="px-3 py-1.5 bg-slate-950/60 border-b border-slate-800/80 flex items-center gap-2 text-[11px] text-slate-400">
            <ShieldCheck className="h-3.5 w-3.5 text-blue-400 shrink-0" />
            <span className="truncate">
              Painel analítico e somente leitura • Dados de Vendas, Pedidos, Estoque e Metas
            </span>
          </div>

          {/* Área de Mensagens */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3.5 scrollbar-thin scrollbar-thumb-slate-700">
            {messages.map((m) => (
              <div
                key={m.id}
                className={cn('flex flex-col', m.role === 'user' ? 'items-end' : 'items-start')}
              >
                <div
                  className={cn(
                    'rounded-2xl px-3.5 py-2.5 max-w-[85%] text-xs leading-relaxed shadow-md',
                    m.role === 'user'
                      ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-tr-none'
                      : 'bg-slate-800/90 text-slate-200 border border-slate-700/60 rounded-tl-none',
                  )}
                >
                  {/* Tool running indicator */}
                  {m.toolRunning && (
                    <div className="flex items-center gap-2 mb-2 pb-1.5 border-b border-slate-700/70 text-[11px] text-indigo-300 font-medium">
                      <Loader2 className="h-3 w-3 animate-spin text-indigo-400" />
                      <span>{m.toolRunning}</span>
                    </div>
                  )}

                  {/* Conteúdo da mensagem */}
                  <div className="whitespace-pre-wrap select-text">
                    {m.content ? (
                      m.content
                    ) : (
                      <span className="flex items-center gap-1.5 text-slate-400 italic">
                        <Loader2 className="h-3 w-3 animate-spin" /> Consultando dados do painel...
                      </span>
                    )}
                  </div>

                  {/* Citações/Fontes */}
                  {m.citations && m.citations.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-slate-700/60 text-[10px] text-slate-400 space-y-1">
                      <span className="font-semibold text-slate-300">Fontes consultadas:</span>
                      <div className="flex flex-wrap gap-1">
                        {m.citations.map((c, i) => (
                          <Badge
                            key={i}
                            variant="secondary"
                            className="text-[9px] px-1.5 py-0 bg-slate-900 border border-slate-700 text-slate-300 max-w-[200px] truncate"
                            title={c.excerpt || c.source_id}
                          >
                            {c.source_id || `Fonte #${c.n}`}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <span className="text-[10px] text-slate-500 mt-1 px-1">{m.timestamp}</span>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Sugestões rápidas (quando há poucas mensagens) */}
          {messages.length <= 2 && (
            <div className="px-4 py-2 border-t border-slate-800/80 bg-slate-950/40">
              <div className="flex items-center gap-1 text-[11px] text-slate-400 mb-1.5">
                <Sparkles className="h-3 w-3 text-indigo-400" />
                <span>Perguntas sugeridas:</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {SUGGESTED_PROMPTS.map((prompt, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSendMessage(prompt)}
                    disabled={loading}
                    className="text-[11px] text-left px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700/60 transition"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input de envio */}
          <form
            onSubmit={(e) => {
              e.preventDefault()
              handleSendMessage()
            }}
            className="p-3 border-t border-slate-800 bg-slate-950 flex items-center gap-2"
          >
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              placeholder="Pergunte sobre vendas, pedidos, estoque ou canais..."
              disabled={loading}
              className="flex-1 bg-slate-900 border border-slate-700/80 rounded-xl px-3.5 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-60"
            />
            <Button
              type="submit"
              size="icon"
              disabled={loading || !inputMessage.trim()}
              className="h-8 w-8 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/30 shrink-0"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
            </Button>
          </form>
        </div>
      )}

      {/* Botão Flutuante (Floating Action Button) */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Abrir assistente inteligente de vendas"
        className={cn(
          'group relative flex items-center justify-center h-14 w-14 rounded-full shadow-2xl transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2 focus:ring-offset-slate-950',
          isOpen
            ? 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
            : 'bg-gradient-to-r from-blue-600 via-indigo-600 to-indigo-700 text-white hover:scale-105 shadow-indigo-500/30',
        )}
      >
        {isOpen ? (
          <ChevronDown className="h-6 w-6" />
        ) : (
          <>
            <Bot className="h-6 w-6 transition-transform group-hover:scale-110" />
            <span className="absolute -top-1 -right-1 flex h-4 w-4">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-4 w-4 bg-indigo-500 border-2 border-slate-950" />
            </span>
          </>
        )}
      </button>
    </div>
  )
}
