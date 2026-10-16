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

    const response = e.response
    response.header().set('Content-Type', 'text/event-stream')
    response.header().set('Cache-Control', 'no-cache')
    response.header().set('Connection', 'keep-alive')
    response.header().set('X-Accel-Buffering', 'no')
    response.flush()

    try {
      const agentStream = $ai.agent('assistente-vendas', {
        conversationId: conversationId,
        user: authRecord.id,
        messages: [{ role: 'user', content: message }],
      })

      for (const event of agentStream) {
        response.write('data: ' + JSON.stringify(event) + '\n\n')
        response.flush()
      }
    } catch (err) {
      console.error('Erro na execução do agente assistente-vendas:', err)
      const errPayload = {
        type: 'error',
        error: 'Desculpe, ocorreu um erro ao processar sua pergunta. Por favor, tente novamente.',
      }
      response.write('data: ' + JSON.stringify(errPayload) + '\n\n')
      response.flush()
    }
  },
  $apis.requireAuth(),
)
