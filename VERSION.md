# Painel de Vendas Consolidado — Controle de Versões

## Versão e Status Atual

- **Versão**: v1.0.4
- **Data do Backup**: 01/09/2026
- **Status**: QA aprovado, estável, backup oficial consolidado (v0.0.82)

---

## Destaques da Versão 1.0.4

1. **Dashboards Históricos Globais de Longo Prazo (Hook `dashboard_stats.js`)**:
   - Ajuste estrutural nas queries de agregação dos gráficos **"Tendência de Vendas — Equipamentos"** (`vendasEquipamentosHistorico`) e **"Acumulado — Insumos"** (`vendasInsumosHistorico` — Peças, Tintas e Acessórios).
   - Ambos os gráficos agora utilizam a cláusula `sqlWhereHistorical`, trazendo sempre a **base histórica completa** e contínua do início ao fim, ignorando filtros de período (Data De/Até, Ano, Mês, Dia) e dimensões contextuais, respeitando estritamente apenas a seleção de base de dados (**RacNew**, **NetSales** ou **Ambos**).
   - Garante que a curva histórica de evolução não seja truncada quando o usuário aplica filtros pontuais para analisar um mês ou período específico no restante do dashboard.

2. **Backend & Endpoints Consolidados (PocketBase)**:
   - Endpoint `POST /backend/v1/dashboard/stats` totalmente funcional e otimizado com queries SQL agregadas via `$app.db().newQuery()` para alta performance em grandes volumes de dados.
   - Deploy de pb_hooks validado sem erros de sintaxe ou timeouts.
   - Retorno integral de KPIs, gráficos históricos/mensais, análise de equipamentos/insumos, clientes ativos e opções de filtros distintos.

3. **Identidade Visual Roland DG Brasil**:
   - Paleta corporativa refinada: preto/cinza grafite escuro (`#0F172A`, `#141E33`), branco e cinzas neutros (`#F8FAFC`, `#94A3B8`).
   - Cores de destaque nos gráficos e badges: Azul Roland (`#0B6E99` / `209 100% 32%`) e Ciano Roland (`189 100% 38%`).
   - Logo oficial Roland sem o laranja legado: ícone gráfico com bloco superior azul (`#0059C1`) e barra inferior cinza (`#2D3748` / `#94A3B8`), com tipografia "Roland" em vetor puro.

4. **Navegação & Layout Responsivo**:
   - Sidebar desktop colapsável com persistência em `localStorage` (`sidebar_collapsed`), botões rápidos de recolher/expandir no header (`PanelLeftClose` / `PanelLeftOpen`) e menu drawer para dispositivos móveis.
   - Header com data atual formatada por extenso em português e badge de status da sincronização de bases.
   - Footer informativo com data/hora da última carga de dados consolidada.

5. **Gerenciador Central de Sessão & Autenticação Robusta**:
   - Centralizador `safeAuthRefresh` em `src/lib/pocketbase/auth-session.ts` com mutex anti-concorrência (deduplicação de chamadas em voo) e timeout de segurança (6s).
   - `AuthContext` com timer/fallback de segurança no boot (máximo 5s de `isLoading`), impedindo telas brancas ou travamento por instabilidade momentânea do backend.
   - Tratamento específico de erros: preservação da sessão local em quedas transitórias de rede e limpeza seletiva do `authStore` apenas mediante resposta 401/403 explícita.

6. **Filtros Globais Multi-Seleção & Persistência**:
   - Filtros padrão inicializados zerados/abertos (sem restrições no primeiro acesso), garantindo visão completa imediata do faturamento.
   - Suporte a seleção de bases: Ambos, RacNew e NetSales.
   - Dimensões: Data De/Até, Ano, Mês, Dia, Vendedor > Cliente, Vendedor, Grupo do Item, Estado (UF), Tipo de Documento, Utilização, Tipo de Devolução e Busca Textual.
   - Pílulas ativas com remoção rápida individual e popover para filtros adicionais (`+N filtros`).
   - Persistência sincronizada em `sessionStorage`.

---

## Destaques da Versão 1.0.3

