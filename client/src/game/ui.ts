import type { Action, InputController } from "./input";
import type { HudSnapshot } from "./types";
import type { OnlinePlayerState } from "./net";
import { evaluateEscape, LORE_DOCUMENTS, type LoreDocument, ITEM_EXAMINE_DATA } from "./story";

export interface UiCallbacks {
  onLobby: () => void;
  onCoop: () => void;
  onStart: () => void;
  onInteract: () => void;
  onCloseDossier: () => void;
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
  private archiveOpen = false;
  private previewDossier: LoreDocument | null = null;
  private currentPhase: HudSnapshot["phase"] = "title";
  private relayActive = false;
  private lastInventory: HudSnapshot["inventory"] = [];
  private readDossierIds = new Set<string>();

  private ecgCanvas: HTMLCanvasElement | null = null;
  private ecgCtx: CanvasRenderingContext2D | null = null;
  private ecgHistory: number[] = new Array(130).fill(14);
  private ecgPhase = 0;
  private ecgLastTime = performance.now();
  private examiningItem: HudSnapshot["inventory"][0] | null = null;

  constructor(private readonly input: InputController, callbacks: UiCallbacks) {
    this.callbacks = callbacks;
    this.root.id = "hollow-ui";
    this.root.dataset.phase = "title";
    this.root.innerHTML = `
      <div class="game-vignette"></div>
      <header class="hud-top">
        <div class="brand-lockup"><span class="brand-mark">◉</span><div><strong>THE HOLLOW RELAY</strong><small>BLACKWATER ESTATE · 1947</small></div></div>
        <div class="objective-card"><span class="eyebrow">MISSION OBJECTIVE</span><strong id="objective">Find the relay components</strong><div class="objective-progress"><i id="progress-fill"></i></div></div>
        <div class="frequency-card" id="frequency-card">
          <div class="freq-header"><small>CARRIER TUNER</small><strong>734.2 kHz</strong></div>
          <div class="freq-meter" id="freq-meter"><i id="freq-needle" style="left: 10%;"></i></div>
          <span class="freq-label" id="freq-label">STATIC // NO RESONANCE</span>
        </div>
        <button class="dossier-card" data-click="dossier-archive" aria-label="Open Classified Dossiers"><small>CLASSIFIED DOSSIERS</small><strong id="dossier-count">0 / 5</strong><span class="dossier-badge-sub">VIEW ARCHIVE [TAB]</span></button>
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
        <div class="vitals-monitor">
          <div class="ecg-row">
            <canvas id="ecg-canvas" class="ecg-canvas" width="130" height="28"></canvas>
            <div class="ecg-status-block">
              <span id="ecg-badge" class="ecg-badge fine">FINE</span>
              <span id="ecg-bpm" class="ecg-bpm">68 BPM</span>
            </div>
          </div>
          <div class="vital-row"><span>BREATH</span><div class="meter"><i id="stamina-bar"></i></div><b id="stamina-val">100</b></div>
          <div class="battery-gauge">
            <span style="font-size:7px; letter-spacing:0.12em; color:#8f887b;">LAMP</span>
            <div class="battery-cells" id="battery-cells">
              <span class="b-cell active"></span>
              <span class="b-cell active"></span>
              <span class="b-cell active"></span>
              <span class="b-cell active"></span>
              <span class="b-cell active"></span>
            </div>
            <span class="battery-pct" id="battery-pct">100%</span>
          </div>
          <div class="noise-row"><i id="noise-lamp"></i><span id="noise-label">QUIET</span><span class="flash-label" id="flash-label">LIGHT OFF</span></div>
          <i id="health-bar" style="display:none"></i><b id="health-val" style="display:none">100</b>
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

      <!-- RESIDENT EVIL DOSSIER INSPECTOR -->
      <section id="dossier-viewer" class="phase-screen dossier-modal hidden-screen">
        <div class="dossier-paper">
          <div class="dossier-stamp" id="dossier-stamp">TOP SECRET</div>
          <div class="dossier-header">
            <span class="dossier-eyebrow" id="dossier-eyebrow">OFFICE OF NAVAL RESEARCH — DIVISION 9</span>
            <h2 id="dossier-title">MEMORANDUM: FREQUENCY 734.2 kHz</h2>
            <div class="dossier-meta">
              <span id="dossier-date">OCTOBER 14, 1947</span>
              <span id="dossier-loc">BLACKWATER ESTATE</span>
            </div>
          </div>
          <div class="dossier-body" id="dossier-body"></div>
          <div class="dossier-footer" id="dossier-footer"></div>
          <div class="dossier-actions">
            <button class="primary-button" data-click="close-dossier">CLOSE DOSSIER <span>[E / ESC]</span></button>
          </div>
        </div>
      </section>

      <!-- DOSSIER ARCHIVES MODAL -->
      <section id="dossier-archive-screen" class="phase-screen hidden-screen">
        <div class="phase-frame archive-frame">
          <button class="back-button" data-click="close-archive">← RETURN TO THE HALL</button>
          <span class="eyebrow">BLACKWATER INCIDENT RECORDS</span>
          <h2>CASE FILE<br><em>ARCHIVES</em></h2>
          <p class="title-copy">Classified documents, medical logs, and telegraph transmissions uncovered within the estate.</p>
          <div class="dossier-list" id="dossier-archive-list"></div>
          <button class="primary-button" data-click="close-archive">RETURN TO SEARCH <span>↗</span></button>
        </div>
      </section>

      <!-- RESIDENT EVIL ITEM EXAMINE MODAL -->
      <section id="item-examine-modal" class="item-modal hidden-screen">
        <div class="item-examine-card">
          <div class="item-examine-header">
            <div class="item-exam-specs">
              <span id="exam-category">RELAY COMPONENT</span>
              <span id="exam-ref">ONR-SPEC-47-B</span>
              <span id="exam-weight">0.45 KG</span>
            </div>
            <h2 id="exam-title">Silver Vacuum Tube</h2>
          </div>
          <div class="item-exam-visual">
            <div class="item-exam-glyph" id="exam-glyph">⌁</div>
            <div class="item-exam-schematic" id="exam-schematic">SCHEMATIC // SPEC-47</div>
          </div>
          <div class="item-exam-description" id="exam-desc"></div>
          <div class="item-exam-protocol" id="exam-protocol"></div>
          <div class="item-exam-actions">
            <button class="primary-button" data-click="examine-use" id="exam-use-btn">USE [SPACE]</button>
            <button class="text-button" data-click="examine-drop" id="exam-drop-btn">DROP [Q]</button>
            <button class="text-button" data-click="close-examine">RETURN [ESC]</button>
          </div>
        </div>
      </section>

      <!-- TITLE SCREEN -->
      <section id="title-screen" class="phase-screen">
        <div class="phase-frame">
          <span class="eyebrow">A BIO-ACOUSTIC SURVIVAL HORROR EXPERIENCE</span>
          <h1>THE<br><em>HOLLOW</em><br>RELAY</h1>
          <p class="title-copy">October 1947. Project Resonance tuned the coastal receiver to 734.2 kHz. What answered reshaped human bone into an acoustic predator. Chief Engineer Cole hunts in the dark. Silence is your only weapon.</p>
          <div class="title-rule"></div>
          <div class="title-actions">
            <button class="primary-button" data-click="lobby">ENTER THE ESTATE <span>↗</span></button>
            <button class="text-button coop-entry" data-click="coop">ONLINE CO-OP · 1–4 SURVIVORS</button>
            <button class="text-button" data-click="help">HOW TO SURVIVE</button>
          </div>
          <div class="control-note">WASD MOVE <i>·</i> MOUSE LOOK <i>·</i> E INTERACT / READ <i>·</i> SHIFT RUN <i>·</i> C CROUCH <i>·</i> H HIDE <i>·</i> TAB ARCHIVE</div>
          <div class="edition">CASE FILE 1947-B <span>—</span> RESIDENT SURVIVAL CUT</div>
        </div>
        <div class="title-image"></div>
      </section>

      <!-- LOBBY SCREEN -->
      <section id="lobby-screen" class="phase-screen hidden-screen">
        <div class="phase-frame lobby-frame">
          <button class="back-button" data-click="back">← BACK</button>
          <span class="eyebrow">PREPARE YOURSELF</span><h2>OPERATION<br><em>BLACKWATER</em></h2>
          <p class="title-copy">A solo survival run through the infected estate. Recover Eleanor Cross's three relay components, calibrate the transmitter sequence, and escape through the hydraulic gate before dawn.</p>
          <div class="lobby-checklist">
            <span><i>01</i> RECOVER 3 RELAY MODULES <b>FUSE · SPOOL · VALVE</b></span>
            <span><i>02</i> MATCH TRANSMISSION CODES <b>3-LAMP SEQUENCE</b></span>
            <span><i>03</i> BREACH THE IRON GATE <b>GATE KEY + KEROSENE FUEL</b></span>
          </div>
          <button class="primary-button" data-click="start">BEGIN THE SHIFT <span>↗</span></button>
          <p class="lobby-footnote">One survivor · Local deterministic simulation · 15 minute countdown</p>
        </div>
      </section>

      <!-- PAUSE SCREEN -->
      <section id="pause-screen" class="phase-screen hidden-screen">
        <div class="phase-frame pause-frame">
          <span class="eyebrow">THE HOUSE IS STILL AWAKE</span>
          <h2>HOLD YOUR<br><em>BREATH</em></h2>
          <button class="primary-button" data-click="resume">RETURN TO THE HALL <span>↗</span></button>
          <button class="text-button" data-click="menu">LEAVE SHIFT</button>
          <p class="lobby-footnote">Mouse look sensitivity is tuned for precise navigation. Torch beam and peripheral bounce enabled.</p>
        </div>
      </section>

      <!-- RESULTS SCREEN -->
      <section id="results-screen" class="phase-screen hidden-screen">
        <div class="phase-frame results-frame">
          <span class="eyebrow" id="result-kicker">INCIDENT EVALUATION REPORT · BLACKWATER ESTATE</span>
          <h2 id="result-title">THE NIGHT<br><em>REMAINS</em></h2>
          <div class="rank-display">
            <div class="rank-badge" id="rank-badge">D</div>
            <div class="rank-info">
              <strong id="rank-comment">THE TRANSMISSION PROPAGATES</strong>
              <span id="rank-score">0 / 5 DOSSIERS DISCOVERED</span>
            </div>
          </div>
          <p class="title-copy" id="result-copy"></p>
          <div class="results-stats">
            <span>TIME IN ESTATE <b id="result-time">00:00</b></span>
            <span>RELAY STATUS <b id="result-relay">LOST</b></span>
            <span>EXTRACTED <b id="result-escapes">0</b></span>
            <span>SURVIVAL STATUS <b id="result-health">100%</b></span>
          </div>
          <div class="epilogue-box" id="epilogue-box"></div>
          <button class="primary-button" data-click="again">RECORD ANOTHER SHIFT <span>↗</span></button>
          <button class="text-button" data-click="menu">RETURN TO TITLE</button>
        </div>
      </section>

      <!-- HELP SCREEN -->
      <section id="help-screen" class="phase-screen hidden-screen">
        <div class="phase-frame help-frame">
          <button class="back-button" data-click="close-help">← BACK</button>
          <span class="eyebrow">FIELD SURVIVAL NOTES</span>
          <h2>DON'T LET IT<br><em>HEAR YOU</em></h2>
          <div class="help-grid">
            <span><b>MOVE</b> WASD / left stick</span>
            <span><b>LOOK</b> mouse / drag screen</span>
            <span><b>INTERACT</b> E / USE / READ</span>
            <span><b>RUN</b> hold Shift / RUN</span>
            <span><b>CROUCH / HIDE</b> C crouch · H hide in wardrobes</span>
            <span><b>EQUIPMENT</b> F torch · G ping · Q drop · Space use</span>
            <span><b>ARCHIVES</b> TAB open classified case files</span>
            <span><b>RELAY</b> 1 / 2 / 3 match signal lamps</span>
          </div>
          <p class="title-copy">Chief Engineer Cole possesses no sight. He hunts by bone resonance and floorboard vibrations. Walk slowly, crouch when entering unmapped rooms, and hide inside wardrobes before he crosses the threshold.</p>
          <button class="primary-button" data-click="lobby">UNDERSTOOD <span>↗</span></button>
        </div>
      </section>
    `;
    document.body.appendChild(this.root);
    this.ecgCanvas = this.root.querySelector<HTMLCanvasElement>("#ecg-canvas");
    if (this.ecgCanvas) {
      this.ecgCtx = this.ecgCanvas.getContext("2d");
    }
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
      else if (action === "examine-use") {
        this.callbacks.onUse();
        this.closeExamine();
      }
      else if (action === "examine-drop") {
        this.callbacks.onDrop();
        this.closeExamine();
      }
      else if (action === "close-examine") {
        this.closeExamine();
      }
      else if (action === "pause") this.callbacks.onPause();
      else if (action === "resume") { this.callbacks.onPause(); }
      else if (action === "help") { this.helpOpen = true; this.showOnly("help-screen"); }
      else if (action === "close-help") { this.helpOpen = false; this.showOnly("title-screen"); }
      else if (action === "close-dossier") {
        this.closeDossier();
      }
      else if (action === "dossier-archive") {
        this.archiveOpen = true;
        this.showOnly("dossier-archive-screen");
        this.renderArchiveList();
      }
      else if (action === "close-archive") {
        this.archiveOpen = false;
        this.showOnly("");
      }
    };

