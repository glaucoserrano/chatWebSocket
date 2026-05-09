// chat.js
// Global state
let myName = '';
let myRoom = 'geral';
let sessionId = localStorage.getItem('chat_session') || null;
let reconnectAttempts = 0;
let reconnectTimer = null;
let typingTimer = null;
let isTyping = false;
let hasMoreHistory = false;
let firstMessageId = null;
let replyTo = null;
let editingId = null;
let activePrivateChat = null;
let currentRoomInfo = null;
const typingUsers = new Set();
const userColors = new Map();
const unreadDMs = new Map();
const dmList = new Set();
const AVAILABLE_ROOMS = new Set(['geral']);
const ROOM_LABELS = { geral: '💬 Geral' };
const EMOJIS = ['😀', '😂', '😍', '🤔', '😎', '🥳', '😢', '😡', '👍', '👎', '🙌', '🔥', '❤️', '✅', '⚡', '🎉', '💡', '🚀', '💬', '🤝', '😮', '🥹', '😴', '🤣'];

// DOM refs
const appEl = document.getElementById('app');
const messagesEl = document.getElementById('messages');
const inputEl = document.getElementById('input');

const typingBar = document.getElementById('typing-bar');
const userListEl = document.getElementById('user-list');
const onlineCount = document.getElementById('online-count');
const topbarRoom = document.getElementById('topbar-room');
const banner = document.getElementById('reconnect-banner');
const emojiPicker = document.getElementById('emoji-picker');
const toast = document.getElementById('toast');

// Emoji picker
EMOJIS.forEach(e => {
  const s = document.createElement('span');
  s.textContent = e;
  s.addEventListener('click', () => {
    if (emojiPicker.dataset.targetId) {
      const room = emojiPicker.dataset.targetRoom || (activePrivateChat ? 'p:' + [myName, activePrivateChat].sort().join(':') : myRoom);
      wsSend({ type: 'react', messageId: emojiPicker.dataset.targetId, emoji: e, room });
      emojiPicker.dataset.targetId = '';
      emojiPicker.dataset.targetRoom = '';
    } else {
      inputEl.value += e;
      inputEl.focus();
    }
    emojiPicker.classList.remove('open');
  });
  emojiPicker.appendChild(s);
});

document.getElementById('emojiBtn').addEventListener('click', (ev) => {
  ev.stopPropagation();
  emojiPicker.dataset.targetId = '';
  emojiPicker.classList.toggle('open');
});
document.addEventListener('click', () => emojiPicker.classList.remove('open'));

// Theme toggle
const themeBtn = document.getElementById('themeBtn');
const savedTheme = localStorage.getItem('chat_theme') || 'dark';
document.documentElement.setAttribute('data-theme', savedTheme);
themeBtn.textContent = savedTheme === 'dark' ? '☀️' : '🌙';
themeBtn.addEventListener('click', () => {
  const cur = document.documentElement.getAttribute('data-theme');
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('chat_theme', next);
  themeBtn.textContent = next === 'dark' ? '☀️' : '🌙';
});

document.getElementById('status-selector').addEventListener('change', (e) => {
  wsSend({ type: 'change_status', status: e.target.value });
});

// Mobile menu
const sidebar = document.getElementById('sidebar');
document.getElementById('menuBtn').addEventListener('click', (ev) => {
  ev.stopPropagation();
  sidebar.classList.toggle('open');
});
document.addEventListener('click', (e) => {
  if (!sidebar.contains(e.target) && e.target.id !== 'menuBtn') {
    sidebar.classList.remove('open');
  }
});

function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3500);
}

function getPrivateRoomId(u1, u2) {
  return 'p:' + [u1, u2].sort().join(':');
}

function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function scrollBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// Modal System
const modalOverlay = document.getElementById('modal-overlay');
const modalTitle   = document.getElementById('modal-title');
const modalText    = document.getElementById('modal-text');
const modalInput   = document.getElementById('modal-input');
const modalCancel  = document.getElementById('modal-cancel');
const modalConfirm = document.getElementById('modal-confirm');

