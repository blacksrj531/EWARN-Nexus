/**
 * E-WARN NEXUS — Worldwide Two-Way WebRTC Mesh Engine
 * Powered by Open Cloud Peer Mesh + Google STUN
 * Enables True Two-Way Cross-Device & Cross-Internet Video Calls (Zero Paid APIs)
 */

import { Peer } from 'peerjs';

export class P2PConnectionEngine {
  constructor(roomId, localUserId, onRemoteStream, onDataReceived) {
    this.roomId = roomId;
    this.localUserId = localUserId;
    this.onRemoteStream = onRemoteStream;
    this.onDataReceived = onDataReceived;

    this.activeCalls = new Map(); // peerId -> mediaConnection
    this.activeConnections = new Map(); // peerId -> dataConnection
    this.localStreams = [];

    this._initPeerMesh();
  }

  _initPeerMesh() {
    // Generate clean unique peer identifier tied to the room prefix
    const cleanRoom = this.roomId.replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase();
    this.fullPeerId = `ewarn-${cleanRoom}-${this.localUserId}`;

    this.peer = new Peer(this.fullPeerId, {
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' }
        ]
      },
      debug: 1
    });

    this.peer.on('open', (id) => {
      console.log('[E-WARN P2P] Connected to Worldwide Mesh with Peer ID:', id);
      this._broadcastPresence();
    });

    // Inbound Media Call from remote participant
    this.peer.on('call', (mediaConnection) => {
      // Answer with local primary stream if available, or empty stream
      const primaryStream = this.localStreams[0] || new MediaStream();
      mediaConnection.answer(primaryStream);

      mediaConnection.on('stream', (remoteStream) => {
        if (this.onRemoteStream) {
          this.onRemoteStream(mediaConnection.peer, remoteStream);
        }
      });

      this.activeCalls.set(mediaConnection.peer, mediaConnection);
    });

    // Inbound Data Connection (Chat & File Sharing)
    this.peer.on('connection', (dataConnection) => {
      this._setupDataConnection(dataConnection);
    });

    this.peer.on('error', (err) => {
      console.warn('[E-WARN P2P] Mesh notice:', err.type, err.message);
    });

    // Fallback broadcast channel for same-machine discovery
    this.localChannel = new BroadcastChannel(`ewarn_room_${this.roomId}`);
    this.localChannel.onmessage = (e) => {
      if (e.data && e.data.peerId && e.data.peerId !== this.fullPeerId) {
        this.connectToPeer(e.data.peerId);
      }
    };
  }

  _broadcastPresence() {
    this.localChannel.postMessage({
      type: 'DISCOVERY',
      peerId: this.fullPeerId
    });
  }

  /**
   * Connect to a remote peer (Call media + Open DataChannel)
   */
  connectToPeer(remotePeerId) {
    if (remotePeerId === this.fullPeerId || this.activeCalls.has(remotePeerId)) return;

    // 1. Establish Media Call
    const primaryStream = this.localStreams[0] || new MediaStream();
    const call = this.peer.call(remotePeerId, primaryStream);

    if (call) {
      call.on('stream', (remoteStream) => {
        if (this.onRemoteStream) {
          this.onRemoteStream(remotePeerId, remoteStream);
        }
      });
      this.activeCalls.set(remotePeerId, call);
    }

    // 2. Establish DataChannel
    const conn = this.peer.connect(remotePeerId);
    if (conn) {
      this._setupDataConnection(conn);
    }
  }

  _setupDataConnection(conn) {
    conn.on('open', () => {
      this.activeConnections.set(conn.peer, conn);
    });

    conn.on('data', (data) => {
      if (this.onDataReceived) {
        this.onDataReceived(conn.peer, data);
      }
    });

    conn.on('close', () => {
      this.activeConnections.delete(conn.peer);
    });
  }

  /**
   * Register local media stream to share with peers
   */
  registerLocalStream(stream) {
    this.localStreams.push(stream);
    // Push new tracks to all currently active media calls
    const vTrack = stream.getVideoTracks()[0];
    if (vTrack) {
      for (const [_, call] of this.activeCalls) {
        if (call.peerConnection) {
          call.peerConnection.addTrack(vTrack, stream);
        }
      }
    }
  }

  /**
   * Send chat or file payload across the peer mesh
   */
  sendData(targetPeerId, payload) {
    if (targetPeerId && targetPeerId !== 'ALL') {
      const conn = this.activeConnections.get(targetPeerId);
      if (conn && conn.open) {
        conn.send(payload);
      }
    } else {
      // Broadcast to all connected peers
      for (const [_, conn] of this.activeConnections) {
        if (conn.open) {
          conn.send(payload);
        }
      }
    }
  }

  disconnect() {
    if (this.localChannel) this.localChannel.close();
    for (const [_, call] of this.activeCalls) call.close();
    for (const [_, conn] of this.activeConnections) conn.close();
    if (this.peer) this.peer.destroy();
    this.activeCalls.clear();
    this.activeConnections.clear();
  }
}