1. **Backend & Endpoints Consolidados (PocketBase)**:
   - Endpoint `POST /backend/v1/dashboard/stats` totalmente funcional e otimizado com queries SQL agregadas via `$app.db().newQuery()` para alta performance em grandes volumes de dados.
   - Deploy de pb_hooks validado sem erros de sintaxe ou timeouts.
   - Retorno integral de KPIs, gráficos históricos/mensais, análise de equipamentos/insumos, clientes ativos e opções de filtros distintos.

2. **Identidade Visual Roland DG Brasil**:
   - Paleta corporativa refinada: preto/cinza grafite escuro (`#0F172A`, `#141E33`), branco e cinzas neutros (`#F8FAFC`, `#94A3B8`).
   - Cores de destaque nos gráficos e badges: Azul Roland (`#0B6E99` / `209 100% 32%`) e Ciano Roland (`189 100% 38%`).
   - Logo oficial Roland sem o laranja legado: ícone gráfico com bloco superior azul (`#0059C1`) e barra inferior cinza (`#2D3748` / `#94A3B8`), com tipografia "Roland" em vetor puro.

3. **Navegação & Layout Responsivo**:
   - Sidebar desktop colapsável com persistência em `localStorage` (`sidebar_collapsed`), botões rápidos de recolher/expandir no header (`PanelLeftClose` / `PanelLeftOpen`) e menu drawer para dispositivos móveis.
   - Header com data atual formatada por extenso em português e badge de status da sincronização de bases.
   - Footer informativo com data/hora da última carga de dados consolidada.

4. **Gerenciador Central de Sessão & Autenticação Robusta**:
   - Centralizador `safeAuthRefresh` em `src/lib/pocketbase/auth-session.ts` com mutex anti-concorrência (deduplicação de chamadas em voo) e timeout de segurança (6s).
   - `AuthContext` com timer/fallback de segurança no boot (máximo 5s de `isLoading`), impedindo telas brancas ou travamento por instabilidade momentânea do backend.
   - Tratamento específico de erros: preservação da sessão local em quedas transitórias de rede e limpeza seletiva do `authStore` apenas mediante resposta 401/403 explícita.

5. **Filtros Globais Multi-Seleção & Persistência**:
   - Filtros padrão inicializados zerados/abertos (sem restrições no primeiro acesso), garantindo visão completa imediata do faturamento.
   - Suporte a seleção de bases: Ambos, RacNew e NetSales.
   - Dimensões: Data De/Até, Ano, Mês, Dia, Vendedor > Cliente, Vendedor, Grupo do Item, Estado (UF), Tipo de Documento, Utilização, Tipo de Devolução e Busca Textual.
   - Pílulas ativas com remoção rápida individual e popover para filtros adicionais (`+N filtros`).
   - Persistência sincronizada em `sessionStorage`.

---

## Credenciais e Acessos Padronizados

- **Senha Padrão (Todos os Usuários)**: `Roland@1234`
- **Senha Master Admin (Modal de Proteção)**: `Reset@Painel2025`

### Lista de Usuários (@rolanddg.com.br):

1. `silvio.mattos@rolanddg.com.br` — Silvio Mattos (Admin)
2. `nicolas.brito@rolanddg.com.br` — Nicolas Brito (Admin)
3. `fred.lunardini@rolanddg.com.br` — Fred Lunardini (User)
4. `anderson.clayton@rolanddg.com.br` — Anderson Clayton (User)
5. `edson.salles@rolanddg.com.br` — Edson Salles (User)
6. `caroline.diniz@rolanddg.com.br` — Caroline Diniz (User)
7. `carine.santos@rolanddg.com.br` — Carine Cristina Santos (User)

---

## Resumo das Funcionalidades Estáveis

