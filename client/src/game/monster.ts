import { nearestRoom, roomById, rooms, routeTo } from "./map";
import type { HudSnapshot, NoiseEvent, WorldPoint } from "./types";

export interface MonsterCallbacks {
  onAttack: () => void;
  onMode: (mode: HudSnapshot["monsterMode"]) => void;
  onNotice: (message: string) => void;
}

const SAFE_PATROL_STARTS = rooms.filter(room => Math.hypot(room.x + 17, room.z + 14) > 19);
const patrolStart = (seed: number) => SAFE_PATROL_STARTS[Math.abs(seed) % SAFE_PATROL_STARTS.length]!;

export class ListenerAI {
  x = 14;
  z = 0;
  yaw = Math.PI;
  mode: HudSnapshot["monsterMode"] = "patrol";
  private target: WorldPoint = { x: 0, z: 0 };
  private targetRoom = "relay";
  private lastKnown: WorldPoint = { x: 0, z: 0 };
  private stateTime = 0;
  private attackCooldown = 0;
  private lostSightTime = 0;
  private patrolIndex = 0;
  private route: string[] = [];
  private routeIndex = 0;
  private readonly patrolIds = ["dining", "archive", "stairwell", "boiler", "yard", "gate", "kitchen", "gallery", "relay"];
  private finalPhase = false;
  private saidChase = false;

  constructor(private readonly callbacks: MonsterCallbacks, seed = 0) {
    const start = patrolStart(seed);
    this.x = start.x;
    this.z = start.z;
    this.targetRoom = start.id;
  }

  update(dt: number, player: WorldPoint, hidden: boolean, flashlight: boolean, noises: NoiseEvent[], visible: boolean, finalPhase: boolean, holdingBreath = false) {
    this.stateTime += dt;
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    this.finalPhase = finalPhase;
    const playerDistance = Math.hypot(player.x - this.x, player.z - this.z);
    const playerRoom = nearestRoom(player.x, player.z);
    const currentRoom = nearestRoom(this.x, this.z);

    const breathingNoise = noises.some(n => (n.kind === "breathing" || n.kind === "gasping breath") && Math.hypot(n.point.x - this.x, n.point.z - this.z) < 4.0);
    const detectedInHiding = hidden && ((flashlight && playerDistance < 3.5) || (breathingNoise && playerDistance < 2.6));
    const canSee = (!hidden && visible && playerDistance < (finalPhase ? 21 : flashlight ? 16 : 11)) || detectedInHiding;

    if (detectedInHiding && this.mode !== "chase" && this.mode !== "enraged") {
      this.callbacks.onNotice(flashlight ? "LAMP BEAM REVEALED YOUR HIDING SPOT!" : "IT HEARD YOUR BREATHING INSIDE! BREAK OUT!");
    }

    if (canSee) {
      this.lostSightTime = 0;
      if (this.mode !== "chase") {
        this.setMode(finalPhase ? "enraged" : "chase");
        this.callbacks.onNotice("THE LISTENER HAS YOUR SHAPE. RUN.");
      }
      this.lastKnown = { ...player };
      this.target = { ...player };
      this.targetRoom = playerRoom.id;
      this.saidChase = true;
    } else if (this.mode === "chase" || this.mode === "enraged") {
      this.lostSightTime += dt;
      if (playerDistance > 24 || this.lostSightTime > 3.8) {
        this.setMode("search");
        this.target = { ...this.lastKnown };
        this.targetRoom = nearestRoom(this.lastKnown.x, this.lastKnown.z).id;
        this.stateTime = 0;
        this.lostSightTime = 0;
      }
    }

    if (this.mode !== "chase" && this.mode !== "enraged") {
      const audible = noises.filter(event => {
        const distance = Math.hypot(event.point.x - this.x, event.point.z - this.z);
        return distance < event.radius && event.intensity > 0.09;
      }).sort((a, b) => b.intensity - a.intensity)[0];
      if (audible && this.mode !== "investigate") {
        this.target = { ...audible.point };
        this.targetRoom = nearestRoom(audible.point.x, audible.point.z).id;
        this.setMode("investigate");
        this.stateTime = 0;
      } else if (audible && audible.intensity > 0.7) {
        this.target = { ...audible.point };
        this.targetRoom = nearestRoom(audible.point.x, audible.point.z).id;
      }
    }

    this.chooseRoute(currentRoom.id);
    this.move(dt, player, hidden, playerDistance);

    if ((this.mode === "chase" || this.mode === "enraged") && canSee && playerDistance < 1.7 && this.attackCooldown <= 0) {
      this.callbacks.onAttack();
      this.attackCooldown = 3.1;
    }

    if (this.mode === "investigate" && this.stateTime > 5.5) {
      this.setMode("search"); this.stateTime = 0;
    } else if (this.mode === "search" && this.stateTime > 7) {
      this.setMode("return"); this.stateTime = 0;
    } else if (this.mode === "return" && this.stateTime > 3.5) {
      this.setMode("patrol"); this.stateTime = 0;
    } else if (this.mode === "patrol" && this.stateTime > 8) {
      this.patrolIndex = (this.patrolIndex + 1) % this.patrolIds.length;
      this.targetRoom = this.patrolIds[this.patrolIndex]!;
      const room = roomById.get(this.targetRoom)!;
      this.target = { x: room.x, z: room.z };
      this.stateTime = 0;
    }

    if (finalPhase && this.mode !== "chase" && this.mode !== "enraged" && this.mode !== "investigate") {
      this.setMode("enraged");
      this.target = { ...this.lastKnown };
      this.targetRoom = nearestRoom(this.lastKnown.x, this.lastKnown.z).id;
    }
  }

