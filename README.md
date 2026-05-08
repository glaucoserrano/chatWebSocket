# 💬 Chat WebSocket v2.0

Chat em tempo real construído com **Node.js** e **WebSocket puro** (`ws`). Suporta múltiplas salas, persistência de histórico, reconexão automática, indicador de digitação, modo escuro e muito mais.

---

## 📋 Sobre o Projeto

Comunicação bidirecional em tempo real via protocolo WebSocket. Múltiplos usuários podem entrar em salas diferentes, trocar mensagens instantâneas e ver o histórico das conversas anteriores — tudo sem frameworks de backend.

---

## 🧱 Estrutura do Projeto

```
chatWebSocket/
├── public/
│   └── index.html          # Frontend completo (redesenhado)
├── src/
│   ├── chatHandler.js      # Lógica WebSocket (salas, validação, broadcast)
│   ├── db.js               # Persistência de mensagens (JSON)
│   └── rateLimiter.js      # Rate limiting por janela deslizante
├── tests/
│   └── chat.test.js        # Testes automatizados (Jest) — 7 testes
├── data/
│   └── messages.json       # Histórico persistido (gerado automaticamente)
├── .env                    # Variáveis de ambiente
├── .env.example            # Exemplo para novos colaboradores
├── .eslintrc.json          # Configuração ESLint
├── .prettierrc.json        # Configuração Prettier
├── server.js               # Ponto de entrada do servidor
└── package.json
```

### Tecnologias

