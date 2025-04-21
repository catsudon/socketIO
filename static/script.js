// script1.js: Room chat + Theme + Tabbed DMs + Integrated RPS game with modal
const socket = io();

// Immediately request active rooms
socket.emit('request_room_list');

// ─────────────────────────────────────────
// Global state
// ─────────────────────────────────────────
let name = '';
let room = '';
const dmSessions = {};
let currentDM = null;

// RPS modal elements (initialized later)
let modal, txt, yesBtn, noBtn;

//Bad Word
const badWords = ["kuy", "fuck", "shit", "bitch", "asshole", "bastard", "dick", "pussy", "slut", "whore", "cunt", "motherfucker", "fucker", "nigga", "nigger", "cock", "tit", "tits", "boobs", "douche", "damn", "crap", "bollocks", "bugger", "wanker", "twat", "prick", "jerkoff", "handjob", "blowjob", "suckmydick"];

function censorText(text) {
  const regex = new RegExp(badWords.join("|"), "gi"); // สร้าง RegExp จากลิสต์คำหยาบ
  return text.replace(regex, (match) => "*".repeat(match.length)); // แทนที่คำด้วย '*'
}


// ─────────────────────────────────────────
// Initial DOM setup: theme & RPS modal
// ─────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  // Apply saved theme
  const saved = localStorage.getItem('theme') || 'cyberpunk';
  document.body.classList.remove('cyberpunk', 'vaporwave', 'lily');
  document.body.classList.add(saved);

  // Request the list of rooms
  socket.emit('request_room_list');

  // Create RPS modal if it doesn't exist
  modal = document.getElementById('rps-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'rps-modal';
    modal.className = 'rps-modal-overlay';
    modal.innerHTML = `
      <div class="rps-modal-content">
        <p id="rps-modal-text"></p>
        <div class="rps-modal-buttons">
          <button id="rps-yes" class="rps-btn-yes">Yes</button>
          <button id="rps-no" class="rps-btn-no">No</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }
  txt    = document.getElementById('rps-modal-text');
  yesBtn = document.getElementById('rps-yes');
  noBtn  = document.getElementById('rps-no');

  // Move DM container into the chat area and set up side-by-side layout
  const dmContainer = document.getElementById('dm-tab-container');
  const chatBox = document.getElementById('chat');
  if (dmContainer && chatBox) {
    const leftPane = document.createElement('div');
    leftPane.className = 'chat-left-pane';
    const originals = Array.from(chatBox.children);
    originals.forEach(el => leftPane.appendChild(el));
    chatBox.innerHTML = '';
    chatBox.appendChild(leftPane);
    chatBox.appendChild(dmContainer);

    chatBox.style.display = 'flex';
    chatBox.style.flexDirection = 'row';
    chatBox.style.alignItems = 'flex-start';
    leftPane.style.flex = '1';
    dmContainer.style.flex = '0 0 300px';
    dmContainer.style.marginLeft = '20px';
  }
});

// ─────────────────────────────────────────
// Theme Toggle
// ─────────────────────────────────────────
function toggleTheme() {
  const themes = ['cyberpunk', 'vaporwave', 'lily'];
  const current = themes.find(t => document.body.classList.contains(t));
  const next = current === 'cyberpunk'
    ? 'vaporwave'
    : current === 'vaporwave'
      ? 'lily'
      : 'cyberpunk';
  document.body.classList.remove(...themes);
  document.body.classList.add(next);
  localStorage.setItem('theme', next);
}

// ─────────────────────────────────────────
// Room join & chat messaging
// ─────────────────────────────────────────
function joinRoom() {
  name = document.getElementById('name').value.trim();
  room = document.getElementById('room').value.trim();
  if (!name || !room) return;
  socket.emit('join', { name, room });
  document.getElementById('login').style.display = 'none';
  document.getElementById('chat').style.display  = 'block';
  document.getElementById('room-name').textContent = room;
  document.getElementById('messages').innerHTML = '';
}

function quickJoin(selectedRoom) {
  const inp = document.getElementById('name');
  const user = inp.value.trim() || `Guest${Math.floor(Math.random()*1000)}`;
  inp.value = user;
  document.getElementById('room').value = selectedRoom;
  joinRoom();
}

function sendMessage() {
  const input = document.getElementById('message');
  const msg   = input.value.trim();
  console.log(msg);
  if (!msg) return;
  const censoredMsg = censorText(msg);
  socket.emit('message', censoredMsg);
  input.value = '';
}

document.getElementById('message').addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

// ─────────────────────────────────────────
// Socket event handlers: rooms, chat, users
// ─────────────────────────────────────────
socket.on('room_list', rooms => {
  const ul = document.getElementById('room-list'); ul.innerHTML = '';
  Object.keys(rooms).forEach(rm => {
    const members = rooms[rm];
    const li = document.createElement('li'); li.style.marginBottom = '8px';
    const title = document.createElement('strong');
    title.textContent = `${rm} (${members.length} user${members.length>1?'s':''})`;
    title.style.cursor = 'pointer'; title.onclick = () => quickJoin(rm);
    li.appendChild(title); ul.appendChild(li);
  });
});

socket.on('message', msg => {
  const li = document.createElement('li'); li.textContent = msg;
  li.textContent = censorText(msg); // เซ็นเซอร์ข้อความก่อนแสดง
  document.getElementById('messages').appendChild(li);
});

socket.on('history', msgs => {
  const ul = document.getElementById('messages'); ul.innerHTML = '';
  msgs.forEach(m => { const li = document.createElement('li'); li.textContent = m; ul.appendChild(li); });
});

socket.on('user_list', users => {
  const ul = document.getElementById('user-list'); ul.innerHTML = '';
  users.forEach(u => {
    const li = document.createElement('li'); li.textContent = u;
    li.style.cursor = 'pointer'; li.onclick = () => openDM(u);
    ul.appendChild(li);
  });
});

socket.on('dm_history', data => {
  data.msgs.forEach(line => addDMMessage(data.with, line));
});

socket.on('private_message', ({ from, to, text }) => {
  const other = from === name ? to : from;
  addDMMessage(other, `${from}: ${text}`);
});

// ─────────────────────────────────────────
// Tabbed DMs + RPS invite
// ─────────────────────────────────────────
function openDM(user) {
  if (user === name) return;
  const cont = document.getElementById('dm-tab-container'); cont.style.display = 'block';
  if (!dmSessions[user]) {
    const tab = document.createElement('button');
    tab.textContent = user; tab.onclick = () => switchDM(user);
    document.getElementById('dm-tabs').appendChild(tab);
    dmSessions[user] = { messages: [], tabEl: tab };
  }
  socket.emit('request_dm_history', { with: user });
  switchDM(user);
}

function switchDM(user) {
  currentDM = user;
  Object.values(dmSessions).forEach(s => s.tabEl.classList.remove('active'));
  dmSessions[user].tabEl.classList.add('active');
  renderDM(user);
}

function renderDM(user) {
  const area = document.getElementById('dm-chat-area'); area.innerHTML = '';
  dmSessions[user].messages.forEach(msg => {
    const d = document.createElement('div'); d.textContent = censorText(msg); area.appendChild(d);
  });
  const ctrl = document.createElement('div'); ctrl.className = 'dm-message-input';
  const ta = document.createElement('textarea'); ta.rows = 1; ta.placeholder = 'Type...';
  const sendBtn = document.createElement('button'); sendBtn.textContent = 'Send';
  const rpsBtn = document.createElement('button');
  rpsBtn.textContent = 'Play R‑P‑S'; rpsBtn.className = 'rps-btn';
  rpsBtn.dataset.to = user;
  rpsBtn.onclick = () => { socket.emit('rps_invite', { to: user }); rpsBtn.disabled = true; };

  sendBtn.onclick = () => { const t = ta.value.trim(); if (!t) return; const censoredText = censorText(t); socket.emit('private_message',{to:user,message:censoredText}); ta.value=''; };
  ta.addEventListener('keydown', e => { if (e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); sendBtn.onclick(); }});
  ctrl.append(ta, sendBtn, rpsBtn); area.appendChild(ctrl);
}

function addDMMessage(user, message) {
  if (!dmSessions[user]) openDM(user);
  const censoredMessage = censorText(message); // เซ็นเซอร์ข้อความก่อนเพิ่ม
  dmSessions[user].messages.push(censoredMessage);
  if (currentDM===user) renderDM(user);
}

// ─────────────────────────────────────────
// Rock‑Paper‑Scissors game panel & flow
// ─────────────────────────────────────────
function rpsPanel(user, gameId=null) {
  const area = document.getElementById('dm-chat-area');
  let panel = area.querySelector(`.rps-panel[data-game-id="${gameId}"]`);
  if (!panel) {
    panel=document.createElement('div'); panel.className='rps-panel';
    panel.dataset.gameId=gameId||'';
    panel.innerHTML=`
      <h5>Rock‑Paper‑Scissors</h5>
      <div class="status">Waiting…</div>
      <div class="choices" style="display:none">
        <button data-m="rock">🪨</button>
        <button data-m="paper">📄</button>
        <button data-m="scissors">✂️</button>
      </div>`;
    area.appendChild(panel);
    panel.querySelectorAll('button[data-m]').forEach(btn => {
  btn.onclick = () => {
    const mv = btn.dataset.m;

    // ① visually mark this button as selected, clear others
    panel.querySelectorAll('button[data-m]').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');

    // ② emit your move
    socket.emit('rps_move', {
      game_id: panel.dataset.gameId,
      move: mv
    });

    // ③ update status & hide choices (optional timing)
    panel.querySelector('.status').textContent = `You chose ${mv}…`;
    panel.querySelector('.choices').style.display = 'none';
  };
});

  }
  if(gameId)panel.dataset.gameId=gameId;
  return panel;
}

socket.on('rps_invited',({game_id,from})=>{
  if(!dmSessions[from])openDM(from);else switchDM(from);
  txt.textContent=`${from} challenges you to R‑P‑S!`;
  modal.classList.add('show');
  yesBtn.onclick=()=>{modal.classList.remove('show');socket.emit('rps_join',{game_id});rpsPanel(from,game_id);};
  noBtn.onclick=()=>modal.classList.remove('show');
});

// When I invite someone, show my panel (no choices yet)
socket.on('rps_created', ({ game_id, opponent }) => {
  const panel = rpsPanel(opponent, game_id);
  panel.querySelector('.status').textContent = 'Invitation sent…';
  panel.querySelector('.choices').style.display = 'none';
});

// When both have joined, reveal the choice buttons
socket.on('rps_start', ({ game_id }) => {
  const panel = document.querySelector(`.rps-panel[data-game-id="${game_id}"]`);
  if (!panel) return;
  panel.querySelector('.status').textContent = 'Choose your move!';
  panel.querySelector('.choices').style.display = 'block';
  panel.querySelectorAll('.choices button').forEach(b => b.disabled = false);
});

// When the result lands, show verdict, hide choices, re-enable button, then remove panel
socket.on('rps_result', ({ game_id, p1, m1, p2, m2, winner }) => {
  const panel = document.querySelector(`.rps-panel[data-game-id="${game_id}"]`);
  if (!panel) return;
  
  // Build and display verdict
  const you = name;
  const verdict =
    winner === 'draw'              ? "It's a draw!" :
    winner === you                 ? 'You win! 🎉' :
                                     'You lose 😢';
  panel.querySelector('.status').textContent =
    `${p1} ➜ ${m1}\n${p2} ➜ ${m2}\n${verdict}`;
  
  // Hide choices now that game is over
  panel.querySelector('.choices').style.display = 'none';

  // Re-enable the Play R‑P‑S button for this DM
  const opponent = (you === p1 ? p2 : p1);
  const btn = document.querySelector(`button.rps-btn[data-to="${opponent}"]`);
  if (btn) btn.disabled = false;

  // Remove the panel after 5 seconds
  setTimeout(() => panel.remove(), 5000);
});