function showModal({ title, text, input, confirmText, danger, onConfirm }) {
  modalTitle.textContent = title;
  modalText.textContent = text;
  modalInput.style.display = input ? 'block' : 'none';
  if (input) {
    modalInput.value = typeof input === 'string' ? input : '';
    setTimeout(() => modalInput.focus(), 100);
  }
  modalConfirm.textContent = confirmText || 'Confirmar';
  modalConfirm.className = 'btn-modal ' + (danger ? 'btn-danger' : 'btn-confirm');
  
  modalOverlay.classList.add('show');
  
  modalConfirm.onclick = () => {
    const val = input ? modalInput.value.trim() : true;
    if (input && !val) return;
    modalOverlay.classList.remove('show');
    onConfirm(val);
  };
  
  modalCancel.onclick = () => {
    modalOverlay.classList.remove('show');
  };
}

// Search & Observer
const searchBtn = document.getElementById('searchBtn');
const searchWrap = document.getElementById('search-wrap');
const searchInput = document.getElementById('search-input');
const closeSearchBtn = document.getElementById('closeSearchBtn');

searchBtn.onclick = () => {
  searchWrap.classList.toggle('show');
  if (searchWrap.classList.contains('show')) searchInput.focus();
};
closeSearchBtn.onclick = () => searchWrap.classList.remove('show');

searchInput.onkeyup = (e) => {
  if (e.key === 'Enter') {
    const term = searchInput.value.trim();
    if (term) wsSend({ type: 'search', term });
  }
};

const readObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const id = entry.target.dataset.id;
      if (id && !entry.target.classList.contains('mine')) {
        wsSend({ type: 'mark_read', messageId: id, room: getActiveRoomId() });
        readObserver.unobserve(entry.target);
      }
    }
  });
}, { threshold: 0.5 });

function observeMessage(el) { readObserver.observe(el); }

function getAvatarColor(name) {
  if (userColors.has(name)) return userColors.get(name);
  const colors = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  const color = colors[Math.abs(hash) % colors.length];
  userColors.set(name, color);
  return color;
}

function getInitials(name) {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
}

function linkify(text) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return text.replace(urlRegex, (url) => {
    return `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color:inherit;text-decoration:underline">${url}</a>`;
  });
}

