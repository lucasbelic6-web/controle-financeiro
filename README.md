# Sistema de Controle Financeiro Pessoal

Um sistema completo para organizar suas finanças pessoais, controlar transações, metas e investimentos.

## Funcionalidades

- ✅ **Controle de Transações**: Registre receitas e despesas com categorias personalizadas
- ✅ **Relatórios Financeiros**: Visualize resumos mensais e análises detalhadas
- ✅ **Gerenciamento de Categorias**: Crie e organize categorias para receitas e despesas
- ✅ **Metas Financeiras**: Defina e acompanhe metas de economia e objetivos financeiros
- ✅ **Controle de Investimentos**: Gerencie seus investimentos com acompanhamento de rentabilidade
- ✅ **Interface de Linha de Comando**: Interface intuitiva via terminal

## Instalação

1. Clone ou baixe o projeto
2. Instale as dependências:
   ```bash
   npm install
   ```

3. Inicialize o banco de dados:
   ```bash
   node src/init.js
   ```

4. Inicie a aplicação:
   ```bash
   npm start
   ```

## Como Usar

### Adicionar Transações
- Selecione "Adicionar Transação" no menu principal
- Escolha entre receita ou despesa
- Selecione uma categoria ou use as categorias padrão
- Informe o valor, descrição e data

### Visualizar Relatórios
- Resumo do mês atual: Veja sua saúde financeira atual
- Resumo personalizado: Filtre por período específico
- Relatório mensal detalhado: Análise por categoria

### Metas Financeiras
- Crie metas de economia ou objetivos financeiros
- Acompanhe o progresso em tempo real
- Defina prazos e valores alvo

### Investimentos
- Registre seus investimentos
- Acompanhe rentabilidade e valorização
- Calcule lucros/prejuízos

## Estrutura do Projeto

```
├── src/
│   ├── models/          # Modelos de dados e banco de dados
│   ├── services/        # Serviços de negócio
│   ├── controllers/     # Controladores (futuro)
│   ├── views/           # Views (futuro)
│   ├── utils/           # Utilitários
│   ├── index.js         # Ponto de entrada da aplicação
│   └── init.js          # Inicialização do banco de dados
├── data/               # Arquivos de dados do SQLite
├── config/             # Arquivos de configuração
├── tests/              # Testes unitários
└── package.json        # Dependências do projeto
```

## Tecnologias Utilizadas

- **Node.js**: Runtime JavaScript
- **SQLite**: Banco de dados leve
- **Inquirer.js**: Interface de linha de comando interativa
- **Chalk**: Colorização de texto no terminal
- **Moment.js**: Manipulação de datas

## Próximos Passos

- [ ] Interface web
- [ ] Exportação de relatórios (PDF, Excel)
- [ ] Gráficos e visualizações
- [ ] Sincronização com bancos externos
- [ ] Alertas e notificações
- [ ] Multi-usuário

## Licença

MIT License