export type Action = "sprint" | "crouch" | "interact" | "flashlight" | "hide" | "drop" | "use" | "ping" | "pause";

const keyActions: Record<string, Action> = {
  ShiftLeft: "sprint",
  ShiftRight: "sprint",
  Shift: "sprint",
  ControlLeft: "crouch",
  ControlRight: "crouch",
  Control: "crouch",
  KeyC: "crouch",
  KeyE: "interact",
  KeyF: "flashlight",
  KeyH: "hide",
  KeyG: "ping",
  KeyQ: "drop",
  Space: "use",
  Escape: "pause",
};

export class InputController {
  private keys = new Set<string>();
  private actions = new Set<Action>();
  private consumed = new Set<Action>();
  private joyX = 0;
  private joyY = 0;
  private lookPointer: number | null = null;
  private mouseDown = false;
  private sensitivity = 0.0022;
  private disposed = false;
  onLockChange: ((locked: boolean) => void) | null = null;

  private readonly onKeyDown = (event: KeyboardEvent) => {
    const code = event.code || event.key;
    if (["Space", "Tab", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(code)) event.preventDefault();
    this.keys.add(code);
    const action = keyActions[code] ?? keyActions[event.key];
    if (action && !this.actions.has(action)) this.consumed.delete(action);
    if (action) this.actions.add(action);
  };

  private readonly onKeyUp = (event: KeyboardEvent) => {
    this.keys.delete(event.code || event.key);
    const action = keyActions[event.code] ?? keyActions[event.key];
    if (action) this.actions.delete(action);
  };

  private readonly onBlur = () => {
    this.keys.clear();
    this.actions.clear();
    this.joyX = 0;
    this.joyY = 0;
    this.mouseDown = false;
  };

  private readonly onLockEvent = () => {
    const locked = document.pointerLockElement === this.canvas;
    this.onLockChange?.(locked);
  };

  constructor(private readonly canvas: HTMLCanvasElement, private readonly onLook: (dx: number, dy: number) => void) {
    window.addEventListener("keydown", this.onKeyDown, { passive: false });
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    canvas.addEventListener("pointerdown", this.pointerDown);
    window.addEventListener("pointerdown", this.globalPointerDown);
    window.addEventListener("pointerup", this.pointerUp);
    window.addEventListener("pointercancel", this.pointerUp);
    window.addEventListener("pointermove", this.pointerMove);
    document.addEventListener("pointerlockchange", this.onLockEvent);
    canvas.addEventListener("contextmenu", this.preventContext);
  }

  get isLocked() {
    return document.pointerLockElement === this.canvas;
  }

  requestLock() {
    if (document.pointerLockElement !== this.canvas) {
      void this.canvas.requestPointerLock?.().catch(() => undefined);
    }
  }

  private readonly pointerDown = (event: PointerEvent) => {
    if ((event.target as HTMLElement)?.closest?.("[data-control], button, a, input")) return;
    if (event.pointerType === "touch") {
      this.lookPointer = event.pointerId;
      this.canvas.setPointerCapture?.(event.pointerId);
      return;
    }
    if (event.button === 0) {
      this.mouseDown = true;
      this.requestLock();
    }
  };

  private readonly globalPointerDown = (event: PointerEvent) => {
    if ((event.target as HTMLElement)?.closest?.("button, input, a, [data-control], #coop-overlay")) return;
    if (event.pointerType !== "touch" && event.button === 0) {
      this.mouseDown = true;
      // Re-acquire pointer lock on viewport click if unlocked
      if (document.pointerLockElement !== this.canvas) {
        this.requestLock();
      }
    }
  };

  private readonly pointerUp = (event: PointerEvent) => {
    if (this.lookPointer === event.pointerId) this.lookPointer = null;
    if (event.pointerType !== "touch") this.mouseDown = false;
  };

  private readonly pointerMove = (event: PointerEvent) => {
    const locked = document.pointerLockElement === this.canvas;
    if (locked || this.mouseDown) {
      this.onLook(event.movementX * this.sensitivity, event.movementY * this.sensitivity);
    } else if (event.pointerType === "touch" && this.lookPointer === event.pointerId) {
      this.onLook(event.movementX * this.sensitivity * 1.6, event.movementY * this.sensitivity * 1.6);
    }
  };

  private readonly preventContext = (event: Event) => event.preventDefault();

  movement() {
    const forward = Number(this.keys.has("KeyW") || this.keys.has("ArrowUp")) - Number(this.keys.has("KeyS") || this.keys.has("ArrowDown"));
    const strafe = Number(this.keys.has("KeyD") || this.keys.has("ArrowRight")) - Number(this.keys.has("KeyA") || this.keys.has("ArrowLeft"));
    const x = strafe + this.joyX;
    const z = -forward + this.joyY;
    const length = Math.hypot(x, z);
    return length > 1 ? { x: x / length, z: z / length } : { x, z };
  }

  down(action: Action) { return this.actions.has(action); }
  justPressed(action: Action) {
    if (!this.actions.has(action) || this.consumed.has(action)) return false;
    this.consumed.add(action);
    return true;
  }
  setAction(action: Action, down: boolean) {
    if (down && !this.actions.has(action)) this.consumed.delete(action);
    if (down) this.actions.add(action); else this.actions.delete(action);
  }
  setJoystick(x: number, y: number) {
    this.joyX = Math.max(-1, Math.min(1, x));
    this.joyY = Math.max(-1, Math.min(1, y));
  }
  clearJoystick() { this.joyX = 0; this.joyY = 0; }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    window.removeEventListener("pointerdown", this.globalPointerDown);
    window.removeEventListener("pointerup", this.pointerUp);
    window.removeEventListener("pointercancel", this.pointerUp);
    window.removeEventListener("pointermove", this.pointerMove);
    document.removeEventListener("pointerlockchange", this.onLockEvent);
    this.canvas.removeEventListener("pointerdown", this.pointerDown);
    this.canvas.removeEventListener("contextmenu", this.preventContext);
    if (document.pointerLockElement === this.canvas) document.exitPointerLock?.();
  }
}