    const docClick = (event: Event) => {
      const target = (event.target as HTMLElement).closest<HTMLElement>("[data-read-doc]");
      if (!target) return;
      const docId = target.dataset.readDoc;
      const doc = LORE_DOCUMENTS.find(d => d.id === docId);
      if (doc) {
        this.previewDossier = doc;
        this.showDossier(doc);
      }
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
      const clickedItem = this.lastInventory[this.inventoryIndex];
      if (clickedItem && this.currentPhase === "playing") {
        this.examineItem(clickedItem);
      }
    };
    const relaySwitch = (event: Event) => {
      const target = (event.target as HTMLElement).closest<HTMLElement>("[data-switch]");
      if (target) this.callbacks.onPuzzleSwitch(Number(target.dataset.switch));
    };
    const callout = (event: Event) => {
      const target = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-callout]");
      if (target?.dataset.callout) this.callbacks.onCallout(target.dataset.callout);
    };
    const keyHandler = (event: KeyboardEvent) => {
      if (event.code === "Tab" && this.currentPhase === "playing") {
        event.preventDefault();
        this.archiveOpen = !this.archiveOpen;
        if (this.archiveOpen) {
          this.showOnly("dossier-archive-screen");
          this.renderArchiveList();
        } else {
          this.showOnly("");
        }
        return;
      }
      if (event.code === "Escape") {
        const examineModal = this.root.querySelector<HTMLElement>("#item-examine-modal");
        if (examineModal && !examineModal.classList.contains("hidden-screen")) {
          event.preventDefault();
          this.closeExamine();
          return;
        }
      }
      if (this.examiningItem) {
        if (event.code === "Space") {
          event.preventDefault();
          this.callbacks.onUse();
          this.closeExamine();
          return;
        }
        if (event.code === "KeyQ") {
          event.preventDefault();
          this.callbacks.onDrop();
          this.closeExamine();
          return;
        }
      }
      if (event.code === "Escape" || event.code === "KeyE") {
        const viewer = this.root.querySelector<HTMLElement>("#dossier-viewer");
        if (viewer && !viewer.classList.contains("hidden-screen")) {
          event.preventDefault();
          this.closeDossier();
          return;
        }
        if (event.code === "Escape" && this.archiveOpen) {
          event.preventDefault();
          this.archiveOpen = false;
          this.showOnly("");
          return;
        }
      }
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

    const viewer = this.root.querySelector<HTMLElement>("#dossier-viewer");
    const viewerClick = (event: MouseEvent) => {
      if (event.target === viewer) {
        this.closeDossier();
      }
    };
    viewer?.addEventListener("click", viewerClick);

    const examineModal = this.root.querySelector<HTMLElement>("#item-examine-modal");
    const examineClick = (event: MouseEvent) => {
      if (event.target === examineModal) {
        this.closeExamine();
      }
    };
    examineModal?.addEventListener("click", examineClick);

    this.root.addEventListener("click", click);
    this.root.addEventListener("click", docClick);
    this.root.addEventListener("pointerdown", down);
    window.addEventListener("pointerup", up);
    this.root.addEventListener("click", inventory);
    this.root.addEventListener("click", relaySwitch);
    this.root.addEventListener("click", callout);
    window.addEventListener("keydown", keyHandler);
    this.cleanup.push(
      () => viewer?.removeEventListener("click", viewerClick),
      () => examineModal?.removeEventListener("click", examineClick),
      () => this.root.removeEventListener("click", click),
      () => this.root.removeEventListener("click", docClick),
      () => this.root.removeEventListener("pointerdown", down),
      () => window.removeEventListener("pointerup", up),
      () => this.root.removeEventListener("click", inventory),
      () => this.root.removeEventListener("click", relaySwitch),
      () => this.root.removeEventListener("click", callout),
      () => window.removeEventListener("keydown", keyHandler)
    );

    const stick = this.root.querySelector<HTMLElement>("[data-control='joystick']")!;
    const updateStick = (event: PointerEvent) => {
      if (this.stickPointer !== event.pointerId) return;
      const dx = event.clientX - this.stickCenter.x;
      const dy = event.clientY - this.stickCenter.y;
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
    this.cleanup.push(
      () => stick.removeEventListener("pointerdown", startStick),
      () => stick.removeEventListener("pointermove", updateStick),
      () => stick.removeEventListener("pointerup", endStick),
      () => stick.removeEventListener("pointercancel", endStick)
    );
  }

  closeDossier() {
    this.previewDossier = null;
    this.callbacks.onCloseDossier();
    const viewer = this.root.querySelector<HTMLElement>("#dossier-viewer");
    viewer?.classList.add("hidden-screen");
    if (this.currentPhase === "playing") {
      this.input.requestLock();
    }
  }

  private showOnly(id: string) {
    this.root.querySelectorAll<HTMLElement>(".phase-screen").forEach(node => {
      node.classList.add("hidden-screen");
    });
    if (id) {
      const node = this.root.querySelector<HTMLElement>(`#${id}`);
      if (node) node.classList.remove("hidden-screen");
    }
    const viewer = this.root.querySelector<HTMLElement>("#dossier-viewer");
    viewer?.classList.add("hidden-screen");
    this.previewDossier = null;
    const examineModal = this.root.querySelector<HTMLElement>("#item-examine-modal");
    examineModal?.classList.add("hidden-screen");
    this.examiningItem = null;
  }

  examineItem(item: NonNullable<HudSnapshot["inventory"][0]>) {
    this.examiningItem = item;
    const modal = this.root.querySelector<HTMLElement>("#item-examine-modal");
    if (!modal) return;

    const data = ITEM_EXAMINE_DATA[item.id];
    const cat = modal.querySelector<HTMLElement>("#exam-category");
    const ref = modal.querySelector<HTMLElement>("#exam-ref");
    const weight = modal.querySelector<HTMLElement>("#exam-weight");
    const title = modal.querySelector<HTMLElement>("#exam-title");
    const glyph = modal.querySelector<HTMLElement>("#exam-glyph");
    const schematic = modal.querySelector<HTMLElement>("#exam-schematic");
    const desc = modal.querySelector<HTMLElement>("#exam-desc");
    const protocol = modal.querySelector<HTMLElement>("#exam-protocol");

    const glyphMap: Record<string, string> = {
      fuse: "⌁", spool: "◉", valve: "⊗", gateKey: "⚿", fuelCell: "▰", medkit: "+", battery: "▣", noiseMaker: "◌"
    };

    if (cat) cat.textContent = data?.category || "SURVIVAL GEAR";
    if (ref) ref.textContent = data?.militaryRef || "ITEM-SPEC-1947";
    if (weight) weight.textContent = data?.weight || "0.50 KG";
    if (title) title.textContent = data?.name || item.name;
    if (glyph) glyph.textContent = glyphMap[item.id] || "◉";
    if (schematic) schematic.textContent = `SCHEMATIC // ${data?.militaryRef || item.id.toUpperCase()}`;
    if (desc) desc.textContent = data?.description || item.name;
    if (protocol) protocol.innerHTML = `<strong>OPERATIONAL PROTOCOL:</strong> ${this.escapeText(data?.protocol || "Can be utilized or combined.")}`;

    modal.classList.remove("hidden-screen");
    if (document.pointerLockElement) {
      document.exitPointerLock?.();
    }
  }

  closeExamine() {
    this.examiningItem = null;
    const modal = this.root.querySelector<HTMLElement>("#item-examine-modal");
    modal?.classList.add("hidden-screen");
    if (this.currentPhase === "playing") {
      this.input.requestLock();
    }
  }

  private renderEcg(health: number) {
    if (!this.ecgCanvas || !this.ecgCtx) return;
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.ecgLastTime) / 1000);
    this.ecgLastTime = now;

    let bpm = 68;
    let badgeText = "FINE";
    let badgeClass = "fine";
    let color = "#52c468";

    if (health <= 25) {
      bpm = 156;
      badgeText = "DANGER";
      badgeClass = "danger";
      color = "#e23b2b";
    } else if (health <= 60) {
      bpm = 104;
      badgeText = "CAUTION";
      badgeClass = "caution";
      color = "#f0b832";
    }

    const badge = this.root.querySelector<HTMLElement>("#ecg-badge");
    if (badge) {
      badge.textContent = badgeText;
      badge.className = `ecg-badge ${badgeClass}`;
    }
    const bpmEl = this.root.querySelector<HTMLElement>("#ecg-bpm");
    if (bpmEl) bpmEl.textContent = `${bpm} BPM`;

    const bps = bpm / 60;
    this.ecgPhase = (this.ecgPhase + dt * bps) % 1;
    const p = this.ecgPhase;

    let y = 14;
    if (p >= 0.15 && p <= 0.23) {
      const sub = (p - 0.15) / 0.08;
      y -= Math.sin(sub * Math.PI) * 2.8;
    } else if (p >= 0.29 && p < 0.32) {
      const sub = (p - 0.29) / 0.03;
      y += Math.sin(sub * Math.PI) * 2.5;
    } else if (p >= 0.32 && p <= 0.37) {
      const sub = (p - 0.32) / 0.05;
      y -= Math.sin(sub * Math.PI) * 11.5;
    } else if (p > 0.37 && p <= 0.41) {
      const sub = (p - 0.37) / 0.04;
      y += Math.sin(sub * Math.PI) * 5.0;
    } else if (p >= 0.52 && p <= 0.68) {
      const sub = (p - 0.52) / 0.16;
      y -= Math.sin(sub * Math.PI) * 4.2;
    } else {
      y += (Math.random() - 0.5) * 0.8;
    }

    this.ecgHistory.shift();
    this.ecgHistory.push(y);

    const ctx = this.ecgCtx;
    ctx.clearRect(0, 0, 130, 28);

    ctx.strokeStyle = "rgba(70, 120, 80, 0.15)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 7); ctx.lineTo(130, 7);
    ctx.moveTo(0, 14); ctx.lineTo(130, 14);
    ctx.moveTo(0, 21); ctx.lineTo(130, 21);
    for (let x = 0; x < 130; x += 16) {
      ctx.moveTo(x, 0); ctx.lineTo(x, 28);
    }
    ctx.stroke();

    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 6;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let i = 0; i < this.ecgHistory.length; i++) {
      const hx = i;
      const hy = this.ecgHistory[i];
      if (i === 0) ctx.moveTo(hx, hy);
      else ctx.lineTo(hx, hy);
    }
    ctx.stroke();

    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(129, this.ecgHistory[129], 1.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  showDossier(doc: LoreDocument) {
    const viewer = this.root.querySelector<HTMLElement>("#dossier-viewer");
    if (!viewer) return;
    const stamp = viewer.querySelector<HTMLElement>("#dossier-stamp");
    const eyebrow = viewer.querySelector<HTMLElement>("#dossier-eyebrow");
    const title = viewer.querySelector<HTMLElement>("#dossier-title");
    const date = viewer.querySelector<HTMLElement>("#dossier-date");
    const loc = viewer.querySelector<HTMLElement>("#dossier-loc");
    const body = viewer.querySelector<HTMLElement>("#dossier-body");
    const footer = viewer.querySelector<HTMLElement>("#dossier-footer");

    if (stamp) stamp.textContent = doc.classifiedStamp || "CLASSIFIED";
    if (eyebrow) eyebrow.textContent = doc.subtitle;
    if (title) title.textContent = doc.title;
    if (date) date.textContent = doc.date;
    if (loc) loc.textContent = `${doc.roomName} · BLACKWATER`;
    if (body) body.innerHTML = doc.lines.map(line => `<p>${this.escapeText(line)}</p>`).join("");
    if (footer) footer.textContent = doc.footer || "";

    viewer.classList.remove("hidden-screen");
    if (document.pointerLockElement) {
      document.exitPointerLock?.();
    }
  }

  renderArchiveList() {
    const list = this.root.querySelector<HTMLElement>("#dossier-archive-list");
    if (!list) return;
    list.innerHTML = LORE_DOCUMENTS.map(doc => {
      const isUnlocked = this.readDossierIds.has(doc.id);
      if (isUnlocked) {
        return `
          <button class="dossier-item unlocked" data-read-doc="${doc.id}">
            <div>
              <strong>${this.escapeText(doc.title)}</strong>
              <small>${this.escapeText(doc.subtitle)} · ${doc.date}</small>
            </div>
            <span>READ ↗</span>
          </button>
        `;
      }
      return `
        <div class="dossier-item locked">
          <div>
            <strong>[CLASSIFIED RECORD — ENCRYPTED]</strong>
            <small>Discovered in ${doc.roomName}</small>
          </div>
          <span>LOCKED</span>
        </div>
      `;
    }).join("");
  }

  setPrompt(text: string) {
    this.prompt = text;
    const el = this.root.querySelector<HTMLElement>("#prompt");
    if (!el) return;
    if (text) {
      el.innerHTML = `<kbd>E</kbd> ${text}`;
      el.classList.add("visible");
    } else if (!this.input.isLocked && this.currentPhase === "playing") {
      el.innerHTML = `<span style="color:#c5a676; letter-spacing:0.12em; font-size:9px;">CLICK SCREEN TO CONTROL CAMERA</span>`;
      el.classList.add("visible");
    } else {
      el.innerHTML = "";
      el.classList.remove("visible");
    }
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
    const vignette = $(".game-vignette");
    if (vignette) {
      const danger = snapshot.monsterMode === "chase" || snapshot.monsterMode === "enraged" || snapshot.monsterDistance < 4.5;
      const close = !danger && snapshot.monsterDistance < 9.0;
      vignette.classList.toggle("threat-danger", danger && phase === "playing");
      vignette.classList.toggle("threat-close", close && phase === "playing");
      vignette.classList.toggle("stealth-hidden", snapshot.hidden && phase === "playing");
      vignette.classList.toggle("health-critical", snapshot.health < 35 && phase === "playing");
    }

    // Dossier inspector synchronization
    if (snapshot.activeDossier && phase === "playing") {
      this.readDossierIds.add(snapshot.activeDossier.id);
      this.showDossier(snapshot.activeDossier);
    } else if (phase !== "playing" || !this.previewDossier) {
      const viewer = $("#dossier-viewer");
      viewer?.classList.add("hidden-screen");
      if (phase !== "playing") this.previewDossier = null;
    }

    const timer = $("#timer"); if (timer) timer.textContent = fmt(snapshot.remaining);
    const objective = $("#objective"); if (objective) objective.textContent = snapshot.objective;
    const dossierCount = $("#dossier-count"); if (dossierCount) dossierCount.textContent = `${snapshot.dossiersRead} / ${snapshot.totalDossiers}`;
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

    if (phase === "playing") {
      this.renderEcg(snapshot.health);

      // 734.2 kHz Radio Frequency Meter
      const dist = snapshot.monsterDistance;
      const proximityRatio = Math.max(0, Math.min(1, (22 - dist) / 20));
      const isSpike = proximityRatio > 0.6 || snapshot.monsterMode === "chase" || snapshot.monsterMode === "enraged";
      const jitter = isSpike ? (Math.random() - 0.5) * 14 : (Math.random() - 0.5) * 2;
      const needlePct = Math.max(5, Math.min(95, 10 + proximityRatio * 78 + jitter));

      const freqMeter = $("#freq-meter");
      const freqNeedle = $("#freq-needle");
      const freqLabel = $("#freq-label");
      if (freqNeedle) freqNeedle.style.left = `${needlePct}%`;
      if (freqMeter) freqMeter.classList.toggle("spike", isSpike);
      if (freqLabel) {
        freqLabel.classList.toggle("alert", isSpike);
        if (isSpike) {
          freqLabel.textContent = "734.2 kHz CARRIER LOCK — ACOUSTIC SPIKE";
        } else if (proximityRatio > 0.2) {
          freqLabel.textContent = "SIGNAL HARMONIC DETECTED";
        } else {
          freqLabel.textContent = "STATIC // NO RESONANCE";
        }
      }

      // Flashlight Battery Cells Gauge
      const batteryCells = this.root.querySelectorAll<HTMLElement>("#battery-cells .b-cell");
      const activeCellCount = Math.round((snapshot.battery / 100) * batteryCells.length);
      batteryCells.forEach((cell, idx) => {
        cell.classList.toggle("active", idx < activeCellCount);
        cell.classList.toggle("danger", snapshot.battery <= 20);
      });
      const battPct = $("#battery-pct");
      if (battPct) battPct.textContent = `${Math.round(snapshot.battery)}%`;
    }

    this.renderInventory(snapshot.inventory, currentSlot);

    if (phase === "results") {
      const won = snapshot.escapes > 0;
      const evaluation = evaluateEscape(snapshot.elapsed, snapshot.health, snapshot.dossiersRead, snapshot.totalDossiers, won);
      const t = $("#result-title"); if (t) t.innerHTML = won ? "THE SIGNAL<br><em>GOT OUT</em>" : "THE NIGHT<br><em>REMAINS</em>";
      const kicker = $("#result-kicker"); if (kicker) kicker.textContent = evaluation.title;
      const badge = $("#rank-badge");
      if (badge) {
        badge.textContent = evaluation.rank;
        badge.className = `rank-badge rank-${evaluation.rank}`;
      }
      const rankComment = $("#rank-comment"); if (rankComment) rankComment.textContent = evaluation.rankComment;
      const rankScore = $("#rank-score"); if (rankScore) rankScore.textContent = evaluation.loreScore;
      const copy = $("#result-copy"); if (copy) copy.textContent = evaluation.survivalNotes;
      const tm = $("#result-time"); if (tm) tm.textContent = fmt(snapshot.elapsed);
      const relay = $("#result-relay"); if (relay) relay.textContent = snapshot.relayReady ? "RESTORED" : "DARK";
      const escapes = $("#result-escapes"); if (escapes) escapes.textContent = won ? "1" : "0";
      const hp = $("#result-health"); if (hp) hp.textContent = `${Math.round(snapshot.health)}%`;
      const epilogue = $("#epilogue-box"); if (epilogue) epilogue.textContent = evaluation.epilogue;
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
