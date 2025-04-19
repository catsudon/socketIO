const socket = io();
let name = '';
let room = '';

const dmSessions = {}; // { username: { messages: [], tabEl: Element } }
let currentDM = null;

// ─────────────────────────────────────────
// 🌀 Theme Handling
// ─────────────────────────────────────────
window.onload = () => {
    const savedTheme = localStorage.getItem('theme') || 'cyberpunk';
    document.body.classList.remove('cyberpunk', 'vaporwave', 'lily');
    document.body.classList.add(savedTheme);
    generateParticles();
    socket.emit('request_room_list');
};

function toggleTheme() {
    const body = document.body;
    const themes = ['cyberpunk', 'vaporwave', 'lily'];
    const current = themes.find(t => body.classList.contains(t));
    const next = current === 'cyberpunk' ? 'vaporwave' : current === 'vaporwave' ? 'lily' : 'cyberpunk';

    body.classList.remove(...themes);
    body.classList.add(next);
    localStorage.setItem('theme', next);

    document.querySelector('.particles').innerHTML = '';
    if (next === 'lily') generateParticles();
}

function generateParticles(count = 40) {
    const container = document.querySelector('.particles');
    if (!document.body.classList.contains('lily')) return;
    for (let i = 0; i < count; i++) {
        const p = document.createElement('span');
        p.style.left = Math.random() * 100 + 'vw';
        p.style.animationDelay = (Math.random() * 20) + 's';
        p.style.animationDuration = (10 + Math.random() * 10) + 's';
        container.appendChild(p);
    }
}

// ─────────────────────────────────────────
// 🧠 Room Join + Messages
// ─────────────────────────────────────────
function joinRoom() {
    name = document.getElementById('name').value;
    room = document.getElementById('room').value;
    if (!name || !room) return;

    socket.emit('join', { name, room });

    document.getElementById('messages').innerHTML = '';
    document.getElementById('login').style.display = 'none';
    document.getElementById('chat').style.display = 'block';
    document.getElementById('room-name').textContent = room;
}

function sendMessage() {
    const input = document.getElementById('message');
    const msg = input.value.trim();
    if (msg) {
        socket.emit('message', msg);
        input.value = '';
    }
}

function quickJoin(selectedRoom) {
    const nameInput = document.getElementById('name');
    const userName = nameInput.value.trim() || `Guest${Math.floor(Math.random() * 1000)}`;

    document.getElementById('room').value = selectedRoom;
    nameInput.value = userName;
    name = userName;

    socket.emit('join', { name: userName, room: selectedRoom });

    document.getElementById('messages').innerHTML = '';
    document.getElementById('login').style.display = 'none';
    document.getElementById('chat').style.display = 'block';
    document.getElementById('room-name').textContent = selectedRoom;
}

socket.on('message', function (msg) {
    const item = document.createElement('li');
    item.textContent = msg;
    document.getElementById('messages').appendChild(item);
});

socket.on('room_list', function (rooms) {
    const roomList = document.getElementById('room-list');
    roomList.innerHTML = '';

    for (const room in rooms) {
        const members = rooms[room];
        const li = document.createElement('li');
        li.style.marginBottom = '8px';

        const roomName = document.createElement('strong');
        roomName.textContent = `${room} (${members.length} user${members.length > 1 ? 's' : ''})`;
        roomName.style.cursor = 'pointer';
        roomName.onclick = () => quickJoin(room);
        li.appendChild(roomName);

        const memberList = document.createElement('ul');
        memberList.style.marginTop = '4px';
        members.forEach(name => {
            const userLi = document.createElement('li');
            userLi.textContent = name;
            memberList.appendChild(userLi);
        });

        li.appendChild(memberList);
        roomList.appendChild(li);
    }
});

socket.on('user_list', function (users) {
    const userList = document.getElementById('user-list');
    userList.innerHTML = '';
    users.forEach(user => {
        const li = document.createElement('li');
        li.textContent = user;
        li.style.cursor = 'pointer';
        li.onclick = () => openDM(user);
        userList.appendChild(li);
    });
});

// ─────────────────────────────────────────
// 💬 Tabbed DM Interface
// ─────────────────────────────────────────
function openDM(user) {
    if (user === name) return;

    document.getElementById('dm-tab-container').style.display = 'block';

    if (!dmSessions[user]) {
        const tab = document.createElement('button');
        tab.textContent = user;
        tab.onclick = () => switchDM(user);
        document.getElementById('dm-tabs').appendChild(tab);

        dmSessions[user] = { messages: [], tabEl: tab };
    }

    switchDM(user);
}

function switchDM(user) {
    currentDM = user;

    Object.values(dmSessions).forEach(session =>
        session.tabEl.classList.remove('active')
    );
    dmSessions[user].tabEl.classList.add('active');

    renderDM(user);
}

function renderDM(user) {
    const area = document.getElementById('dm-chat-area');
    area.innerHTML = '';

    const messages = dmSessions[user].messages || [];
    messages.forEach(msg => {
        const div = document.createElement('div');
        div.textContent = msg;
        area.appendChild(div);
    });

    const inputWrap = document.createElement('div');
    inputWrap.className = 'dm-message-input';

    const input = document.createElement('input');
    const send = document.createElement('button');
    send.textContent = 'Send';

    send.onclick = () => {
        const text = input.value.trim();
        if (text) {
            socket.emit('private_message', { to: user, message: text });
            input.value = '';
        }
    };

    inputWrap.appendChild(input);
    inputWrap.appendChild(send);
    area.appendChild(inputWrap);
}

function addDMMessage(user, message) {
    if (!dmSessions[user]) openDM(user);
    dmSessions[user].messages.push(message);
    if (currentDM === user) renderDM(user);
}

socket.on('private_message', function ({ from, to, text }) {
    const otherUser = (from === name) ? to : from;
    addDMMessage(otherUser, `${from}: ${text}`);
});
