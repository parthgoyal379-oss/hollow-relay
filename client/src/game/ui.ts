import type { Action, InputController } from "./input";
import type { HudSnapshot } from "./types";
import type { OnlinePlayerState } from "./net";

export interface UiCallbacks {
  onLobby: () => void;
  onCoop: () => void;
  onStart: () => void;
  onInteract: () => void;
  onSwitch: (index: number) => void;
  onHide: () => void;
  onFlashlight: () => void;
  onPing: () => void;
  onDrop: () => void;
  onUse: () => void;
  onPuzzleSwitch: (index: number) => void;
  onCallout: (message: string) => void;
  onPause: () => void;
  onMenu: () => void;
  onAction: (action: Action, pressed: boolean) => void;
  onJoystick: (x: number, y: number) => void;
}

const fmt = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${Math.floor(seconds % 60).toString().padStart(2, "0")}`;

export class GameUI {
  readonly root = document.createElement("div");
  private prompt = "";
  private lastPhase = "";
  private callbacks: UiCallbacks;
  private cleanup: Array<() => void> = [];
  private stickPointer: number | null = null;
  private stickCenter = { x: 0, y: 0 };
  private inventoryIndex = 0;
  private helpOpen = false;
  private currentPhase: HudSnapshot["phase"] = "title";
  private relayActive = false;
  private lastInventory: HudSnapshot["inventory"] = [];

  constructor(private readonly input: InputController, callbacks: UiCallbacks) {
    this.callbacks = callbacks;
    this.root.id = "hollow-ui";
    this.root.dataset.phase = "title";
    this.root.innerHTML = `
      <div class="game-vignette"></div>
      <header class="hud-top">
        <div class="brand-lockup"><span class="brand-mark">◉</span><div><strong>THE HOLLOW RELAY</strong><small>BLACKWATER ESTATE · 03:17 AM</small></div></div>
        <div class="objective-card"><span class="eyebrow">CURRENT TRANSMISSION</span><strong id="objective">Find the relay components</strong><div class="objective-progress"><i id="progress-fill"></i></div></div>
        <div class="timer-card"><small>UNTIL DAWN</small><strong id="timer">12:00</strong><span id="phase-label">SIGNAL LOST</span></div>
        <button class="pause-button" data-click="pause" aria-label="Pause">Ⅱ</button>
      </header>
      <div id="room-name" class="room-name"></div>
      <aside id="team-roster" class="team-roster" aria-live="polite"></aside>
      <nav id="coop-comms" class="coop-comms" aria-label="Team callouts"><small>QUICK SIGNAL</small><button data-callout="HELP">HELP</button><button data-callout="MONSTER HERE">THREAT</button><button data-callout="FOLLOW ME">FOLLOW</button><button data-callout="OBJECTIVE FOUND">OBJECTIVE</button><button data-callout="ITEM FOUND">ITEM</button><button data-callout="RUN">RUN</button><button data-callout="HIDE">HIDE</button><button class="leave-shift" data-click="menu">LEAVE</button></nav>
      <div id="notice" class="notice"></div>
      <div id="prompt" class="interaction-prompt"></div>
      <div id="relay-panel" class="relay-panel"><small>RELAY REFERENCE · ALIGN IN ORDER</small><strong id="relay-code"></strong><div class="relay-switches"><button data-switch="1" aria-label="Align lamp 1">1</button><button data-switch="2" aria-label="Align lamp 2">2</button><button data-switch="3" aria-label="Align lamp 3">3</button></div><span id="relay-progress"></span></div>
      <div id="center-reticle" class="reticle">+</div>
      <div class="hud-bottom">
        <div class="vitals">
          <div class="vital-row"><span>BREATH</span><div class="meter"><i id="stamina-bar"></i></div><b id="stamina-val">100</b></div>
          <div class="vital-row"><span>INJURY</span><div class="meter injury"><i id="health-bar"></i></div><b id="health-val">100</b></div>
          <div class="noise-row"><i id="noise-lamp"></i><span id="noise-label">QUIET</span><span class="flash-label" id="flash-label">LIGHT OFF</span></div>
        </div>
        <div class="inventory" id="inventory"></div>
        <div class="threat-indicator"><span class="threat-eye" id="threat-eye">◉</span><div><b id="threat-label">THE HOUSE IS LISTENING</b><small>Keep your steps low</small></div></div>
      </div>
      <div class="mobile-controls" id="mobile-controls">
        <div class="stick-zone" data-control="joystick"><div class="stick-base"><i id="stick-knob"></i></div><small>MOVE</small></div>
        <div class="mobile-actions">
          <button class="mobile-button" data-action="crouch">CROUCH</button>
          <button class="mobile-button action-main" data-click="interact">USE</button>
          <button class="mobile-button" data-action="sprint">RUN</button>
          <button class="mobile-button" data-click="hide">HIDE</button>
          <button class="mobile-button" data-click="flashlight">LAMP</button>
          <button class="mobile-button" data-click="ping">PING</button>
        </div>
      </div>
      <section id="title-screen" class="phase-screen">
        <div class="phase-frame">
          <span class="eyebrow">A BLACKWATER ESTATE STORY</span>
          <h1>THE<br><em>HOLLOW</em><br>RELAY</h1>
          <p class="title-copy">The storm erased the road. Something in the house still answers the radio.</p>
          <div class="title-rule"></div>
          <div class="title-actions">
            <button class="primary-button" data-click="lobby">ENTER THE ESTATE <span>↗</span></button>
            <button class="text-button coop-entry" data-click="coop">ONLINE CO-OP · 1–4 SURVIVORS</button>
            <button class="text-button" data-click="help">HOW TO SURVIVE</button>
          </div>
          <div class="control-note">WASD MOVE <i>·</i> MOUSE LOOK <i>·</i> E INTERACT <i>·</i> SHIFT RUN <i>·</i> C CROUCH · H HIDE</div>
          <div class="edition">LOCAL STORY DEMO <span>—</span> BUILD 0.1</div>
        </div>
        <div class="title-image"></div>
      </section>
      <section id="lobby-screen" class="phase-screen hidden-screen">
        <div class="phase-frame lobby-frame">
          <button class="back-button" data-click="back">← BACK</button>
          <span class="eyebrow">PREPARE YOURSELF</span><h2>THE LAST<br><em>TRANSMISSION</em></h2>
          <p class="title-copy">A solo field recording from Blackwater. Find three relay parts, align the signal, and reach the iron gate before dawn.</p>
          <div class="lobby-checklist"><span><i>01</i> SCAVENGE THE ESTATE <b>3 PARTS</b></span><span><i>02</i> RESTORE THE RELAY <b>3-LAMP SEQUENCE</b></span><span><i>03</i> OPEN THE GATE <b>KEY + FUEL</b></span></div>
          <button class="primary-button" data-click="start">BEGIN THE SHIFT <span>↗</span></button>
          <p class="lobby-footnote">One survivor · Local deterministic match · 15 minute shift</p>
        </div>
      </section>
      <section id="pause-screen" class="phase-screen hidden-screen"><div class="phase-frame pause-frame"><span class="eyebrow">THE HOUSE IS STILL AWAKE</span><h2>HOLD YOUR<br><em>BREATH</em></h2><button class="primary-button" data-click="resume">RETURN TO THE HALL <span>↗</span></button><button class="text-button" data-click="menu">LEAVE SHIFT</button><p class="lobby-footnote">Settings: mouse look sensitivity is tuned for a steady turn. Reduce flashing is enabled.</p></div></section>
      <section id="results-screen" class="phase-screen hidden-screen"><div class="phase-frame results-frame"><span class="eyebrow" id="result-kicker">FIELD REPORT · BLACKWATER</span><h2 id="result-title">THE NIGHT<br><em>REMAINS</em></h2><p class="title-copy" id="result-copy"></p><div class="results-stats"><span>TIME IN ESTATE <b id="result-time">00:00</b></span><span>RELAY STATUS <b id="result-relay">LOST</b></span><span>EXTRACTED <b id="result-escapes">0</b></span><span>ITEMS CARRIED <b id="result-items">0</b></span></div><button class="primary-button" data-click="again">RECORD ANOTHER SHIFT <span>↗</span></button><button class="text-button" data-click="menu">RETURN TO TITLE</button></div></section>
      <section id="help-screen" class="phase-screen hidden-screen"><div class="phase-frame help-frame"><button class="back-button" data-click="close-help">← BACK</button><span class="eyebrow">FIELD NOTES</span><h2>DON'T LET IT<br><em>HEAR YOU</em></h2><div class="help-grid"><span><b>MOVE</b> WASD / left stick</span><span><b>LOOK</b> mouse / drag screen</span><span><b>INTERACT</b> E / USE</span><span><b>RUN</b> hold Shift / RUN</span><span><b>CROUCH / HIDE</b> C crouch · H hide near cover</span><span><b>TOOLS</b> F lamp · G ping · Q drop · Space use</span><span><b>RELAY</b> 1 / 2 / 3 lamps in order</span></div><p class="title-copy">Running and metal machinery carry through walls. Break line of sight, find a wardrobe or the dark beneath a table, and wait for the search to pass. The Listener follows evidence, not your exact position.</p><button class="primary-button" data-click="lobby">UNDERSTOOD <span>↗</span></button></div></section>
    `;
    document.body.appendChild(this.root);
    this.bind();
    this.renderInventory([]);
  }

  private bind() {
    const click = (event: Event) => {
      const target = (event.target as HTMLElement).closest<HTMLElement>("[data-click]");
      if (!target) return;
      const action = target.dataset.click;
      if (action === "lobby") this.showOnly("lobby-screen");
      else if (action === "coop") this.callbacks.onCoop();
      else if (action === "back") this.showOnly("title-screen");
      else if (action === "menu") { this.showOnly("title-screen"); this.callbacks.onMenu(); }
      else if (action === "start" || action === "again") this.callbacks.onStart();
      else if (action === "interact") this.callbacks.onInteract();
      else if (action === "hide") this.callbacks.onHide();
      else if (action === "flashlight") this.callbacks.onFlashlight();
      else if (action === "ping") this.callbacks.onPing();
      else if (action === "drop") this.callbacks.onDrop();
      else if (action === "use") this.callbacks.onUse();
      else if (action === "pause") this.callbacks.onPause();
      else if (action === "resume") { this.callbacks.onPause(); }
      else if (action === "help") { this.helpOpen = true; this.showOnly("help-screen"); }
      else if (action === "close-help") { this.helpOpen = false; this.showOnly("title-screen"); }
    };
    const down = (event: Event) => {
      const target = (event.target as HTMLElement).closest<HTMLElement>("[data-action]");
      if (target?.dataset.action) { event.preventDefault(); this.callbacks.onAction(target.dataset.action as Action, true); target.classList.add("pressed"); }
    };
    const up = (event: Event) => {
      const target = (event.target as HTMLElement).closest<HTMLElement>("[data-action]");
      if (target?.dataset.action) { this.callbacks.onAction(target.dataset.action as Action, false); target.classList.remove("pressed"); }
    };
    const inventory = (event: Event) => {
      const target = (event.target as HTMLElement).closest<HTMLElement>("[data-slot]");
      if (!target) return;
      this.inventoryIndex = Number(target.dataset.slot || 0);
      document.querySelectorAll(".inventory-slot").forEach(el => el.classList.remove("selected"));
      target.classList.add("selected");
      this.callbacks.onSwitch(this.inventoryIndex);
    };
    const relaySwitch = (event: Event) => {
      const target = (event.target as HTMLElement).closest<HTMLElement>("[data-switch]");
      if (target) this.callbacks.onPuzzleSwitch(Number(target.dataset.switch));
    };
    const callout = (event: Event) => {
      const target = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-callout]");
      if (target?.dataset.callout) this.callbacks.onCallout(target.dataset.callout);
    };
    const relayKey = (event: KeyboardEvent) => {
      if (this.currentPhase !== "playing" || !/^Digit[1-4]$/.test(event.code)) return;
      event.preventDefault();
      const value = Number(event.code.slice(-1));
      if (this.relayActive && value <= 3) this.callbacks.onPuzzleSwitch(value);
      else if (!this.relayActive) {
        this.inventoryIndex = value - 1;
        this.callbacks.onSwitch(this.inventoryIndex);
        this.renderInventory(this.lastInventory, this.inventoryIndex);
      }
    };
    this.root.addEventListener("click", click);
    this.root.addEventListener("pointerdown", down);
    window.addEventListener("pointerup", up);
    this.root.addEventListener("click", inventory);
    this.root.addEventListener("click", relaySwitch);
    this.root.addEventListener("click", callout);
    window.addEventListener("keydown", relayKey);
    this.cleanup.push(() => this.root.removeEventListener("click", click), () => this.root.removeEventListener("pointerdown", down), () => window.removeEventListener("pointerup", up), () => this.root.removeEventListener("click", inventory), () => this.root.removeEventListener("click", relaySwitch), () => this.root.removeEventListener("click", callout), () => window.removeEventListener("keydown", relayKey));
    const stick = this.root.querySelector<HTMLElement>("[data-control='joystick']")!;
    const updateStick = (event: PointerEvent) => {
      if (this.stickPointer !== event.pointerId) return;
      const dx = event.clientX - this.stickCenter.x;
      const dy = event.clientY - this.stickCenter.y;
      const length = Math.max(38, Math.hypot(dx, dy));
      const x = Math.max(-1, Math.min(1, dx / 44));
      const y = Math.max(-1, Math.min(1, dy / 44));
      const knob = this.root.querySelector<HTMLElement>("#stick-knob");
      if (knob) knob.style.transform = `translate(${x * 22}px, ${y * 22}px)`;
      this.callbacks.onJoystick(x, y);
    };
    const startStick = (event: PointerEvent) => {
      event.preventDefault(); this.stickPointer = event.pointerId; this.stickCenter = { x: event.clientX, y: event.clientY };
      stick.setPointerCapture?.(event.pointerId); updateStick(event);
    };
    const endStick = (event: PointerEvent) => {
      if (this.stickPointer !== event.pointerId) return;
      this.stickPointer = null; this.callbacks.onJoystick(0, 0);
      const knob = this.root.querySelector<HTMLElement>("#stick-knob"); if (knob) knob.style.transform = "translate(0,0)";
    };
    stick.addEventListener("pointerdown", startStick);
    stick.addEventListener("pointermove", updateStick);
    stick.addEventListener("pointerup", endStick);
    stick.addEventListener("pointercancel", endStick);
    this.cleanup.push(() => stick.removeEventListener("pointerdown", startStick), () => stick.removeEventListener("pointermove", updateStick), () => stick.removeEventListener("pointerup", endStick), () => stick.removeEventListener("pointercancel", endStick));
  }

  private showOnly(id: string) {
    this.root.querySelectorAll<HTMLElement>(".phase-screen").forEach(node => node.classList.add("hidden-screen"));
    if (!id) return;
    const node = this.root.querySelector<HTMLElement>(`#${id}`);
    if (node) node.classList.remove("hidden-screen");
  }

  setPrompt(text: string) {
    this.prompt = text;
    const el = this.root.querySelector<HTMLElement>("#prompt");
    if (el) { el.innerHTML = text ? `<kbd>E</kbd> ${text}` : ""; el.classList.toggle("visible", Boolean(text)); }
  }

  renderTeam(players: OnlinePlayerState[], ownId: string) {
    const root = this.root.querySelector<HTMLElement>("#team-roster");
    if (!root) return;
    root.classList.toggle("visible", players.length > 1 && this.currentPhase === "playing");
    this.root.querySelector<HTMLElement>("#coop-comms")?.classList.toggle("visible", players.length > 1 && this.currentPhase === "playing");
    root.innerHTML = players.filter(player => player.id !== ownId).map(player => {
      const status = player.escaped ? "OUT" : player.eliminated ? "LOST" : player.downed ? `DOWN · ${Math.round(player.reviveProgress / 8 * 100)}%` : player.connected ? `${Math.round(player.health)} HP` : "RECONNECTING";
      return `<div class="team-player ${player.downed ? "downed" : ""} ${player.escaped ? "escaped" : ""}"><i></i><b>${this.escapeText(player.name)}</b><small>${status}</small></div>`;
    }).join("");
  }

  private escapeText(value: string) { return value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!); }

  render(snapshot: HudSnapshot, totalItems: number, currentSlot: number) {
    const phase = snapshot.phase;
    this.currentPhase = phase;
    this.relayActive = snapshot.relayPuzzleActive;
    this.lastInventory = snapshot.inventory;
    this.root.dataset.phase = phase;
    const chromeOff = phase !== "playing";
    this.root.querySelectorAll<HTMLElement>(".hud-top, .hud-bottom, .room-name, .notice, .interaction-prompt, .reticle, .mobile-controls, .relay-panel, .coop-comms").forEach(node => node.classList.toggle("ui-off", chromeOff));
    if (phase !== this.lastPhase) {
      this.lastPhase = phase;
      if (phase === "playing") this.showOnly("");
      if (phase === "paused") this.showOnly("pause-screen");
      if (phase === "results") this.showOnly("results-screen");
      if (phase === "title") this.showOnly("title-screen");
    }
    const $ = <T extends HTMLElement>(selector: string) => this.root.querySelector<T>(selector);
    const timer = $("#timer"); if (timer) timer.textContent = fmt(snapshot.remaining);
    const objective = $("#objective"); if (objective) objective.textContent = snapshot.objective;
    const progress = $("#progress-fill"); if (progress) progress.style.width = `${snapshot.relayReady ? snapshot.gateOpen ? 100 : 70 : Math.min(64, snapshot.relayParts * 14 + (snapshot.relayReady ? 25 : 0))}%`;
    const stamina = $("#stamina-bar"); if (stamina) stamina.style.width = `${snapshot.stamina}%`;
    const health = $("#health-bar"); if (health) health.style.width = `${snapshot.health}%`;
    const sv = $("#stamina-val"); if (sv) sv.textContent = Math.round(snapshot.stamina).toString();
    const hv = $("#health-val"); if (hv) hv.textContent = Math.round(snapshot.health).toString();
    const noise = $("#noise-lamp"); if (noise) noise.classList.toggle("hot", snapshot.noise > 0.45);
    const label = $("#noise-label"); if (label) label.textContent = snapshot.noise > 0.62 ? "LOUD" : snapshot.noise > 0.28 ? "AUDIBLE" : "QUIET";
    const flash = $("#flash-label"); if (flash) flash.textContent = snapshot.flashlight ? `LAMP ${Math.round(snapshot.battery)}%` : "LIGHT OFF";
    const room = $("#room-name"); if (room) room.textContent = snapshot.room;
    const relayPanel = $("#relay-panel"); relayPanel?.classList.toggle("open", phase === "playing" && snapshot.relayPuzzleActive);
    const relayCode = $("#relay-code"); if (relayCode) relayCode.textContent = snapshot.puzzlePattern.join("  ·  ");
    const relayProgress = $("#relay-progress"); if (relayProgress) relayProgress.textContent = `${snapshot.puzzleIndex} / 3 LAMPS ALIGNED`;
    const notice = $("#notice"); if (notice) { notice.textContent = snapshot.notice; notice.classList.toggle("show", Boolean(snapshot.notice)); }
    const modeText: Record<string, string> = { patrol: "THE HOUSE IS LISTENING", investigate: "SOMETHING DREW IT CLOSER", search: "IT IS SEARCHING", chase: "IT HAS YOUR SHAPE", enraged: "THE LAST SIGNAL", return: "FOOTSTEPS RECEDING" };
    const threat = $("#threat-label"); if (threat) threat.textContent = modeText[snapshot.monsterMode] ?? "THE HOUSE IS LISTENING";
    const eye = $("#threat-eye"); if (eye) eye.classList.toggle("threat-hot", snapshot.monsterMode === "chase" || snapshot.monsterMode === "enraged");
    const criticalAt = snapshot.demo ? 8 : 60;
    const finalAt = snapshot.demo ? 24 : 180;
    const phaseLabel = $("#phase-label"); if (phaseLabel) phaseLabel.textContent = snapshot.remaining < criticalAt ? "CRITICAL" : snapshot.remaining < finalAt ? "FINAL PHASE" : "SIGNAL LOST";
    this.renderInventory(snapshot.inventory, currentSlot);
    if (phase === "results") {
      const won = snapshot.escapes > 0;
      const t = $("#result-title"); if (t) t.innerHTML = won ? "THE SIGNAL<br><em>GOT OUT</em>" : "THE NIGHT<br><em>REMAINS</em>";
      const copy = $("#result-copy"); if (copy) copy.textContent = won ? "A weak carrier tone reaches the coast. You make it past the iron gate." : "The relay falls quiet. Somewhere in Blackwater, the Listener returns to its rounds.";
      const tm = $("#result-time"); if (tm) tm.textContent = fmt(snapshot.elapsed);
      const relay = $("#result-relay"); if (relay) relay.textContent = snapshot.relayReady ? "RESTORED" : "DARK";
      const escapes = $("#result-escapes"); if (escapes) escapes.textContent = won ? "1" : "0";
      const items = $("#result-items"); if (items) items.textContent = totalItems.toString();
    }
  }

  private renderInventory(items: HudSnapshot["inventory"], active = this.inventoryIndex) {
    const root = this.root.querySelector<HTMLElement>("#inventory");
    if (!root) return;
    root.innerHTML = Array.from({ length: 4 }, (_, index) => {
      const item = items[index];
      const glyph = item ? (item.id === "fuse" ? "⌁" : item.id === "spool" ? "◉" : item.id === "valve" ? "⊗" : item.id === "gateKey" ? "⚿" : item.id === "fuelCell" ? "▰" : item.id === "medkit" ? "+" : item.id === "battery" ? "▣" : "◌") : "";
      return `<button class="inventory-slot ${index === active ? "selected" : ""}" data-slot="${index}" aria-label="Slot ${index + 1}${item ? `: ${item.name}` : " empty"}"><span class="slot-number">0${index + 1}</span><strong>${glyph}</strong><small>${item ? item.name : "EMPTY"}</small></button>`;
    }).join("");
  }

  dispose() {
    this.cleanup.forEach(fn => fn());
    this.root.remove();
  }
}
