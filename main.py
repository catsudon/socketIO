from flask import Flask, render_template, request
from flask_socketio import SocketIO, join_room, leave_room, emit

app = Flask(__name__)
app.config['SECRET_KEY'] = 'secret!'
socketio = SocketIO(app)

# sid → { name, room }
clients = {}

@app.route('/')
def index():
    return render_template('index.html')

@socketio.on('join')
def handle_join(data):
    name = data['name']
    room = data['room']
    sid = request.sid

    join_room(room)
    clients[sid] = {'name': name, 'room': room}

    emit('message', f"{name} joined {room} 🌟", room=room)
    broadcast_user_list(room)
    broadcast_room_list()

@socketio.on('message')
def handle_message(msg):
    sid = request.sid
    user = clients.get(sid, {})
    name = user.get('name', 'Anonymous')
    room = user.get('room')
    if room:
        emit('message', f"{name}: {msg}", room=room)

@socketio.on('disconnect')
def handle_disconnect():
    sid = request.sid
    user = clients.pop(sid, None)
    if user:
        room = user['room']
        name = user['name']
        emit('message', f"{name} left {room}", room=room)
        broadcast_user_list(room)  # ← this must be here
        broadcast_room_list()

        
@socketio.on('request_room_list')
def handle_room_list_request():
    emit('room_list', get_all_group_info())


@socketio.on('private_message')
def handle_private_message(data):
    sender_sid = request.sid
    sender = clients.get(sender_sid, {}).get('name', 'Unknown')
    recipient_name = data.get('to')
    message = data.get('message')

    recipient_sid = next((sid for sid, info in clients.items() if info['name'] == recipient_name), None)

    if recipient_sid and sender != recipient_name:  # Avoid DM self
        payload = { "from": sender, "to": recipient_name, "text": message }
        emit('private_message', payload, room=sender_sid)
        emit('private_message', payload, room=recipient_sid)

def broadcast_user_list(room):
    users = [u['name'] for u in clients.values() if u['room'] == room]
    emit('user_list', users, room=room)

def broadcast_room_list():
    emit('room_list', get_all_group_info(), broadcast=True)

def get_all_group_info():
    room_info = {}
    for client in clients.values():
        room = client['room']
        name = client['name']
        if room not in room_info:
            room_info[room] = []
        room_info[room].append(name)
    return room_info


if __name__ == '__main__':
    socketio.run(app, debug=True)
