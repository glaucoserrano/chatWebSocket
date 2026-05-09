# 💬 Chat WebSocket Premium

[![Node.js](https://img.shields.io/badge/Node.js-LTS-green.svg)](https://nodejs.org/)
[![SQLite](https://img.shields.io/badge/SQLite-3-blue.svg)](https://sqlite.org/)
[![WebSocket](https://img.shields.io/badge/Websocket-Pure-orange.svg)](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API)

Um ecossistema de comunicação em tempo real projetado para alta performance, escalabilidade e resiliência. Este projeto demonstra habilidades avançadas em **Backend (Node.js)**, **Persistência (SQLite)** e **Arquitetura de Sistemas**.

---

## 🚀 Funcionalidades de Destaque

### 💎 Nova Experiência de Lobby (MVP UOL-like)
- **Zero Fricção**: Entrada no chat exigindo apenas a escolha de um Nickname, focando em altíssima conversão.
- **Prova Social em Tempo Real**: O Lobby (Dashboard de entrada) exibe a lotação e o total de usuários online ao vivo usando WebSockets, antes mesmo do usuário entrar na sala.
- **Catálogo de Salas Temáticas**: Salas categorizadas (Relacionamento, Amizade, Games, Cidades, etc.) para conectar pessoas com interesses comuns.
- **Design Moderno**: Interface responsiva e modular (HTML/CSS/JS separados) construída com CSS Grid e Flexbox em modo noturno (Dark Mode).

### 💬 Experiência do Chat
- **Mensageria Híbrida**: Salas públicas dinâmicas e Chats Privados (DMs) isolados.
- **Interatividade Social**: Sistema de reações com emojis e respostas (Reply) contextuais.
- **Gestão de Mensagens**: Edição e exclusão de mensagens com "soft delete".
- **Visualização de Status**: Indicadores de Online, Ausente e Ocupado em tempo real.
- **Confirmação de Leitura (✓✓)**: Lógica de "visto" implementada via `IntersectionObserver`.

### 🛠️ Engenharia de Software
- **Persistência Robusta**: Migração de JSON para **SQLite**, garantindo integridade de dados e consultas rápidas via índices.
- **Graceful Shutdown**: Tratamento de sinais `SIGTERM` para fechamento limpo do banco de dados e prevenção de corrupção de arquivos.
- **Sincronização Global**: Broadcast inteligente de salas e usuários para todos os clientes conectados.
- **Busca Indexada**: Mecanismo de busca no histórico de mensagens integrado ao backend.

---

## 🏗️ Decisões de Arquitetura (The "Why")

1. **WebSockets vs HTTP Polling**: Optamos por WebSockets puros para garantir a menor latência possível, essencial para uma experiência de chat fluida.
2. **SQLite para Persistência**: Escolhido pela sua natureza *self-contained* e zero configuração, sendo ideal para aplicações que precisam de performance de SQL sem a complexidade de um servidor de banco de dados separado inicialmente.
3. **Vanilla JS no Frontend**: Demonstra domínio total da DOM API e princípios fundamentais de JavaScript, sem dependência de frameworks pesados para uma UI rápida e reativa.

---

## 📈 Visão de Negócio & Monetização

O produto pivotou para um modelo focado em **crescimento massivo (B2C)**, inspirado nos bate-papos clássicos (como UOL).

Estratégias de Monetização Preparadas na Arquitetura:
1. **Modelo VIP (Assinatura Mensal)**:
   - *Fura-Fila*: Capacidade das salas é limitadas (ex: 50 pessoas). Apenas usuários VIP podem furar a fila.
   - *Exclusividade*: Ícones e cores de nickname customizadas.
2. **Microtransações & Gifting**: Envio de presentes virtuais e animações na sala geral.
3. **Ads Nativos**: Espaços definidos no Lobby para banners patrocinados (Google AdSense ou Venda Direta).

---

## ☁️ Deploy & Infraestrutura

O projeto está pronto para produção, com suporte nativo a volumes em PaaS como **Railway**.

### Configuração de Volume (Railway)
Para persistência de dados, mapeie um volume no Railway:
- **Mount Path**: `/app/data`

---

## 📦 Como Instalar

```bash
# Clone o repositório
git clone https://github.com/seu-usuario/chatWebSocket.git

# Instale as dependências
npm install

# Inicie o servidor
npm start
```

---
*Este projeto faz parte do meu portfólio técnico. Sinta-se à vontade para explorar o código e entrar em contato para oportunidades de colaboração.*