function renderMessage(msg, prepend = false) {
  if (msg.type === 'info') {
    const wrap = document.createElement('div');
    wrap.className = 'msg-wrap info';
    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble';
    bubble.textContent = msg.text;
    wrap.appendChild(bubble);
    messagesEl.appendChild(wrap);
    if (!prepend) { scrollBottom(); observeMessage(wrap); }
    return;
  }
  if (msg.type && msg.type !== 'message') return;

  const isMine = msg.name === myName;
  const wrap = document.createElement('div');
  wrap.className = 'msg-wrap ' + (isMine ? 'mine' : 'other');
  wrap.dataset.id = msg.id;

  const row = document.createElement('div');
  row.className = 'msg-row';

  if (!isMine) {
    const avatar = document.createElement('div');
    avatar.className = 'msg-avatar';
    avatar.style.background = getAvatarColor(msg.name);
    avatar.textContent = getInitials(msg.name);
    row.appendChild(avatar);
  }

  const content = document.createElement('div');
  content.className = 'msg-content';

  if (!isMine) {
    const sender = document.createElement('div');
    sender.className = 'msg-sender';
    sender.textContent = msg.isPrivate ? `👤 ${msg.name} (Privado)` : msg.name;
    content.appendChild(sender);
  } else if (msg.isPrivate) {
    const sender = document.createElement('div');
    sender.className = 'msg-sender';
    sender.textContent = `Para: ${msg.to}`;
    content.appendChild(sender);
  }

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';

  if (msg.replyTo) {
    const q = document.createElement('div');
    q.className = 'msg-reply-quoted';
    q.innerHTML = `<b>${msg.replyTo.name}</b>${msg.replyTo.text}`;
    q.onclick = () => {
      const target = document.querySelector(`.msg-wrap[data-id="${msg.replyTo.id}"]`);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };
    bubble.appendChild(q);
  }

  const textSpan = document.createElement('div');
  textSpan.className = 'msg-text';
  textSpan.innerHTML = linkify(msg.text);
  bubble.appendChild(textSpan);

  if (msg.editedAt) {
    const edited = document.createElement('span');
    edited.className = 'msg-edited';
    edited.textContent = '(editada)';
    bubble.appendChild(edited);
  }

  const actions = document.createElement('div');
  actions.className = 'msg-actions';

  const reactBtn = document.createElement('span');
  reactBtn.className = 'action-btn';
  reactBtn.textContent = '😊';
  reactBtn.onclick = (e) => {
    e.stopPropagation();
    emojiPicker.classList.add('open');
    emojiPicker.dataset.targetId = msg.id;
    emojiPicker.dataset.targetRoom = msg.room || (msg.isPrivate ? 'p:' + [myName, activePrivateChat].sort().join(':') : myRoom);
  };
  actions.appendChild(reactBtn);

  const replyBtn = document.createElement('span');
  replyBtn.className = 'action-btn';
  replyBtn.textContent = '↩️';
  replyBtn.onclick = () => setReplyTo(msg);
  actions.appendChild(replyBtn);

  const isSuperAdmin = myName.toLowerCase() === 'glauco';
  const canModerate = isSuperAdmin && !msg.isPrivate;
  
  if (isMine || canModerate) {
    const editBtn = document.createElement('span');
    editBtn.className = 'action-btn';
    editBtn.textContent = '✏️';
    editBtn.onclick = () => setEditMode(msg);
    actions.appendChild(editBtn);

    const delBtn = document.createElement('span');
    delBtn.className = 'action-btn';
    delBtn.textContent = '🗑️';
    delBtn.onclick = () => {
      const room = getActiveRoomId();
      showModal({
        title: 'Deletar Mensagem',
        text: canModerate ? 'Você está deletando esta mensagem como Moderador.' : 'Tem certeza que deseja remover esta mensagem?',
        confirmText: 'Deletar',
        danger: true,
        onConfirm: () => wsSend({ type: 'delete_message', id: msg.id, room })
      });
    };
    actions.appendChild(delBtn);
  }

  bubble.appendChild(actions);
  content.appendChild(bubble);

  const reactionsList = document.createElement('div');
  reactionsList.className = 'msg-reactions';
  updateReactionsUI(reactionsList, msg.reactions || {}, msg.id);
  content.appendChild(reactionsList);

  const meta = document.createElement('div');
  meta.className = 'msg-meta';

  const time = document.createElement('span');
  time.className = 'msg-time';
  time.textContent = formatTime(msg.timestamp);
  meta.appendChild(time);

  if (isMine) {
    const checks = document.createElement('span');
    checks.className = 'checks';
    const isRead = msg.readBy && msg.readBy.filter(u => u !== myName).length > 0;
    checks.innerHTML = isRead ? '✓✓' : '✓';
    checks.classList.add(isRead ? 'read' : 'sent');
    meta.appendChild(checks);
  }

  content.appendChild(meta);
  row.appendChild(content);
  wrap.appendChild(row);

  if (prepend) {
    const loadMore = document.getElementById('load-more');
    loadMore.after(wrap);
  } else {
    messagesEl.appendChild(wrap);
    scrollBottom();
  }
}

function updateReactionsUI(el, reactions, messageId) {
  el.innerHTML = '';
  Object.entries(reactions).forEach(([emoji, users]) => {
    if (users.length === 0) return;
    const badge = document.createElement('div');
    badge.className = 'reaction-badge' + (users.includes(myName) ? ' active' : '');
    badge.innerHTML = `<span>${emoji}</span> ${users.length}`;
    badge.title = users.join(', ');
    badge.onclick = () => wsSend({ type: 'react', messageId, emoji, room: getActiveRoomId() });
    el.appendChild(badge);
  });
}

