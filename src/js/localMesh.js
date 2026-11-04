/**
 * E-WARN NEXUS — Guaranteed Local & Network P2P Mesh Client
 * Connects directly to our dedicated local signaling server.
 */

export class LocalNetworkMesh {
  constructor(roomId, localUserId, onRemoteStream, onDataReceived) {
    this.roomId = roomId;
    this.localUserId = localUserId;
    this.onRemoteStream = onRemoteStream;
    this.onDataReceived = onDataReceived;

    this.peers = new Map(); // peerId -> RTCPeerConnection
    this.dataChannels = new Map(); // peerId -> RTCDataChannel
    this.localStreams = [];

    this.rtcConfig = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    };

    this._connectSignaling();
  }

  _connectSignaling() {
    // Determine signaling host: uses current window host IP dynamically
    const host = window.location.hostname || 'localhost';
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${host}:3001`;

    console.log(`[E-WARN Client] Connecting to signaling server at: ${wsUrl}`);
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log('[E-WARN Client] Connected to signaling server!');
      this.ws.send(JSON.stringify({
        type: 'JOIN_ROOM',
        roomId: this.roomId,
        userId: this.localUserId
      }));
    };

    this.ws.onmessage = async (event) => {
      try {
        const msg = JSON.parse(event.data);
        switch (msg.type) {
          case 'PEER_JOINED':
            // An incoming peer joined! Initiate call to them
            console.log('[E-WARN Client] New peer joined room:', msg.peerId);
            await this._initiateCall(msg.peerId);
            break;

          case 'EXISTING_PEER':
            console.log('[E-WARN Client] Found existing peer in room:', msg.peerId);
            break;

          case 'SIGNAL':
            await this._handleSignal(msg.senderId, msg.signal);
            break;

          case 'PEER_LEFT':
            console.log('[E-WARN Client] Peer left:', msg.peerId);
            this._removePeer(msg.peerId);
            break;
        }
      } catch (err) {
        console.error('[E-WARN Client] Error parsing signaling message:', err);
      }
    };

    this.ws.onerror = (err) => {
      console.warn('[E-WARN Client] Signaling error:', err);
    };

    this.ws.onclose = () => {
      console.log('[E-WARN Client] Reconnecting to signaling in 2s...');
      setTimeout(() => this._connectSignaling(), 2000);
    };
  }

  async _initiateCall(peerId) {
    if (this.peers.has(peerId)) return;

    const pc = this._createPeerConnection(peerId);

    // Setup DataChannel for Chat & File Sharing
    const dc = pc.createDataChannel('chat_data');
    this._setupDataChannel(peerId, dc);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    this._sendSignal(peerId, { type: 'offer', sdp: pc.localDescription });
  }

  async _handleSignal(peerId, signal) {
    let pc = this.peers.get(peerId);

    if (signal.type === 'offer') {
      if (!pc) pc = this._createPeerConnection(peerId);
      await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      this._sendSignal(peerId, { type: 'answer', sdp: pc.localDescription });
    } else if (signal.type === 'answer') {
      if (pc && pc.signalingState !== 'stable') {
        await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
      }
    } else if (signal.type === 'candidate' && signal.candidate) {
      if (pc) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
        } catch (e) {
          console.warn('[E-WARN Client] ICE candidate error:', e);
        }
      }
    }
  }

  _createPeerConnection(peerId) {
    const pc = new RTCPeerConnection(this.rtcConfig);
    this.peers.set(peerId, pc);

    // Add all local camera tracks
    for (const stream of this.localStreams) {
      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });
    }

    // Inbound remote video stream arrived!
    pc.ontrack = (event) => {
      console.log('[E-WARN Client] Inbound remote track from:', peerId);
      const stream = event.streams[0] || new MediaStream([event.track]);
      if (this.onRemoteStream) {
        this.onRemoteStream(peerId, stream);
      }
    };

    // Forward ICE candidates to signaling server
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this._sendSignal(peerId, { type: 'candidate', candidate: event.candidate });
      }
    };

    pc.ondatachannel = (event) => {
      this._setupDataChannel(peerId, event.channel);
    };

    return pc;
  }

  _setupDataChannel(peerId, dc) {
    this.dataChannels.set(peerId, dc);
    dc.onmessage = (e) => {
      if (this.onDataReceived) {
        this.onDataReceived(peerId, e.data);
      }
    };
    dc.onclose = () => this.dataChannels.delete(peerId);
  }

  _sendSignal(targetId, signal) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'SIGNAL',
        targetId,
        signal
      }));
    }
  }

  _removePeer(peerId) {
    const pc = this.peers.get(peerId);
    if (pc) {
      pc.close();
      this.peers.delete(peerId);
    }
    this.dataChannels.delete(peerId);
    const card = document.getElementById(`feed-remote-${peerId}`);
    if (card && card.parentNode) {
      card.parentNode.removeChild(card);
    }
  }

  registerLocalStream(stream) {
    this.localStreams.push(stream);
    // Push new tracks to all active peer connections
    for (const [_, pc] of this.peers) {
      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });
    }
  }

  sendData(target, payload) {
    const data = typeof payload === 'string' ? payload : JSON.stringify(payload);
    for (const [_, dc] of this.dataChannels) {
      if (dc.readyState === 'open') {
        dc.send(data);
      }
    }
  }

  disconnect() {
    if (this.ws) this.ws.close();
    for (const [_, pc] of this.peers) pc.close();
    this.peers.clear();
    this.dataChannels.clear();
  }
}
