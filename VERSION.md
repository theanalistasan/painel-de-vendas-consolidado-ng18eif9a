# VERSION.md — Estado Estável do Projeto

**Versão:** `v0.0.22` (backup estável)
**Data do backup:** estado consolidado atual do repositório.

---

## Visão Geral

**Painel de Vendas Consolidado** — dashboard de vendas construído sobre Skip Cloud
(PocketBase) com SQL puro, operando aproximadamente **126.000 registros** consolidados.

A versão estável atual é totalmente funcional: o Dashboard renderiza KPIs e gráficos,
os filtros respondem, a aba Vendas pagina e exporta, a importação de bases processa
arquivos XLSX/CSV com barra de progresso e a consolidação roda sem erros.

---

## Funcionalidades Estáveis

### Dashboard

- Consultas em **SQL puro** sobre ~126k registros consolidados.
- **5 KPIs** (cards de indicadores).
- **6 gráficos** (renderizados via `ChartCard`).
- Filtros combinados:
  - Ano
  - Mês
  - Dia
  - Vendedor
  - Estado

### Vendas

- Tabela **paginada** de vendas.
- **Exportação CSV** dos dados filtrados.

### Importação

- Importação de bases com **barra de progresso**.
- Suporte a arquivos XLSX e CSV.
- Consolidação de dados **executando sem erro**.

### Backend

- **Hooks pb_hooks deployados** no Skip Cloud.
- Migrações aplicadas (schema consolidado).

### Formatação de Datas

- Datas no **formato brasileiro DD/MM/AAAA**.
- Correção aplicada no **parser XLSX**.
- Correção aplicada em `import_racnew`.
- Correção aplicada em `import_netsales`.

---

## Estrutura Principal (não alterada neste backup)

- `src/App.tsx` — roteamento e layout principal.
- `src/pages/Index.tsx` — Dashboard.
- `src/pages/Vendas.tsx` — listagem paginada + export CSV.
- `src/pages/Importar.tsx` — importação de bases com progresso.
- `src/pages/Admin.tsx` — administração.
- `src/pages/Login.tsx` — autenticação.
- `src/components/` — `ChartCard`, `FilterBar`, `KpiCard`, `Layout`.
- `src/services/sales.ts` — camada de dados / SQL.
- `src/lib/pocketbase/client.ts` — cliente PocketBase.
- `src/lib/formatters.ts` — formatadores (incl. datas BR).
- `pocketbase/migrations/` — migrações JS do schema.
- `pocketbase/hooks/` — hooks server-side (incl. import/consolidação).

---

## Observação

Este commit é um **backup de ponto estável**. Nenhum código foi alterado —
apenas este arquivo `VERSION.md` foi criado para documentar o estado funcional atual.

Tag sugerida: `backup-estavel` apontando para este commit.
