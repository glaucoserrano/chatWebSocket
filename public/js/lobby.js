// lobby.js
const lobbyScreen = document.getElementById('lobby-screen');
const lobbyGrid = document.getElementById('lobby-grid');
const globalOnlineEl = document.getElementById('global-online-count');

// Modal Elements
const nicknameModal = document.getElementById('nickname-modal');
const nicknameInput = document.getElementById('nickname-input');
const btnJoinFinal = document.getElementById('btn-join-final');
const btnCloseModal = document.getElementById('btn-close-modal');

let currentRoomsData = [];
let currentCategory = 'Todas';
let selectedRoomId = null;

// Initialize Lobby Connection
function initLobby() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  if (!window.ws || window.ws.readyState !== WebSocket.OPEN) {
    window.ws = new WebSocket(`${proto}://${location.host}`);
    
    window.ws.onopen = () => {
      // Connect to lobby
      window.ws.send(JSON.stringify({ type: 'join_lobby' }));
    };

    window.ws.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }

      if (msg.type === 'lobby_update') {
        currentRoomsData = msg.payload.rooms;
        globalOnlineEl.textContent = `${msg.payload.totalOnline} online`;
        renderLobbyGrid();
      } else if (msg.type === 'welcome') {
        // Handled by chat.js, but we hide lobby here
        lobbyScreen.style.display = 'none';
        appEl.style.display = 'flex';
      }
    };
  }
}

function renderLobbyGrid() {
  lobbyGrid.innerHTML = '';
  
  const filtered = currentRoomsData.filter(r => 
    currentCategory === 'Todas' || r.category.includes(currentCategory)
  );

  if (filtered.length === 0) {
    lobbyGrid.innerHTML = '<div style="color: var(--txt2); padding: 20px;">Nenhuma sala encontrada nesta categoria.</div>';
    return;
  }

  filtered.forEach(room => {
    const card = document.createElement('div');
    card.className = 'room-card';
    
    const percentage = Math.min((room.onlineCount / room.capacity) * 100, 100);
    const isFull = room.onlineCount >= room.capacity;

    card.innerHTML = `
      <div class="room-card-header">
        <h3 class="room-card-title">${room.name}</h3>
      </div>
      <p class="room-card-desc">${room.description}</p>
      <div class="room-card-tags">
        ${room.tags.map(t => `<span class="room-tag">#${t}</span>`).join('')}
      </div>
      <div class="room-card-footer">
        <div class="room-capacity-bar">
          <div class="room-capacity-fill ${isFull ? 'full' : ''}" style="width: ${percentage}%"></div>
        </div>
        <div class="room-card-stats">
          <span>${room.onlineCount}/${room.capacity} online</span>
          <button class="btn-enter-room">${isFull ? 'Lotada 🔒' : 'Entrar →'}</button>
        </div>
      </div>
    `;

    card.onclick = () => {
      if (isFull) {
        alert('Esta sala está lotada! Assine o VIP para furar a fila. (Em breve)');
        return;
      }
      openNicknameModal(room.id);
    };

    lobbyGrid.appendChild(card);
  });
}

function openNicknameModal(roomId) {
  selectedRoomId = roomId;
  nicknameModal.classList.add('show');
  nicknameInput.focus();
}

function closeNicknameModal() {
  nicknameModal.classList.remove('show');
  selectedRoomId = null;
}

btnCloseModal.onclick = closeNicknameModal;

btnJoinFinal.onclick = () => {
  const name = nicknameInput.value.trim();
  if (!name) return alert('Digite um nickname!');
  
  // Call function from chat.js to actually join
  if (typeof window.joinChat === 'function') {
    const roomToJoin = selectedRoomId;
    closeNicknameModal();
    window.joinChat(name, roomToJoin);
  }
};

nicknameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') btnJoinFinal.click();
});

// Category filtering
document.querySelectorAll('.category-item').forEach(item => {
  item.addEventListener('click', (e) => {
    document.querySelectorAll('.category-item').forEach(i => i.classList.remove('active'));
    e.currentTarget.classList.add('active');
    
    const cat = e.currentTarget.dataset.category;
    currentCategory = cat;
    renderLobbyGrid();
  });
});

// Search
const lobbySearch = document.getElementById('lobby-search-input');
if (lobbySearch) {
  lobbySearch.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const items = lobbyGrid.querySelectorAll('.room-card');
    items.forEach(card => {
      const title = card.querySelector('.room-card-title').textContent.toLowerCase();
      if (title.includes(term)) {
        card.style.display = 'flex';
      } else {
        card.style.display = 'none';
      }
    });
  });
}

// Start Lobby
window.addEventListener('DOMContentLoaded', () => {
  // Only init if we are on lobby screen
  if (lobbyScreen && lobbyScreen.style.display !== 'none') {
    initLobby();
  }
});
