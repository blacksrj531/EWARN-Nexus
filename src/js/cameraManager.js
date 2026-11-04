/**
 * E-WARN NEXUS — Multi-Camera Hardware Controller
 * Standard: Microsoft Azure Media Services & WebRTC Track Multiplexing
 * Capability: Ingests Laptop Webcam AND Multiple External USB Cameras Simultaneously
 */

export class CameraManager {
  constructor(videoGridElement, onStreamAdded, onStreamRemoved) {
    this.videoGrid = videoGridElement;
    this.onStreamAdded = onStreamAdded;
    this.onStreamRemoved = onStreamRemoved;
    
    // Map of active streams: streamId -> { stream, deviceId, label, type, videoElement }
    this.activeStreams = new Map();
    this.audioTrack = null;
    this.isAudioMuted = false;
  }

  /**
   * Enumerate all connected physical video capture devices
   */
  async getAvailableVideoDevices() {
    try {
      // Must request temporary permission to read hardware labels
      const tempStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      tempStream.getTracks().forEach(t => t.stop());

      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter(device => device.kind === 'videoinput');
    } catch (err) {
      console.error('[E-WARN CameraManager] Error enumerating devices:', err);
      throw err;
    }
  }

  /**
   * Start Primary Camera (Typically the integrated laptop webcam)
   */
  async startPrimaryCamera(preferredDeviceId = null) {
    try {
      const constraints = {
        video: preferredDeviceId ? { deviceId: { exact: preferredDeviceId } } : { facingMode: 'user' },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      // Store the shared audio track
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length > 0) {
        this.audioTrack = audioTracks[0];
      }

      const videoTrack = stream.getVideoTracks()[0];
      const deviceId = videoTrack.getSettings().deviceId;
      const label = videoTrack.label || 'Primary Webcam';

      this._mountStreamTile(stream, {
        id: stream.id,
        deviceId,
        label,
        type: 'webcam',
        isPrimary: true
      });

      return stream;
    } catch (err) {
      console.error('[E-WARN CameraManager] Failed to start primary camera:', err);
      throw err;
    }
  }

  /**
   * Add a Secondary / Aux Camera Feed (External USB Camera, Document Cam, etc.)
   */
  async addSecondaryCamera(deviceId, customLabel = null) {
    try {
      // Prevent duplicate capture of the exact same device
      for (const [_, item] of this.activeStreams) {
        if (item.deviceId === deviceId) {
          throw new Error('This camera device is already active in your meeting layout.');
        }
      }

      const constraints = {
        video: {
          deviceId: { exact: deviceId },
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 }
        },
        audio: false // Auxiliary cameras do not duplicate audio to prevent mic feedback
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      const videoTrack = stream.getVideoTracks()[0];
      const label = customLabel || videoTrack.label || 'USB Camera Feed';

      this._mountStreamTile(stream, {
        id: stream.id,
        deviceId,
        label,
        type: 'usb',
        isPrimary: false
      });

      return stream;
    } catch (err) {
      console.error('[E-WARN CameraManager] Failed to attach secondary camera:', err);
      throw err;
    }
  }

  /**
   * Mount stream into DOM and update the video grid layout
   */
  _mountStreamTile(stream, meta) {
    const card = document.createElement('div');
    card.className = 'video-card';
    card.id = `feed-${meta.id}`;

    const video = document.createElement('video');
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true; // Local preview is always muted to avoid local feedback
    video.srcObject = stream;

    // Badge Label
    const badge = document.createElement('div');
    badge.className = 'video-badge';
    badge.innerHTML = `
      <span class="tag-type tag-${meta.type}">${meta.type.toUpperCase()}</span>
      <span>${meta.label}</span>
    `;

    // Action Controls (Stop feed)
    const actions = document.createElement('div');
    actions.className = 'video-card-actions';
    
    if (!meta.isPrimary) {
      const stopBtn = document.createElement('button');
      stopBtn.className = 'btn-card-action';
      stopBtn.title = 'Close this camera feed';
      stopBtn.innerHTML = '✕';
      stopBtn.onclick = () => this.stopStream(meta.id);
      actions.appendChild(stopBtn);
    }

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

    this._updateGridLayout();

    if (this.onStreamAdded) {
      this.onStreamAdded(stream, meta);
    }
  }

  /**
   * Stop an individual camera stream
   */
  stopStream(streamId) {
    const streamMeta = this.activeStreams.get(streamId);
    if (!streamMeta) return;

    // Stop physical tracks to turn off camera hardware LED
    streamMeta.stream.getTracks().forEach(track => track.stop());

    // Remove from UI
    if (streamMeta.element && streamMeta.element.parentNode) {
      streamMeta.element.parentNode.removeChild(streamMeta.element);
    }

    this.activeStreams.delete(streamId);
    this._updateGridLayout();

    if (this.onStreamRemoved) {
      this.onStreamRemoved(streamId);
    }
  }

  /**
   * Toggle Audio Mute across the call
   */
  toggleAudio() {
    if (!this.audioTrack) return false;
    this.isAudioMuted = !this.isAudioMuted;
    this.audioTrack.enabled = !this.isAudioMuted;
    return !this.isAudioMuted;
  }

  /**
   * Dynamically adjust grid layout css based on active stream count
   */
  _updateGridLayout() {
    const totalFeeds = this.videoGrid.children.length;
    this.videoGrid.setAttribute('data-count', Math.min(totalFeeds, 8).toString());
  }

  /**
   * Retrieve all currently active local media tracks
   */
  getAllLocalTracks() {
    const tracks = [];
    if (this.audioTrack) tracks.push(this.audioTrack);

    for (const [_, item] of this.activeStreams) {
      const vTrack = item.stream.getVideoTracks()[0];
      if (vTrack) tracks.push(vTrack);
    }
    return tracks;
  }
}
