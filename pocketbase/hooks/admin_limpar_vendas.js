// admin_limpar_vendas.js — endpoint administrativo TEMPORÁRIO de limpeza.
//
// POR QUE EXISTE: a migration 1742800002 (mesma limpeza) está presa em
// `pending` na fila do Skip Cloud e o backend responde "instance is still
// applying an earlier batch" em toda tentativa. Sem ela, a reimportação das
// planilhas NetSales não pode começar (inseriria tudo em dobro em cima da base
// atual). Este endpoint faz exatamente a mesma limpeza — e SÓ ela:
//
//   LIMPA:  netsales, vendas, vendas_staging,
//           resumo_vendas_mensal, resumo_clientes_ativos, resumo_vendas_uf_regiao
//   PRESERVA: pedidos_abertos, estoque_sap, audit_logs, produtos, tipos_cliente,
//             canais_clientes, canais_metas, users
//
// Exige usuário autenticado com role = 'admin'.
//
// IMPORTANTE: é uma ferramenta de operação, não parte do produto. Deve ser
// removido (ou desativado) quando a migration pendente for aplicada.

routerAdd('POST', '/backend/v1/admin/limpar-vendas', (e) => {
  const auth = e.requestInfo().auth
  if (!auth || auth.role !== 'admin') {
    return e.json(403, { error: 'Apenas administradores.' })
  }

  const body = e.requestInfo().body || {}
  if (body.confirmar !== 'LIMPAR') {
    return e.json(400, {
      error: 'Confirmação obrigatória: envie { "confirmar": "LIMPAR" }.',
    })
  }

  const resultado = { limpos: [], preservados: [], antes: {}, erros: [] }
  const alvos = ['netsales', 'vendas']
  const preservar = ['pedidos_abertos', 'estoque_sap', 'audit_logs']

  // Contagem ANTES (para o relatório de conferência)
  const contar = (nome) => {
    try {
      const rows = arrayOf(new DynamicModel({ c: 0 }))
      $app
        .db()
        .newQuery('SELECT COUNT(*) AS c FROM ' + nome)
        .all(rows)
      return rows.length > 0 ? parseInt(rows[0].c, 10) || 0 : 0
    } catch (_) {
      return 0
    }
  }

  for (let i = 0; i < alvos.length; i++) resultado.antes[alvos[i]] = contar(alvos[i])
  for (let j = 0; j < preservar.length; j++) {
    resultado.antes[preservar[j]] = contar(preservar[j])
  }

  // Limpeza
  for (let i = 0; i < alvos.length; i++) {
    const nome = alvos[i]
    try {
      const col = $app.findCollectionByNameOrId(nome)
      $app.truncateCollection(col)
      resultado.limpos.push(nome)
    } catch (err) {
      try {
        $app
          .db()
          .newQuery('DELETE FROM ' + nome)
          .execute()
        resultado.limpos.push(nome + ' (DELETE)')
      } catch (errDel) {
        resultado.erros.push(nome + ': ' + String(errDel))
      }
    }
  }

  const tabelas = [
    'vendas_staging',
    'resumo_vendas_mensal',
    'resumo_clientes_ativos',
    'resumo_vendas_uf_regiao',
  ]
  for (let k = 0; k < tabelas.length; k++) {
    try {
      $app
        .db()
        .newQuery('DELETE FROM ' + tabelas[k])
        .execute()
      resultado.limpos.push(tabelas[k])
    } catch (err) {
      // Tabela pode não existir — não é erro fatal.
    }
  }

  // Reinicia as máquinas de estado da consolidação
  try {
    $app
      .db()
      .newQuery(
        "UPDATE vendas_consolidacao_status SET status = 'idle', etapa = NULL, " +
          'processados = 0, total = 0',
      )
      .execute()
  } catch (_) {}
  try {
    $app
      .db()
      .newQuery("UPDATE vendas_migracao_historico_status SET status = 'idle', etapa = NULL")
      .execute()
  } catch (_) {}

  // Contagem DEPOIS — comprova que as bases de gestão seguem intactas
  resultado.depois = {}
  for (let m = 0; m < alvos.length; m++) resultado.depois[alvos[m]] = contar(alvos[m])
  for (let n = 0; n < preservar.length; n++) {
    resultado.depois[preservar[n]] = contar(preservar[n])
    resultado.preservados.push(preservar[n])
  }

  // Invalida caches do painel
  try {
    if (globalThis.__skipDashboardCache) globalThis.__skipDashboardCache.clear()
    if (globalThis.__skipFilterOptionsCache) globalThis.__skipFilterOptionsCache = new Map()
  } catch (_) {}

  console.log(
    'admin_limpar_vendas: limpos=' +
      resultado.limpos.join(',') +
      ' | preservados(antes/depois)=' +
      preservar.map((p) => p + ':' + resultado.antes[p] + '/' + resultado.depois[p]).join(','),
  )

  return e.json(200, resultado)
})
