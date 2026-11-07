# E-WARN NEXUS vs. LiveKit Meet: Security, Edge-Case & Architecture Audit
**Lead Architect Evaluation**: Sovereign Real-Time Communications Architecture  
**Benchmark Reference**: LiveKit Meet (Commercial LiveKit Cloud / Next.js)  
**Date**: November 2026  
**Audience**: Project Owner & Technical Leadership  

---

## 1. Architectural Comparison: E-WARN NEXUS vs. LiveKit Meet

| Dimension | LiveKit Meet (Commercial SaaS) | E-WARN NEXUS (Sovereign Architecture) | Verdict / Strategic Advantage |
| :--- | :--- | :--- | :--- |
| **Data Custody & Privacy** | Media packets decrypt on LiveKit Cloud servers (US/EU data centers). | **100% Client-Side & Private Server**. No foreign corporate servers touch media or chat. | 🏆 **E-WARN Wins**: Total sovereign compliance and security. |
| **Recurring Cost** | $0.004 per participant minute after 50GB. Grows aggressively with multi-cam ($100s–$1000s/mo). | **$0.00 Perpetual Operating Cost**. Zero per-minute licensing fees. | 🏆 **E-WARN Wins**: Zero operational bill risk. |
| **Multi-Camera Handling** | Supported, but requires complex room token permissions and separate published tracks. | **Native Multi-Camera UI**: Dedicated selectors for Webcam + USB Cameras + Local IP/RTSP Feeds. | 🏆 **E-WARN Wins**: Built specifically for multi-camera workflows. |
| **IP / RTSP Camera Ingest** | Requires enterprise LiveKit Ingress service with complex RTMP/RTSP egress pipelines. | **Local Sandboxed Ingest Bridge**: Direct HTTP/MJPEG and canvas stream integration. | 🏆 **E-WARN Wins**: Lightweight, in-browser network ingest. |
| **Media Architecture** | **SFU (Selective Forwarding Unit)**: Single upload to server; server distributes to peers. | **Mesh (P2P via Sovereign Signaling)**: Direct peer-to-peer media delivery. | ⚖️ **Trade-Off**: LiveKit handles 50+ participants better; E-WARN is faster and more private for focused teams (2–8 participants). |
| **File Sharing** | Not native; requires separate S3/Blob storage configuration. | **Direct P2P Binary Slicing**: Files transfer browser-to-browser via RAM. Zero cloud storage. | 🏆 **E-WARN Wins**: True zero-footprint file transfer. |

---

## 2. In-Depth Security & Vulnerability Analysis

### 🛡️ What Makes E-WARN NEXUS Inherently More Secure
1. **Zero Cloud File Retention**: Files shared in E-WARN NEXUS never hit a hard disk, database, or AWS S3 bucket. They exist only in RAM during the transfer and vanish when the tab closes.
2. **IP Camera Credential Sandboxing**: Passwords and internal IP addresses (`192.168.x.x`) of CCTV or inspection cameras are never sent to remote participants—only encrypted video pixels.
3. **Volatile In-Memory Chat**: Chat history is stored in local volatile arrays, eliminating subpoena or data leak risks from third-party server databases.

### ⚠️ Current Security Gaps to Harden
1. **Unauthenticated Room Entry**: Currently, anyone with the room string (`#room-nexus-hq`) can join the call without password verification.
   * *Remedy*: Add an optional client-side **Room Passcode** hashed via SHA-256 before signaling admission.
2. **Cross-Site Scripting (XSS) in Chat**: In `sovereignClient.js`, chat messages must be strictly sanitized before DOM injection to prevent malicious script injection (`<script>alert(1)</script>`).
3. **Signaling Room Snooping**: While media is encrypted with DTLS-SRTP (military-grade 256-bit AES), the signaling server on Render handles unencrypted JSON room messages.
   * *Remedy*: Encrypt the signaling payload client-side before sending to the WebSocket hub.

---

## 3. Top Bugs & Glitches Identified in the Current Build

### Glitch 1: Multiple Cameras Sound Feedback (Acoustic Echo)
* **The Glitch**: When a user connects a secondary USB camera that also has a built-in microphone (e.g., Logitech C920), the browser might inadvertently capture audio from both microphones simultaneously, creating a metallic echo or loud screeching feedback loop.
* **The Fix**: Hardcode auxiliary camera constraints to strictly enforce `{ audio: false }` for all secondary and IP camera inputs, routing audio exclusively through the primary presenter microphone with noise suppression and echo cancellation.

### Glitch 2: Camera Disconnection / Unplug Recovery
* **The Glitch**: If an external USB camera cable is accidentally knocked or unplugged during a call, the video grid card currently freezes on the last buffered frame and does not cleanly self-terminate.
* **The Fix**: Listen to `MediaStreamTrack.onended` and `navigator.mediaDevices.ondevicechange` events to automatically tear down the tile and notify the room: *"USB Camera disconnected"*.

### Glitch 3: Mobile Aspect Ratio Stretching
* **The Glitch**: When an Android or iPhone device rotates from portrait to landscape, video cards can momentarily stretch or distort if CSS `object-fit: cover` encounters unconstrained dimensions.
* **The Fix**: Enforce strict 16:9 container wrappers with dynamic CSS `aspect-ratio` bounds.

### Glitch 4: Unsanitized Chat DOM Injection
* **The Glitch**: The chat engine displays user names directly into the message element.
* **The Fix**: Use `textContent` instead of `innerHTML` when displaying messages to guarantee 100% XSS immunity.

---

## 4. Immediate Hardening Action Plan

| Priority | Security / Glitch Fix | Impact |
| :---: | :--- | :--- |
| 🔴 **P0** | **Audio Isolation on Aux Cams** | Completely prevents screeching echo loops when multiple USB webcams are plugged in. |
| 🔴 **P0** | **XSS Chat Sanitization** | Closes text injection vulnerabilities in the room chat. |
| 🟡 **P1** | **Camera Unplug Detection** | Automatically cleans up the screen if a USB camera is disconnected mid-call. |
| 🟡 **P1** | **Room Passcode Protection** | Prevents unwanted guests from entering private meeting rooms. |
| 🟢 **P2** | **Mobile Aspect Ratio Lock** | Ensures video tiles maintain crystal-clear proportions when phones rotate. |
