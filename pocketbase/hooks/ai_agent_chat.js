/// <reference path="../pb_data/types.d.ts" />

/**
 * Endpoint de streaming SSE para o Agente Skip Cloud "assistente-vendas".
 * POST /backend/v1/chat/agent
 *
 * Headers aceitos:
 * Authorization: Bearer <user_token>
 *
 * Body JSON:
 * {
 *   "message": "Qual foi o faturamento em setembro?",
 *   "conversationId": "conv_123" (opcional)
 * }
 */
routerAdd(
  'POST',
  '/backend/v1/chat/agent',
  (e) => {
    // Autenticação exigida (somente usuários autenticados da aplicação)
    const authRecord = e.auth
    if (!authRecord) {
      return e.json(401, { error: 'Autenticação necessária para consultar o assistente virtual.' })
    }

    const body = e.requestInfo().body || {}
    const message = (body.message || '').trim()
    const conversationId = (body.conversationId || '').trim() || undefined

    if (!message) {
      return e.json(400, { error: 'Mensagem não informada.' })
    }

    try {
      const conv = $ai.agent('assistente-vendas').getOrCreateConversation({
        user_id: authRecord.id,
        id: conversationId || null,
      })
      const iter = $ai.agent('assistente-vendas').chat({
        user_id: authRecord.id,
        conversation_id: conv.id,
        message: message,
        stream: true,
      })
      e.response.header().set('Content-Type', 'text/event-stream')
      e.response.header().set('Cache-Control', 'no-cache')
      e.response.header().set('X-Conversation-Id', conv.id)
      $response.stream(e, iter)
    } catch (err) {
      console.error('Erro na execução do agente assistente-vendas:', err)
      if (err instanceof SkipAiConfigError) {
        return e.json(503, { error: 'Serviço de IA temporariamente indisponível.' })
      }
      if (err instanceof SkipAiAgentsError) {
        const status = err.status || 500
        return e.json(status, {
          error: status >= 500 ? 'Falha na comunicação com o assistente.' : err.message,
        })
      }
      if (err instanceof SkipAiError) {
        const status = err.status || 502
        return e.json(status, {
          error: status >= 500 ? 'Serviço de IA temporariamente indisponível.' : err.message,
        })
      }
      return e.json(500, {
        error: 'Erro interno ao consultar o assistente: ' + (err.message || String(err)),
      })
    }
  },
  $apis.requireAuth(),
)