| Camada     | Tecnologia                               |
|------------|------------------------------------------|
| Runtime    | Node.js                                  |
| Protocolo  | WebSocket (RFC 6455)                     |
| Biblioteca | [`ws`](https://github.com/websockets/ws) v8.x |
| Frontend   | HTML5 + CSS3 + JavaScript (Vanilla)      |
| HTTP       | Módulo nativo `http` do Node.js          |
| Testes     | Jest                                     |
| Qualidade  | ESLint + Prettier                        |

---

## ⚙️ Como Funciona (Passo a Passo)

### 1. Servidor HTTP + WebSocket
- `server.js` cria um servidor HTTP que serve arquivos estáticos da pasta `public/`
- O servidor WebSocket (`ws`) é montado sobre o mesmo servidor HTTP (porta compartilhada)
- Variáveis de ambiente lidas do `.env` via `dotenv`
- Proteção contra **directory traversal** no servidor HTTP

### 2. Fluxo de Entrada
1. Usuário abre `http://localhost:3000` → recebe `public/index.html`
2. Preenche nome e escolhe uma sala → frontend abre conexão WebSocket
3. Envia `{ type: "join", name, room, sessionId }` ao conectar
4. Servidor valida o nome (tamanho, sanitização de HTML, unicidade na sala)
5. Responde com `{ type: "welcome", history, rooms, sessionId }`
6. Frontend exibe o histórico da sala e muda para a tela de chat

### 3. Envio e Broadcast de Mensagens
1. Usuário digita e envia → `{ type: "message", text }`
2. Servidor valida (tamanho máximo, rate limit: 10 msg/5s por cliente)
3. Faz broadcast apenas para os clientes **da mesma sala**
4. Salva a mensagem em `data/messages.json` (persistência)

### 4. Salas
- Três salas fixas: **Geral**, **Tecnologia**, **Off-topic**
- Cada sala tem seu próprio histórico, lista de usuários e broadcast isolado
- Usuário pode trocar de sala sem desconectar: `{ type: "switch_room", room }`

### 5. Indicador de Digitação
- Frontend envia `{ type: "typing", isTyping: true/false }` ao digitar
- Para automaticamente após 2s de inatividade
- Servidor faz broadcast para os demais da sala (excluindo o remetente)

### 6. Reconexão Automática
- Ao perder conexão, o frontend agenda uma reconexão com **backoff exponencial** (máx 30s)
- Um banner vermelho exibe a contagem regressiva
- Ao reconectar, o `sessionId` salvo no `localStorage` é reutilizado

### 7. Heartbeat (Ping/Pong)
- A cada 30s o servidor envia `ping` para todos os clientes
- Se um cliente não responder com `pong`, a conexão é encerrada (`terminate`)
- Evita acúmulo de conexões "zumbis" que parecem abertas mas não respondem

### 8. Persistência
- Histórico salvo em `data/messages.json` por sala
- Limitado às últimas `MAX_HISTORY` (padrão: 100) mensagens por sala
- Novos usuários recebem as últimas 50 mensagens ao entrar

---

## 🚀 Como Executar

### Pré-requisitos
- [Node.js](https://nodejs.org/) v18 ou superior

### Passos

```bash
# 1. Instale as dependências
npm install

# 2. (Opcional) Ajuste as configurações
cp .env.example .env

# 3. Inicie o servidor
npm start

# Modo desenvolvimento (reinicia ao salvar)
npm run dev
```

Acesse: **http://localhost:3000**

> Abra múltiplas abas para simular vários usuários em tempo real.

---

## 🧪 Testes

```bash
npm test
```

```
PASS tests/chat.test.js
  RateLimiter
    ✓ permite até o limite de requisições
    ✓ libera após a janela de tempo expirar
    ✓ remove cliente sem erros
  DB - persistência de mensagens
    ✓ salva e recupera mensagens de uma sala
    ✓ retorna array vazio para sala sem histórico
    ✓ respeita o limite de mensagens retornadas
    ✓ mensagens de salas diferentes não se misturam

Tests: 7 passed, 7 total
```

---

## 📡 Protocolo de Mensagens (JSON)

### Cliente → Servidor

| Tipo          | Payload                                    | Descrição                        |
|---------------|--------------------------------------------|----------------------------------|
| `join`        | `{ type, name, room, sessionId? }`         | Entrar em uma sala               |
| `message`     | `{ type, text }`                           | Enviar mensagem                  |
| `typing`      | `{ type, isTyping }`                       | Indicador de digitação           |
| `switch_room` | `{ type, room }`                           | Trocar de sala                   |

### Servidor → Clientes

| Tipo           | Payload                                               | Descrição                         |
|----------------|-------------------------------------------------------|-----------------------------------|
| `welcome`      | `{ type, sessionId, name, room, rooms, history }`     | Boas-vindas + histórico           |
| `room_changed` | `{ type, room, history }`                             | Confirmação de troca de sala      |
| `message`      | `{ type, id, name, text, room, timestamp }`           | Mensagem de um usuário            |
| `info`         | `{ type, text, timestamp }`                           | Notificação de sistema            |
| `user_list`    | `{ type, users, room }`                               | Lista de usuários online na sala  |
| `typing`       | `{ type, name, isTyping }`                            | Alguém está digitando             |
| `error`        | `{ type, text }`                                      | Erro de validação ou servidor     |

---

## ⚙️ Variáveis de Ambiente (`.env`)

| Variável               | Padrão  | Descrição                                      |
|------------------------|---------|------------------------------------------------|
| `PORT`                 | `3000`  | Porta do servidor                              |
| `HOST`                 | `localhost` | Host de escuta                            |
| `MAX_NAME_LENGTH`      | `20`    | Tamanho máximo do nome de usuário              |
| `MAX_MESSAGE_LENGTH`   | `500`   | Tamanho máximo de uma mensagem                 |
| `MAX_HISTORY`          | `100`   | Máximo de mensagens persistidas por sala       |
| `HEARTBEAT_INTERVAL`   | `30000` | Intervalo do ping/pong em ms                   |
| `RATE_LIMIT_WINDOW_MS` | `5000`  | Janela do rate limiter em ms                   |
| `RATE_LIMIT_MAX`       | `10`    | Máximo de mensagens por janela por cliente     |

---

## ✅ Melhorias Implementadas na v2.0

### 🔒 Segurança
- [x] **Sanitização de entrada**: Nome validado no servidor (tamanho, caracteres HTML escapados)
- [x] **Limite de tamanho**: Mensagens limitadas a `MAX_MESSAGE_LENGTH` caracteres
- [x] **Rate limiting**: Máx 10 mensagens por 5s por cliente (janela deslizante)
- [x] **Directory traversal**: Servidor HTTP protegido contra acesso fora de `public/`

### 🏗️ Arquitetura
- [x] **Separação frontend/backend**: Frontend em `public/`, backend em `src/`
- [x] **Salas/canais**: Geral, Tecnologia e Off-topic com broadcast isolado
- [x] **Persistência**: Histórico salvo em JSON por sala
- [x] **Histórico ao entrar**: Últimas 50 mensagens exibidas ao novo usuário

### 🛠️ Robustez
- [x] **try/catch no JSON.parse**: Servidor não cai com dados malformados
- [x] **Reconexão automática**: Backoff exponencial (1s → 30s máx) com banner de aviso
- [x] **Heartbeat/Ping-Pong**: Detecção e encerramento de conexões zumbis a cada 30s

### ✨ Funcionalidades
- [x] **Indicador de digitação**: Mostra em tempo real quem está digitando
- [x] **Timestamp nas mensagens**: Horário exibido abaixo de cada mensagem
- [x] **Usuários online**: Lista atualizada em tempo real na sidebar
- [x] **Emoji picker**: 24 emojis prontos para usar
- [x] **Modo escuro/claro**: Toggle com preferência salva no `localStorage`
- [x] **Responsivo mobile**: Layout adaptado para telas pequenas com menu lateral

### 🧪 Qualidade de Código
- [x] **7 testes automatizados**: Cobertura de RateLimiter e persistência (Jest)
- [x] **ESLint**: Configurado com regras para Node.js ES2022
- [x] **Prettier**: Formatação padronizada
- [x] **Variáveis de ambiente**: Porta, limites e intervalos via `.env`

---

## 📄 Licença

ISC
