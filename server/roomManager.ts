import { randomBytes, randomInt } from "node:crypto";
import { isWalkable, lineWalkable, roomAt, rooms, routeTo, spawnPoints } from "../client/src/game/map";
import type { ItemId, MonsterMode, NoiseEvent, WorldItem, WorldPoint } from "../client/src/game/types";
import { ListenerAI } from "../client/src/game/monster";

type Phase = "lobby" | "playing" | "results";
type Peer = { send: (data: string) => void; readyState?: number };
type ClientMessage =
  | { type: "create"; name?: string }
  | { type: "join"; code: string; name?: string; reconnectKey?: string }
  | { type: "ready"; ready: boolean }
  | { type: "start" }
  | { type: "move"; x: number; z: number; yaw: number; moving: boolean; sprinting: boolean; crouched: boolean }
  | { type: "action"; action: "interact" | "hide" | "flashlight" | "ping" | "drop" | "use" | "switch" | "revive"; index?: number }
  | { type: "callout"; phrase: string }
  | { type: "signal"; target: string; payload: unknown }
  | { type: "leave" };

type Player = {
  id: string; name: string; reconnectKey: string; ready: boolean; connected: boolean;
  x: number; z: number; yaw: number; moving: boolean; sprinting: boolean; crouched: boolean;
  hidden: boolean; flashlight: boolean; battery: number; stamina: number; health: number;
  inventory: Array<{ id: ItemId; name: string }>; downed: boolean; eliminated: boolean; escaped: boolean;
  downedAt: number; downs: number; reviveTarget: string | null; reviveProgress: number; lastMoveAt: number;
};
type Room = {
  code: string; hostId: string; phase: Phase; seed: number; createdAt: number; lastActive: number;
  players: Map<string, Player>; peers: Map<string, Peer>; elapsed: number; maxTime: number;
  items: WorldItem[]; relayReady: boolean; relayPuzzleActive: boolean; puzzlePattern: number[]; puzzleIndex: number; gateOpen: boolean;
  monster: ListenerAI; monsterMode: MonsterMode; monsterNotice: string; noiseEvents: NoiseEvent[]; notice: string; noticeUntil: number;
};

const ITEM_NAMES: Record<ItemId, string> = {
  fuse: "Ceramic Fuse", spool: "Copper Spool", valve: "Brass Valve", gateKey: "Gate Key",
  fuelCell: "Fuel Canister", medkit: "Field Dressing", noiseMaker: "Clockwork Decoy", battery: "Flashlight Cell",
};
const ROOM_CHARS = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const safeName = (value?: string) => (value ?? "Survivor").replace(/[<>\u0000-\u001f]/g, "").trim().slice(0, 18) || "Survivor";
const distance = (a: WorldPoint, b: WorldPoint) => Math.hypot(a.x - b.x, a.z - b.z);
const publicPlayer = (p: Player) => ({
  id: p.id, name: p.name, ready: p.ready, connected: p.connected, x: p.x, z: p.z, yaw: p.yaw,
  moving: p.moving, sprinting: p.sprinting, crouched: p.crouched, hidden: p.hidden,
  flashlight: p.flashlight, battery: p.battery, stamina: p.stamina, health: p.health,
  inventory: p.inventory, downed: p.downed, eliminated: p.eliminated, escaped: p.escaped,
  reviveProgress: p.reviveProgress,
});

export class RoomManager {
  private rooms = new Map<string, Room>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastTick = Date.now();
  private broadcastAccumulator = 0;
  private actionTimes = new WeakMap<Peer, number>();

  get roomCount() { return this.rooms.size; }

