/**
 * E-WARN NEXUS — Main Application Coordinator (v1.1)
 * Enhanced with Director Focus Stage, Smart Mirroring, Worldwide Two-Way Mesh, and Mobile Layout Engine
 */

import { CameraManager } from './cameraManager.js';
import { IPCameraBridge } from './ipCamera.js';
import { LocalNetworkMesh } from './localMesh.js';
import { ChatAndFileEngine } from './chatAndFileEngine.js';

class EwarnNexusApp {
  constructor() {
    this.videoGrid = document.getElementById('videoGrid');
    this.roomId = this._getOrCreateRoomId();
    this.localUserId = 'usr_' + Math.random().toString(36).substring(2, 8);
    this.userName = 'Operator-' + Math.floor(100 + Math.random() * 900);

    this._initElements();
    this._initEngines();
    this._bindControls();
  }

  _getOrCreateRoomId() {
    let hash = window.location.hash.replace('#room-', '');
    if (!hash || hash.length < 3) {
      hash = 'nexus-' + Math.random().toString(36).substring(2, 8);
      window.location.hash = `room-${hash}`;
    }
    return hash;
  }

  _initElements() {
    document.getElementById('roomIdDisplay').innerText = `Room: #${this.roomId}`;
  }

  _initEngines() {
    // 1. Multi-Camera Hardware Controller & Director Focus Stage
    this.cameraManager = new CameraManager(
      this.videoGrid,
      (stream, meta) => {
        this._showToast(`Added Feed: ${meta.label}`);
        if (this.mesh) {
          this.mesh.registerLocalStream(stream);
        }
      },
      (streamId) => {
        this._showToast(`Stopped Feed: ${streamId}`);
      }
    );

    // 2. IP / RTSP Bridge
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
      if (this.mesh) {
        this.mesh.registerLocalStream(canvasStream);
      }
    });

    // 3. Guaranteed Local Network P2P Mesh
    this.mesh = new LocalNetworkMesh(
      this.roomId,
      this.localUserId,
      (peerId, remoteStream) => {
        this._handleRemoteMediaStream(peerId, remoteStream);
      },
      (peerId, data) => {
        if (this.chatAndFileEngine) {
          this.chatAndFileEngine.handleIncomingData(peerId, data);
        }
      }
    );

    // 4. Dual-Layer Chat & File Sharing Engine
    this.chatAndFileEngine = new ChatAndFileEngine(
      this.userName,
      (target, data) => this.mesh.sendData(target, data)
    );

    // Start Primary Camera (Presenter Webcam with Natural Mirroring)
    this.cameraManager.startPrimaryCamera().then((stream) => {
      this.mesh.registerLocalStream(stream);
    }).catch((e) => {
      console.warn('[E-WARN NEXUS] Camera permissions requested or denied:', e);
      this._showToast('Please grant Camera/Microphone permissions to join call.');
    });
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
      const isEnabled = this.cameraManager.toggleAudio();
      btnMic.classList.toggle('danger', !isEnabled);
      btnMic.querySelector('.btn-label').innerText = isEnabled ? 'Mute' : 'Unmute';
      this._showToast(isEnabled ? 'Microphone Active' : 'Microphone Muted');
    };

    // Entire Screen Share Handler
    const handleScreenShare = async () => {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: { cursor: 'always', displaySurface: 'monitor' },
          audio: true // Captures native system sound
        });

        this.cameraManager._mountStreamTile(screenStream, {
          id: 'screen-' + Date.now(),
          deviceId: 'screen',
          label: 'Entire Screen Share',
          type: 'screen',
          isPrimary: false,
          isMirrored: false // Screen share must never be mirrored
        });

        // Auto-feature the screen share onto the big stage
        this.cameraManager.setFeaturedStream('screen-' + Date.now());

        if (this.p2pEngine) {
          this.p2pEngine.registerLocalStream(screenStream);
        }

        screenStream.getVideoTracks()[0].onended = () => {
          this.cameraManager.stopStream('screen-' + Date.now());
        };
      } catch (e) {
        console.warn('Screen share canceled or denied', e);
      }
    };

    document.getElementById('btnShareScreen').onclick = handleScreenShare;
    document.getElementById('mBtnShareScreen').onclick = () => {
      document.getElementById('modalMobileActions').classList.remove('open');
      handleScreenShare();
    };

    // Layout Toggle Handler (Director Stage vs Equal Grid)
    const handleLayoutToggle = (btn) => {
      const mode = this.cameraManager.toggleLayoutMode();
      btn.innerText = mode === 'stage' ? '🗔 Stage View' : '⊞ Grid View';
      this._showToast(`Switched to ${mode === 'stage' ? 'Director Focus Stage' : 'Equal Grid'} View`);
    };

    const btnLayout = document.getElementById('btnLayoutToggle');
    btnLayout.onclick = () => handleLayoutToggle(btnLayout);

    const mBtnLayout = document.getElementById('mBtnLayoutToggle');
    mBtnLayout.onclick = () => {
      document.getElementById('modalMobileActions').classList.remove('open');
      handleLayoutToggle(btnLayout);
    };

    // Add Secondary Camera Modal Triggers
    const modalCamera = document.getElementById('modalAddCamera');
    const openCameraModal = async () => {
      const select = document.getElementById('cameraDeviceSelect');
      select.innerHTML = '<option value="">Searching for connected USB cameras...</option>';
      modalCamera.classList.add('open');

      try {
        const devices = await this.cameraManager.getAvailableVideoDevices();
        select.innerHTML = '';
        if (devices.length === 0) {
          select.innerHTML = '<option value="">No external cameras found</option>';
          return;
        }
        devices.forEach((d, idx) => {
          const opt = document.createElement('option');
          opt.value = d.deviceId;
          opt.innerText = d.label || `Camera ${idx + 1} (${d.deviceId.substring(0, 8)})`;
          select.appendChild(opt);
        });
      } catch (err) {
        select.innerHTML = '<option value="">Failed to detect devices</option>';
      }
    };

    document.getElementById('btnAddCamera').onclick = openCameraModal;
    document.getElementById('mBtnAddCamera').onclick = () => {
      document.getElementById('modalMobileActions').classList.remove('open');
      openCameraModal();
    };

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

    // Add IP Camera Modal Triggers
    const modalIP = document.getElementById('modalAddIPCamera');
    const openIPModal = () => modalIP.classList.add('open');

    document.getElementById('btnAddIPCamera').onclick = openIPModal;
    document.getElementById('mBtnAddIPCamera').onclick = () => {
      document.getElementById('modalMobileActions').classList.remove('open');
      openIPModal();
    };

    document.getElementById('btnConfirmAddIPCamera').onclick = async () => {
      const url = document.getElementById('ipCameraUrl').value.trim();
      const name = document.getElementById('ipCameraName').value.trim() || 'Site IP Cam';
      if (!url) return;

      try {
        await this.ipBridge.mountIPStream(url, name);
        modalIP.classList.remove('open');
      } catch (err) {
        alert(err.message || 'Failed to connect to IP camera');
      }
    };

    document.getElementById('btnCloseIPCameraModal').onclick = () => {
      modalIP.classList.remove('open');
    };

    // Mobile More Actions Sheet
    const modalMobile = document.getElementById('modalMobileActions');
    document.getElementById('btnMobileMore').onclick = () => {
      modalMobile.classList.add('open');
    };
    document.getElementById('btnCloseMobileActions').onclick = () => {
      modalMobile.classList.remove('open');
    };

    // Sidebar Toggles
    const sidebar = document.getElementById('sidebar');
    document.getElementById('btnToggleSidebar').onclick = () => {
      sidebar.classList.toggle('collapsed');
    };
    document.getElementById('btnCloseSidebar').onclick = () => {
      sidebar.classList.add('collapsed');
    };

    // Chat / File Tab Switching
    document.getElementById('tabChat').onclick = (e) => {
      e.target.classList.add('active');
      document.getElementById('tabFiles').classList.remove('active');
      document.getElementById('panelChat').style.display = 'flex';
      document.getElementById('panelFiles').style.display = 'none';
    };

    document.getElementById('tabFiles').onclick = (e) => {
      e.target.classList.add('active');
      document.getElementById('tabChat').classList.remove('active');
      document.getElementById('panelChat').style.display = 'none';
      document.getElementById('panelFiles').style.display = 'flex';
    };

    // Leave Meeting
    document.getElementById('btnLeaveMeeting').onclick = () => {
      if (confirm('Are you sure you want to disconnect from E-WARN NEXUS?')) {
        this.p2pEngine.disconnect();
        window.location.hash = '';
        window.location.reload();
      }
    };
  }

  /**
   * Handle Inbound Remote Media Stream from Connected Participant
   */
  _handleRemoteMediaStream(peerId, remoteStream) {
    let remoteCard = document.getElementById(`feed-remote-${peerId}`);
    if (!remoteCard) {
      remoteCard = document.createElement('div');
      remoteCard.className = 'video-card';
      remoteCard.id = `feed-remote-${peerId}`;
      remoteCard.dataset.streamId = `feed-remote-${peerId}`;

      const video = document.createElement('video');
      video.autoplay = true;
      video.playsInline = true;
      video.srcObject = remoteStream;

      const badge = document.createElement('div');
      badge.className = 'video-badge';
      badge.innerHTML = `
        <span class="tag-type tag-webcam">REMOTE</span>
        <span>${peerId.substring(0, 10)}</span>
      `;

      // Flip toggle for remote stream
      const actions = document.createElement('div');
      actions.className = 'video-card-actions';
      const flipBtn = document.createElement('button');
      flipBtn.className = 'btn-card-action';
      flipBtn.title = 'Flip orientation';
      flipBtn.innerHTML = '⇄';
      flipBtn.onclick = (e) => {
        e.stopPropagation();
        remoteCard.classList.toggle('mirrored');
      };
      actions.appendChild(flipBtn);

      // Tap to feature on Main Stage
      remoteCard.onclick = () => {
        this.cameraManager.setFeaturedStream(remoteCard.id);
      };

      remoteCard.appendChild(video);
      remoteCard.appendChild(badge);
      remoteCard.appendChild(actions);
      this.videoGrid.appendChild(remoteCard);

      // Refresh layout engine so the new participant is positioned cleanly in Stage / Grid
      this.cameraManager._applyLayoutMode();

      this._showToast(`Connected with participant (${peerId.substring(0, 8)})`);
    }
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
