/**
 * E-WARN NEXUS — Multi-Camera Hardware Controller & Director Focus Stage Engine
 * Standards: Google Chromium Media Stream & Apple Director Stage Layout
 */

export class CameraManager {
  constructor(videoGridElement, onStreamAdded, onStreamRemoved) {
    this.videoGrid = videoGridElement;
    this.onStreamAdded = onStreamAdded;
    this.onStreamRemoved = onStreamRemoved;

    // Active streams map: streamId -> { stream, deviceId, label, type, isMirrored, element, videoElement }
    this.activeStreams = new Map();
    this.audioTrack = null;
    this.isAudioMuted = false;

    // Layout Mode: 'stage' (Director Focus Mode) vs 'grid' (Equal Grid)
    this.layoutMode = 'stage';
    this.featuredStreamId = null;
  }

  /**
   * Enumerate physical capture devices
   */
  async getAvailableVideoDevices() {
    try {
      const tempStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      tempStream.getTracks().forEach(t => t.stop());
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter(d => d.kind === 'videoinput');
    } catch (err) {
      console.error('[E-WARN CameraManager] Device enumeration error:', err);
      throw err;
    }
  }

  /**
   * Start Primary Presenter Webcam (Default: Mirrored for natural self-view)
   */
  async startPrimaryCamera(preferredDeviceId = null) {
    try {
      const constraints = {
        video: preferredDeviceId ? { deviceId: { exact: preferredDeviceId } } : { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length > 0) {
        this.audioTrack = audioTracks[0];
      }

      const videoTrack = stream.getVideoTracks()[0];
      const deviceId = videoTrack.getSettings().deviceId;
      const label = videoTrack.label || 'Presenter Webcam';

      this._mountStreamTile(stream, {
        id: stream.id,
        deviceId,
        label,
        type: 'webcam',
        isPrimary: true,
        isMirrored: true // Natural mirror for self face
      });

      return stream;
    } catch (err) {
      console.error('[E-WARN CameraManager] Primary camera error:', err);
      throw err;
    }
  }

  /**
   * Add External USB Camera Feed (Default: Unmirrored for readable documents/text)
   */
  async addSecondaryCamera(deviceId, customLabel = null) {
    try {
      for (const [_, item] of this.activeStreams) {
        if (item.deviceId === deviceId) {
          throw new Error('This camera hardware is already active in your meeting.');
        }
      }

      const constraints = {
        video: {
          deviceId: { exact: deviceId },
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 24 }
        },
        audio: false // STRICT P0: Never capture audio from secondary USB cameras to eliminate metallic echo feedback
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      const videoTrack = stream.getVideoTracks()[0];
      const label = customLabel || videoTrack.label || 'Auxiliary USB Camera';

      // P1: Handle physical cable disconnect / snag cleanly
      videoTrack.onended = () => {
        console.warn(`[E-WARN CameraManager] Hardware disconnected for feed: ${label}`);
        this.stopStream(stream.id);
      };

      this._mountStreamTile(stream, {
        id: stream.id,
        deviceId,
        label,
        type: 'usb',
        isPrimary: false,
        isMirrored: false
      });

      return stream;
    } catch (err) {
      console.error('[E-WARN CameraManager] USB camera error:', err);
      throw err;
    }
  }

  /**
   * Mount stream into DOM with Director Stage & Flip capabilities
   */
  _mountStreamTile(stream, meta) {
    const card = document.createElement('div');
    card.className = `video-card ${meta.isMirrored ? 'mirrored' : ''}`;
    card.id = `feed-${meta.id}`;
    card.dataset.streamId = meta.id;

    const video = document.createElement('video');
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true;
    video.srcObject = stream;

    // Badge Label
    const badge = document.createElement('div');
    badge.className = 'video-badge';
    badge.innerHTML = `
      <span class="tag-type tag-${meta.type}">${meta.type.toUpperCase()}</span>
      <span>${meta.label}</span>
    `;

    // Action Controls (Flip Mirror, Stop feed)
    const actions = document.createElement('div');
    actions.className = 'video-card-actions';

    // Flip Mirror Toggle Button
    const flipBtn = document.createElement('button');
    flipBtn.className = 'btn-card-action';
    flipBtn.title = 'Flip / Mirror orientation';
    flipBtn.innerHTML = '⇄';
    flipBtn.onclick = (e) => {
      e.stopPropagation();
      this.toggleMirror(meta.id);
    };
    actions.appendChild(flipBtn);

    // Stop Feed Button
    if (!meta.isPrimary) {
      const stopBtn = document.createElement('button');
      stopBtn.className = 'btn-card-action';
      stopBtn.title = 'Close this camera feed';
      stopBtn.innerHTML = '✕';
      stopBtn.onclick = (e) => {
        e.stopPropagation();
        this.stopStream(meta.id);
      };
      actions.appendChild(stopBtn);
    }

    // Tap or Click to Focus / Swap into Main Stage
    card.onclick = () => {
      this.setFeaturedStream(meta.id);
    };

    card.appendChild(video);
    card.appendChild(badge);
    card.appendChild(actions);

    this.videoGrid.appendChild(card);

    this.activeStreams.set(meta.id, {
      ...meta,
      stream,
      element: card,
      videoElement: video
    });

    // Default first stream to be featured
    if (!this.featuredStreamId) {
      this.featuredStreamId = meta.id;
    }

    this._applyLayoutMode();

    if (this.onStreamAdded) {
      this.onStreamAdded(stream, meta);
    }
  }

  /**
   * Toggle Mirroring on an individual video feed
   */
  toggleMirror(streamId) {
    const item = this.activeStreams.get(streamId);
    if (!item) return;
    item.isMirrored = !item.isMirrored;
    item.element.classList.toggle('mirrored', item.isMirrored);
  }

  /**
   * Set a specific stream to be the large Featured Stage
   */
  setFeaturedStream(streamId) {
    if (!this.activeStreams.has(streamId)) return;
    this.featuredStreamId = streamId;
    this._applyLayoutMode();
  }

  /**
   * Toggle between Director Stage and Equal Grid
   */
  toggleLayoutMode() {
    this.layoutMode = this.layoutMode === 'stage' ? 'grid' : 'stage';
    this._applyLayoutMode();
    return this.layoutMode;
  }

  _applyLayoutMode() {
    const totalFeeds = this.videoGrid.children.length;
    this.videoGrid.setAttribute('data-mode', this.layoutMode);
    this.videoGrid.setAttribute('data-count', Math.min(totalFeeds, 8).toString());

    // Highlight featured feed, dock the others (applies to both local and remote cards)
    const cards = Array.from(this.videoGrid.querySelectorAll('.video-card'));
    for (const card of cards) {
      const isFeatured = (this.layoutMode === 'stage' && (card.dataset.streamId === this.featuredStreamId || card.id === this.featuredStreamId));
      card.classList.toggle('featured-stage', isFeatured);
    }
  }

  stopStream(streamId) {
    const item = this.activeStreams.get(streamId);
    if (!item) return;

    item.stream.getTracks().forEach(t => t.stop());
    if (item.element && item.element.parentNode) {
      item.element.parentNode.removeChild(item.element);
    }

    this.activeStreams.delete(streamId);

    // If the stopped stream was featured, switch focus to another active stream
    if (this.featuredStreamId === streamId) {
      const remainingIds = Array.from(this.activeStreams.keys());
      this.featuredStreamId = remainingIds.length > 0 ? remainingIds[0] : null;
    }

    this._applyLayoutMode();

    if (this.onStreamRemoved) {
      this.onStreamRemoved(streamId);
    }
  }

  toggleAudio() {
    if (!this.audioTrack) return false;
    this.isAudioMuted = !this.isAudioMuted;
    this.audioTrack.enabled = !this.isAudioMuted;
    return !this.isAudioMuted;
  }
}
