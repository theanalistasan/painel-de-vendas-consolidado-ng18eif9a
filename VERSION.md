# Painel de Vendas Consolidado — Release Oficial

## Versão e Status

- **Versão**: 1.0
- **Data**: 20/08/2026
- **Status**: Estável / Release Oficial

---

## Credenciais de Acesso

- **Administrador**: `silvio.mattos@rolanddg.com.br` | Senha: `Skip@Pass`
- **Usuário**: `nicolas.brito@rolanddg.com.br` | Senha: `Skip@Pass`
- **Senha Admin (Modal de Proteção)**: `Reset@Painel2025`

---

## Funcionalidades Implementadas (Release Oficial 1.0)

1. **Dashboard com KPIs**:
   - Faturamento Bruto
   - Valor Líquido
   - Devoluções
   - Ticket Médio
   - Quantidade de Vendas

2. **Gráficos Históricos / Estratégicos**:
   - **Evolução de Vendas por Ano**: Barras com faturamento e devoluções + linha de variação percentual ano a ano.
   - **Tendência de Vendas — Equipamentos**: Linha do tempo contínua com histórico completo de faturamento de máquinas/equipamentos.
   - **Acumulado de Vendas — Insumos**: Linha do tempo contínua acumulada ao longo dos anos para insumos/tintas.

3. **Gráficos que Respeitam Filtros**:
   - **Evolução de Vendas por Mês**: Visão mensal detalhada com comparativo em relação ao ano anterior e devoluções.
   - **Venda Mensal por Grupo do Item**: Comparativo dos últimos 6 meses com barras lado a lado por categoria de produto.
   - **Vendas por Grupo do Item**: Distribuição consolidada de faturamento por categoria.
   - **Clientes Ativos — Equipamentos**: Evolução de clientes ativos com compras nos últimos 6 meses.
   - **Clientes Ativos — Insumos**: Monitoramento da base de clientes ativos com comparativo em relação ao mesmo período do ano anterior.

4. **Página de Vendas**:
   - Tabela analítica completa com paginação sob demanda.
   - Ordenação server-side por colunas com indicadores visuais nos cabeçalhos.
   - Agrupamento colapsável por Nº NFe com somatório de itens e valores da nota.

5. **Exportação CSV Completa**:
   - Exportação de todos os registros filtrados (sem limite de paginação da tela).
   - Formato CSV no padrão brasileiro (separador `;`, formatação numérica pt-BR e compatibilidade com Microsoft Excel).

6. **Filtros Globais Multi-Seleção com Persistência**:
   - Dimensões hierárquicas e multi-seleção: Vendedor > Cliente, Ano, Mês, Dia, Grupo de Item, Tipo Doc, Utilização.
   - Persistência de estado via `sessionStorage`.

7. **Filtros Padrão na Inicialização**:
   - Utilização: `"Venda de Mercadoria"`
   - Ano: Ano atual vigente
   - Grupos: `PEÇAS`, `TINTAS`, `ACESSÓRIOS`, `EQUIPAMENTOS`
   - Tipo Doc: `"NF de Saída"`

8. **Importação de Dados com Preview e Progresso**:
   - Importação das bases Produtos, RacNew e NetSales.
   - Modal de preview interativo antes do processamento.
   - Barra de progresso em tempo real e validação de schema.

9. **Consolidação SQL**:
   - Base mestra RacNew com enriquecimento complementar da NetSales (12 campos exclusivos mapeados via `COALESCE`).
   - Integridade relacional e tratamento de nulos/duplicatas.

10. **Proteção de Rotas Admin com Senha Modal**:
    - Proteção das rotas restritas: `/importar`, `/admin`, `/usuarios` e `/auditoria`.
    - Autenticação de segundo fator com modal de senha administrativa mestre.

11. **Gestão de Usuários**:
    - CRUD completo de usuários (criação, edição, desativação/ativação e exclusão).
    - Geração de link de convite para novos usuários.
    - Perfis de acesso diferenciados (Admin e Usuário comum).

12. **Auditoria Completa**:
    - Rastreamento e log de eventos de login, logout e acessos administrativos.
    - Interface de auditoria com filtros, busca e badges visuais por tipo de ação.

13. **Autenticação e Gestão de Sessão de Usuários**:
    - Fluxo seguro de autenticação e persistência de sessão de usuários.

14. **Layout Responsivo**:
    - Sidebar colapsável, header com informações do usuário logado e drawer mobile para navegação otimizada em dispositivos móveis.

15. **Datas e Moedas no Padrão Brasileiro**:
    - Datas formatadas em `DD/MM/AAAA`.
    - Moedas formatadas em `R$` com separadores decimais e de milhar no padrão pt-BR.

16. **Correção de Datas na Importação**:
    - Tratamento e leitura correta de serial dates do Excel e múltiplos formatos textuais de data.

17. **Colapso Inteligente de Pílulas de Filtro**:
    - Exibição compacta das seleções ativas com contador expansível `+N filtros`.

18. **Botão "Aplicar Filtros"**:
    - Controle manual de disparo de consultas e queries para otimização de performance e controle do usuário.

19. **Sincronização de Filtros entre Dashboard e Vendas**:
    - Manutenção consistente do contexto de filtros ao navegar entre as páginas do painel.

20. **Correção do Botão "Selecionar todos"**:
    - Comportamento de seleção respeitando o termo da busca ativa no dropdown.

21. **Limpeza de Registros Vazios / Nulos dos Filtros**:
    - Higienização e descarte de opções nulas ou vazias nas opções de filtro.

22. **DISTINCT nos Dropdowns de Filtro**:
    - Eliminação de itens duplicados nos seletores de filtro.

---

## Histórico de Versões

- **v1.0 (20/08/2026)**: **Release Oficial Estável** — Versão 1.0 final de produção contendo todas as 22 frentes e otimizações implementadas (Dashboard, Gráficos históricos e filtrados, Tabela de Vendas com NFe colapsável, Exportação CSV completa pt-BR, Filtros multi-seleção persistentes e sincronizados com DISTINCT e busca ativa, Importação com preview/progresso e consolidação RacNew/NetSales, Proteção de rotas admin com modal, CRUD de Usuários com link de convite, Auditoria, Autenticação, Layout responsivo, Padrão pt-BR e higienização de dados).
- **v0.0.39**: Backup documental com funcionalidades ativas, ~126k registros consolidados, RacNew + NetSales, 5 KPIs e 6 gráficos.
- **v0.0.36**: Backup pós-recuperação do backend (migrações, hooks, auth e superusuário restaurados).
- **v0.0.29**: Backup com rotas e filtros consolidados.
- **v0.0.27**: Backup de referência da arquitetura inicial.
