// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { /* defaults */ });

const PORT = process.env.PORT || 3000;

// Serve static client
app.use(express.static(path.join(__dirname, 'public')));

// Data structure: rooms -> { socketId: playerState }
const rooms = {};

// Helper: ensure room exists
function ensureRoom(roomId) {
  if (!rooms[roomId]) rooms[roomId] = {};
}

// Socket.io handlers
io.on('connection', socket => {
  console.log('socket connected', socket.id);

  socket.on('join', ({ name, char, room }) => {
    room = room || 'default';
    ensureRoom(room);
    socket.join(room);

    // Create player entry
    rooms[room][socket.id] = {
      id: socket.id,
      name: name || 'Player',
      char: char || '❤',
      pos: { x: 0, y: 0, z: 0 },
      rotY: 0,
      ts: Date.now()
    };

    // Tell the new client about all existing players in room
    const existing = Object.values(rooms[room]).filter(p => p.id !== socket.id);
    socket.emit('currentPlayers', existing);

    // Inform others about the new player
    socket.to(room).emit('playerJoined', rooms[room][socket.id]);

    // Acknowledge join
    socket.emit('joined', { id: socket.id, room });
    console.log(`${name} joined room ${room}`);
  });

  socket.on('move', ({ room, pos, rotY }) => {
    if (!room || !rooms[room] || !rooms[room][socket.id]) return;
    rooms[room][socket.id].pos = pos;
    rooms[room][socket.id].rotY = rotY;
    rooms[room][socket.id].ts = Date.now();
    // Broadcast to others (throttling is done client-side)
    socket.to(room).emit('playerMoved', { id: socket.id, pos, rotY });
  });

  socket.on('action', ({ room, action }) => {
    if (!room) return;
    // Broadcast action to others in room
    socket.to(room).emit('playerAction', { id: socket.id, action });
  });

  socket.on('portalSolved', ({ room, by }) => {
    if (!room) return;
    // Broadcast to room that portal solved -> play animation / music
    io.in(room).emit('portalSolved', { by });
  });

  socket.on('disconnecting', () => {
    // Remove from rooms
    const socketRooms = Object.keys(socket.rooms).filter(r => r !== socket.id);
    socketRooms.forEach(room => {
      if (rooms[room] && rooms[room][socket.id]) {
        delete rooms[room][socket.id];
        socket.to(room).emit('playerLeft', { id: socket.id });
      }
    });
  });

  socket.on('disconnect', () => {
    console.log('socket disconnected', socket.id);
  });
});

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
