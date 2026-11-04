/**
 * E-WARN NEXUS — Main Application Coordinator
 */

import { CameraManager } from './cameraManager.js';
import { IPCameraBridge } from './ipCamera.js';
import { P2PConnectionEngine } from './p2pEngine.js';
import { ChatAndFileEngine } from './chatAndFileEngine.js';

class EwarnNexusApp {
  constructor() {
    this.videoGrid = document.getElementById('videoGrid');
    this.roomId = this._getOrCreateRoomId();
    this.localUserId = 'usr_' + Math.random().toString(36).substring(2, 9);
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
    // 1. Multi-Camera Hardware Manager
    this.cameraManager = new CameraManager(
      this.videoGrid,
      (stream, meta) => {
        this._showToast(`Added Feed: ${meta.label}`);
        // Add new track to existing peer connections
        const vTrack = stream.getVideoTracks()[0];
        if (vTrack && this.p2pEngine) {
          this.p2pEngine.addTrackToPeers(vTrack, stream);
        }
      },
      (streamId) => {
        this._showToast(`Stopped Feed: ${streamId}`);
      }
    );

    // 2. IP / RTSP Bridge
    this.ipBridge = new IPCameraBridge(this.videoGrid, (canvasStream, meta) => {
      this._showToast(`Connected Network Camera: ${meta.label}`);
      const vTrack = canvasStream.getVideoTracks()[0];
      if (vTrack && this.p2pEngine) {
        this.p2pEngine.addTrackToPeers(vTrack, canvasStream);
      }
    });

    // 3. P2P WebRTC Engine
    this.p2pEngine = new P2PConnectionEngine(
      this.roomId,
      this.localUserId,
      (peerId, remoteStream, track) => {
        this._handleRemoteMediaTrack(peerId, remoteStream, track);
      },
      (peerId, data) => {
        if (this.chatAndFileEngine) {
          this.chatAndFileEngine.handleIncomingData(peerId, data);
        }
      }
    );

    // 4. Chat & Direct File Sharing Engine
    this.chatAndFileEngine = new ChatAndFileEngine(
      this.userName,
      (target, data) => this.p2pEngine.sendData(target, data)
    );

    // Automatically initialize primary camera
    this.cameraManager.startPrimaryCamera().catch((e) => {
      console.warn('[E-WARN NEXUS] Camera permission requested or denied:', e);
      this._showToast('Please grant Camera/Microphone permissions to join call.');
    });
  }

  _bindControls() {
    // Copy meeting URL
    document.getElementById('btnCopyRoom').onclick = () => {
      navigator.clipboard.writeText(window.location.href);
      this._showToast('Meeting Link Copied to Clipboard!');
    };

    // Mic Mute Toggle
    const btnMic = document.getElementById('btnMicToggle');
    btnMic.onclick = () => {
      const isEnabled = this.cameraManager.toggleAudio();
      btnMic.classList.toggle('danger', !isEnabled);
      btnMic.querySelector('.btn-label').innerText = isEnabled ? 'Mute Mic' : 'Unmute Mic';
      this._showToast(isEnabled ? 'Microphone Active' : 'Microphone Muted');
    };

    // Add Secondary Camera Modal Trigger
    const modalCamera = document.getElementById('modalAddCamera');
    document.getElementById('btnAddCamera').onclick = async () => {
      const select = document.getElementById('cameraDeviceSelect');
      select.innerHTML = '<option value="">Loading devices...</option>';
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

    // Add IP Camera Modal Trigger
    const modalIP = document.getElementById('modalAddIPCamera');
    document.getElementById('btnAddIPCamera').onclick = () => {
      modalIP.classList.add('open');
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

    // Sidebar Toggles
    const sidebar = document.getElementById('sidebar');
    document.getElementById('btnToggleSidebar').onclick = () => {
      sidebar.classList.toggle('collapsed');
    };

    // Tab Buttons
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

    // Screen Share
    document.getElementById('btnShareScreen').onclick = async () => {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        this.cameraManager._mountStreamTile(screenStream, {
          id: 'screen-' + Date.now(),
          deviceId: 'screen',
          label: 'Screen Share',
          type: 'usb',
          isPrimary: false
        });
      } catch (e) {
        console.warn('Screen share canceled or failed', e);
      }
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

  _handleRemoteMediaTrack(peerId, remoteStream, track) {
    let remoteCard = document.getElementById(`feed-remote-${track.id}`);
    if (!remoteCard) {
      remoteCard = document.createElement('div');
      remoteCard.className = 'video-card';
      remoteCard.id = `feed-remote-${track.id}`;

      const video = document.createElement('video');
      video.autoplay = true;
      video.playsInline = true;
      video.srcObject = remoteStream;

      const badge = document.createElement('div');
      badge.className = 'video-badge';
      badge.innerHTML = `
        <span class="tag-type tag-webcam">REMOTE</span>
        <span>Peer: ${peerId.substring(0, 8)}</span>
      `;

      remoteCard.appendChild(video);
      remoteCard.appendChild(badge);
      this.videoGrid.appendChild(remoteCard);

      const totalFeeds = this.videoGrid.children.length;
      this.videoGrid.setAttribute('data-count', Math.min(totalFeeds, 8).toString());
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

// Bootstrap application on DOM readiness
window.addEventListener('DOMContentLoaded', () => {
  new EwarnNexusApp();
});