function renderHistory(history) {
  if (history.length > 0) firstMessageId = history[0].id;
  history.forEach(m => renderMessage(m));
}

function renderHistoryChunk(messages) {
  if (messages.length > 0) firstMessageId = messages[0].id;
  [...messages].reverse().forEach(m => renderMessage(m, true));
}

function updateTypingBar() {
  const names = [...typingUsers];
  if (names.length === 0) { typingBar.textContent = ''; return; }
  if (names.length === 1) { typingBar.textContent = `${names[0]} está digitando…`; return; }
  typingBar.textContent = `${names.join(', ')} estão digitando…`;
}

function renderUserList(users) {
  userListEl.innerHTML = '';
  users.forEach(u => {
    const name = typeof u === 'string' ? u : u.name;
    const status = typeof u === 'string' ? 'online' : (u.status || 'online');

    if (name === myName) return;
    const div = document.createElement('div');
    div.className = 'user-item';

    const dot = document.createElement('span');
    dot.className = `status-dot ${status}`;
    div.appendChild(dot);

    const nameSpan = document.createElement('span');
    nameSpan.textContent = name;
    div.appendChild(nameSpan);

    div.onclick = () => openPrivateChat(name);
    userListEl.appendChild(div);
  });
  onlineCount.textContent = `● ${users.length} online na sala`;
}

function renderDMList() {
  const el = document.getElementById('dm-list');
  el.innerHTML = '';
  dmList.forEach(name => {
    if (!name || name === 'undefined' || name === 'null') return;
    const div = document.createElement('div');
    div.className = 'dm-item' + (activePrivateChat === name ? ' active' : '');
    div.style.display = 'flex';
    div.style.justifyContent = 'space-between';
    div.style.alignItems = 'center';
    
    const infoWrap = document.createElement('div');
    infoWrap.innerHTML = `<span>👤</span> ${name}`;
    infoWrap.style.flex = '1';
    infoWrap.onclick = () => openPrivateChat(name);
    div.appendChild(infoWrap);

    const badge = document.createElement('span');
    badge.className = 'unread-badge';
    const count = unreadDMs.get(name) || 0;
    if (count > 0) {
      badge.textContent = count;
      badge.classList.add('show');
    }
    div.appendChild(badge);

    const closeBtn = document.createElement('span');
    closeBtn.innerHTML = '×';
    closeBtn.style.marginLeft = '8px';
    closeBtn.style.cursor = 'pointer';
    closeBtn.style.opacity = '0.5';
    closeBtn.style.fontSize = '1.2rem';
    closeBtn.onclick = (e) => {
      e.stopPropagation();
      dmList.delete(name);
      unreadDMs.delete(name);
      if (activePrivateChat === name) {
        wsSend({ type: 'switch_room', room: 'geral' });
      }
      renderDMList();
    };
    closeBtn.onmouseover = () => closeBtn.style.opacity = '1';
    closeBtn.onmouseout = () => closeBtn.style.opacity = '0.5';
    div.appendChild(closeBtn);
    
    el.appendChild(div);
  });
}

function openPrivateChat(name) {
  if (!name || name === myName) return;
  activePrivateChat = name;
  dmList.add(name);
  unreadDMs.delete(name);
  myRoom = getPrivateRoomId(myName, name);
  
  messagesEl.innerHTML = '<div id="load-more" class="show">Carregando conversa privada...</div>';
  typingUsers.clear();
  updateTypingBar();
  firstMessageId = null;
  hasMoreHistory = false;

  topbarRoom.textContent = `👤 ${name}`;
  document.getElementById('room-meta').textContent = 'Conversa Privada';
  document.getElementById('deleteRoomBtn').style.display = 'none';
  
  wsSend({ type: 'load_history', room: myRoom });
  
  renderDMList();
  renderRoomList([...AVAILABLE_ROOMS]);
  sidebar.classList.remove('open');
}

