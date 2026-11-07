/**
 * E-WARN NEXUS — Sovereign Robust WebRTC Client Engine
 * Standards: Google Meet & Apple WebKit Call State Machine
 * Features: ICE Candidate Queuing, Deterministic Negotiation, Zero 3rd-Party APIs
 */

export class SovereignWebRTCClient {
  constructor(roomId, userId, userName, passcodeHash, onRemoteStream, onPeerLeft, onChatMessage) {
    this.roomId = roomId;
    this.userId = userId;
    this.userName = userName;
    this.passcodeHash = passcodeHash;
    this.onRemoteStream = onRemoteStream;
    this.onPeerLeft = onPeerLeft;
    this.onChatMessage = onChatMessage;

    this.peers = new Map(); // targetId -> { pc, dc, iceQueue: [] }
    this.localStreams = [];

    // Global Public STUN Cluster (Free, zero accounts, open protocol standard)
    this.rtcConfig = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' }
      ]
    };

    this._connectSocket();
  }

  _connectSocket() {
    // If running on local machine, connect to localhost:3001
    // If running live on GitHub Pages, connect to your sovereign public signaling server
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const wsUrl = isLocal 
      ? 'ws://localhost:3001'
      : 'wss://ewarn-nexus-signaling.onrender.com';

    console.log(`[E-WARN Client] Establishing sovereign connection to: ${wsUrl}`);
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log('[E-WARN Client] Connected to Sovereign Signaling Hub!');
      this.ws.send(JSON.stringify({
        type: 'JOIN_LOBBY',
        roomId: this.roomId,
        userId: this.userId,
        userName: this.userName,
        passcodeHash: this.passcodeHash
      }));
    };

    this.ws.onmessage = async (event) => {
      try {
        const msg = JSON.parse(event.data);
        switch (msg.type) {
          case 'ROOM_STATE':
            // Existing participants in the room! Initiate connections to them
            for (const peer of msg.participants) {
              if (peer.userId !== this.userId) {
                console.log(`[E-WARN Client] Calling existing participant: ${peer.userName} (${peer.userId})`);
                await this._initiatePeerCall(peer.userId, peer.userName);
              }
            }
            break;

          case 'PEER_JOINED':
            if (msg.userId !== this.userId) {
              console.log(`[E-WARN Client] New participant entered: ${msg.userName} (${msg.userId})`);
            }
            break;

          case 'WEBRTC_SIGNAL':
            await this._handleIncomingSignal(msg.senderId, msg.senderName, msg.signal);
            break;

          case 'PEER_LEFT':
            this._teardownPeer(msg.userId);
            if (this.onPeerLeft) this.onPeerLeft(msg.userId);
            break;

          case 'CHAT_MESSAGE':
            if (this.onChatMessage) {
              this.onChatMessage(msg);
            }
            break;
        }
      } catch (e) {
        console.error('[E-WARN Client] Parse error:', e);
      }
    };

    this.ws.onclose = () => {
      console.warn('[E-WARN Client] Socket closed. Reconnecting in 2s...');
      setTimeout(() => this._connectSocket(), 2000);
    };
  }

  async _initiatePeerCall(targetId, targetName) {
    if (this.peers.has(targetId)) return;

    const peerObj = this._getOrCreatePeer(targetId, targetName);
    const pc = peerObj.pc;

    const offer = await pc.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true
    });
    await pc.setLocalDescription(offer);

    this._sendSignal(targetId, {
      type: 'OFFER',
      sdp: pc.localDescription
    });
  }

  async _handleIncomingSignal(senderId, senderName, signal) {
    const peerObj = this._getOrCreatePeer(senderId, senderName);
    const pc = peerObj.pc;

    if (signal.type === 'OFFER') {
      await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));

      // Flush queued ICE candidates
      while (peerObj.iceQueue.length > 0) {
        const cand = peerObj.iceQueue.shift();
        await pc.addIceCandidate(new RTCIceCandidate(cand));
      }

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      this._sendSignal(senderId, {
        type: 'ANSWER',
        sdp: pc.localDescription
      });
    } else if (signal.type === 'ANSWER') {
      if (pc.signalingState !== 'stable') {
        await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));

        // Flush queued ICE candidates
        while (peerObj.iceQueue.length > 0) {
          const cand = peerObj.iceQueue.shift();
          await pc.addIceCandidate(new RTCIceCandidate(cand));
        }
      }
    } else if (signal.type === 'ICE') {
      if (signal.candidate) {
        if (pc.remoteDescription && pc.remoteDescription.type) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
          } catch (e) {}
        } else {
          // Buffer candidate in queue until remote description is set!
          peerObj.iceQueue.push(signal.candidate);
        }
      }
    }
  }

  _getOrCreatePeer(targetId, targetName) {
    if (this.peers.has(targetId)) {
      return this.peers.get(targetId);
    }

    const pc = new RTCPeerConnection(this.rtcConfig);
    const peerObj = {
      id: targetId,
      name: targetName,
      pc,
      iceQueue: []
    };

    // Attach all active local camera & audio tracks
    for (const stream of this.localStreams) {
      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });
    }

    // Inbound remote video & audio stream
    pc.ontrack = (event) => {
      console.log(`[E-WARN Client] Inbound video track from ${targetName}`);
      const remoteStream = event.streams[0] || new MediaStream([event.track]);
      if (this.onRemoteStream) {
        this.onRemoteStream(targetId, targetName, remoteStream);
      }
    };

    // Send ICE candidates to peer via signaling server
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this._sendSignal(targetId, {
          type: 'ICE',
          candidate: event.candidate
        });
      }
    };

    this.peers.set(targetId, peerObj);
    return peerObj;
  }

  _sendSignal(targetId, signal) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'WEBRTC_SIGNAL',
        targetId,
        signal
      }));
    }
  }

  sendChat(text) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'CHAT_BROADCAST',
        text
      }));
    }
  }

  registerLocalStream(stream) {
    this.localStreams.push(stream);
    // Push new tracks to all active connections
    for (const [_, peerObj] of this.peers) {
      stream.getTracks().forEach((t) => {
        peerObj.pc.addTrack(t, stream);
      });
    }
  }

  _teardownPeer(userId) {
    if (this.peers.has(userId)) {
      const p = this.peers.get(userId);
      p.pc.close();
      this.peers.delete(userId);
    }
  }

  disconnect() {
    if (this.ws) this.ws.close();
    for (const [_, p] of this.peers) {
      p.pc.close();
    }
    this.peers.clear();
  }
}
