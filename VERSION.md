# Versão Estável — `backup-estavel` / `v1.0-estavel`

Estado preservado como **versão estável e perfeita** do Painel de Vendas Consolidado.

> Dashboard funcional com ~126k registros, KPIs, gráficos, importação e consolidação estáveis.

## O que está estável nesta versão

- **Dashboard** operando com SQL puro sobre ~126.000 registros consolidados.
- **KPIs e gráficos** renderizando corretamente a partir dos dados consolidados.
- **Vendas paginadas** — listagem com paginação funcional e sem travamentos.
- **Importação de bases completas** — fluxo de importação processando bases
  inteiras sem perda de registros.
- **Consolidação sem erros** — pipeline de consolidação executando de ponta a
  ponta sem falhas.
- **Hooks deployados** — todos os `pb_hooks` (server-side) publicados e ativos
  no backend Skip Cloud (PocketBase).

## Como restaurar este estado

Este commit marca o ponto de referência estável. Para voltar a ele:

```bash
git checkout <commit-hash-deste-commit> -- .
```

ou, após criar a tag localmente:

```bash
git tag backup-estavel
git checkout backup-estavel
```

---

Marcado como versão estável em preservação do estado funcional atual.