function playNotificationSound() {
  const sound = document.getElementById('msg-sound');
  if (sound) {
    sound.currentTime = 0;
    sound.play().catch(() => {});
  }
}

function setActiveRoom(room, roomInfo = null) {
  myRoom = room;
  activePrivateChat = null;
  currentRoomInfo = roomInfo;
  
  topbarRoom.textContent = ROOM_LABELS[room] || `# ${room}`;
  
  const metaEl = document.getElementById('room-meta');
  const delBtn = document.getElementById('deleteRoomBtn');
  
  if (roomInfo) {
    const date = new Date(roomInfo.createdAt).toLocaleDateString('pt-BR');
    metaEl.textContent = `Criada por ${roomInfo.creator} em ${date}`;
    
    const isCreator = roomInfo.creator.trim().toLowerCase() === myName.trim().toLowerCase();
    const isSuperAdmin = myName.trim().toLowerCase() === 'glauco';
    
    delBtn.style.display = (isCreator && room !== 'geral') ? 'block' : 'none';
    document.getElementById('clearMessagesBtn').style.display = (isCreator || isSuperAdmin) ? 'block' : 'none';
  } else {
    metaEl.textContent = '';
    delBtn.style.display = 'none';
  }

  document.querySelectorAll('.room-item').forEach(el => {
    el.classList.toggle('active', el.dataset.room === room);
  });

  document.querySelectorAll('.dm-item').forEach(el => el.classList.remove('active'));
  typingUsers.clear();
  updateTypingBar();
  sidebar.classList.remove('open');
  renderDMList();
}

function renderRoomList(rooms) {
  const container = document.getElementById('room-list');
  container.innerHTML = '';
  rooms.forEach(r => {
    const div = document.createElement('div');
    const isActive = (r === myRoom && !activePrivateChat);
    div.className = 'room-item' + (isActive ? ' active' : '');
    div.dataset.room = r;
    div.textContent = ROOM_LABELS[r] || `# ${r}`;
    div.onclick = () => {
      if (!window.ws || window.ws.readyState !== WebSocket.OPEN) return;
      activePrivateChat = null;
      wsSend({ type: 'switch_room', room: r });
    };
    container.appendChild(div);
  });
}

const createRoomModal = document.getElementById('create-room-modal');
const crNameInput = document.getElementById('cr-name');
const crCategoryInput = document.getElementById('cr-category');
const crDescInput = document.getElementById('cr-desc');
const crCapacityInput = document.getElementById('cr-capacity');
const crTagsInput = document.getElementById('cr-tags');

document.getElementById('addRoomBtn').addEventListener('click', () => {
  crNameInput.value = '';
  crDescInput.value = '';
  crTagsInput.value = '';
  crCapacityInput.value = 50;
  crCategoryInput.value = 'Outros';
  createRoomModal.style.display = 'flex';
  setTimeout(() => crNameInput.focus(), 100);
});

document.getElementById('btn-cr-cancel').addEventListener('click', () => {
  createRoomModal.style.display = 'none';
});

document.getElementById('btn-cr-confirm').addEventListener('click', () => {
  const name = crNameInput.value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
  if (!name) return showToast('Digite um nome válido para a sala!');
  
  const category = crCategoryInput.value;
  const description = crDescInput.value.trim();
  const capacity = parseInt(crCapacityInput.value, 10) || 50;
  
  const tagsRaw = crTagsInput.value.trim();
  const tags = tagsRaw ? tagsRaw.split(',').map(t => t.trim().toLowerCase()).filter(t => t) : [];

  createRoomModal.style.display = 'none';

  AVAILABLE_ROOMS.add(name);
  ROOM_LABELS[name] = `# ${name}`;
  renderRoomList([...AVAILABLE_ROOMS]);
  
  wsSend({ 
    type: 'switch_room', 
    room: name,
    category,
    description,
    capacity,
    tags
  });
});

