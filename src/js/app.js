/**
 * E-WARN NEXUS — Main Application Coordinator (Sovereign Edition)
 * Standard: Microsoft Teams & Google Meet Enterprise Architecture
 */

import { CameraManager } from './cameraManager.js';
import { IPCameraBridge } from './ipCamera.js';
import { SovereignWebRTCClient } from './sovereignClient.js';

class EwarnNexusApp {
  constructor() {
    this.videoGrid = document.getElementById('videoGrid');
    this.userId = 'usr_' + Math.random().toString(36).substring(2, 8);
    this.localStream = null;

    this._initLobby();
  }

  async _initLobby() {
    const lobbyScreen = document.getElementById('lobbyScreen');
    const inCallApp = document.getElementById('app');
    const previewVideo = document.getElementById('lobbyPreviewVideo');
    const inputUserName = document.getElementById('lobbyUserName');
    const inputRoomId = document.getElementById('lobbyRoomId');
    const btnEnter = document.getElementById('btnEnterMeeting');

    // Pre-populate room from hash or generate random unique Google Meet style code
    const generateUniqueRoomId = () => {
      const part1 = Math.random().toString(36).substring(2, 5);
      const part2 = Math.random().toString(36).substring(2, 6);
      const part3 = Math.random().toString(36).substring(2, 5);
      return `nex-${part1}-${part2}`;
    };

    let hash = window.location.hash.replace('#room-', '');
    if (!hash || hash.length < 3) {
      hash = generateUniqueRoomId();
    }
    inputRoomId.value = hash;
    inputUserName.value = 'Operator-' + Math.floor(100 + Math.random() * 900);

    // 1-Click "🔄 Generate New" room code button in Lobby
    const btnGenNew = document.getElementById('btnGenerateNewRoomId');
    if (btnGenNew) {
      btnGenNew.onclick = () => {
        const newId = generateUniqueRoomId();
        inputRoomId.value = newId;
        this._showToast(`Generated New Room: ${newId}`);
      };
    }

    // Start Lobby Camera Preview
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: { echoCancellation: true, noiseSuppression: true }
      });
      previewVideo.srcObject = this.localStream;
    } catch (e) {
      console.warn('Lobby preview error:', e);
    }

    btnEnter.onclick = async () => {
      const userName = inputUserName.value.trim() || 'Participant';
      const roomId = inputRoomId.value.trim() || 'nexus-hq';
      const passcode = document.getElementById('lobbyRoomPasscode').value.trim();

      // Client-side SHA-256 room passcode hashing
      let passcodeHash = null;
      if (passcode) {
        const msgBuffer = new TextEncoder().encode(passcode);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        passcodeHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      }

      window.location.hash = `room-${roomId}`;
      document.getElementById('roomIdDisplay').innerText = `Room: #${roomId}`;

      // Transition from Lobby to Meeting Room
      lobbyScreen.style.display = 'none';
      inCallApp.style.display = 'flex';

      this._startMeeting(roomId, userName, passcodeHash);
    };
  }

  _startMeeting(roomId, userName, passcodeHash = null) {
    // 1. Multi-Camera Hardware Controller & Director Focus Stage
    this.cameraManager = new CameraManager(
      this.videoGrid,
      (stream, meta) => {
        this._showToast(`Added Feed: ${meta.label}`);
        if (this.client) {
          this.client.registerLocalStream(stream);
        }
      },
      (streamId) => {
        this._showToast(`Stopped Feed: ${streamId}`);
      }
    );

    // Mount the primary camera that was already capturing in the lobby
    if (this.localStream) {
      const vTrack = this.localStream.getVideoTracks()[0];
      this.cameraManager._mountStreamTile(this.localStream, {
        id: this.localStream.id,
        deviceId: vTrack.getSettings().deviceId,
        label: `${userName} (Self)`,
        type: 'webcam',
        isPrimary: true,
        isMirrored: true
      });
    }

    // 2. IP Camera Bridge
    this.ipBridge = new IPCameraBridge(this.videoGrid, (canvasStream, meta) => {
      this._showToast(`Connected Network Camera: ${meta.label}`);
      this.cameraManager._mountStreamTile(canvasStream, {
        id: meta.id,
        deviceId: 'ipcam',
        label: meta.label,
        type: 'ipcam',
        isPrimary: false,
        isMirrored: false
      });
      if (this.client) {
        this.client.registerLocalStream(canvasStream);
      }
    });

    // 3. Sovereign WebRTC Client (Zero 3rd-Party APIs)
    this.client = new SovereignWebRTCClient(
      roomId,
      this.userId,
      userName,
      passcodeHash,
      (targetId, targetName, remoteStream) => {
        this._handleRemoteStream(targetId, targetName, remoteStream);
      },
      (leftUserId) => {
        this._handlePeerLeft(leftUserId);
      },
      (chatMsg) => {
        this._handleIncomingChat(chatMsg);
      }
    );

    if (this.localStream) {
      this.client.registerLocalStream(this.localStream);
    }

    this._bindControls();
  }

  _handleRemoteStream(targetId, targetName, remoteStream) {
    let card = document.getElementById(`feed-remote-${targetId}`);
    if (!card) {
      card = document.createElement('div');
      card.className = 'video-card';
      card.id = `feed-remote-${targetId}`;
      card.dataset.streamId = card.id;

      const video = document.createElement('video');
      video.autoplay = true;
      video.playsInline = true;
      video.srcObject = remoteStream;

      const badge = document.createElement('div');
      badge.className = 'video-badge';
      badge.innerHTML = `
        <span class="tag-type tag-webcam">REMOTE</span>
        <span>${targetName}</span>
      `;

      // Flip toggle
      const actions = document.createElement('div');
      actions.className = 'video-card-actions';
      const flipBtn = document.createElement('button');
      flipBtn.className = 'btn-card-action';
      flipBtn.title = 'Flip orientation';
      flipBtn.innerHTML = '⇄';
      flipBtn.onclick = (e) => {
        e.stopPropagation();
        card.classList.toggle('mirrored');
      };
      actions.appendChild(flipBtn);

      card.onclick = () => {
        this.cameraManager.setFeaturedStream(card.id);
      };

      card.appendChild(video);
      card.appendChild(badge);
      card.appendChild(actions);
      this.videoGrid.appendChild(card);

      // Re-apply director layout
      this.cameraManager._applyLayoutMode();
      this._showToast(`${targetName} joined the call!`);
    }
  }

  _handlePeerLeft(userId) {
    const card = document.getElementById(`feed-remote-${userId}`);
    if (card && card.parentNode) {
      card.parentNode.removeChild(card);
      this.cameraManager._applyLayoutMode();
      this._showToast('A participant left the call.');
    }
  }

  _handleIncomingChat(msg) {
    const container = document.getElementById('chatMessages');
    const el = document.createElement('div');
    el.className = 'msg-item';

    const meta = document.createElement('div');
    meta.className = 'msg-meta';

    const sender = document.createElement('span');
    sender.className = 'msg-sender';
    sender.textContent = msg.senderName; // Safe textContent (prevents XSS)

    const time = document.createElement('span');
    time.textContent = 'Just now';

    meta.appendChild(sender);
    meta.appendChild(time);

    const body = document.createElement('div');
    body.className = 'msg-body';
    body.textContent = msg.text; // Safe textContent (prevents XSS)

    el.appendChild(meta);
    el.appendChild(body);
    container.appendChild(el);
    container.scrollTop = container.scrollHeight;
  }

  _bindControls() {
    // Copy meeting URL
    document.getElementById('btnCopyRoom').onclick = () => {
      navigator.clipboard.writeText(window.location.href);
      this._showToast('Meeting link copied! Send it to your team.');
    };

    // Mic Mute Toggle
    const btnMic = document.getElementById('btnMicToggle');
    btnMic.onclick = () => {
      if (this.localStream) {
        const audio = this.localStream.getAudioTracks()[0];
        if (audio) {
          audio.enabled = !audio.enabled;
          btnMic.classList.toggle('danger', !audio.enabled);
          btnMic.querySelector('.btn-label').innerText = audio.enabled ? 'Mute' : 'Unmute';
          this._showToast(audio.enabled ? 'Microphone Active' : 'Microphone Muted');
        }
      }
    };

    // Entire Screen Share
    const handleScreenShare = async () => {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
          alert('Screen sharing is not supported by your mobile browser. Please use Chrome/Edge on Desktop.');
          return;
        }

        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: { cursor: 'always' },
          audio: false // Safer across platforms that don't allow system audio loopback
        });

        const screenTrack = screenStream.getVideoTracks()[0];
        const screenId = 'screen-' + Date.now();

        this.cameraManager._mountStreamTile(screenStream, {
          id: screenId,
          deviceId: 'screen',
          label: 'Entire Screen',
          type: 'screen',
          isPrimary: false,
          isMirrored: false
        });

        // Set screen share as the main featured stage immediately!
        this.cameraManager.setFeaturedStream(screenId);

        // Broadcast to peers
        this.client.registerLocalStream(screenStream);

        // Listen for native stop button
        screenTrack.onended = () => {
          this.cameraManager.stopStream(screenId);
        };
      } catch (e) {
        console.warn('Screen share canceled or not allowed', e);
      }
    };

    document.getElementById('btnShareScreen').onclick = handleScreenShare;
    document.getElementById('mBtnShareScreen').onclick = () => {
      document.getElementById('modalMobileActions').classList.remove('open');
      handleScreenShare();
    };

    // Layout Toggle (Director Stage vs Equal Grid)
    const handleLayoutToggle = (btn) => {
      const mode = this.cameraManager.toggleLayoutMode();
      btn.innerText = mode === 'stage' ? '🗔 Stage View' : '⊞ Grid View';
      this._showToast(`Switched to ${mode === 'stage' ? 'Director Focus Stage' : 'Equal Grid'} View`);
    };

    const btnLayout = document.getElementById('btnLayoutToggle');
    btnLayout.onclick = () => handleLayoutToggle(btnLayout);

    // Multi-Camera Modals
    const modalCamera = document.getElementById('modalAddCamera');
    // Open Camera Modal logic reusable for desktop and mobile
    const openAddCameraModal = async () => {
      const select = document.getElementById('cameraDeviceSelect');
      select.innerHTML = '<option value="">Scanning hardware...</option>';
      modalCamera.classList.add('open');

      try {
        const devices = await this.cameraManager.getAvailableVideoDevices();
        select.innerHTML = '';
        if (devices.length === 0) {
          select.innerHTML = '<option value="">No extra USB cameras found</option>';
          return;
        }
        devices.forEach((d, idx) => {
          const opt = document.createElement('option');
          opt.value = d.deviceId;
          opt.innerText = d.label || `Camera ${idx + 1}`;
          select.appendChild(opt);
        });
      } catch (err) {
        select.innerHTML = '<option value="">Device scan failed</option>';
      }
    };

    document.getElementById('btnAddCamera').onclick = openAddCameraModal;

    // Mobile More Actions Bottom Sheet Triggers
    const modalMobile = document.getElementById('modalMobileActions');
    const btnMobileMore = document.getElementById('btnMobileMore');
    if (btnMobileMore) {
      btnMobileMore.onclick = () => {
        modalMobile.classList.add('open');
      };
    }
    const btnCloseMobile = document.getElementById('btnCloseMobileActions');
    if (btnCloseMobile) {
      btnCloseMobile.onclick = () => {
        modalMobile.classList.remove('open');
      };
    }

    // Connect Mobile Sheet Buttons to Real Actions
    const mBtnAddCam = document.getElementById('mBtnAddCamera');
    if (mBtnAddCam) {
      mBtnAddCam.onclick = () => {
        modalMobile.classList.remove('open');
        openAddCameraModal();
      };
    }

    const mBtnAddIP = document.getElementById('mBtnAddIPCamera');
    if (mBtnAddIP) {
      mBtnAddIP.onclick = () => {
        modalMobile.classList.remove('open');
        modalIP.classList.add('open');
      };
    }

    const mBtnLayout = document.getElementById('mBtnLayoutToggle');
    if (mBtnLayout) {
      mBtnLayout.onclick = () => {
        modalMobile.classList.remove('open');
        handleLayoutToggle(btnLayout);
      };
    }

    document.getElementById('btnConfirmAddCamera').onclick = async () => {
      const select = document.getElementById('cameraDeviceSelect');
      const customName = document.getElementById('cameraCustomLabel').value.trim();
      const deviceId = select.value;
      if (!deviceId) return;

      try {
        await this.cameraManager.addSecondaryCamera(deviceId, customName);
        modalCamera.classList.remove('open');
      } catch (err) {
        alert(err.message || 'Failed to add camera feed');
      }
    };

    document.getElementById('btnCloseCameraModal').onclick = () => {
      modalCamera.classList.remove('open');
    };

    // IP Camera Modal
    const modalIP = document.getElementById('modalAddIPCamera');
    document.getElementById('btnAddIPCamera').onclick = () => modalIP.classList.add('open');
    document.getElementById('btnConfirmAddIPCamera').onclick = async () => {
      const url = document.getElementById('ipCameraUrl').value.trim();
      const name = document.getElementById('ipCameraName').value.trim() || 'Site IP Cam';
      if (!url) return;
      try {
        await this.ipBridge.mountIPStream(url, name);
        modalIP.classList.remove('open');
      } catch (err) {
        alert(err.message);
      }
    };
    document.getElementById('btnCloseIPCameraModal').onclick = () => modalIP.classList.remove('open');

    // Sidebar & Chat
    const sidebar = document.getElementById('sidebar');
    document.getElementById('btnToggleSidebar').onclick = () => sidebar.classList.toggle('collapsed');
    document.getElementById('btnCloseSidebar').onclick = () => sidebar.classList.add('collapsed');

    // Send Chat
    const chatInput = document.getElementById('chatInput');
    const sendChat = () => {
      const text = chatInput.value.trim();
      if (!text) return;
      this.client.sendChat(text);
      this._handleIncomingChat({ senderName: 'You', text });
      chatInput.value = '';
    };

    document.getElementById('btnSendMessage').onclick = sendChat;
    chatInput.onkeypress = (e) => {
      if (e.key === 'Enter') sendChat();
    };

    // Leave
    document.getElementById('btnLeaveMeeting').onclick = () => {
      if (confirm('Leave E-WARN NEXUS call?')) {
        this.client.disconnect();
        window.location.reload();
      }
    };
  }

  _showToast(msg) {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerText = msg;
    container.appendChild(toast);
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 3500);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new EwarnNexusApp();
});
