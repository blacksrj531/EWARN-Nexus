/**
 * E-WARN NEXUS — Google Meet Standards Video Manager & Global Relay
 * Standard: Google Meet WebRTC Multi-Party Peer Engine
 */

export class GoogleMeetPeerMesh {
  constructor(roomId, localUserId, onRemoteStream) {
    this.roomId = roomId.toLowerCase().replace(/[^a-z0-9_-]/g, '');
    this.localUserId = localUserId;
    this.onRemoteStream = onRemoteStream;

    this.peers = new Map(); // peerId -> RTCPeerConnection
    this.localStreams = [];

    // Google Meet production STUN cluster
    this.rtcConfig = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' }
      ]
    };

    this.signalingTopic = `ewarn_nexus_${this.roomId}`;
    this._initSignaling();
  }

  _initSignaling() {
    // 1. Same-device / local-tab communication
    this.bc = new BroadcastChannel(this.signalingTopic);
    this.bc.onmessage = (e) => this._processSignal(e.data);

    // 2. Cross-Device Real-Time Server-Sent Events (SSE) Signaling
    // Uses Google-standard HTTP push + SSE listener
    if (window.EventSource) {
      try {
        this.es = new EventSource(`https://ntfy.sh/${this.signalingTopic}/sse`);
        this.es.onmessage = (e) => {
          try {
            const data = JSON.parse(e.data);
            if (data && data.message) {
              const signal = JSON.parse(data.message);
              this._processSignal(signal);
            }
          } catch (err) {}
        };
      } catch (e) {
        console.warn('[E-WARN Mesh] SSE setup notice:', e);
      }
    }

    // Announce presence immediately
    this._postSignal({
      type: 'JOIN',
      senderId: this.localUserId
    });

    // Periodic announcement so late joiners establish connection immediately
    this.heartbeat = setInterval(() => {
      this._postSignal({
        type: 'PING',
        senderId: this.localUserId
      });
    }, 2000);
  }

  _postSignal(msg) {
    const jsonStr = JSON.stringify(msg);

    // Broadcast locally
    try {
      this.bc.postMessage(msg);
    } catch (e) {}

    // Broadcast across WAN / Internet (Mobile <-> PC)
    if (window.fetch) {
      fetch(`https://ntfy.sh/${this.signalingTopic}`, {
        method: 'POST',
        body: jsonStr,
        headers: { 'Title': 'signaling' }
      }).catch(() => {});
    }
  }

  async _processSignal(data) {
    if (!data || data.senderId === this.localUserId) return;
    const remotePeerId = data.senderId;

    switch (data.type) {
      case 'JOIN':
      case 'PING':
        // Deterministic collision avoidance (Google Meet algorithm):
        // The peer with the lexicographically higher ID initiates the offer
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

    // Create DataChannel for keepalive
    pc.createDataChannel('meet_sync');

    const offer = await pc.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true
    });
    await pc.setLocalDescription(offer);

    this._postSignal({
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

    this._postSignal({
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

    // Add all local video and audio tracks
    for (const stream of this.localStreams) {
      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
      });
    }

    // Receive remote video/audio track!
    pc.ontrack = (event) => {
      const stream = event.streams[0] || new MediaStream([event.track]);
      if (this.onRemoteStream) {
        this.onRemoteStream(peerId, stream);
      }
    };

    // Forward ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this._postSignal({
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
    // Push new track to all connected peers
    for (const [_, pc] of this.peers) {
      stream.getTracks().forEach(t => {
        pc.addTrack(t, stream);
      });
    }
  }

  disconnect() {
    clearInterval(this.heartbeat);
    if (this.es) this.es.close();
    if (this.bc) this.bc.close();
    for (const [_, pc] of this.peers) pc.close();
    this.peers.clear();
  }
}
