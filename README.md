# 💬 Chat WebSocket Premium

Um sistema de chat em tempo real moderno, robusto e elegante, construído com Node.js e WebSockets, contando com persistência em SQLite e interface responsiva com Glassmorphism.

## 🚀 Principais Funcionalidades

- **Salas Dinâmicas**: Crie e gerencie salas públicas. O criador tem poder total sobre a sala.
- **Conversas Privadas (DM)**: Inicie chats isolados com qualquer usuário online.
- **Persistência Profissional**: Migrado de arquivos JSON para **SQLite**, garantindo que salas e mensagens sobrevivam a reinícios.
- **Interatividade Total**:
  - **Reações**: Adicione emojis às mensagens.
  - **Respostas (Reply)**: Responda a mensagens específicas com citação.
  - **Edição e Exclusão**: Altere ou remova suas mensagens (com janela de 15 minutos).
- **Recursos Avançados**:
  - **Busca de Mensagens**: Pesquise no histórico da sala atual.
  - **Checks de Leitura (✓✓)**: Saiba quando sua mensagem foi entregue e lida.
  - **Sons de Notificação**: Alerta sonoro para novas DMs.
  - **Status de Usuário**: Online, Ausente ou Ocupado.
- **Design Premium**: Modo escuro/claro automático, modais estilizados e interface totalmente responsiva.

## 🛠️ Tecnologias Utilizadas

- **Backend**: Node.js, `ws` (WebSockets), `better-sqlite3` (Banco de Dados).
- **Frontend**: HTML5, CSS3 (Vanilla), JavaScript (ES6+).
- **Persistência**: SQLite 3.

## 📦 Como Rodar Localmente

1. **Instale as dependências**:
   ```bash
   npm install
   ```
2. **Inicie o servidor**:
   ```bash
   npm start
   ```
   Ou para desenvolvimento com auto-reload:
   ```bash
   npm run dev
   ```
3. Abra `http://localhost:3000` no seu navegador.

## ☁️ Deploy no Railway (Importante!)

Este projeto foi otimizado para o **Railway.com**. Devido ao uso do SQLite, você **deve** configurar um Volume para não perder dados:

1. No painel do serviço no Railway, vá em **Volumes**.
2. Clique em **Add Volume**.
3. Configure o **Mount Path** como: `/app/data`
4. Isso garantirá que o arquivo `chat.db` seja persistido permanentemente.

## 📁 Estrutura do Projeto

- `server.js`: Ponto de entrada da aplicação.
- `src/chatHandler.js`: Lógica principal do protocolo de mensagens e salas.
- `src/db.js`: Gerenciamento do banco de dados SQLite.
- `public/`: Interface frontend (HTML, CSS e JS).
- `data/`: Local de armazenamento do banco de dados (protegido via .gitignore).

---
*Desenvolvido com foco em performance e experiência do usuário.*
