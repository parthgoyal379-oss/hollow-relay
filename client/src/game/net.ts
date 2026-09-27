import type { ItemId, MonsterMode, WorldPoint } from "./types";
import type { SignalPayload } from "./voice";

export interface OnlinePlayerState {
  id: string; name: string; ready: boolean; connected: boolean; x: number; z: number; yaw: number;
  moving: boolean; sprinting: boolean; crouched: boolean; hidden: boolean; flashlight: boolean; battery: number;
  stamina: number; health: number; inventory: Array<{ id: ItemId; name: string }>;
  downed: boolean; eliminated: boolean; escaped: boolean; reviveProgress: number;
}
export interface OnlineRoomState {
  type: "state"; code: string; phase: "lobby" | "playing" | "results"; hostId: string; seed: number;
  elapsed: number; remaining: number; relayReady: boolean; relayPuzzleActive: boolean;
  puzzlePattern: number[]; puzzleIndex: number; gateOpen: boolean;
  teamParts: number;
  items: Array<{ id: string; type: ItemId; name: string; point: WorldPoint; collected: boolean }>;
  players: OnlinePlayerState[]; monster: { x: number; z: number; yaw: number; mode: MonsterMode };
  notice: string; roomNames: Array<{ id: string; room: string }>;
}
export type RoomEvent =
  | { type: "joined"; code: string; playerId: string; reconnectKey: string; host: boolean; reconnected?: boolean }
  | OnlineRoomState
  | { type: "signal"; from: string; payload: SignalPayload }
  | { type: "error"; message: string };

type RoomMessage = Record<string, unknown> & { type: string };

export class RoomClient {
  socket: WebSocket | null = null;
  playerId = "";
  reconnectKey = "";
  code = "";
  private name = "Survivor";
  private reconnectTimer: number | null = null;
  private attempts = 0;
  private intentionalClose = false;
  private movementAt = 0;
  onEvent: ((event: RoomEvent) => void) | null = null;
  onStatus: ((status: "connecting" | "connected" | "reconnecting" | "closed") => void) | null = null;

  connect(resume = false) {
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) return;
    this.intentionalClose = false;
    this.onStatus?.(this.attempts ? "reconnecting" : "connecting");
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${protocol}//${location.host}/api/rooms`);
    this.socket = socket;
    socket.addEventListener("open", () => {
      this.attempts = 0;
      this.onStatus?.("connected");
      if (resume && this.code && this.reconnectKey) this.send({ type: "join", code: this.code, name: this.name, reconnectKey: this.reconnectKey });
    });
    socket.addEventListener("message", event => {
      try {
        const data = JSON.parse(String(event.data)) as RoomEvent;
        if (data.type === "joined") {
          this.code = data.code; this.playerId = data.playerId; this.reconnectKey = data.reconnectKey;
          localStorage.setItem(`hollow-room:${this.code}`, JSON.stringify({ reconnectKey: this.reconnectKey, name: this.name }));
        }
        this.onEvent?.(data);
      } catch { this.onEvent?.({ type: "error", message: "The room sent an unreadable update." }); }
    });
    socket.addEventListener("close", () => {
      if (this.intentionalClose) { this.onStatus?.("closed"); return; }
      this.onStatus?.("reconnecting");
      this.scheduleReconnect();
    });
    socket.addEventListener("error", () => { this.onStatus?.("reconnecting"); });
  }

  create(name: string) { this.name = name; this.connect(); this.whenOpen(() => this.send({ type: "create", name })); }
  join(code: string, name: string) {
    this.name = name; this.code = code.trim().toUpperCase();
    try {
      const saved = JSON.parse(localStorage.getItem(`hollow-room:${this.code}`) ?? "null") as { reconnectKey?: string; name?: string } | null;
      if (saved?.reconnectKey) { this.reconnectKey = saved.reconnectKey; this.name = saved.name ?? name; }
    } catch { /* stale token */ }
    this.connect();
    this.whenOpen(() => this.send({ type: "join", code: this.code, name: this.name, reconnectKey: this.reconnectKey || undefined }));
  }
  ready(ready: boolean) { this.send({ type: "ready", ready }); }
  start() { this.send({ type: "start" }); }
  leave() { this.send({ type: "leave" }); this.close(); }
  callout(phrase: string) { this.send({ type: "callout", phrase }); }
  signal(target: string, payload: SignalPayload) { this.send({ type: "signal", target, payload }); }
  action(action: "interact" | "hide" | "flashlight" | "ping" | "drop" | "use" | "switch" | "revive", index = 0) {
    this.send({ type: "action", action, index });
  }
  move(input: { x: number; z: number; yaw: number; moving: boolean; sprinting: boolean; crouched: boolean }) {
    const now = performance.now();
    if (now - this.movementAt < 65) return;
    this.movementAt = now;
    this.send({ type: "move", ...input });
  }

  restore(code: string, name = "Survivor") {
    this.code = code.toUpperCase(); this.name = name;
    try {
      const saved = JSON.parse(localStorage.getItem(`hollow-room:${this.code}`) ?? "null") as { reconnectKey?: string; name?: string } | null;
      this.reconnectKey = saved?.reconnectKey ?? ""; this.name = saved?.name ?? name;
    } catch { this.reconnectKey = ""; }
    if (this.reconnectKey) this.connect();
  }

  close() {
    this.intentionalClose = true;
    if (this.reconnectTimer !== null) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    this.socket?.close(1000, "leave room"); this.socket = null;
    this.onStatus?.("closed");
  }

  private send(message: RoomMessage) {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
  }
  private whenOpen(callback: () => void) {
    if (this.socket?.readyState === WebSocket.OPEN) callback();
    else if (this.socket) this.socket.addEventListener("open", callback, { once: true });
  }
  private scheduleReconnect() {
    if (this.intentionalClose || !this.code || this.reconnectTimer !== null) return;
    this.attempts++;
    const delay = Math.min(10_000, 500 * 2 ** Math.min(this.attempts, 5));
    this.reconnectTimer = window.setTimeout(() => { this.reconnectTimer = null; this.connect(true); }, delay);
  }
}