document.getElementById('clearMessagesBtn').onclick = () => {
  showModal({
    title: 'Limpar Histórico',
    text: 'Deseja apagar todas as mensagens desta sala? Esta ação não pode ser desfeita.',
    confirmText: 'Limpar Agora',
    danger: true,
    onConfirm: () => wsSend({ type: 'clear_messages', room: myRoom })
  });
};

document.getElementById('deleteRoomBtn').onclick = () => {
  if (!myRoom || myRoom === 'geral') return;
  showModal({
    title: 'Excluir Sala',
    text: `Tem certeza que deseja excluir a sala "${myRoom}"? Todas as mensagens serão apagadas permanentemente.`,
    confirmText: 'Excluir TUDO',
    danger: true,
    onConfirm: () => wsSend({ type: 'delete_room', room: myRoom })
  });
};

function wsSend(data) {
  if (window.ws && window.ws.readyState === WebSocket.OPEN) {
    window.ws.send(JSON.stringify(data));
  }
}

function setReplyTo(msg) {
  replyTo = msg ? { id: msg.id, name: msg.name, text: msg.text } : null;
  const preview = document.getElementById('reply-preview');
  if (replyTo) {
    document.getElementById('reply-to-name').textContent = replyTo.name;
    document.getElementById('reply-to-text').textContent = replyTo.text;
    preview.classList.add('show');
    inputEl.focus();
    setEditMode(null);
  } else {
    preview.classList.remove('show');
  }
}

document.getElementById('cancelReplyBtn').onclick = () => setReplyTo(null);

function setEditMode(msg) {
  editingId = msg ? msg.id : null;
  if (msg) {
    inputEl.value = msg.text;
    inputEl.focus();
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';
    setReplyTo(null);
    showToast('Editando mensagem...');
  } else {
    inputEl.value = '';
    inputEl.style.height = 'auto';
  }
}

messagesEl.addEventListener('scroll', () => {
  if (messagesEl.scrollTop <= 50 && hasMoreHistory && window.ws && window.ws.readyState === WebSocket.OPEN) {
    document.getElementById('load-more').classList.add('show');
    wsSend({ type: 'load_history', before: firstMessageId, room: getActiveRoomId() });
    hasMoreHistory = false;
  }
});

