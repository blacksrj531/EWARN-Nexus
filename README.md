# E-WARN NEXUS

> **Enterprise-Grade Sovereign Multi-Camera Video Collaboration Platform**  
> **Project Owner & Founder**: [Soumya Ranjan Jena (@blacksrj531)](https://github.com/blacksrj531) | **Organization**: E-WARN (*Towards Smart Future!*)

[![Deploy to GitHub Pages](https://github.com/blacksrj531/EWARN-Nexus/actions/workflows/deploy.yml/badge.svg)](https://github.com/blacksrj531/EWARN-Nexus/actions/workflows/deploy.yml)
[![Live Frontend](https://img.shields.io/badge/Live-GitHub%20Pages-blue.svg)](https://blacksrj531.github.io/EWARN-Nexus/)
[![Sovereign Backend](https://img.shields.io/badge/Signaling-Render%20WebSocket-success.svg)](https://ewarn-nexus-signaling.onrender.com/)
[![Zero Paid APIs](https://img.shields.io/badge/API%20Costs-%240.00%20(Zero%20Vendor%20Lock--in)-emerald.svg)]()
[![Zero API Keys](https://img.shields.io/badge/API%20Keys-Zero%20Required-success.svg)]()

---

## 🎯 Executive Overview

**E-WARN NEXUS** is a custom, sovereign, web-based video conferencing platform built to Google Meet and Microsoft Teams enterprise specifications. It overcomes traditional single-camera limits by enabling users to broadcast **multiple physical camera feeds simultaneously** (e.g. Integrated Webcam + External USB Camera + Inspection Microscope), while natively ingesting **Local Network IP / RTSP security cameras** directly into the call.

Unlike commercial platforms (LiveKit Cloud, Twilio, Agora, or Firebase), E-WARN NEXUS requires **zero paid cloud subscriptions, zero third-party API keys, and zero vendor lock-in**. Signaling is handled by a sovereign Node.js WebSocket engine deployed on Render, and media streams flow directly peer-to-peer via encrypted WebRTC.

---

## 🌟 Core Features & Technical Reality

### 1. Simultaneous Multi-Camera Ingest
- Stream primary laptop/phone camera for presenter face.
- Plug in one or more external USB webcams or capture cards and stream them simultaneously on separate video tiles.
- **Echo-Free Auxiliary Feeds**: Auxiliary cameras strictly enforce `{ audio: false }` to eliminate metallic feedback and room echo.
- **Cable Unplug Detection**: Hardware disconnections are automatically caught via `videoTrack.onended` and unmounted cleanly.

### 2. Google Meet Material 3 Dark UI & Director Focus Stage
- **Director Focus Stage**: Pinned 16:9 featured viewport with automatic aspect ratio constraints (`max-height: calc(100vh - 250px)`), avoiding vertical squishing or horizontal stretching.
- **Horizontal Filmstrip Tray**: All secondary cameras and remote participants dock neatly in a horizontal scrolling bottom tray (`.filmstrip-row`).
- **1-Click Stage Pinning**: Dedicated `📍` / `📌` pin button on every video tile to instantly promote or swap any feed onto the main stage.
- **Orientation Standard**: 
  - Self-view webcam is mirrored (`transform: scaleX(-1)`) for a natural reflection experience.
  - Remote participants, document cameras, and screen shares remain in their natural, unmirrored orientation so text and documents are easily readable.

### 3. Desktop & Mobile Screen Sharing
- **Dynamic Multi-Track Renegotiation**: Starting or stopping a screen share mid-call triggers an automatic SDP offer/answer renegotiation cycle so peers receive the presentation without dropping the call.
- **Single-Screen Mapping**: Deterministic card IDs prevent ghost tiles or duplicate screens when stopping and re-sharing.
- **Mobile Screen Sharing**: Integrated into the mobile **Meeting Tools** menu with OS detection for supported browsers.

### 4. Native Mobile Web App Experience
- **Fluid Multi-Touch Pinch-to-Zoom**: Pinch with two fingers to zoom into shared desktop presentations from **1.0x up to 4.5x**, with single-finger panning and a `🔍 Reset` button.
- **Front ⇄ Rear Camera Switcher**: Dedicated `🔄` button in the dock and tools sheet allows instant switching between front (selfie) and rear (environment) cameras via `RTCRtpSender.replaceTrack`.
- **Circular Touch Targets**: 44px Google Meet style bottom dock with frosted-glass backdrop (`backdrop-filter: blur(12px)`).

### 5. Local IP / Network Camera Bridge
- Ingest local network cameras (HTTP / MJPEG / Virtual relays from Hikvision, Dahua, CP Plus, Axis).
- In-memory HTML5 Canvas bridge converts the local feed into an encrypted WebRTC stream (`canvas.captureStream(24)`).
- **Zero Credential Leaks**: Embedded passwords and local IP addresses (`192.168.x.x`) are stripped from the DOM before rendering.

### 6. In-Call Real-Time Messaging & Unread Indicator
- Low-latency chat broadcasted directly through the sovereign signaling hub.
- **Pulsing Unread Badge**: A red indicator (`.chat-badge-dot`) pulses over the `💬 Chat` button when new messages arrive while the chat drawer is closed.
- **XSS Protection**: All messages are rendered via `.textContent` to mitigate script injection risks.

### 7. Clean Hardware Lifecycle Teardown
- Exiting the call via **Leave Call** calls `track.stop()` across all active media streams, ensuring camera and microphone hardware lights turn off immediately.

---

## 🔒 Security & Privacy Architecture

- **Zero API Key Footprint**: No third-party API keys are used in the codebase.
- **Media Layer**: DTLS-SRTP end-to-end hardware encryption (AES-128 / AES-256 GCM) for all WebRTC audio and video streams.
- **Client-Side Passcode Hashing**: Room security passcodes are hashed with `SHA-256` before transmission. Plaintext passwords never travel across the network.
- **Ephemeral RAM Signaling**: The backend (`server.js`) operates entirely in volatile memory. No databases, persistent session tracking, or telemetry logs are retained.

---

## 🏗️ Architecture & Deployment

```
[ Client Browser (PC / Mobile) ]
       │
       ├─── WebRTC DTLS-SRTP (Audio / Video / Screen) ───► [ Peer Browser ]
       │
       └─── Sovereign WebSocket (Signaling / Chat) ──────► [ Render Node.js Hub ]
                                                            wss://ewarn-nexus-signaling.onrender.com
```

- **Frontend**: Hosted on GitHub Pages (`https://blacksrj531.github.io/EWARN-Nexus/`).
- **Sovereign Signaling Hub**: Node.js WebSocket server running on Render (`https://ewarn-nexus-signaling.onrender.com/`).
- **STUN Infrastructure**: Public STUN cluster (`stun.l.google.com:19302`) for NAT traversal without cloud fees.

---

## 🚀 Local Development

### Prerequisites
- [Node.js](https://nodejs.org/) (v18.0.0 or higher recommended)
- Modern web browser (Chrome, Edge, Safari, Firefox)

### Installation & Run

```bash
# Clone the repository
git clone https://github.com/blacksrj531/EWARN-Nexus.git
cd EWARN-Nexus

# Install dependencies
npm install

# Start local sovereign signaling server (port 3001)
node server.js

# In a separate terminal, start Vite frontend dev server (port 3000)
npm run dev
```

Visit **`http://localhost:3000`** in your browser.

---

## 📜 License & Attribution

- **Project Lead & Founder**: Soumya Ranjan Jena ([@blacksrj531](https://github.com/blacksrj531))
- **Organization**: E-WARN (*Towards Smart Future!*)
- **License**: Proprietary / Sovereign — All Rights Reserved.
