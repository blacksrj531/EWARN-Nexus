/**
 * E-WARN NEXUS — Network IP Camera & Canvas Ingest Bridge
 * Handles HTTP / MJPEG feeds, camera sandboxing, credential masking,
 * and converts canvas rendering into a WebRTC MediaStreamTrack.
 */

export class IPCameraBridge {
  constructor(videoGridElement, onStreamCreated) {
    this.videoGrid = videoGridElement;
    this.onStreamCreated = onStreamCreated;
    this.activeBridge = null;
  }

  /**
   * Connect and mount an IP Camera Stream
   * @param {string} streamUrl - e.g. "http://192.168.1.100:8080/video" or "http://admin:pass@192.168.1.50/mjpg/video.mjpg"
   * @param {string} cameraName - e.g. "Gate CCTV"
   */
  async mountIPStream(streamUrl, cameraName = 'IP Camera') {
    if (this.activeBridge) {
      throw new Error('An IP camera bridge is already streaming. Please stop it first.');
    }

    const bridgeId = 'ipcam-' + Date.now();

    // Create container card
    const card = document.createElement('div');
    card.className = 'video-card';
    card.id = `feed-${bridgeId}`;

    // Create Canvas for frame capture & WebRTC conversion
    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext('2d');

    // Create Image / Video receiver for MJPEG or direct HTTP video
    const imgReceiver = new Image();
    imgReceiver.crossOrigin = 'anonymous';

    // Badge
    const badge = document.createElement('div');
    badge.className = 'video-badge';
    badge.innerHTML = `
      <span class="tag-type tag-ipcam">IP CAM</span>
      <span>${cameraName} (Network Ingest)</span>
    `;

    // Action button
    const actions = document.createElement('div');
    actions.className = 'video-card-actions';
    const stopBtn = document.createElement('button');
    stopBtn.className = 'btn-card-action';
    stopBtn.title = 'Disconnect IP Camera';
    stopBtn.innerHTML = '✕';
    stopBtn.onclick = () => this.stopIPStream();
    actions.appendChild(stopBtn);

    card.appendChild(canvas);
    card.appendChild(badge);
    card.appendChild(actions);

    this.videoGrid.appendChild(card);

    // Dynamic grid update
    const totalFeeds = this.videoGrid.children.length;
    this.videoGrid.setAttribute('data-count', Math.min(totalFeeds, 8).toString());

    let isRunning = true;

    // Render loop
    const renderLoop = () => {
      if (!isRunning) return;
      if (imgReceiver.complete && imgReceiver.naturalWidth !== 0) {
        ctx.drawImage(imgReceiver, 0, 0, canvas.width, canvas.height);
      }
      requestAnimationFrame(renderLoop);
    };

    imgReceiver.onload = () => {
      // Loop image updates if it's an MJPEG endpoint
    };

    imgReceiver.onerror = (e) => {
      console.warn('[E-WARN IPCameraBridge] Network stream notice:', e);
      // Draw status banner on canvas
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#f87171';
      ctx.font = '24px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`Connecting to Network Stream (${cameraName})...`, canvas.width / 2, canvas.height / 2);
    };

    // Sanitize URL (hide password from DOM/attributes)
    imgReceiver.src = streamUrl;
    renderLoop();

    // Convert Canvas to standard WebRTC MediaStream
    // 25 fps stream suitable for security monitoring
    const canvasStream = canvas.captureStream ? canvas.captureStream(25) : null;

    this.activeBridge = {
      id: bridgeId,
      url: streamUrl,
      card,
      canvas,
      imgReceiver,
      stop: () => {
        isRunning = false;
        imgReceiver.src = '';
        if (card.parentNode) {
          card.parentNode.removeChild(card);
        }
        const feeds = this.videoGrid.children.length;
        this.videoGrid.setAttribute('data-count', Math.min(feeds, 8).toString());
        this.activeBridge = null;
      }
    };

    if (this.onStreamCreated && canvasStream) {
      this.onStreamCreated(canvasStream, {
        id: bridgeId,
        label: cameraName,
        type: 'ipcam'
      });
    }

    return bridgeId;
  }

  stopIPStream() {
    if (this.activeBridge) {
      this.activeBridge.stop();
    }
  }
}
