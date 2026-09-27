import type { OnlineRoomState } from "./net";

export interface CoopCallbacks {
  onCreate: (name: string) => void;
  onJoin: (code: string, name: string) => void;
  onReady: (ready: boolean) => void;
  onVoiceToggle: (enabled: boolean) => Promise<boolean>;
  onStart: () => void;
  onLeave: () => void;
  onClose: () => void;
}

export class CoopUI {
  readonly root = document.createElement("section");
  private callbacks: CoopCallbacks;
  private isHost = false;
  private isReady = false;
  private voiceEnabled = false;
  private cleanup: Array<() => void> = [];

  constructor(callbacks: CoopCallbacks) {
    this.callbacks = callbacks;
    this.root.id = "coop-overlay";
    this.root.innerHTML = `
      <div class="coop-card">
        <button class="coop-close" data-coop="close" aria-label="Close co-op">×</button>
        <span class="eyebrow">BLACKWATER FIELD NETWORK</span>
        <h2>DON'T GO<br><em>ALONE</em></h2>
        <p class="coop-copy">Create a private 5-character room or join a host. Up to four survivors share objectives, supplies, and the Listener.</p>
        <label class="coop-label" for="coop-name">CALLSIGN</label>
        <input id="coop-name" maxlength="18" autocomplete="nickname" placeholder="Survivor" />
        <div class="coop-actions">
          <button class="primary-button" data-coop="create">CREATE ROOM <span>↗</span></button>
          <div class="coop-join-row"><input id="coop-code-entry" maxlength="5" autocomplete="off" placeholder="ROOM CODE" aria-label="Room code"/><button class="text-button" data-coop="join">JOIN</button></div>
        </div>
        <div id="coop-status" role="status" aria-live="polite">Room codes are private. Share the five-character code with your crew.</div>
        <div id="coop-lobby" class="coop-lobby hidden">
          <div class="coop-code-row"><span>ROOM CODE</span><button id="coop-code" data-coop="copy" aria-label="Copy room code">----- ⧉</button></div>
          <div class="coop-slots" id="coop-slots"></div>
          <div class="coop-lobby-actions"><button class="text-button" data-coop="leave">LEAVE ROOM</button><button class="text-button" data-coop="voice">ENABLE VOICE · OPT IN</button><button class="text-button" data-coop="ready">READY</button><button class="primary-button" data-coop="start">START SHIFT <span>↗</span></button></div>
          <small id="coop-host-note">The host starts once every connected survivor is ready.</small>
        </div>
        <p class="coop-footnote">Voice is opt-in, peer-to-peer, and depends on browser/network support. Team text callouts work without a microphone.</p>
      </div>`;
    document.body.appendChild(this.root);
    this.root.addEventListener("click", this.handleClick);
    this.cleanup.push(() => this.root.removeEventListener("click", this.handleClick));
    this.root.querySelector<HTMLInputElement>("#coop-code-entry")?.addEventListener("input", this.handleCodeInput);
    this.cleanup.push(() => this.root.querySelector<HTMLInputElement>("#coop-code-entry")?.removeEventListener("input", this.handleCodeInput));
  }