1. **Dashboard com 5 KPIs e Gráficos Estratégicos**:
   - **5 KPIs**: Faturamento Bruto, Valor Líquido, Itens Vendidos, Documentos (NFe) e Devoluções.
   - **Gráficos Históricos e Estratégicos**:
     - _Evolução de Vendas por Ano_ (Faturamento, Devoluções e Variação % Ano a Ano).
     - _Tendência de Vendas — Equipamentos_ (Linha contínua mensal por período cronológico).
     - _Acumulado de Vendas — Insumos_ (Linha do tempo contínua para Peças, Tintas e Acessórios).
     - _Evolução de Vendas por Mês_ (Últimos 6 meses com comparativo de ano anterior e devoluções).
     - _Venda Mensal por Grupo do Item_ (Últimos 6 meses com barras comparativas por grupo).
     - _Vendas por Grupo do Item_ (Distribuição percentual em Donut).
     - _Top 10 Vendedores_ e _Top 10 Clientes_ (Rankings por faturamento).
     - _Vendas por Estado (UF)_ (Distribuição regional).
     - _Clientes Ativos — Equipamentos_ e _Clientes Ativos — Insumos_ (Últimos 6 meses vs. ano anterior).
   - **Vendas Recentes**: Listagem dos últimos lançamentos com link direto para a visão analítica.

2. **Página de Vendas Analítica**:
   - Tabela com ordenação server-side por todas as colunas.
   - Agrupamento inteligente por Nº NFe com somatório de itens e detalhamento colapsável.
   - Badges identificadores de origem (RacNew e NetSales).
   - Paginação sob demanda com seleção de registros por página.

3. **Exportação CSV Completa**:
   - Exportação de todos os registros correspondentes aos filtros ativos.
   - Padrão brasileiro (separador `;`, formatação numérica pt-BR e UTF-8 com BOM para compatibilidade com Microsoft Excel).

4. **Segurança, Auditoria & Gestão**:
   - Proteção de rotas restritas (`/importar`, `/admin`, `/usuarios`, `/auditoria`) com modal de segundo fator por senha master.
   - Gestão de Usuários completa com convites e atribuição de perfis (Admin / User).
   - Auditoria completa com logs de ações, logins, exportações e acessos.

---

## Histórico de Versões

- **v1.0.4 (01/09/2026)**: Backup estável oficial (commit `0.0.82`) — ajuste do hook `pocketbase/hooks/dashboard_stats.js` para que os gráficos "Tendência de Vendas — Equipamentos" e "Acumulado — Insumos" sempre apresentem a base histórica inteira (via `sqlWhereHistorical`), ignorando filtros de período e dimensão e respeitando apenas a seleção de base (RacNew/NetSales/Ambos).
- **v1.0.3 (01/09/2026)**: Backup estável oficial (commit `0.0.81`) — hook `dashboard_stats.js` totalmente validado e deployável no backend PocketBase com queries agregadas via SQL puro; identidade visual Roland DG (preto, cinza, branco com acentos em azul #0B6E99 e ciano); logo corporativo Roland sem laranja; sidebar colapsável com persistência em localStorage; filtros padrão abertos/zerados no primeiro boot; gerenciador central de sessão (`safeAuthRefresh`) com mutex e timeout de segurança no boot.
- **v1.0.2 (22/08/2026)**: Backup de segurança — correção crítica de autenticação (AuthContext limpa pb.authStore no catch do authRefresh, eliminando token inválido que causava dados zerados ao navegar/refresh), filtro Seleção de Bases funcional (RacNew/NetSales/Ambos) com correção da lógica tem_netsales, badges de origem (RacNew âmbar, NetSales indigo), resumo de origens acima da tabela, coluna Tipo de Documento e coluna Origem na tabela de Vendas e CSV, e senhas padronizadas Roland@1234 para todos os 7 usuários + admin.
- **v0.0.59 (22/08/2026)**: Backup estável pré-"Seleção de Bases" — 5 KPIs, 9 gráficos, filtros multi-seleção persistentes, colapso por NFe, ordenação server-side, auditoria, exportação CSV completa, senhas padronizadas e QA aprovado.
- **v1.0 (20/08/2026)**: Release oficial estável no commit 0.0.56 com 22 frentes de otimização consolidadas.
- **v0.0.39**: Backup documental com funcionalidades ativas e bases consolidadas.
- **v0.0.36**: Backup pós-recuperação do backend.
- **v0.0.29**: Backup com rotas e filtros consolidados.
