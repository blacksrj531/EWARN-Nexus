/**
 * E-WARN NEXUS — Sovereign Real-Time Signaling Server
 * Standard: Google Meet & Microsoft Teams State Machine
 * 100% Zero Third-Party Cloud APIs. Pure Node.js WebSocket Mesh.
 */

import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';

const PORT = process.env.PORT || 3001;
const server = http.createServer((req, res) => {
  // Health check endpoint
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'ok', service: 'E-WARN NEXUS Sovereign Signaling Hub' }));
});

const wss = new WebSocketServer({ server });

// Map: roomId -> Map(userId -> { ws, userName })
const rooms = new Map();

wss.on('connection', (ws) => {
  let currentRoomId = null;
  let currentUserId = null;
  let currentUserName = null;

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());

      switch (data.type) {
        case 'JOIN_LOBBY':
          currentRoomId = data.roomId.toLowerCase().trim();
          currentUserId = data.userId;
          currentUserName = data.userName || 'Participant';

          if (!rooms.has(currentRoomId)) {
            rooms.set(currentRoomId, new Map());
          }

          const room = rooms.get(currentRoomId);

          // Notify the new user of all existing peers in the room
          const existingParticipants = [];
          room.forEach((meta, peerId) => {
            existingParticipants.push({ userId: peerId, userName: meta.userName });
          });

          ws.send(JSON.stringify({
            type: 'ROOM_STATE',
            participants: existingParticipants
          }));

          // Notify existing peers that a new participant entered
          room.forEach((meta) => {
            if (meta.ws.readyState === WebSocket.OPEN) {
              meta.ws.send(JSON.stringify({
                type: 'PEER_JOINED',
                userId: currentUserId,
                userName: currentUserName
              }));
            }
          });

          // Register client into room
          room.set(currentUserId, { ws, userName: currentUserName });
          console.log(`[E-WARN Server] ${currentUserName} (${currentUserId}) joined room: ${currentRoomId} (Total: ${room.size})`);
          break;

        case 'WEBRTC_SIGNAL':
          // Targeted point-to-point signal (Offer, Answer, ICE)
          if (currentRoomId && rooms.has(currentRoomId)) {
            const room = rooms.get(currentRoomId);
            const target = room.get(data.targetId);
            if (target && target.ws.readyState === WebSocket.OPEN) {
              target.ws.send(JSON.stringify({
                type: 'WEBRTC_SIGNAL',
                senderId: currentUserId,
                senderName: currentUserName,
                signal: data.signal
              }));
            }
          }
          break;

        case 'CHAT_BROADCAST':
          if (currentRoomId && rooms.has(currentRoomId)) {
            const room = rooms.get(currentRoomId);
            room.forEach((meta, peerId) => {
              if (peerId !== currentUserId && meta.ws.readyState === WebSocket.OPEN) {
                meta.ws.send(JSON.stringify({
                  type: 'CHAT_MESSAGE',
                  senderId: currentUserId,
                  senderName: currentUserName,
                  text: data.text,
                  timestamp: Date.now()
                }));
              }
            });
          }
          break;
      }
    } catch (err) {
      console.error('[E-WARN Server] Message parse error:', err);
    }
  });

  ws.on('close', () => {
    if (currentRoomId && rooms.has(currentRoomId)) {
      const room = rooms.get(currentRoomId);
      room.delete(currentUserId);
      console.log(`[E-WARN Server] User ${currentUserId} left room ${currentRoomId}`);

      // Notify remaining room participants
      room.forEach((meta) => {
        if (meta.ws.readyState === WebSocket.OPEN) {
          meta.ws.send(JSON.stringify({
            type: 'PEER_LEFT',
            userId: currentUserId
          }));
        }
      });

      if (room.size === 0) {
        rooms.delete(currentRoomId);
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Sovereign E-WARN NEXUS Signaling Server listening on port ${PORT}`);
});