  private handleCodeInput = (event: Event) => {
    const input = event.currentTarget as HTMLInputElement;
    input.value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);
  };

  private handleClick = (event: Event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-coop]");
    if (!button) return;
    const action = button.dataset.coop;
    const name = this.root.querySelector<HTMLInputElement>("#coop-name")?.value.trim() || "Survivor";
    if (action === "close") this.callbacks.onClose();
    else if (action === "create") this.callbacks.onCreate(name);
    else if (action === "join") this.callbacks.onJoin(this.root.querySelector<HTMLInputElement>("#coop-code-entry")?.value.trim() ?? "", name);
    else if (action === "ready") { this.isReady = !this.isReady; this.callbacks.onReady(this.isReady); button.textContent = this.isReady ? "NOT READY" : "READY"; }
    else if (action === "voice") {
      const requested = !this.voiceEnabled;
      void this.callbacks.onVoiceToggle(requested).then(success => {
        if (!success) return;
        this.voiceEnabled = requested;
        button.textContent = requested ? "MICROPHONE ON · MUTE" : "ENABLE VOICE · OPT IN";
      });
    }
    else if (action === "start") this.callbacks.onStart();
    else if (action === "leave") this.callbacks.onLeave();
    else if (action === "copy") {
      const code = this.root.querySelector<HTMLElement>("#coop-code")?.dataset.code ?? "";
      if (code) navigator.clipboard?.writeText(code).then(() => this.setStatus("Room code copied to clipboard."), () => this.setStatus(`Share this code: ${code}`));
    }
  };

  open() { this.root.classList.add("visible"); }
  close() { this.root.classList.remove("visible"); }

  reset() {
    this.isHost = false; this.isReady = false; this.voiceEnabled = false;
    this.root.querySelector<HTMLElement>("#coop-lobby")?.classList.add("hidden");
    this.root.querySelector<HTMLElement>(".coop-actions")?.classList.remove("hidden");
    this.root.querySelector<HTMLInputElement>("#coop-name")?.classList.remove("hidden");
    this.root.querySelector<HTMLInputElement>("#coop-code-entry")!.value = "";
    this.root.querySelector<HTMLElement>("#coop-status")?.classList.remove("hidden");
    const code = this.root.querySelector<HTMLButtonElement>("#coop-code");
    if (code) { code.textContent = "----- ⧉"; delete code.dataset.code; }
    const ready = this.root.querySelector<HTMLButtonElement>("[data-coop='ready']");
    if (ready) ready.textContent = "READY";
    const start = this.root.querySelector<HTMLButtonElement>("[data-coop='start']");
    start?.classList.add("hidden");
  }

  setStatus(message: string, error = false) {
    const status = this.root.querySelector<HTMLElement>("#coop-status");
    if (status) { status.textContent = message; status.classList.toggle("error", error); }
  }

  showRoom(state: OnlineRoomState, ownId: string) {
    const lobby = this.root.querySelector<HTMLElement>("#coop-lobby");
    const entry = this.root.querySelector<HTMLElement>(".coop-actions");
    const nameInput = this.root.querySelector<HTMLInputElement>("#coop-name");
    if (state.phase === "lobby") {
      lobby?.classList.remove("hidden"); entry?.classList.add("hidden"); nameInput?.classList.add("hidden");
      this.root.querySelector<HTMLElement>("#coop-status")?.classList.add("hidden");
      const code = this.root.querySelector<HTMLButtonElement>("#coop-code");
      if (code) { code.textContent = `${state.code}  ⧉`; code.dataset.code = state.code; }
      const self = state.players.find(player => player.id === ownId);
      this.isHost = state.hostId === ownId;
      this.isReady = self?.ready ?? false;
      const readyButton = this.root.querySelector<HTMLButtonElement>("[data-coop='ready']");
      if (readyButton) readyButton.textContent = this.isReady ? "NOT READY" : "READY";
      const startButton = this.root.querySelector<HTMLButtonElement>("[data-coop='start']");
      if (startButton) startButton.classList.toggle("hidden", !this.isHost);
      const slots = this.root.querySelector<HTMLElement>("#coop-slots");
      if (slots) slots.innerHTML = Array.from({ length: 4 }, (_, i) => {
        const player = state.players[i];
        const marker = player ? (player.id === state.hostId ? "HOST" : player.ready ? "READY" : "WAITING") : "OPEN SLOT";
        return `<div class="coop-slot ${player ? "occupied" : ""}"><i>0${i + 1}</i><strong>${player ? this.escape(player.name) : "Awaiting survivor"}</strong><small>${player ? `${marker}${player.connected ? " · CONNECTED" : " · RECONNECTING"}` : marker}</small></div>`;
      }).join("");
      this.setStatus("Share the room code with your crew. The map and objectives synchronize when the host starts.");
      this.open();
    } else if (state.phase === "playing") {
      this.close();
    } else if (state.phase === "results") {
      this.close();
      this.setStatus("The shift has ended. Leave to return to the title screen.");
    }
  }

  get host() { return this.isHost; }
  private escape(value: string) { return value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!); }

  dispose() { this.cleanup.forEach(fn => fn()); this.root.remove(); }
}
