# 🚀 Especificação de Melhorias - Chat WebSocket Premium

Este documento detalha as próximas evoluções recomendadas para o sistema, divididas por impacto e complexidade.

## 1. Persistência e Infraestrutura (Prioridade Alta)
- [ ] **Salvar Salas no Disco**: Atualmente as salas dinâmicas ficam apenas na memória. Criar `data/rooms.json` para que as salas criadas pelos usuários sobrevivam ao reinício do servidor.
- [ ] **Banco de Dados Real**: Migrar do JSON para um banco SQLite ou MongoDB para suportar milhares de mensagens com performance.
- [ ] **Logs de Auditoria**: Sistema de logs no servidor para rastrear quem excluiu qual sala ou baniu quem.

## 2. Experiência do Usuário (UX) e Funcionalidades
- [ ] **Check de Leitura (Vistos)**: Implementar os famosos "checks" (✓ recebido, ✓✓ lido) usando o evento `message_read`.
- [ ] **Busca de Mensagens**: Barra de busca para encontrar palavras-chave dentro do histórico da sala atual.
- [ ] **Notificações Push & Som**: Notificar o usuário sobre novas DMs mesmo quando a aba estiver em segundo plano.
- [ ] **Prévia de Links**: Detectar URLs e gerar um card com título, descrição e imagem do site automaticamente.

## 3. Mídia e Arquivos
- [ ] **Upload de Imagens**: Arrastar e soltar imagens para enviar diretamente no chat (com miniatura).
- [ ] **Mensagens de Áudio**: Gravador de voz integrado para mensagens rápidas.
- [ ] **Compartilhamento de Arquivos**: Suporte a PDFs, Docs e arquivos compactados.

## 4. Moderação e Segurança
- [ ] **Sistema de Login/Senha**: Cadastro real de usuários com senha (BCrypt) e JWT para segurança.
- [ ] **Controle de Moderador**: Criadores de sala podem "Silenciar" ou "Banir" usuários da sala específica.
- [ ] **Salas com Senha**: Possibilidade de criar uma sala pública que exige uma senha para entrar.

## 5. Design e Estética (Wow Factor)
- [ ] **Wallpapers Customizados**: Cada sala pode ter um fundo (imagem ou gradiente) diferente escolhido pelo criador.
- [ ] **Lottie Animations**: Reações animadas que "saltam" na tela ao serem clicadas.
- [ ] **Efeito Typing Detalhado**: "João está digitando..." com foto do usuário ao lado da barra.

---
*Documento gerado para guiar o desenvolvimento das próximas sprints.*