// Main Chat Message Handler 
// We intercept window.ws.onmessage when in chat
function attachChatHandlers() {
  window.ws.onmessage = (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }

    switch (msg.type) {
      case 'welcome':
        sessionId = msg.sessionId;
        myName = msg.name;
        localStorage.setItem('chat_session', sessionId);
        
        if (msg.rooms) {
          AVAILABLE_ROOMS.clear();
          msg.rooms.forEach(r => {
            AVAILABLE_ROOMS.add(r);
            if (!ROOM_LABELS[r]) ROOM_LABELS[r] = `# ${r}`;
          });
          renderRoomList([...AVAILABLE_ROOMS]);
        }
        
        messagesEl.innerHTML = '<div id="load-more">Carregando mensagens anteriores...</div>';
        setActiveRoom(msg.room, msg.roomInfo);
        hasMoreHistory = !!msg.hasMore;
        renderHistory(msg.history || []);
        
        // Esconde lobby, mostra chat
        const lobbyScreen = document.getElementById('lobby-screen');
        if(lobbyScreen) lobbyScreen.style.display = 'none';
        appEl.style.display = 'flex';
        break;

      case 'room_changed':
        activePrivateChat = null;
        if (msg.rooms) {
          AVAILABLE_ROOMS.clear();
          msg.rooms.forEach(r => {
            AVAILABLE_ROOMS.add(r);
            if (!ROOM_LABELS[r]) ROOM_LABELS[r] = `# ${r}`;
          });
          renderRoomList([...AVAILABLE_ROOMS]);
        }
        messagesEl.innerHTML = '<div id="load-more">Carregando mensagens anteriores...</div>';
        setActiveRoom(msg.room, msg.roomInfo);
        hasMoreHistory = !!msg.hasMore;
        renderHistory(msg.history || []);
        break;

      case 'room_deleted':
        showToast(`⚠️ A sala "${msg.room}" foi excluída pelo criador.`);
        if (myRoom === msg.room) {
          wsSend({ type: 'switch_room', room: 'geral' });
        }
        break;

      case 'history_chunk':
        hasMoreHistory = !!msg.hasMore;
        document.getElementById('load-more').classList.remove('show');
        renderHistoryChunk(msg.messages || []);
        break;

      case 'messages_cleared':
        if (msg.room === myRoom) {
          messagesEl.innerHTML = '<div id="load-more">Histórico limpo pelo criador.</div>';
          showToast('🧹 O histórico da sala foi limpo.');
        }
        break;

      case 'message':
        const isMyPrivate = msg.isPrivate && (msg.to === myName || msg.name === myName);
        const isRelevantPrivate = isMyPrivate && (activePrivateChat === msg.to || activePrivateChat === msg.name);

        if (msg.room === myRoom || isRelevantPrivate) {
          renderMessage(msg);
        } else if (msg.isPrivate && msg.to === myName) {
          if (activePrivateChat !== msg.name) {
            dmList.add(msg.name);
            const count = (unreadDMs.get(msg.name) || 0) + 1;
            unreadDMs.set(msg.name, count);
            renderDMList();
            playNotificationSound();
            showToast(`Nova mensagem de ${msg.name}`);
          }
        }
        break;

      case 'message_edited':
        const editWrap = document.querySelector(`.msg-wrap[data-id="${msg.id}"]`);
        if (editWrap) {
          editWrap.querySelector('.msg-text').innerHTML = linkify(msg.text);
          if (!editWrap.querySelector('.msg-edited')) {
            const ed = document.createElement('span');
            ed.className = 'msg-edited';
            ed.textContent = '(editada)';
            editWrap.querySelector('.msg-bubble').appendChild(ed);
          }
        }
        break;

      case 'message_deleted':
        const delWrap = document.querySelector(`.msg-wrap[data-id="${msg.id}"]`);
        if (delWrap) {
          delWrap.querySelector('.msg-text').textContent = '[mensagem removida]';
          delWrap.querySelector('.msg-text').style.fontStyle = 'italic';
          delWrap.querySelector('.msg-text').style.opacity = '0.5';
          const actions = delWrap.querySelector('.msg-actions');
          if (actions) actions.remove();
        }
        break;

      case 'reaction_update':
        const reactWrap = document.querySelector(`.msg-wrap[data-id="${msg.messageId}"]`);
        if (reactWrap) {
          updateReactionsUI(reactWrap.querySelector('.msg-reactions'), msg.reactions, msg.messageId);
        }
        break;

      case 'info':
        if (!activePrivateChat && msg.room === myRoom) {
          renderMessage(msg);
        }
        break;

      case 'user_list':
        renderUserList(msg.users || []);
        break;

      case 'room_list_update':
        if (msg.rooms) {
          AVAILABLE_ROOMS.clear();
          msg.rooms.forEach(r => {
            AVAILABLE_ROOMS.add(r);
            if (!ROOM_LABELS[r]) ROOM_LABELS[r] = `# ${r}`;
          });
          renderRoomList([...AVAILABLE_ROOMS]);
        }
        break;

      case 'message_read':
        const readMsg = document.querySelector(`.msg-wrap[data-id="${msg.messageId}"]`);
        if (readMsg && readMsg.classList.contains('mine')) {
          const checks = readMsg.querySelector('.checks');
          if (checks) {
            checks.innerHTML = '✓✓';
            checks.classList.add('read');
          }
        }
        break;

      case 'search_results':
        if (msg.results && msg.results.length > 0) {
          showToast(`Encontradas ${msg.results.length} mensagens para "${msg.term}"`);
          messagesEl.innerHTML = `<div style="text-align:center;padding:10px;color:var(--acc)">Resultados da busca para "${msg.term}" <button onclick="location.reload()" style="background:none;border:none;color:var(--txt2);cursor:pointer;text-decoration:underline">(Limpar)</button></div>`;
          renderHistory(msg.results);
        } else {
          showToast('Nenhuma mensagem encontrada.');
        }
        break;

      case 'typing':
        if (msg.isTyping) {
          typingUsers.add(msg.name);
        } else {
          typingUsers.delete(msg.name);
        }
        updateTypingBar();
        break;

      case 'error':
        showToast('⚠️ ' + msg.text);
        break;
    }
  };

  window.ws.onclose = () => {
    if (appEl.style.display !== 'none') scheduleReconnect();
  };

  window.ws.onerror = () => {
    window.ws.close();
  };
}

