# VERSION.md — Estado Estável do Projeto

**Versão:** `v0.0.26` (backup estável)
**Backup anterior:** `v0.0.25` (commit `6efe576`)
**Data do backup:** estado consolidado atual do repositório.

---

## Visão Geral

**Painel de Vendas Consolidado** — dashboard de vendas construído sobre Skip Cloud
(PocketBase) com SQL puro, operando aproximadamente **126.000 registros** consolidados.

A versão estável atual é totalmente funcional: o Dashboard renderiza KPIs e gráficos,
os filtros respondem, a aba Vendas pagina e exporta CSV (padrão brasileiro), a importação
de bases processa arquivos XLSX/CSV em lotes de 5.000 com barra de progresso e a
consolidação roda via SQL sem timeout.

---

## Funcionalidades Estáveis

### Dashboard

- Consultas em **SQL puro** sobre ~126k registros consolidados.
- **5 KPIs**: Faturamento, Valor Líquido, Itens, Documentos, Devoluções.
- **6 gráficos** (renderizados via `ChartCard`).
- Filtros combinados:
  - Ano
  - Mês
  - Dia
  - Vendedor
  - Estado
  - Grupo item
  - Classificação
- Filtros com **colapso de pílulas** (mostra 3 + "+ X filtros") e botão **"Limpar Todos"**.

### Vendas

- Tabela **paginada** de vendas.
- **Exportação CSV** dos dados filtrados em padrão brasileiro.

### Importação

- Importação de bases: **Produtos**, **RacNew**, **NetSales**.
- **Barra de progresso** em lotes de 5.000 registros.
- Suporte a arquivos XLSX e CSV.

### Consolidação

- Consolidação via **SQL** (`INSERT ... SELECT ... LEFT JOIN`), sem timeout.
- `COALESCE` aplicado aos campos da NetSales.
- **Regra de negócio:** RacNew é a base mestra (prevalece sempre); NetSales complementa
  apenas quando não há correspondência, adicionando **12 campos exclusivos**.

### Datas

- **Correção definitiva aplicada** no parser XLSX: captura o valor serial bruto da data
  (ignora formatação visual do Excel) e converte matematicamente para data real no JS.
- Datas armazenadas em **ISO (`YYYY-MM-DD`)** e exibidas em **DD/MM/AAAA brasileiro**.
- NFE 790 validada como **12/06/2026**.

### Backend

- **Hooks pb_hooks deployados** no Skip Cloud: `stats_counts`, `vendas_list`, `dashboard_stats`.
- Migrações aplicadas (schema consolidado).

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
apenas este arquivo `VERSION.md` foi atualizado para documentar o estado funcional atual.

Tag sugerida: `backup-estavel` apontando para este commit.
