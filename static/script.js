window.onload = () => {
    const savedTheme = localStorage.getItem('theme') || 'cyberpunk';
    document.body.classList.add(savedTheme);
};

const socket = io();
socket.emit('request_room_list');
let name = '';
let room = '';

socket.on('message', function (msg) {
    const item = document.createElement('li');
    item.textContent = msg;
    document.getElementById('messages').appendChild(item);
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


socket.on('room_list', function (rooms) {
    const roomList = document.getElementById('room-list');
    roomList.innerHTML = '';

    for (const room in rooms) {
        const members = rooms[room];
        const li = document.createElement('li');
        li.style.marginBottom = '8px';

        // Make room name clickable
        const roomName = document.createElement('strong');
        roomName.textContent = `${room} (${members.length} user${members.length > 1 ? 's' : ''})`;
        roomName.style.cursor = 'pointer';
        roomName.onclick = () => quickJoin(room);
        li.appendChild(roomName);

        // Show member list
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


socket.on('private_message', function (msg) {
    const { from, to, text } = msg;
    const otherUser = (from === name) ? to : from;

    const chatList = openDMWindow(otherUser);  // always returns the right <ul>
    if (chatList) {
        const li = document.createElement('li');
        li.textContent = `${from}: ${text}`;
        chatList.appendChild(li);
        chatList.scrollTop = chatList.scrollHeight;
    }

});






function joinRoom() {
    name = document.getElementById('name').value;
    room = document.getElementById('room').value;
    if (!name || !room) return;

    socket.emit('join', { name, room });

    document.getElementById('messages').innerHTML = '';  // ← Clear chat
    document.getElementById('login').style.display = 'none';
    document.getElementById('chat').style.display = 'block';
    document.getElementById('room-name').textContent = room;
}

function sendMessage() {
    const input = document.getElementById('message');
    const msg = input.value.trim();
    if (msg) {
        socket.emit('message', msg);  // ⬅ FIXED LINE
        input.value = '';
    }
}

function quickJoin(selectedRoom) {
    const nameInput = document.getElementById('name');
    const userName = nameInput.value.trim() || `Guest${Math.floor(Math.random() * 1000)}`;

    document.getElementById('room').value = selectedRoom;
    nameInput.value = userName;

    name = userName;  // ← This is important

    socket.emit('join', { name: userName, room: selectedRoom });

    document.getElementById('messages').innerHTML = '';
    document.getElementById('login').style.display = 'none';
    document.getElementById('chat').style.display = 'block';
    document.getElementById('room-name').textContent = selectedRoom;
}


function openDM(user) {
    if (user === name) return;  // 🛑 Don't DM yourself

    openDMWindow(user);
    const text = prompt(`Message to ${user}:`);
    if (text && text.trim()) {
        socket.emit('private_message', { to: user, message: text.trim() });
    }
}


function openDMWindow(user) {
    const id = `dm-${user}`;
    let existing = document.getElementById(id);
    if (existing) {
        return existing.querySelector('ul');  // 🟢 return existing chat box
    }

    const div = document.createElement('div');
    div.className = 'dm-window';
    div.id = id;

    div.innerHTML = `
<h4>DM with ${user}</h4>
<ul></ul>
<input placeholder="Type a message"/>
<button>Send</button>
`;

    document.body.appendChild(div);

    const input = div.querySelector('input');
    const button = div.querySelector('button');
    const chatList = div.querySelector('ul'); // 🟢 capture here

    button.onclick = () => {
        const msg = input.value.trim();
        if (msg) {
            socket.emit('private_message', { to: user, message: msg });
            input.value = '';
        }
    };

    return chatList; // 🟢 return the <ul> directly
}




function toggleTheme() {
    const body = document.body;

    if (body.classList.contains('cyberpunk')) {
        body.classList.remove('cyberpunk');
        body.classList.add('vaporwave');
        localStorage.setItem('theme', 'vaporwave');
    } else if (body.classList.contains('vaporwave')) {
        body.classList.remove('vaporwave');
        body.classList.add('lily');
        localStorage.setItem('theme', 'lily');
    } else if (body.classList.contains('lily')) {
        body.classList.remove('lily');
        body.classList.add('cyberpunk');
        localStorage.setItem('theme', 'cyberpunk');
    } else {
        // fallback (first load)
        body.classList.add('cyberpunk');
        localStorage.setItem('theme', 'cyberpunk');
    }
}


function generateParticles(count = 40) {
    const container = document.querySelector('.particles');
    for (let i = 0; i < count; i++) {
        const p = document.createElement('span');
        p.style.left = Math.random() * 100 + 'vw';
        p.style.animationDelay = (Math.random() * 20) + 's';
        p.style.animationDuration = (10 + Math.random() * 10) + 's';
        container.appendChild(p);
    }
}

window.onload = () => {
    const savedTheme = localStorage.getItem('theme') || 'cyberpunk';
    document.body.classList.add(savedTheme);
    generateParticles();
};

