/**
 * E-WARN NEXUS — Dual-Layer Chat (Room & 1-on-1) + Zero-Cloud P2P File Sharing Engine
 */

export class ChatAndFileEngine {
  constructor(localUserName, sendDataFn) {
    this.localUserName = localUserName;
    this.sendDataFn = sendDataFn;

    // Dom elements
    this.messagesContainer = document.getElementById('chatMessages');
    this.chatInput = document.getElementById('chatInput');
    this.targetSelect = document.getElementById('chatTarget');
    this.fileDropzone = document.getElementById('fileDropzone');
    this.fileList = document.getElementById('fileList');

    // Pending file transfers in memory (Zero Cloud Storage)
    this.incomingFiles = new Map(); // fileId -> { name, size, type, chunks, receivedBytes }
    this.CHUNK_SIZE = 16384; // 16 KB chunks for smooth WebRTC DataChannel flow

    this._bindEvents();
  }

  _bindEvents() {
    // Send chat on Enter
    this.chatInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.sendMessage();
    });

    // File Dropzone handlers
    this.fileDropzone.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.onchange = (e) => {
        if (e.target.files.length > 0) {
          this.sendFile(e.target.files[0]);
        }
      };
      input.click();
    });

    this.fileDropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      this.fileDropzone.style.borderColor = 'var(--accent-blue)';
    });

    this.fileDropzone.addEventListener('dragleave', () => {
      this.fileDropzone.style.borderColor = 'var(--border-medium)';
    });

    this.fileDropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      this.fileDropzone.style.borderColor = 'var(--border-medium)';
      if (e.dataTransfer.files.length > 0) {
        this.sendFile(e.dataTransfer.files[0]);
      }
    });
  }

  /**
   * Send Public or 1-on-1 Private Message
   */
  sendMessage() {
    const text = this.chatInput.value.trim();
    if (!text) return;

    const target = this.targetSelect.value; // 'ALL' or specific peerId
    const isPrivate = target !== 'ALL';

    const payload = {
      type: 'CHAT_MESSAGE',
      senderName: this.localUserName,
      text,
      timestamp: Date.now(),
      isPrivate
    };

    // Broadcast or unicast through DataChannel
    this.sendDataFn(target, payload);

    // Display locally
    this.renderMessage({
      senderName: 'You',
      text,
      timestamp: payload.timestamp,
      isSelf: true,
      isPrivate
    });

    this.chatInput.value = '';
  }

  /**
   * Handle incoming serialized data or binary file chunk
   */
  handleIncomingData(senderPeerId, rawData) {
    if (typeof rawData === 'string') {
      try {
        const msg = JSON.parse(rawData);
        if (msg.type === 'CHAT_MESSAGE') {
          this.renderMessage({
            senderName: msg.senderName,
            text: msg.text,
            timestamp: msg.timestamp,
            isSelf: false,
            isPrivate: msg.isPrivate
          });
        } else if (msg.type === 'FILE_HEADER') {
          this._initIncomingFile(senderPeerId, msg);
        }
      } catch (e) {
        console.error('[E-WARN Chat] Error parsing incoming string:', e);
      }
    } else if (rawData instanceof ArrayBuffer) {
      // Binary chunk received for active file transfer
      this._handleFileChunk(rawData);
    }
  }

  renderMessage({ senderName, text, timestamp, isSelf, isPrivate }) {
    const timeStr = new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const msgEl = document.createElement('div');
    msgEl.className = `msg-item ${isSelf ? 'self' : ''} ${isPrivate ? 'private' : ''}`;

    msgEl.innerHTML = `
      <div class="msg-meta">
        <span class="msg-sender">${isPrivate ? '🔒 (Private) ' : ''}${senderName}</span>
        <span>${timeStr}</span>
      </div>
      <div class="msg-body">${this._escapeHtml(text)}</div>
    `;

    this.messagesContainer.appendChild(msgEl);
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
  }

  /**
   * Send File direct Peer-to-Peer without cloud storage
   */
  async sendFile(file) {
    const fileId = 'file_' + Math.random().toString(36).substring(2, 9);
    const target = this.targetSelect.value;

    // 1. Send Header
    const header = {
      type: 'FILE_HEADER',
      fileId,
      name: file.name,
      size: file.size,
      mimeType: file.type,
      senderName: this.localUserName
    };

    this.sendDataFn(target, header);

    // Render outgoing file item in UI
    const fileItem = this._createFileProgressUI(file.name, file.size, true);
    this.fileList.prepend(fileItem.element);

    // 2. Read and slice binary file
    const reader = file.stream().getReader();
    let sentBytes = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // Send raw binary buffer
      this.sendDataFn(target, value.buffer);
      sentBytes += value.byteLength;

      const progress = Math.min(100, Math.round((sentBytes / file.size) * 100));
      fileItem.updateProgress(progress);
    }
  }

  _initIncomingFile(senderPeerId, header) {
    this.incomingFiles.set(header.fileId, {
      ...header,
      chunks: [],
      receivedBytes: 0,
      ui: this._createFileProgressUI(header.name, header.size, false)
    });

    const fileMeta = this.incomingFiles.get(header.fileId);
    this.fileList.prepend(fileMeta.ui.element);
  }

  _handleFileChunk(buffer) {
    // Assuming single sequential active incoming transfer for simplicity
    const active = Array.from(this.incomingFiles.values())[0];
    if (!active) return;

    active.chunks.push(buffer);
    active.receivedBytes += buffer.byteLength;

    const progress = Math.min(100, Math.round((active.receivedBytes / active.size) * 100));
    active.ui.updateProgress(progress);

    // File fully received -> Trigger instant browser download
    if (active.receivedBytes >= active.size) {
      const blob = new Blob(active.chunks, { type: active.mimeType || 'application/octet-stream' });
      const downloadUrl = URL.createObjectURL(blob);

      active.ui.showDownload(downloadUrl, active.name);
      this.incomingFiles.delete(active.fileId);
    }
  }

  _createFileProgressUI(name, size, isUpload) {
    const el = document.createElement('div');
    el.className = 'file-item';

    const formattedSize = (size / (1024 * 1024)).toFixed(2) + ' MB';
    el.innerHTML = `
      <div style="flex: 1; margin-right: 12px;">
        <div class="file-info">
          <span class="file-icon">${isUpload ? '📤' : '📥'}</span>
          <div>
            <div class="file-name" title="${name}">${name}</div>
            <div class="file-size">${formattedSize}</div>
          </div>
        </div>
        <div class="file-progress">
          <div class="file-progress-bar"></div>
        </div>
      </div>
      <div class="file-action-slot">
        <span style="font-size: 0.75rem; color: var(--text-dim);" class="progress-label">0%</span>
      </div>
    `;

    const progressBar = el.querySelector('.file-progress-bar');
    const progressLabel = el.querySelector('.progress-label');
    const actionSlot = el.querySelector('.file-action-slot');

    return {
      element: el,
      updateProgress: (pct) => {
        progressBar.style.width = `${pct}%`;
        progressLabel.innerText = `${pct}%`;
      },
      showDownload: (url, filename) => {
        actionSlot.innerHTML = `
          <a href="${url}" download="${filename}" class="btn-ctrl" style="padding: 4px 8px; font-size: 0.75rem; color: var(--accent-emerald);">
            Save File
          </a>
        `;
      }
    };
  }

  _escapeHtml(text) {
    const div = document.createElement('div');
    div.innerText = text;
    return div.innerHTML;
  }
}
