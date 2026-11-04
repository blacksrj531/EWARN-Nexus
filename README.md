# E-WARN NEXUS

> **Enterprise-Grade Decentralized Multi-Camera Video Collaboration Platform**  
> **Project Owner & Founder**: [Soumya Ranjan Jena (@blacksrj531)](https://github.com/blacksrj531) | **Organization**: E-WARN (*Towards Smart Future!*)

[![Deploy to GitHub Pages](https://github.com/blacksrj531/EWARN-Nexus/actions/workflows/deploy.yml/badge.svg)](https://github.com/blacksrj531/EWARN-Nexus/actions/workflows/deploy.yml)
[![License: UNLICENSED](https://img.shields.io/badge/License-Proprietary-blue.svg)](LICENSE)
[![Zero Cost](https://img.shields.io/badge/Cost-%240.00-emerald.svg)]()
[![Zero API Keys](https://img.shields.io/badge/API%20Keys-Zero%20Required-success.svg)]()

---

## 🎯 Executive Overview

**E-WARN NEXUS** breaks traditional single-camera video conferencing limitations. It empowers users to broadcast **multiple physical video feeds simultaneously** (e.g., Integrated Laptop Webcam + External USB Tripod Camera + Workbench Microscope), while natively accommodating **Local Network IP / RTSP security cameras** directly into the same real-time call grid.

All data, media, and file transfers operate **purely peer-to-peer (P2P)** with zero third-party cloud storage fees, zero recurring SaaS costs, and zero external API dependencies.

---

## 🌟 Key Capabilities

1. **Simultaneous Multi-Camera Ingest**:
   - Stream primary laptop camera for presenter face.
   - Plug in one or more external USB cameras and stream them simultaneously on independent video tiles.
   - Independent mute, device switching, and layout resizing.

2. **Director Focus Stage & 1-Click Camera Swapping**:
   - **Active Stage Mode**: One large primary viewport displaying the key feed (e.g., high-res document or workbench camera), with all other feeds docked in a live, real-time mini-filmstrip.
   - **Instant 0ms Swap**: Tap or click any live thumbnail to immediately swap it into the main stage while the previous feed drops smoothly into the thumbnail dock without interrupting transmission.
   - **Smart Video Mirroring**: Self-view webcam automatically mirrors horizontally for natural interaction; external USB document cameras, IP cameras, and screen shares stay in true, unmirrored orientation.
   - **Interactive Tile Flipping**: `⇄ Flip` toggle on each card to manually invert or mirror any feed on the fly.

3. **High-Definition Entire Screen Sharing**:
   - Share entire desktop displays with optional computer audio.
   - Strictly unmirrored presentation view running concurrently with active presenter facecam.

4. **Local IP / RTSP Camera Integration**:
   - Ingest local network cameras (HTTP/MJPEG/Virtual relays from Hikvision, Dahua, CP Plus, Axis).
   - In-memory HTML5 Canvas bridge converts the local feed into an encrypted WebRTC stream.
   - **Zero Network Leakage**: Camera credentials and internal IP addresses (`192.168.x.x`) remain strictly sandboxed in your local browser; remote participants only receive encrypted video pixels.

5. **Dual-Layer Real-Time Messaging**:
   - **Public Room Broadcast**: Low-latency communication to all connected room members.
   - **Private 1-on-1 Chat**: Direct, peer-to-peer encrypted messaging between any two individuals.
   - **Zero Cloud Footprint**: Messages live in volatile RAM only and are permanently destroyed when the session terminates.

6. **Direct Zero-Cloud P2P File Sharing**:
   - Chunked binary streaming (16KB/64KB) over WebRTC DataChannels.
   - Instant progress indicators and direct browser-memory download.
   - Zero file storage compliance risk or cloud bucket fees.

7. **Mobile-First Responsive Layout & Worldwide Low Latency**:
   - Zero button overlaps across iPhones, Android devices, tablets, and wide monitors.
   - Intelligent collapsible "••• More Actions" sheet on mobile devices.
   - Direct P2P media routing via Google STUN with **50ms – 150ms glass-to-glass latency**.

---

## 🚀 Quickstart & Local Development

### Prerequisites
- [Node.js](https://nodejs.org/) (v18.0.0 or higher recommended; v24 verified)
- Modern web browser (Google Chrome, Microsoft Edge, Safari, Firefox)

### Installation
```bash
# Clone the repository
git clone https://github.com/blacksrj531/EWARN-Nexus.git
cd EWARN-Nexus

# Install Vite dev dependencies
npm install

# Start local high-speed dev server
npm run dev
```

The application will launch automatically at:
👉 **`http://localhost:3000`**

---

## 🌐 Production Deployment via GitHub Pages

This repository includes an automated GitHub Action (`.github/workflows/deploy.yml`).

1. Ensure GitHub Pages is enabled in your repository:
   - Navigate to **Settings** > **Pages**.
   - Under **Build and deployment**, set **Source** to **GitHub Actions**.
2. Any commit pushed to the `main` branch automatically builds and deploys to:
   👉 **`https://blacksrj531.github.io/EWARN-Nexus/`**

---

## 🔒 Security & Privacy Architecture

- **Media Layer**: DTLS-SRTP end-to-end hardware encryption (AES-128 / AES-256 GCM).
- **Data Layer**: SCTP over DTLS for chat and file transfers.
- **Privacy Standard**: Zero persistent databases, zero cookies, zero telemetry tracking.

---

## 👥 Project Ownership & Leadership
- **Project Owner & Founder**: [Soumya Ranjan Jena (@blacksrj531)](https://github.com/blacksrj531)
- **Organization**: E-WARN
- **Motto**: *Towards Smart Future!*
- **Architectural Reference**: [Technical Blueprint](EWARN_NEXUS_TECHNICAL_BLUEPRINT.md)
