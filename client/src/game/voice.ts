export type SignalPayload = { description?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit };
type Peer = { connection: RTCPeerConnection; audio: HTMLAudioElement; pending: RTCIceCandidateInit[] };

export class ProximityVoice {
  private peers = new Map<string, Peer>();
  private stream: MediaStream | null = null;
  private enabled = false;
  onSignal: ((target: string, payload: SignalPayload) => void) | null = null;
  onStatus: ((message: string, error?: boolean) => void) | null = null;
  get isActive() { return this.enabled; }

  async enable() {
    if (this.enabled) { this.mute(false); return; }
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("Microphone capture is not available in this browser.");
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
    this.enabled = true;
    for (const peer of this.peers.values()) for (const track of this.stream.getAudioTracks()) peer.connection.addTrack(track, this.stream);
    this.onStatus?.("Voice on · headset recommended");
  }

  mute(muted: boolean) {
    for (const track of this.stream?.getAudioTracks() ?? []) track.enabled = !muted;
    this.onStatus?.(muted ? "Microphone muted" : "Voice on · headset recommended");
  }

  async sync(ownId: string, remoteIds: string[]) {
    const active = new Set(remoteIds.filter(id => id && id !== ownId));
    for (const [id, peer] of this.peers) if (!active.has(id)) { peer.connection.close(); peer.audio.remove(); this.peers.delete(id); }
    for (const id of active) {
      if (this.peers.has(id) || ownId.localeCompare(id) > 0) continue;
      const peer = this.createPeer(id);
      try {
        const offer = await peer.connection.createOffer();
        await peer.connection.setLocalDescription(offer);
        this.send(id, { description: peer.connection.localDescription?.toJSON() });
      } catch { this.onStatus?.("Voice could not connect to a teammate.", true); }
    }
  }

  async handleSignal(from: string, payload: SignalPayload) {
    if (!from || from.length > 32 || !payload || typeof payload !== "object") return;
    const peer = this.peers.get(from) ?? this.createPeer(from);
    try {
      if (payload.description) {
        await peer.connection.setRemoteDescription(payload.description);
        for (const candidate of peer.pending.splice(0)) await peer.connection.addIceCandidate(candidate);
        if (payload.description.type === "offer") {
          const answer = await peer.connection.createAnswer();
          await peer.connection.setLocalDescription(answer);
          this.send(from, { description: peer.connection.localDescription?.toJSON() });
        }
      }
      if (payload.candidate) {
        if (peer.connection.remoteDescription) await peer.connection.addIceCandidate(payload.candidate);
        else peer.pending.push(payload.candidate);
      }
    } catch { this.onStatus?.("Voice signaling failed. The shift itself is still connected.", true); }
  }

  setDistance(id: string, meters: number) {
    const peer = this.peers.get(id);
    if (!peer) return;
    peer.audio.volume = Math.max(0, Math.min(1, (18 - meters) / 14));
    peer.audio.muted = peer.audio.volume <= 0;
  }

  dispose() {
    for (const peer of this.peers.values()) { peer.connection.close(); peer.audio.remove(); }
    this.peers.clear();
    for (const track of this.stream?.getTracks() ?? []) track.stop();
    this.stream = null; this.enabled = false;
  }

  private createPeer(id: string): Peer {
    const connection = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    const audio = document.createElement("audio");
    audio.autoplay = true; audio.setAttribute("playsinline", ""); audio.dataset.peerId = id; audio.volume = 1;
    document.body.appendChild(audio);
    const peer: Peer = { connection, audio, pending: [] };
    this.peers.set(id, peer);
    if (this.stream) for (const track of this.stream.getAudioTracks()) connection.addTrack(track, this.stream);
    connection.onicecandidate = event => { if (event.candidate) this.send(id, { candidate: event.candidate.toJSON() }); };
    connection.ontrack = event => { audio.srcObject = event.streams[0] ?? null; audio.play().catch(() => undefined); };
    connection.onconnectionstatechange = () => { if (connection.connectionState === "failed") this.onStatus?.("Voice link failed; room data remains connected.", true); };
    return peer;
  }

  private send(target: string, payload: SignalPayload) { this.onSignal?.(target, payload); }
}
