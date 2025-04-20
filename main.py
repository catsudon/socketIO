from flask import Flask, render_template, request
from flask_socketio import SocketIO, join_room, leave_room, emit
from datetime import datetime
from flask_sqlalchemy import SQLAlchemy

app = Flask(__name__)
app.config['SECRET_KEY'] = 'secret!'
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///chat.db'  
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
socketio = SocketIO(app)
db = SQLAlchemy(app)


# sid → { name, room }
clients = {}
from uuid import uuid4          # NEW
active_games = {}               # game_id → {players:[a,b], moves:{}}
WIN = {'rock':'scissors', 'paper':'rock', 'scissors':'paper'}

class Message(db.Model):
    id        = db.Column(db.Integer, primary_key=True)
    room      = db.Column(db.String(120), index=True, nullable=True)  # ← fixed
    sender    = db.Column(db.String(120), index=True)                 # optional idx
    recipient = db.Column(db.String(120), index=True, nullable=True)
    text      = db.Column(db.Text)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)

    def serialize(self):
        """Return a plain string identical to what the front‑end already displays."""
        # if self.room is None:            # DM  ➜ "Alice → Bob: hello"
        #     return f"{self.sender} → {self.recipient}: {self.text}"
        # else:                            # room ➜ "Alice: hello"
        return f"{self.sender}: {self.text}"

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

    recent = (Message.query.filter_by(room=room)
                          .order_by(Message.timestamp.desc())
                          .limit(50)
                          .all()[::-1])      # oldest → newest
    history = [m.serialize() for m in recent]

    emit('history', history, room=sid)
    emit('message', f"{name} joined {room} 🌟", room=room)

    msg = f"{name} joined {room} 🌟"
    db.session.add(Message(room=room, sender=name, text=msg))
    db.session.commit()
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
        db.session.add(Message(room=room, sender=name, text=msg))
        db.session.commit()

@socketio.on('disconnect')
def handle_disconnect():
    sid = request.sid
    user = clients.pop(sid, None)
    if user:
        room = user['room']
        name = user['name']
        msg = f"{name} left the {room}."
        emit('message', f"{name} left {room}", room=room)
        db.session.add(Message(room=room, sender=name, text=msg))
        db.session.commit()
        broadcast_user_list(room)  # ← this must be here
        broadcast_room_list()

        
@socketio.on('request_room_list')
def handle_room_list_request():
    emit('room_list', get_all_group_info())
    
@socketio.on('request_dm_history')
def handle_request_dm_history(data):
    other = data['with']           # partner’s username
    me    = clients.get(request.sid, {}).get('name')
    if not me:
        return

    msgs = (Message.query
            .filter(Message.room == None)
            .filter(
                db.or_(
                    db.and_(Message.sender == me,    Message.recipient == other),
                    db.and_(Message.sender == other, Message.recipient == me)
                ))
            .order_by(Message.timestamp.desc())
            .limit(50).all()[::-1])

    emit('dm_history',
         {'with': other, 'msgs': [m.serialize() for m in msgs]},
         room=request.sid)


@socketio.on('private_message')
def handle_private_message(data):
    sender_sid = request.sid
    sender = clients.get(sender_sid, {}).get('name', 'Unknown')
    recipient_name = data.get('to')
    message = data.get('message','').strip()
    
    recipient_sid = next((sid for sid, info in clients.items() if info['name'] == recipient_name), None)
    
    if recipient_sid and sender != recipient_name:  # Avoid DM self
        payload = { "from": sender, "to": recipient_name, "text": message }
        emit('private_message', payload, room=sender_sid)
        emit('private_message', payload, room=recipient_sid)
        
        db.session.add(Message(
        room=None,
        sender=sender,
        recipient=recipient_name,
        text=message
        ))
        db.session.commit()

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

@socketio.on('rps_invite')
def rps_invite(data):
    sender_sid = request.sid
    sender = clients.get(sender_sid, {}).get('name')
    opponent = data['to']
    opp_sid  = next((sid for sid,i in clients.items() if i['name']==opponent), None)
    if not sender or not opp_sid or sender == opponent:
        return

    game_id = str(uuid4())
    active_games[game_id] = {'players':[sender, opponent], 'moves':{}}
    print("RPS invite:", sender, "→", opponent, "found?", bool(opp_sid))

    emit('rps_created', {'game_id':game_id,'opponent':opponent}, room=sender_sid)
    emit('rps_invited', {'game_id':game_id,'from':sender}, room=opp_sid)

@socketio.on('rps_join')
def rps_join(data):
    game = active_games.get(data['game_id'])
    if not game: return
    for name in game['players']:
        sid = next(s for s,i in clients.items() if i['name']==name)
        emit('rps_start', {'game_id':data['game_id']}, room=sid)

@socketio.on('rps_move')
def rps_move(data):
    gid   = data['game_id']
    move  = data['move']
    me    = clients.get(request.sid, {}).get('name')
    game  = active_games.get(gid)
    if not game or me not in game['players'] or move not in WIN:
        return

    game['moves'][me] = move
    if len(game['moves']) < 2:
        return

    p1, p2   = game['players']
    m1, m2   = game['moves'][p1], game['moves'][p2]
    winner   = 'draw' if m1==m2 else (p1 if WIN[m1]==m2 else p2)

    # include game_id so the client can find the right panel
    result = {
        'game_id': gid,
        'p1': p1, 'm1': m1,
        'p2': p2, 'm2': m2,
        'winner': winner
    }

    for name in game['players']:
        sid = next(s for s,i in clients.items() if i['name']==name)
        emit('rps_result', result, room=sid)

    active_games.pop(gid, None)



if __name__ == '__main__':
    socketio.run(app, debug=True)
