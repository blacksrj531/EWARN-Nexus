/**
 * E-WARN NEXUS — Local High-Speed Signaling Server
 * Standard: Node.js WebSocket Room Hub
 * Fast, 100% reliable peer introductions across your local network and internet.
 */

import { WebSocketServer, WebSocket } from 'ws';

const PORT = 3001;
const wss = new WebSocketServer({ port: PORT });

// Map: roomId -> Set of client WebSockets
const rooms = new Map();

wss.on('connection', (ws) => {
  let userRoomId = null;
  let userId = null;

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());

      switch (data.type) {
        case 'JOIN_ROOM':
          userRoomId = data.roomId;
          userId = data.userId;
          if (!rooms.has(userRoomId)) {
            rooms.set(userRoomId, new Set());
          }
          rooms.get(userRoomId).add(ws);
          ws.userId = userId;

          // Notify existing participants in the room that a new peer joined
          rooms.get(userRoomId).forEach((client) => {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({
                type: 'PEER_JOINED',
                peerId: userId,
                existingPeers: Array.from(rooms.get(userRoomId)).map(c => c.userId).filter(id => id && id !== c.userId)
              }));
              // Send the existing peer to the newly joined user
              ws.send(JSON.stringify({
                type: 'EXISTING_PEER',
                peerId: client.userId
              }));
            }
          });
          console.log(`[E-WARN Server] User ${userId} joined room ${userRoomId}. Total peers in room: ${rooms.get(userRoomId).size}`);
          break;

        case 'SIGNAL':
          // Relay WebRTC Offer, Answer, or ICE candidate directly to the target peer
          if (userRoomId && rooms.has(userRoomId)) {
            rooms.get(userRoomId).forEach((client) => {
              if (client !== ws && client.userId === data.targetId && client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                  type: 'SIGNAL',
                  senderId: userId,
                  signal: data.signal
                }));
              }
            });
          }
          break;
      }
    } catch (e) {
      console.error('[E-WARN Server] Message error:', e);
    }
  });

  ws.on('close', () => {
    if (userRoomId && rooms.has(userRoomId)) {
      rooms.get(userRoomId).delete(ws);
      // Notify remaining peers that user left
      rooms.get(userRoomId).forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({
            type: 'PEER_LEFT',
            peerId: userId
          }));
        }
      });
      if (rooms.get(userRoomId).size === 0) {
        rooms.delete(userRoomId);
      }
      console.log(`[E-WARN Server] User ${userId} disconnected from room ${userRoomId}`);
    }
  });
});

console.log(`🚀 E-WARN NEXUS Real-Time Signaling Server running on ws://localhost:${PORT}`);