function scheduleReconnect() {
  const delay = Math.min(1000 * 2 ** reconnectAttempts, 30000);
  reconnectAttempts++;
  let remaining = Math.round(delay / 1000);

  banner.classList.add('show');
  document.getElementById('reconnect-countdown').textContent = ` em ${remaining}s`;

  reconnectTimer = setInterval(() => {
    remaining--;
    document.getElementById('reconnect-countdown').textContent = remaining > 0 ? ` em ${remaining}s` : '';
    if (remaining <= 0) {
      clearInterval(reconnectTimer);
      // Reconectar via lobby.js logic or chat
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      window.ws = new WebSocket(`${proto}://${location.host}`);
      window.ws.onopen = () => {
        reconnectAttempts = 0;
        banner.classList.remove('show');
        attachChatHandlers();
        window.ws.send(JSON.stringify({ type: 'join', name: myName, room: myRoom, sessionId }));
      };
    }
  }, 1000);
}

function getActiveRoomId() {
  return activePrivateChat ? getPrivateRoomId(myName, activePrivateChat) : myRoom;
}

function enviar() {
  const text = inputEl.value.trim();
  if (!text || !window.ws || window.ws.readyState !== WebSocket.OPEN) return;

  const room = getActiveRoomId();

  if (editingId) {
    wsSend({ type: 'edit_message', id: editingId, text, room });
    setEditMode(null);
  } else if (activePrivateChat) {
    wsSend({ type: 'private_message', to: activePrivateChat, text, replyTo, room });
    setReplyTo(null);
  } else {
    wsSend({ type: 'message', text, replyTo, room });
    setReplyTo(null);
  }

  inputEl.value = '';
  inputEl.style.height = 'auto';
  if (isTyping) {
    isTyping = false;
    wsSend({ type: 'typing', isTyping: false, room });
  }
}

document.getElementById('sendBtn').addEventListener('click', enviar);

inputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    enviar();
  }
});

inputEl.addEventListener('input', () => {
  inputEl.style.height = 'auto';
  inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';

  if (!isTyping) {
    isTyping = true;
    wsSend({ type: 'typing', isTyping: true });
  }
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => {
    isTyping = false;
    wsSend({ type: 'typing', isTyping: false });
  }, 2000);
});

// Export join function to be used by lobby
window.joinChat = function(name, room) {
  myName = name;
  myRoom = room || 'geral';
  attachChatHandlers();
  
  // Se o socket já estiver aberto, manda o join. 
  // Senão, espera abrir.
  if (window.ws && window.ws.readyState === WebSocket.OPEN) {
    window.ws.send(JSON.stringify({ type: 'join', name: myName, room: myRoom, sessionId }));
  } else {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    window.ws = new WebSocket(`${proto}://${location.host}`);
    window.ws.onopen = () => {
      attachChatHandlers();
      window.ws.send(JSON.stringify({ type: 'join', name: myName, room: myRoom, sessionId }));
    };
  }
};
