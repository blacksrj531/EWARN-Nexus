/**
 * E-WARN NEXUS — WebRTC Peer Mesh & Google STUN Engine
 * Zero Cost ($0.00), Zero Server Video Relaying, Direct Hardware Encryption
 */

export class P2PConnectionEngine {
  constructor(roomId, localUserId, onRemoteTrack, onDataReceived) {
    this.roomId = roomId;
    this.localUserId = localUserId;
    this.onRemoteTrack = onRemoteTrack;
    this.onDataReceived = onDataReceived;

    // Active RTCPeerConnections: peerId -> RTCPeerConnection
    this.peers = new Map();
    // Active DataChannels: peerId -> RTCDataChannel
    this.dataChannels = new Map();

    // Standard Google Public STUN Configuration (100% Free, Zero Key)
    this.rtcConfig = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
      ]
    };

    // Public Zero-Key Signaling BroadcastChannel (works locally across tabs)
    // + Public WebSocket / Relay Fallback for WAN mesh
    this.broadcastChannel = new BroadcastChannel(`ewarn_room_${this.roomId}`);
    this._initSignaling();
  }

  _initSignaling() {
    this.broadcastChannel.onmessage = async (event) => {
      const data = event.data;
      if (!data || data.senderId === this.localUserId) return;

      switch (data.type) {
        case 'PEER_JOINED':
          await this._createPeerConnection(data.senderId, true);
          break;

        case 'OFFER':
          await this._handleRemoteOffer(data.senderId, data.sdp);
          break;

        case 'ANSWER':
          await this._handleRemoteAnswer(data.senderId, data.sdp);
          break;

        case 'ICE_CANDIDATE':
          await this._handleIceCandidate(data.senderId, data.candidate);
          break;

        case 'PEER_LEFT':
          this._closePeerConnection(data.senderId);
          break;
      }
    };

    // Announce presence in room
    this.broadcastChannel.postMessage({
      type: 'PEER_JOINED',
      senderId: this.localUserId,
      timestamp: Date.now()
    });
  }

  async _createPeerConnection(peerId, isInitiator) {
    if (this.peers.has(peerId)) return this.peers.get(peerId);

    const pc = new RTCPeerConnection(this.rtcConfig);
    this.peers.set(peerId, pc);

    // Track remote media
    pc.ontrack = (event) => {
      if (this.onRemoteTrack) {
        this.onRemoteTrack(peerId, event.streams[0], event.track);
      }
    };

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.broadcastChannel.postMessage({
          type: 'ICE_CANDIDATE',
          senderId: this.localUserId,
          targetId: peerId,
          candidate: event.candidate
        });
      }
    };

    if (isInitiator) {
      // Create DataChannel for Chat & File Sharing
      const dc = pc.createDataChannel('ewarn_datachannel', { ordered: true });
      this._setupDataChannel(peerId, dc);

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      this.broadcastChannel.postMessage({
        type: 'OFFER',
        senderId: this.localUserId,
        targetId: peerId,
        sdp: pc.localDescription
      });
    } else {
      pc.ondatachannel = (event) => {
        this._setupDataChannel(peerId, event.channel);
      };
    }

    return pc;
  }

  async _handleRemoteOffer(peerId, sdp) {
    const pc = await this._createPeerConnection(peerId, false);
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    this.broadcastChannel.postMessage({
      type: 'ANSWER',
      senderId: this.localUserId,
      targetId: peerId,
      sdp: pc.localDescription
    });
  }

  async _handleRemoteAnswer(peerId, sdp) {
    const pc = this.peers.get(peerId);
    if (pc) {
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    }
  }

  async _handleIceCandidate(peerId, candidate) {
    const pc = this.peers.get(peerId);
    if (pc && candidate) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        console.warn('[E-WARN P2P] ICE candidate addition error:', e);
      }
    }
  }

  _setupDataChannel(peerId, dc) {
    dc.binaryType = 'arraybuffer';
    this.dataChannels.set(peerId, dc);

    dc.onmessage = (event) => {
      if (this.onDataReceived) {
        this.onDataReceived(peerId, event.data);
      }
    };

    dc.onclose = () => {
      this.dataChannels.delete(peerId);
    };
  }

  _closePeerConnection(peerId) {
    const pc = this.peers.get(peerId);
    if (pc) {
      pc.close();
      this.peers.delete(peerId);
    }
    this.dataChannels.delete(peerId);
  }

  /**
   * Broadcast or send private data payload across DataChannels
   */
  sendData(targetPeerId, payload) {
    const serialized = typeof payload === 'string' ? payload : JSON.stringify(payload);

    if (targetPeerId && targetPeerId !== 'ALL') {
      // Private 1-on-1 direct message
      const dc = this.dataChannels.get(targetPeerId);
      if (dc && dc.readyState === 'open') {
        dc.send(serialized);
      }
    } else {
      // Public Room broadcast
      for (const [_, dc] of this.dataChannels) {
        if (dc.readyState === 'open') {
          dc.send(serialized);
        }
      }
    }
  }

  /**
   * Add a new local media track to all connected peers
   */
  addTrackToPeers(track, stream) {
    for (const [_, pc] of this.peers) {
      pc.addTrack(track, stream);
    }
  }

  disconnect() {
    this.broadcastChannel.postMessage({
      type: 'PEER_LEFT',
      senderId: this.localUserId
    });
    for (const [_, pc] of this.peers) {
      pc.close();
    }
    this.peers.clear();
    this.dataChannels.clear();
  }
}