  receive(peer: Peer, raw: string | Buffer) {
    if (peer.readyState !== undefined && peer.readyState !== 1) return;
    let message: ClientMessage;
    try { message = JSON.parse(raw.toString()) as ClientMessage; }
    catch { this.send(peer, { type: "error", message: "That message was not understood." }); return; }
    if (!message || typeof message.type !== "string") return;
    const prior = this.actionTimes.get(peer) ?? 0;
    if (message.type === "move" && Date.now() - prior < 45) return;
    if ((message.type === "action" || message.type === "callout") && Date.now() - prior < 90) return;
    if (message.type === "move" || message.type === "action" || message.type === "callout") this.actionTimes.set(peer, Date.now());

    if (message.type === "create") { this.create(peer, message.name); return; }
    if (message.type === "join") { this.join(peer, message.code, message.name, message.reconnectKey); return; }
    const found = this.findPlayer(peer);
    if (!found) { this.send(peer, { type: "error", message: "Create or join a room first." }); return; }
    const { room, player } = found;
    room.lastActive = Date.now();
    if (message.type === "ready") {
      if (room.phase !== "lobby") return;
      player.ready = Boolean(message.ready);
      this.broadcast(room);
    } else if (message.type === "start") {
      if (room.phase !== "lobby") return;
      if (player.id !== room.hostId) { this.send(peer, { type: "error", message: "Only the room host can start the shift." }); return; }
      if ([...room.players.values()].some(p => p.connected && !p.ready)) { this.send(peer, { type: "error", message: "Everyone must be ready first." }); return; }
      this.startRoom(room);
      this.broadcast(room);
    } else if (message.type === "move") {
      if (room.phase !== "playing" || player.eliminated || player.escaped) return;
      this.movePlayer(room, player, message);
    } else if (message.type === "action") {
      if (room.phase !== "playing" || player.eliminated || player.escaped) return;
      this.act(room, player, message.action, message.index);
      this.broadcast(room);
    } else if (message.type === "callout") {
      const allowed = ["HELP", "MONSTER HERE", "FOLLOW ME", "OBJECTIVE FOUND", "ITEM FOUND", "RUN", "HIDE"];
      if (allowed.includes(message.phrase)) { this.say(room, `${player.name}: ${message.phrase}`); this.broadcast(room); }
    } else if (message.type === "signal") {
      const target = room.players.get(message.target);
      const targetPeer = room.peers.get(message.target);
      if (target && target.connected && targetPeer && message.target !== player.id) {
        const rawPayload = JSON.stringify(message.payload ?? {});
        if (rawPayload.length <= 4_000) this.send(targetPeer, { type: "signal", from: player.id, payload: JSON.parse(rawPayload) });
      }
    } else if (message.type === "leave") {
      this.removePlayer(room, player);
      this.broadcast(room);
    }
  }

  disconnected(peer: Peer) {
    const found = this.findPlayer(peer);
    if (!found) return;
    const { room, player } = found;
    player.connected = false;
    room.peers.delete(player.id);
    if (room.hostId === player.id) room.hostId = [...room.players.values()].find(candidate => candidate.connected)?.id ?? player.id;
    room.lastActive = Date.now();
    this.broadcast(room);
  }