  private chooseRoute(fromId: string) {
    if (!this.route.length || this.route[this.route.length - 1] !== this.targetRoom || this.routeIndex >= this.route.length) {
      this.route = routeTo(fromId, this.targetRoom);
      this.routeIndex = this.route.length > 1 ? 1 : 0;
    }
  }

  private move(dt: number, player: WorldPoint, hidden: boolean, playerDistance: number) {
    let goal = this.target;
    if ((this.mode === "patrol" || this.mode === "return") && this.route.length > this.routeIndex) {
      const node = roomById.get(this.route[this.routeIndex]!);
      if (node) goal = { x: node.x, z: node.z };
    }
    const dist = Math.hypot(goal.x - this.x, goal.z - this.z);
    if (dist < 1.2 && this.routeIndex < this.route.length - 1 && (this.mode === "patrol" || this.mode === "return")) {
      this.routeIndex += 1;
      const node = roomById.get(this.route[this.routeIndex]!);
      if (node) goal = { x: node.x, z: node.z };
    }
    if ((this.mode === "search" || this.mode === "investigate") && dist < 1.3) {
      this.target = { x: goal.x + Math.sin(this.stateTime * 2) * 2, z: goal.z + Math.cos(this.stateTime * 2) * 2 };
      goal = this.target;
    }
    const dx = goal.x - this.x;
    const dz = goal.z - this.z;
    const length = Math.hypot(dx, dz);
    if (length > 0.15) {
      this.yaw = Math.atan2(dx, dz);
      const speed = this.mode === "chase" || this.mode === "enraged" ? (this.finalPhase ? 4.5 : 3.75) : this.mode === "investigate" ? 2.8 : 2.2;
      this.x += (dx / length) * Math.min(length, speed * dt);
      this.z += (dz / length) * Math.min(length, speed * dt);
    }
    if (hidden && playerDistance < 4.5 && (this.mode === "search" || this.mode === "investigate")) {
      this.target = { x: player.x + 2.2, z: player.z + 1.4 };
    }
  }

  private setMode(mode: HudSnapshot["monsterMode"]) {
    if (this.mode === mode) return;
    this.mode = mode;
    this.stateTime = 0;
    this.callbacks.onMode(mode);
    if (mode === "patrol") this.saidChase = false;
  }

  reset(seed = 0) {
    this.mode = "patrol";
    const start = patrolStart(seed + 4);
    this.x = start.x; this.z = start.z; this.target = { x: start.x, z: start.z };
    this.lastKnown = { x: 0, z: 0 }; this.targetRoom = start.id; this.route = [];
    this.routeIndex = 0; this.patrolIndex = 0; this.stateTime = 0; this.attackCooldown = 0;
    this.lostSightTime = 0;
    this.callbacks.onMode("patrol");
  }
}
