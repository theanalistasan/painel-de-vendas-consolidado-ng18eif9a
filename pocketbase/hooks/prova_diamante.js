// TEMPORÁRIO — prova numérica no BOOT (remover após validação).
// Roda no load do hook (top-level, imune ao scoping do JSVM de callbacks) e
// imprime no log de hooks a soma de total_nf_novo linha a linha para DIAMANTE
// jan–out/2026 em 4 variantes de filtro (decisão Silvio: bater com o Excel do
// gerente, alvo R$ 5.298.224,33).

const variants = [
  {
    id: 'A_vendedor_cliente~DIAMANTE',
    where:
      "UPPER(vendedor_cliente) LIKE '%DIAMANTE%' AND data_lancamento >= '2026-01-01 00:00:00.000Z' AND data_lancamento < '2026-11-01 00:00:00.000Z'",
  },
  {
    id: 'B_A+tipo_documento=NF',
    where:
      "UPPER(vendedor_cliente) LIKE '%DIAMANTE%' AND data_lancamento >= '2026-01-01 00:00:00.000Z' AND data_lancamento < '2026-11-01 00:00:00.000Z' AND UPPER(COALESCE(tipo_documento,'')) = 'NF'",
  },
  {
    id: 'C_A+utilizacao~VENDA*',
    where:
      "UPPER(vendedor_cliente) LIKE '%DIAMANTE%' AND data_lancamento >= '2026-01-01 00:00:00.000Z' AND data_lancamento < '2026-11-01 00:00:00.000Z' AND UPPER(COALESCE(utilizacao,'')) LIKE 'VENDA%'",
  },
  {
    id: 'D_A+NF+VENDA*',
    where:
      "UPPER(vendedor_cliente) LIKE '%DIAMANTE%' AND data_lancamento >= '2026-01-01 00:00:00.000Z' AND data_lancamento < '2026-11-01 00:00:00.000Z' AND UPPER(COALESCE(tipo_documento,'')) = 'NF' AND UPPER(COALESCE(utilizacao,'')) LIKE 'VENDA%'",
  },
]

const results = []
for (let vi = 0; vi < variants.length; vi++) {
  const v = variants[vi]
  let soma = 0
  let count = 0
  let somaForaNF = 0
  let somaServicos = 0
  const porDoc = {}
  const rows = arrayOf(
    new DynamicModel({
      t: '',
      tipo_documento: '',
      codigo_item: '',
    }),
  )
  try {
    $app
      .db()
      .newQuery(
        'SELECT COALESCE(total_nf_novo,0) AS t, ' +
          "COALESCE(tipo_documento,'') AS tipo_documento, COALESCE(codigo_item,'') AS codigo_item " +
          'FROM vendas WHERE ' +
          v.where,
      )
      .all(rows)
  } catch (qerr) {
    results.push({ id: v.id, error: String(qerr) })
    continue
  }
  for (let i = 0; i < rows.length; i++) {
    const t = parseFloat(rows[i].t) || 0
    soma += t
    count += 1
    const td = String(rows[i].tipo_documento || '').toUpperCase()
    const ci = String(rows[i].codigo_item || '').toUpperCase()
    if (td !== 'NF') somaForaNF += t
    if (ci === 'SERVICOS') somaServicos += t
    const key = td + ' | ' + ci
    porDoc[key] = (porDoc[key] || 0) + t
  }
  const breakdown = Object.keys(porDoc)
    .map((k) => ({ k: k, v: Math.round(porDoc[k] * 100) / 100 }))
    .sort((a, b) => b.v - a.v)
    .slice(0, 6)
  results.push({
    id: v.id,
    count: count,
    soma_total_nf_novo: Math.round(soma * 100) / 100,
    soma_fora_NF: Math.round(somaForaNF * 100) / 100,
    soma_SERVICOS: Math.round(somaServicos * 100) / 100,
    breakdown_top: breakdown,
  })
}
console.log('[prova-diamante] alvo=5298224.33 resultados=' + JSON.stringify(results))
