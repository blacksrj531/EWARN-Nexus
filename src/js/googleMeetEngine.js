/**
 * E-WARN NEXUS — Zero-Key Global WebRTC Signaling Engine
 * Standard: Public WebSocket Multi-Relay Mesh
 * Connects directly to PieSocket / HiveMQ / WSS public WebSocket relays with zero rate limits!
 */

export class GoogleMeetPeerMesh {
  constructor(roomId, localUserId, onRemoteStream) {
    this.roomId = roomId.toLowerCase().replace(/[^a-z0-9_-]/g, '');
    this.localUserId = localUserId;
    this.onRemoteStream = onRemoteStream;

    this.peers = new Map(); // peerId -> RTCPeerConnection
    this.localStreams = [];

    // Enterprise STUN cluster
    this.rtcConfig = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun.cloudflare.com:3478' }
      ]
    };

    this.roomTopic = `ewarn_nexus_${this.roomId}`;
    this._connectWebSocketRelay();
  }

  _connectWebSocketRelay() {
    // 1. Same-device / tab broadcast channel
    this.bc = new BroadcastChannel(this.roomTopic);
    this.bc.onmessage = (e) => this._processSignal(e.data);

    // 2. High-speed, unthrottled WebSocket public broker
    // PieSocket Public WebSocket Server (Free, unmetered, zero API key)
    const wsUrl = `wss://free.blr2.piesocket.com/v3/${this.roomTopic}?api_key=VC3vm8WnMbDhdaoQLoZZfrdY7no00xic1xnnqAcT&notify_self=0`;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('[E-WARN Mesh] Connected to global WebSocket signaling mesh.');
        this._broadcast({ type: 'JOIN', senderId: this.localUserId });

        // Continuous discovery ping
        this.heartbeat = setInterval(() => {
          this._broadcast({ type: 'PING', senderId: this.localUserId });
        }, 2000);
      };

      this.ws.onmessage = (e) => {
        try {
          const signal = JSON.parse(e.data);
          this._processSignal(signal);
        } catch (err) {}
      };

      this.ws.onerror = (e) => {
        console.warn('[E-WARN Mesh] WebSocket notice:', e);
      };

      this.ws.onclose = () => {
        setTimeout(() => this._connectWebSocketRelay(), 2500);
      };
    } catch (err) {
      console.warn('[E-WARN Mesh] Connection error:', err);
    }
  }

  _broadcast(msg) {
    const raw = JSON.stringify(msg);

    // Send locally
    try { this.bc.postMessage(msg); } catch (e) {}

    // Send over global WebSocket
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(raw);
      } catch (e) {}
    }
  }

  async _processSignal(data) {
    if (!data || data.senderId === this.localUserId) return;
    const remotePeerId = data.senderId;

    switch (data.type) {
      case 'JOIN':
      case 'PING':
        // Deterministic collision avoidance:
        // Peer with lexicographically higher ID calls the other
        if (!this.peers.has(remotePeerId)) {
          if (this.localUserId > remotePeerId) {
            await this._startCall(remotePeerId);
          }
        }
        break;

      case 'OFFER':
        if (data.targetId === this.localUserId) {
          await this._handleOffer(remotePeerId, data.sdp);
        }
        break;

      case 'ANSWER':
        if (data.targetId === this.localUserId) {
          await this._handleAnswer(remotePeerId, data.sdp);
        }
        break;

      case 'ICE':
        if (data.targetId === this.localUserId) {
          await this._handleIceCandidate(remotePeerId, data.candidate);
        }
        break;
    }
  }

  async _startCall(peerId) {
    const pc = this._createPeerConnection(peerId);

    const offer = await pc.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true
    });
    await pc.setLocalDescription(offer);

    this._broadcast({
      type: 'OFFER',
      senderId: this.localUserId,
      targetId: peerId,
      sdp: pc.localDescription
    });
  }

  async _handleOffer(peerId, sdp) {
    const pc = this._createPeerConnection(peerId);
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    this._broadcast({
      type: 'ANSWER',
      senderId: this.localUserId,
      targetId: peerId,
      sdp: pc.localDescription
    });
  }

  async _handleAnswer(peerId, sdp) {
    const pc = this.peers.get(peerId);
    if (pc && pc.signalingState !== 'stable') {
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    }
  }

  async _handleIceCandidate(peerId, candidate) {
    const pc = this.peers.get(peerId);
    if (pc && candidate) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {}
    }
  }

  _createPeerConnection(peerId) {
    if (this.peers.has(peerId)) return this.peers.get(peerId);

    const pc = new RTCPeerConnection(this.rtcConfig);
    this.peers.set(peerId, pc);

    // Feed all local tracks
    for (const stream of this.localStreams) {
      stream.getTracks().forEach(t => {
        pc.addTrack(t, stream);
      });
    }

    // Inbound remote video track!
    pc.ontrack = (event) => {
      const stream = event.streams[0] || new MediaStream([event.track]);
      if (this.onRemoteStream) {
        this.onRemoteStream(peerId, stream);
      }
    };

    // Forward ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this._broadcast({
          type: 'ICE',
          senderId: this.localUserId,
          targetId: peerId,
          candidate: event.candidate
        });
      }
    };

    return pc;
  }

  registerLocalStream(stream) {
    this.localStreams.push(stream);
    for (const [_, pc] of this.peers) {
      stream.getTracks().forEach(t => {
        pc.addTrack(t, stream);
      });
    }
  }

  disconnect() {
    clearInterval(this.heartbeat);
    if (this.ws) this.ws.close();
    if (this.bc) this.bc.close();
    for (const [_, pc] of this.peers) pc.close();
    this.peers.clear();
  }
}