  dispose() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.rooms.clear();
  }

  private create(peer: Peer, name?: string) {
    const code = this.newCode();
    const id = randomBytes(8).toString("hex");
    const reconnectKey = randomBytes(24).toString("base64url");
    const seed = randomInt(1, 0x7fffffff);
    const player = this.newPlayer(id, name, reconnectKey, 0);
    const room: Room = {
      code, hostId: id, phase: "lobby", seed, createdAt: Date.now(), lastActive: Date.now(),
      players: new Map([[id, player]]), peers: new Map([[id, peer]]), elapsed: 0, maxTime: 900, items: [],
      relayReady: false, relayPuzzleActive: false, puzzlePattern: seed % 2 ? [2, 1, 3] : [1, 3, 2], puzzleIndex: 0, gateOpen: false,
      monster: new ListenerAI({ onAttack: () => this.attackNearest(room), onMode: mode => { room.monsterMode = mode; }, onNotice: text => { room.monsterNotice = text; } }, seed),
      monsterMode: "patrol", monsterNotice: "", noiseEvents: [], notice: "Waiting for the others.", noticeUntil: Date.now() + 5000,
    };
    this.rooms.set(code, room);
    this.send(peer, { type: "joined", code, playerId: id, reconnectKey, host: true });
    this.broadcast(room);
    this.ensureTimer();
  }

  private join(peer: Peer, rawCode: string, name?: string, reconnectKey?: string) {
    const code = String(rawCode ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
    const room = this.rooms.get(code);
    if (!room) { this.send(peer, { type: "error", message: "Room not found. Check the code with your host." }); return; }
    const reconnect = reconnectKey ? [...room.players.values()].find(p => p.reconnectKey === reconnectKey) : undefined;
    if (reconnect) {
      if (reconnect.connected) { this.send(peer, { type: "error", message: "That survivor is already connected." }); return; }
      reconnect.connected = true;
      room.peers.set(reconnect.id, peer);
      room.lastActive = Date.now();
      this.send(peer, { type: "joined", code, playerId: reconnect.id, reconnectKey: reconnect.reconnectKey, host: reconnect.id === room.hostId, reconnected: true });
      this.broadcast(room);
      return;
    }
    if (room.phase !== "lobby") { this.send(peer, { type: "error", message: "This shift has already started." }); return; }
    if (room.players.size >= 4) { this.send(peer, { type: "error", message: "This room is full (4 survivors maximum)." }); return; }
    const id = randomBytes(8).toString("hex");
    const key = randomBytes(24).toString("base64url");
    const player = this.newPlayer(id, name, key, room.players.size);
    room.players.set(id, player); room.peers.set(id, peer); room.lastActive = Date.now();
    this.send(peer, { type: "joined", code, playerId: id, reconnectKey: key, host: false });
    this.broadcast(room);
  }

  private newCode() {
    for (let tries = 0; tries < 100; tries++) {
      let code = "";
      for (let i = 0; i < 5; i++) code += ROOM_CHARS[randomInt(ROOM_CHARS.length)];
      if (!this.rooms.has(code)) return code;
    }
    return randomBytes(4).toString("hex").slice(0, 5).toUpperCase();
  }

  private newPlayer(id: string, name: string | undefined, reconnectKey: string, index: number): Player {
    const spawn = { x: -17 + index * 0.55, z: -14 + index * 0.45 };
    return {
      id, name: safeName(name), reconnectKey, ready: index === 0, connected: true,
      x: spawn.x, z: spawn.z, yaw: 0.2, moving: false, sprinting: false, crouched: false,
      hidden: false, flashlight: true, battery: 100, stamina: 100, health: 100, inventory: [],
      downed: false, eliminated: false, escaped: false, downedAt: 0, reviveTarget: null, reviveProgress: 0, lastMoveAt: Date.now(),
      downs: 0,
    };
  }

  private startRoom(room: Room) {
    room.phase = "playing"; room.elapsed = 0; room.lastActive = Date.now();
    const random = this.seeded(room.seed);
    const pool = [...spawnPoints].sort(() => random() - 0.5);
    const types: ItemId[] = ["fuse", "spool", "valve", "gateKey", "fuelCell", "medkit", "noiseMaker", "battery"];
    room.items = types.map((type, index) => {
      const point = pool[index % pool.length]!;
      return { id: `${type}-${index}`, type, name: ITEM_NAMES[type], point: { x: point.x + (random() - 0.5) * 2, z: point.z + (random() - 0.5) * 2 }, collected: false };
    });
    room.relayReady = false; room.relayPuzzleActive = false; room.puzzleIndex = 0; room.gateOpen = false;
    room.noiseEvents = []; room.notice = "The storm drowned the last transmission."; room.noticeUntil = Date.now() + 5000;
    for (const [index, player] of [...room.players.values()].entries()) {
      const spawn = { x: -17 + index * 0.55, z: -14 + index * 0.45 };
      player.x = spawn.x; player.z = spawn.z; player.health = 100; player.stamina = 100; player.battery = 100;
      player.inventory = []; player.hidden = false; player.flashlight = true; player.downed = false; player.eliminated = false; player.escaped = false;
      player.downs = 0; player.reviveTarget = null; player.reviveProgress = 0;
      player.lastMoveAt = Date.now();
    }
    room.monster.reset(room.seed);
    room.monsterMode = "patrol";
  }

  private movePlayer(room: Room, p: Player, message: Extract<ClientMessage, { type: "move" }>) {
    const x = Number(message.x), z = Number(message.z), yaw = Number(message.yaw);
    if (![x, z, yaw].every(Number.isFinite)) return;
    const now = Date.now();
    // A stalled/idle client must not bank seconds of movement credit and turn
    // its next packet into a teleport. Keep a small lag allowance only.
    const dt = Math.max(0.04, Math.min(0.14, (now - p.lastMoveAt) / 1000));
    const maxStep = (message.sprinting && p.stamina > 4 && !message.crouched ? 5.6 : message.crouched ? 2 : 3.7) * dt + 0.18;
    const dx = x - p.x, dz = z - p.z, distanceMoved = Math.hypot(dx, dz);
    const targetX = distanceMoved > maxStep && distanceMoved > 0 ? p.x + dx / distanceMoved * maxStep : x;
    const targetZ = distanceMoved > maxStep && distanceMoved > 0 ? p.z + dz / distanceMoved * maxStep : z;
    if (isWalkable(targetX, targetZ)) { p.x = targetX; p.z = targetZ; }
    else {
      if (isWalkable(targetX, p.z)) p.x = targetX;
      if (isWalkable(p.x, targetZ)) p.z = targetZ;
    }
    if (Math.abs(p.x) > 38 || p.z > 24 || p.z < -44) { p.x = -17; p.z = -14; }
    p.yaw = Math.atan2(Math.sin(yaw), Math.cos(yaw));
    p.moving = Boolean(message.moving); p.sprinting = Boolean(message.sprinting); p.crouched = Boolean(message.crouched);
    p.lastMoveAt = now;
    if (p.moving && p.sprinting) this.makeNoise(room, p, 0.2, "running steps");
    else if (p.moving) this.makeNoise(room, p, p.crouched ? 0.025 : 0.075, "footsteps");
  }

  private act(room: Room, player: Player, action: Extract<ClientMessage, { type: "action" }>['action'], index = 0) {
    const point = { x: player.x, z: player.z };
    if (action === "interact") {
      if (player.downed) return;
      const downed = [...room.players.values()].find(other => other.downed && !other.eliminated && distance(point, other) < 2.6);
      if (downed) { player.reviveTarget = downed.id; player.reviveProgress = 0; this.say(room, `${player.name} is trying to pull ${downed.name} back.`); this.makeNoise(room, player, 0.4, "revive attempt"); return; }
      const item = room.items.filter(entry => !entry.collected).map(entry => ({ entry, d: distance(point, entry.point) })).filter(x => x.d <= 2.6).sort((a, b) => a.d - b.d)[0]?.entry;
      if (item) {
        if (player.inventory.length >= 4) { this.say(room, "Four slots. Drop something first."); return; }
        item.collected = true; player.inventory.push({ id: item.type, name: item.name });
        this.makeNoise(room, player, 0.14, "item picked up"); this.say(room, `${player.name} found ${item.name}.`); return;
      }
      if (Math.hypot(point.x, point.z) < 5.4 && !room.relayReady) {
        const required: ItemId[] = ["fuse", "spool", "valve"];
        const inventory = this.allPlayers(room).flatMap(p => p.inventory);
        const parts = required.filter(id => inventory.some(item => item.id === id)).length;
        if (parts < 3) { this.say(room, `Relay needs a fuse, spool, and valve. ${parts}/3 types secured by the team.`); return; }
        if (!room.relayPuzzleActive) {
          room.relayPuzzleActive = true; room.puzzleIndex = 0; this.say(room, "The relay is live. Match the three signal lamps in order."); return;
        }
        this.act(room, player, "switch", room.puzzlePattern[room.puzzleIndex]);
        return;
      }
      if (Math.hypot(point.x - 28, point.z + 28) < 5) {
        if (room.gateOpen) {
          player.escaped = true; player.hidden = false; this.say(room, `${player.name} escaped through the iron gate.`); this.checkEnd(room); return;
        }
        const all = this.allPlayers(room);
        const hasKey = all.some(p => p.inventory.some(i => i.id === "gateKey"));
        const hasFuel = all.some(p => p.inventory.some(i => i.id === "fuelCell"));
        if (!room.relayReady) { this.say(room, "No signal. The gate lock is dead."); return; }
        if (!hasKey || !hasFuel) { this.say(room, "The team needs the gate key and a fuel canister."); return; }
        this.consumeFromTeam(room, ["gateKey", "fuelCell"]);
        room.gateOpen = true; this.makeNoise(room, player, 0.95, "gate mechanism"); this.say(room, "The gate groans open. RUN."); return;
      }
      this.say(room, "Nothing here answers.");
    } else if (action === "switch") {
      if (!room.relayPuzzleActive || room.relayReady || index < 1 || index > 3) return;
      if (room.puzzlePattern[room.puzzleIndex] === index) {
        room.puzzleIndex++; this.makeNoise(room, player, 0.16, "relay switch");
        if (room.puzzleIndex >= 3) {
          room.relayReady = true; room.relayPuzzleActive = false; this.consumeFromTeam(room, ["fuse", "spool", "valve"]);
          this.say(room, "RELAY RESTORED. The gate is waking in the yard.");
        } else this.say(room, `${player.name} aligned a lamp. ${room.puzzleIndex}/3.`);
      } else { room.puzzleIndex = 0; this.makeNoise(room, player, 0.42, "relay feedback"); this.say(room, "Feedback shrieks through the hall. Sequence reset."); }
    } else if (action === "hide") {
      if (player.hidden) { player.hidden = false; this.say(room, `${player.name} leaves cover.`); this.makeNoise(room, player, 0.05, "movement"); }
      else {
        const hide = rooms.flatMap(r => r.hiding).find(h => distance(point, h) < 4.1);
        if (hide) { player.hidden = true; this.say(room, `${player.name} folds into a hiding place.`); this.makeNoise(room, player, 0.035, "hiding"); }
        else this.say(room, "No cover close enough.");
      }
    } else if (action === "flashlight") {
      if (player.battery <= 0) this.say(room, "No battery left.");
      else { player.flashlight = !player.flashlight; this.makeNoise(room, player, 0.025, "flashlight click"); }
    } else if (action === "ping") this.makeNoise(room, player, 0.24, "survivor ping");
    else if (action === "drop") {
      const item = player.inventory.splice(Math.max(0, Math.min(player.inventory.length - 1, index)), 1)[0];
      if (!item) return;
      room.items.push({ id: `drop-${randomBytes(4).toString("hex")}`, type: item.id, name: item.name, point: { x: player.x + 0.55, z: player.z + 0.45 }, collected: false });
      this.makeNoise(room, player, 0.28, "dropped item");
    } else if (action === "use") {
      const slot = Math.max(0, Math.min(player.inventory.length - 1, index));
      const item = player.inventory[slot];
      if (item?.id === "medkit" && player.health < 100) { player.inventory.splice(slot, 1); player.health = Math.min(100, player.health + 45); this.say(room, `${player.name} applies a field dressing.`); }
      else if (item?.id === "battery" && player.battery < 85) { player.inventory.splice(slot, 1); player.battery = 100; }
      else if (item?.id === "noiseMaker") { player.inventory.splice(slot, 1); this.makeNoise(room, player, 0.78, "clockwork decoy"); }
      else this.say(room, "No usable item selected.");
    } else if (action === "revive") {
      const target = player.reviveTarget ? room.players.get(player.reviveTarget) : undefined;
      if (!target || !target.downed || distance(player, target) > 3.2) { player.reviveTarget = null; player.reviveProgress = 0; return; }
      player.reviveProgress += 0.25;
      if (player.reviveProgress >= 8) {
        target.downed = false; target.health = 42; target.downedAt = 0; player.reviveTarget = null; player.reviveProgress = 0;
        this.makeNoise(room, player, 0.52, "survivor revived"); this.say(room, `${target.name} is back on their feet.`);
      }
    }
  }

  private makeNoise(room: Room, player: Player, intensity: number, kind: string) {
    room.noiseEvents.push({ point: { x: player.x, z: player.z }, radius: 6 + intensity * 34, intensity, kind, at: Date.now() });
    if (room.noiseEvents.length > 30) room.noiseEvents.shift();
  }

  private tick() {
    const now = Date.now();
    const dt = Math.max(0, Math.min(0.12, (now - this.lastTick) / 1000));
    this.lastTick = now;
    this.broadcastAccumulator += dt;
    for (const room of [...this.rooms.values()]) {
      if (room.phase === "playing") this.tickRoom(room, dt, now);
      else if (room.phase === "results" && now - room.lastActive > 600_000) this.rooms.delete(room.code);
      else if (room.phase === "lobby" && now - room.lastActive > 1_800_000) this.rooms.delete(room.code);
    }
    if (this.broadcastAccumulator >= 0.1) {
      this.broadcastAccumulator = 0;
      for (const room of this.rooms.values()) this.broadcast(room);
    }
    if (!this.rooms.size && this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  private tickRoom(room: Room, dt: number, now: number) {
    room.elapsed += dt;
    room.noiseEvents = room.noiseEvents.filter(e => now - e.at < 12_000);
    if (room.elapsed >= room.maxTime) { room.phase = "results"; this.say(room, "Dawn reaches the estate. The shift is over."); room.lastActive = now; return; }
    const players = [...room.players.values()].filter(p => p.connected && !p.eliminated && !p.escaped && !p.downed);
    for (const p of room.players.values()) {
      if (p.downed && now - p.downedAt > 28_000) { p.downed = false; p.eliminated = true; p.reviveTarget = null; }
      if (!p.connected || p.eliminated || p.escaped) continue;
      if (p.sprinting && p.moving && !p.crouched && p.stamina > 4) p.stamina = Math.max(0, p.stamina - 17 * dt);
      else p.stamina = Math.min(100, p.stamina + (p.moving ? 8 : 15) * dt);
      if (p.flashlight) { p.battery = Math.max(0, p.battery - 0.9 * dt); if (p.battery === 0) p.flashlight = false; }
      if (p.reviveTarget) {
        const target = room.players.get(p.reviveTarget);
        if (!target || !target.downed || distance(p, target) > 3.2) { p.reviveTarget = null; p.reviveProgress = 0; }
        else {
          p.reviveProgress += dt;
          if (p.reviveProgress >= 8) {
            target.downed = false; target.health = 42; target.downedAt = 0;
            if (target.downs > 0) target.eliminated = true;
            p.reviveTarget = null; p.reviveProgress = 0;
            this.makeNoise(room, p, 0.52, "survivor revived");
            this.say(room, target.eliminated ? `${target.name} was caught again and is lost.` : `${target.name} is back on their feet.`);
          }
        }
      }
    }
    if (players.length) {
      const focus = players.reduce((best, p) => distance(p, room.monster) < distance(best, room.monster) ? p : best, players[0]!);
      const canSee = distance(focus, room.monster) < 16 && lineWalkable(focus, room.monster);
      room.monster.update(dt, focus, focus.hidden, focus.flashlight, room.noiseEvents, canSee, room.elapsed >= 720);
      room.monsterMode = room.monster.mode;
    }
    this.checkEnd(room);
  }

  private attackNearest(room: Room) {
    const target = [...room.players.values()].filter(p => p.connected && !p.eliminated && !p.escaped && !p.hidden && !p.downed)
      .sort((a, b) => distance(a, room.monster) - distance(b, room.monster))[0];
    if (!target) return;
    target.health -= 52;
    if (target.health <= 0) {
      target.health = 0; target.downs++; target.downed = true; target.downedAt = Date.now(); target.hidden = false;
      if (target.downs > 1) { target.eliminated = true; target.downed = false; this.say(room, `${target.name} was caught again and is lost.`); }
      else this.say(room, `${target.name} is down. A teammate can revive them in 8 seconds.`);
    }
    else this.say(room, `${target.name} is hurt. Break away.`);
  }

  private checkEnd(room: Room) {
    if ([...room.players.values()].some(p => p.escaped)) {
      room.phase = "results"; this.say(room, "THE SIGNAL GOT OUT. A survivor made it to the coast."); room.lastActive = Date.now(); return;
    }
    const living = [...room.players.values()].filter(p => !p.eliminated && !p.escaped);
    if (!living.length) { room.phase = "results"; this.say(room, "THE ESTATE KEEPS ITS QUIET."); room.lastActive = Date.now(); }
  }

  private consumeFromTeam(room: Room, ids: ItemId[]) {
    const needed = new Map(ids.map(id => [id, 1]));
    for (const player of room.players.values()) {
      player.inventory = player.inventory.filter(item => {
        const count = needed.get(item.id) ?? 0;
        if (count > 0) { needed.set(item.id, count - 1); return false; }
        return true;
      });
    }
  }

  private allPlayers(room: Room) { return [...room.players.values()].filter(p => !p.eliminated && !p.escaped); }
  private say(room: Room, message: string) { room.notice = message; room.noticeUntil = Date.now() + 5000; }

  private snapshot(room: Room) {
    return {
      type: "state", code: room.code, phase: room.phase, hostId: room.hostId, seed: room.seed,
      elapsed: room.elapsed, remaining: Math.max(0, room.maxTime - room.elapsed),
      relayReady: room.relayReady, relayPuzzleActive: room.relayPuzzleActive, puzzlePattern: room.puzzlePattern,
      puzzleIndex: room.puzzleIndex, gateOpen: room.gateOpen,
      teamParts: this.allPlayers(room).reduce((total, player) => total + player.inventory.filter(item => ["fuse", "spool", "valve"].includes(item.id)).length, 0),
      items: room.items,
      players: [...room.players.values()].map(publicPlayer),
      monster: { x: room.monster.x, z: room.monster.z, yaw: room.monster.yaw, mode: room.monsterMode },
      notice: room.noticeUntil > Date.now() ? room.notice : room.monsterNotice,
      roomNames: [...room.players.values()].map(p => ({ id: p.id, room: roomAt(p.x, p.z) })),
    };
  }

  private broadcast(room: Room) {
    const payload = JSON.stringify(this.snapshot(room));
    for (const peer of room.peers.values()) this.send(peer, JSON.parse(payload));
  }

  private send(peer: Peer, message: unknown) {
    try { if (peer.readyState === undefined || peer.readyState === 1) peer.send(JSON.stringify(message)); } catch { /* closed peer */ }
  }

  private findPlayer(peer: Peer): { room: Room; player: Player } | undefined {
    for (const room of this.rooms.values()) for (const [id, currentPeer] of room.peers) if (currentPeer === peer) {
      const player = room.players.get(id); if (player) return { room, player };
    }
    return undefined;
  }

  private removePlayer(room: Room, player: Player) {
    room.players.delete(player.id); room.peers.delete(player.id);
    if (room.hostId === player.id) room.hostId = [...room.players.values()].find(candidate => candidate.connected)?.id ?? "";
    if (!room.players.size) this.rooms.delete(room.code);
  }

  private ensureTimer() {
    if (this.timer) return;
    this.lastTick = Date.now();
    this.timer = setInterval(() => this.tick(), 50);
    this.timer.unref?.();
  }

  private seeded(seed: number) {
    let value = seed >>> 0;
    return () => { value = (value * 1664525 + 1013904223) >>> 0; return value / 4294967296; };
  }
}
