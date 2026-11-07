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

  _handleRemoteStream(targetId, targetName, remoteStream, meta = {}) {
    // PREVENT SELF-LOOP: Never create a remote card for yourself!
    if (targetId === this.userId) return;

    // Detect if this is a screen share
    const isScreen = (meta && meta.track && meta.track.label && meta.track.label.toLowerCase().includes('screen')) ||
                     (meta && meta.trackKind === 'video' && targetName.toLowerCase().includes('screen')) ||
                     (meta && meta.streamId && meta.streamId.includes('screen'));

    // Deterministic Card ID: 1 camera tile + 1 screen tile per peer
    const streamIdentifier = isScreen ? 'screen' : 'cam';
    const cardId = `feed-remote-${targetId}-${streamIdentifier}`;

    let card = document.getElementById(cardId);
    if (!card) {
      card = document.createElement('div');
      card.className = 'video-card';
      card.id = cardId;
      card.dataset.streamId = cardId;

      const video = document.createElement('video');
      video.autoplay = true;
      video.playsInline = true;
      video.srcObject = remoteStream;
      // Do not mute remote participants so you can hear them!
      video.muted = false;

      const tagClass = isScreen ? 'tag-screen' : 'tag-webcam';
      const tagText = isScreen ? 'SCREEN' : 'REMOTE';
      const labelText = isScreen ? `${targetName}'s Screen` : targetName;

      const badge = document.createElement('div');
      badge.className = 'video-badge';
      badge.innerHTML = `
        <span class="tag-type ${tagClass}">${tagText}</span>
        <span>${labelText}</span>
      `;

      // Action Controls (Pin, Zoom, Flip)
      const actions = document.createElement('div');
      actions.className = 'video-card-actions always-visible';

      // 1-Click Pin to Stage Button
      const pinBtn = document.createElement('button');
      pinBtn.className = 'btn-card-action btn-pin-action';
      pinBtn.title = 'Pin presentation to main screen';
      pinBtn.innerHTML = '📍';
      pinBtn.onclick = (e) => {
        e.stopPropagation();
        this.cameraManager.setFeaturedStream(card.id);
      };
      actions.appendChild(pinBtn);

      // Flip toggle
      const flipBtn = document.createElement('button');
      flipBtn.className = 'btn-card-action';
      flipBtn.title = 'Flip orientation';
      flipBtn.innerHTML = '⇄';
      flipBtn.onclick = (e) => {
        e.stopPropagation();
        card.classList.toggle('mirrored');
      };
      actions.appendChild(flipBtn);

      // Interactive Zoom Wrapper for Pinch-to-Zoom & Pan
      const zoomWrapper = document.createElement('div');
      zoomWrapper.className = 'video-zoom-container';
      zoomWrapper.appendChild(video);

      // Reset Zoom Pill
      const resetZoomPill = document.createElement('button');
      resetZoomPill.className = 'zoom-reset-pill';
      resetZoomPill.innerHTML = '🔍 100% Reset';
      zoomWrapper.appendChild(resetZoomPill);

      this._enablePinchAndPanZoom(zoomWrapper, video, resetZoomPill);

      card.onclick = () => {
        this.cameraManager.setFeaturedStream(card.id);
      };

      card.appendChild(zoomWrapper);
      card.appendChild(badge);
      card.appendChild(actions);
      this.videoGrid.appendChild(card);

      // If remote peer shared their screen, automatically feature it on mobile & desktop!
      if (isScreen) {
        this.cameraManager.setFeaturedStream(card.id);
      }

      // Re-apply director layout
      this.cameraManager._applyLayoutMode();
      this._showToast(isScreen ? `${targetName} started presenting screen` : `${targetName} joined the call!`);
    } else {
      // Card already exists: update video source so track switches cleanly without duplicates
      const existingVideo = card.querySelector('video');
      if (existingVideo) {
        existingVideo.srcObject = remoteStream;
        existingVideo.play().catch(e => console.warn('Autoplay prevented:', e));
      }
    }
  }

  _handlePeerLeft(userId) {
    const cards = document.querySelectorAll(`[id^="feed-remote-${userId}"]`);
    cards.forEach(card => {
      if (card.parentNode) card.parentNode.removeChild(card);
    });
    this.cameraManager._applyLayoutMode();
    this._showToast('A participant left the call.');
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

    // Show Notification Badge if Chat Sidebar is currently collapsed/closed
    const sidebar = document.getElementById('sidebar');
    const badge = document.getElementById('chatNotificationBadge');
    if (sidebar && sidebar.classList.contains('collapsed') && msg.senderName !== 'You') {
      if (badge) badge.style.display = 'block';
      this._showToast(`💬 New message from ${msg.senderName}`);
    }
  }

  _bindControls() {
    // Copy meeting URL
    document.getElementById('btnCopyRoom').onclick = () => {
      navigator.clipboard.writeText(window.location.href);
      this._showToast('Meeting link copied! Send it to your team.');
    };

    // Mic Mute Toggle
    const btnMic = document.getElementById('btnMicToggle');
    if (btnMic) {
      btnMic.onclick = () => {
        if (this.localStream) {
          const audio = this.localStream.getAudioTracks()[0];
          if (audio) {
            audio.enabled = !audio.enabled;
            btnMic.classList.toggle('danger', !audio.enabled);
            btnMic.innerText = audio.enabled ? '🎤' : '🔇';
            this._showToast(audio.enabled ? 'Microphone Active' : 'Microphone Muted');
          }
        }
      };
    }

    // Camera Video On/Off Toggle
    const btnVideo = document.getElementById('btnVideoToggle');
    if (btnVideo) {
      btnVideo.onclick = () => {
        if (this.localStream) {
          const videoTrack = this.localStream.getVideoTracks()[0];
          if (videoTrack) {
            videoTrack.enabled = !videoTrack.enabled;
            btnVideo.classList.toggle('danger', !videoTrack.enabled);
            btnVideo.innerText = videoTrack.enabled ? '📹' : '📷';
            this._showToast(videoTrack.enabled ? 'Camera Started' : 'Camera Stopped');
          }
        }
      };
    }

    // Front / Rear Mobile Camera Switcher (Native Android & iOS WebRTC)
    const handleSwitchCamera = async () => {
      if (!this.localStream) {
        this._showToast('No active camera to switch');
        return;
      }
      try {
        this._showToast('Switching camera...');
        const result = await this.cameraManager.switchMobileCamera(this.localStream.id, async (newTrack) => {
          if (this.client) {
            await this.client.replaceVideoTrack(newTrack);
          }
        });
        const modeLabel = result.facingMode === 'environment' ? 'Rear / Back Camera' : 'Front Selfie Camera';
        this._showToast(`Active: ${modeLabel}`);
      } catch (err) {
        console.error('Camera switch failed:', err);
        this._showToast('Could not switch camera hardware');
      }
    };

    const btnSwitchCam = document.getElementById('btnSwitchCamera');
    if (btnSwitchCam) {
      btnSwitchCam.onclick = handleSwitchCamera;
    }

    const mBtnSwitchCam = document.getElementById('mBtnSwitchCamera');
    if (mBtnSwitchCam) {
      mBtnSwitchCam.onclick = () => {
        document.getElementById('modalMobileActions')?.classList.remove('open');
        handleSwitchCamera();
      };
    }

    // Entire Screen Share
    let activeScreenStream = null;
    let activeScreenId = null;

    const handleScreenShare = async () => {
      // If already sharing screen, toggle off
      if (activeScreenStream) {
        activeScreenStream.getTracks().forEach(t => t.stop());
        if (activeScreenId) {
          this.cameraManager.stopStream(activeScreenId);
          this.client.unregisterLocalStream(activeScreenId);
        }
        activeScreenStream = null;
        activeScreenId = null;
        btnShareScreen?.classList.remove('danger');
        this._showToast('Screen sharing stopped');
        return;
      }

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
        const screenId = 'screen-' + this.userId;
        activeScreenStream = screenStream;
        activeScreenId = screenId;

        btnShareScreen?.classList.add('danger');

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
        await this.client.registerLocalStream(screenStream);

        // Listen for native browser stop button
        screenTrack.onended = () => {
          this.cameraManager.stopStream(screenId);
          this.client.unregisterLocalStream(screenId);
          activeScreenStream = null;
          activeScreenId = null;
          btnShareScreen?.classList.remove('danger');
          this._showToast('Screen sharing ended');
        };
      } catch (e) {
        console.warn('Screen share canceled or not allowed', e);
      }
    };

    const btnShareScreen = document.getElementById('btnShareScreen');
    if (btnShareScreen) {
      btnShareScreen.onclick = handleScreenShare;
    }
    
    const mBtnShareScreen = document.getElementById('mBtnShareScreen');
    if (mBtnShareScreen) {
      mBtnShareScreen.onclick = () => {
        document.getElementById('modalMobileActions')?.classList.remove('open');
        handleScreenShare();
      };
    }

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
    const badge = document.getElementById('chatNotificationBadge');

    const toggleSidebar = () => {
      sidebar.classList.toggle('collapsed');
      // If opening chat drawer, dismiss unread notification badge
      if (!sidebar.classList.contains('collapsed') && badge) {
        badge.style.display = 'none';
      }
    };

    document.getElementById('btnToggleSidebar').onclick = toggleSidebar;
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

    // Leave Meeting: Stop all camera & mic hardware before teardown
    const btnLeave = document.getElementById('btnLeaveMeeting');
    if (btnLeave) {
      btnLeave.onclick = () => {
        if (confirm('Leave E-WARN NEXUS call?')) {
          // Release camera & mic hardware completely
          if (this.localStream) {
            this.localStream.getTracks().forEach(t => t.stop());
          }
          if (this.cameraManager) {
            for (const [_, item] of this.cameraManager.activeStreams) {
              if (item.stream) item.stream.getTracks().forEach(t => t.stop());
            }
          }
          if (this.client) {
            this.client.disconnect();
          }
          window.location.hash = '';
          window.location.reload();
        }
      };
    }
  }

  /**
   * Google Meet Style Fluid Multi-Touch Pinch-to-Zoom & Pan Engine
   * Works seamlessly on mobile touchscreens and desktop trackpads
   */
  _enablePinchAndPanZoom(container, videoEl, resetBtn) {
    let scale = 1;
    let translateX = 0;
    let translateY = 0;
    let startDistance = 0;
    let initialScale = 1;
    let startX = 0;
    let startY = 0;
    let isPanning = false;

    const updateTransform = () => {
      // Clamp boundaries
      scale = Math.min(Math.max(1, scale), 4.5); // 1x to 4.5x zoom
      if (scale === 1) {
        translateX = 0;
        translateY = 0;
        resetBtn.style.display = 'none';
      } else {
        resetBtn.style.display = 'flex';
        resetBtn.innerText = `🔍 ${Math.round(scale * 100)}% Reset`;
      }
      videoEl.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
    };

    resetBtn.onclick = (e) => {
      e.stopPropagation();
      scale = 1;
      translateX = 0;
      translateY = 0;
      updateTransform();
    };

    // Mobile Multi-Touch Pinch Gestures
    container.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) {
        // Pinch Zoom start
        startDistance = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        initialScale = scale;
      } else if (e.touches.length === 1 && scale > 1) {
        // Pan while zoomed
        isPanning = true;
        startX = e.touches[0].clientX - translateX;
        startY = e.touches[0].clientY - translateY;
      }
    }, { passive: true });

    container.addEventListener('touchmove', (e) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const currentDistance = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        if (startDistance > 0) {
          const factor = currentDistance / startDistance;
          scale = initialScale * factor;
          updateTransform();
        }
      } else if (e.touches.length === 1 && isPanning && scale > 1) {
        e.preventDefault();
        translateX = e.touches[0].clientX - startX;
        translateY = e.touches[0].clientY - startY;
        updateTransform();
      }
    }, { passive: false });

    container.addEventListener('touchend', (e) => {
      if (e.touches.length < 2) {
        startDistance = 0;
      }
      if (e.touches.length === 0) {
        isPanning = false;
      }
    });

    // Double Tap / Double Click to Fast Zoom 2.5x / Reset
    let lastTap = 0;
    container.addEventListener('click', (e) => {
      const now = Date.now();
      if (now - lastTap < 300) {
        e.stopPropagation();
        scale = scale > 1.2 ? 1 : 2.5;
        translateX = 0;
        translateY = 0;
        updateTransform();
      }
      lastTap = now;
    });

    // Desktop Mouse Wheel / Trackpad Pinch Zoom
    container.addEventListener('wheel', (e) => {
      if (e.ctrlKey || e.metaKey || scale > 1) {
        e.preventDefault();
        const delta = e.deltaY < 0 ? 0.15 : -0.15;
        scale += delta;
        updateTransform();
      }
    }, { passive: false });
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
