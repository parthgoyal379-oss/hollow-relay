import { rooms, spawnPoints, roomAt } from "./map";
import type { HudSnapshot, ItemId, NoiseEvent, WorldItem, WorldPoint } from "./types";
import { LORE_DOCUMENTS, type LoreDocument } from "./story";

const itemNames: Record<ItemId, string> = {
  fuse: "Silver Vacuum Tube", spool: "Copper Induction Spool", valve: "High-Pressure Valve",
  gateKey: "Blackwater Gate Key", fuelCell: "Military Kerosene Can", medkit: "Emergency First Aid Spray",
  noiseMaker: "Clockwork Metronome Decoy", battery: "Heavy Dry Cell",
};

function seeded(seed: number) {
  let value = seed >>> 0;
  return () => { value = (value * 1664525 + 1013904223) >>> 0; return value / 4294967296; };
}

export class GameWorld {
  phase: HudSnapshot["phase"] = "title";
  elapsed = 0;
  readonly maxTime: number;
  stamina = 100;
  health = 100;
  noise = 0;
  flashlight = false;
  battery = 100;
  hidden = false;
  bottles = 3;
  holdingBreath = false;
  deathCinematicTimer = 0;
  relayReady = false;
  gateOpen = false;
  escapes = 0;
  monsterMode: HudSnapshot["monsterMode"] = "patrol";
  monsterDistance = 50;
  notice = "The storm drowned the last transmission.";
  inventory: Array<{ id: ItemId; name: string }> = [];
  items: WorldItem[] = [];
  noiseEvents: NoiseEvent[] = [];
  relayPuzzleActive = false;
  puzzleIndex = 0;
  puzzlePattern = [1, 3, 2];
  readDossiers: Set<string> = new Set();
  activeDossier: LoreDocument | null = null;
  dossierCooldown = 0;
  private random = seeded(Date.now());
  private noticeTimer = 6;
  private damageCooldown = 0;
  private finalAnnounced = false;
  private mapSeed = 0;
  readonly demo: boolean;

  constructor(demo = false) {
    this.demo = demo;
    this.maxTime = demo ? 96 : 900;
  }

  start(seed = Math.floor(Math.random() * 0xffffffff)) {
    this.phase = "playing";
    this.elapsed = 0;
    this.stamina = 100;
    this.health = 100;
    this.noise = 0;
    this.flashlight = false;
    this.battery = 100;
    this.hidden = false;
    this.bottles = 3;
    this.holdingBreath = false;
    this.deathCinematicTimer = 0;
    this.monsterMode = "patrol";
    this.monsterDistance = 50;
    this.relayReady = false;
    this.gateOpen = false;
    this.inventory = [];
    this.noiseEvents = [];
    this.relayPuzzleActive = false;
    this.puzzleIndex = 0;
    this.finalAnnounced = false;
    this.damageCooldown = 0;
    this.escapes = 0;
    this.mapSeed = seed;
    this.random = seeded(seed);
    this.puzzlePattern = this.random() > 0.5 ? [2, 1, 3] : [1, 3, 2];
    this.readDossiers.clear();
    this.activeDossier = null;
    this.dossierCooldown = 0;
    const pool = [...spawnPoints].sort(() => this.random() - 0.5);
    const types: ItemId[] = ["fuse", "spool", "valve", "gateKey", "fuelCell", "medkit", "noiseMaker", "battery"];
    this.items = types.map((type, index) => {
      const point = pool[index % pool.length]!;
      return { id: `${type}-${index}`, type, name: itemNames[type], point: { x: point.x + (this.random() - 0.5) * 2, z: point.z + (this.random() - 0.5) * 2 }, collected: false };
    });
    this.say(`BIO-ACOUSTIC HAZARD // BLACKWATER ESTATE · Shift ${String((seed >>> 0) % 90 + 10)}`);
  }

  update(dt: number, point: WorldPoint, moving: boolean, sprinting: boolean, holdingBreath = false) {
    if (this.phase === "deathCinematic") {
      this.deathCinematicTimer -= dt;
      if (this.deathCinematicTimer <= 0) {
        this.finish(false);
      }
      return;
    }
    if (this.phase !== "playing") return;
    this.elapsed += dt;
    this.damageCooldown = Math.max(0, this.damageCooldown - dt);
    this.dossierCooldown = Math.max(0, this.dossierCooldown - dt);
    this.noticeTimer = Math.max(0, this.noticeTimer - dt);
    this.noiseEvents = this.noiseEvents.filter(event => (performance.now() - event.at) < 12000);
    this.noise = Math.max(0, this.noise - dt * 0.23);

    this.holdingBreath = this.hidden && holdingBreath;
    if (this.hidden) {
      if (this.holdingBreath) {
        this.stamina = Math.max(0, this.stamina - dt * 25);
        if (this.stamina <= 0) {
          this.holdingBreath = false;
          this.makeNoise(point, 0.65, "gasping breath");
          this.say("LUNGS BURNING — YOU GASPED FOR AIR!");
        }
      } else {
        this.stamina = Math.min(100, this.stamina + dt * 10);
        if (this.monsterDistance < 4.5) {
          this.makeNoise(point, 0.08, "breathing");
        }
      }
    } else if (sprinting && moving) {
      this.stamina = Math.max(0, this.stamina - dt * 17);
      if (Math.floor(this.elapsed) !== Math.floor(this.elapsed - dt) && Math.floor(this.elapsed) % 2 === 0) this.makeNoise(point, 0.2, "running steps");
    } else {
      this.stamina = Math.min(100, this.stamina + dt * (moving ? 8 : 15));
      if (moving && Math.floor(this.elapsed * 2) !== Math.floor((this.elapsed - dt) * 2)) this.makeNoise(point, 0.075, "footsteps");
    }

    if (this.flashlight) {
      this.battery = Math.max(0, this.battery - dt * 0.9);
      if (this.battery === 0) { this.flashlight = false; this.say("The flashlight dies. Press [R] to crank dynamo."); }
    }
    const finalPhaseDuration = this.demo ? 24 : 180;
    if (!this.finalAnnounced && this.elapsed >= this.maxTime - finalPhaseDuration) {
      this.finalAnnounced = true;
      this.say("THE LAST SIGNAL — the Listener is moving faster.");
    }
    if (this.elapsed >= this.maxTime) this.finish(false);
    if (this.health <= 0 && this.phase === "playing") {
      this.phase = "deathCinematic";
      this.deathCinematicTimer = 3.2;
      this.say("SIGNAL SEVERED — HARVESTED BY COLE.");
    }
  }

  makeNoise(point: WorldPoint, intensity: number, kind: string) {
    if (this.phase !== "playing") return;
    const radius = 6 + intensity * 34;
    this.noise = Math.min(1, Math.max(this.noise, intensity));
    this.noiseEvents.push({ point: { ...point }, radius, intensity, kind, at: performance.now() });
    if (this.noiseEvents.length > 20) this.noiseEvents.shift();
  }

  nearestItem(point: WorldPoint, maxDistance = 2.8) {
    return this.items.filter(item => !item.collected).map(item => ({ item, distance: Math.hypot(item.point.x - point.x, item.point.z - point.z) }))
      .filter(entry => entry.distance <= maxDistance).sort((a, b) => a.distance - b.distance)[0]?.item;
  }

  nearestDossier(point: WorldPoint, maxDistance = 2.8) {
    return LORE_DOCUMENTS.map(doc => ({ doc, distance: Math.hypot(doc.point.x - point.x, doc.point.z - point.z) }))
      .filter(entry => entry.distance <= maxDistance).sort((a, b) => a.distance - b.distance)[0]?.doc;
  }

  closeDossier() {
    this.activeDossier = null;
    this.dossierCooldown = 0.5;
  }

  interact(point: WorldPoint) {
    if (this.phase !== "playing") return;
    if (this.activeDossier) {
      this.closeDossier();
      return;
    }
    if (this.hidden) { this.hidden = false; this.say("You ease out of the hiding place."); this.makeNoise(point, 0.05, "movement"); return; }
    const item = this.nearestItem(point);
    if (item) {
      if (this.inventory.length >= 4) { this.say("Four slots. Drop something first."); return; }
      item.collected = true;
      this.inventory.push({ id: item.type, name: item.name });
      this.makeNoise(point, 0.14, "item picked up");
      this.say(`Secured: ${item.name}.`);
      return;
    }
    const dossier = this.nearestDossier(point);
    if (dossier && this.dossierCooldown <= 0) {
      this.activeDossier = dossier;
      this.readDossiers.add(dossier.id);
      this.say(`Archived: ${dossier.title}`);
      return;
    }
    const nearRelay = Math.hypot(point.x, point.z) < 5.4;
    if (nearRelay && !this.relayReady) {
      const have = this.count("fuse") + this.count("spool") + this.count("valve");
      if (have < 3) { this.say(`Relay needs three components. ${have}/3 carried.`); return; }
      if (!this.relayPuzzleActive) {
        this.relayPuzzleActive = true;
        this.puzzleIndex = 0;
        this.say("The relay is live. Match the three signal lamps in order.");
        return;
      }
      this.activateSwitch(this.puzzlePattern[this.puzzleIndex], point);
      return;
    }
    const nearGate = Math.hypot(point.x - 28, point.z + 28) < 5;
    if (nearGate && !this.gateOpen) {
      if (!this.relayReady) { this.say("No signal. The gate lock is dead."); return; }
      if (!this.count("gateKey") || !this.count("fuelCell")) { this.say("The gate needs its key and a fuel canister."); return; }
      this.gateOpen = true;
      this.makeNoise(point, 0.95, "gate mechanism");
      this.say("The gate groans open. RUN.");
      return;
    }
    if (nearGate && this.gateOpen) { this.finish(true); return; }
    this.say("Nothing here answers.");
  }

  activateSwitch(index: number, point: WorldPoint) {
    if (!this.relayPuzzleActive || this.relayReady) return;
    if (this.puzzlePattern[this.puzzleIndex] === index) {
      this.puzzleIndex += 1;
      this.makeNoise(point, 0.16, "relay switch");
      if (this.puzzleIndex >= this.puzzlePattern.length) {
        this.relayReady = true;
        this.relayPuzzleActive = false;
        this.inventory = this.inventory.filter(item => !["fuse", "spool", "valve"].includes(item.id));
        this.say("RELAY RESTORED. The gate is waking in the yard.");
      } else this.say(`Signal holds. ${this.puzzleIndex}/3 lamps aligned.`);
    } else {
      this.puzzleIndex = 0;
      this.makeNoise(point, 0.42, "relay feedback");
      this.say("Feedback shrieks through the hall. Sequence reset.");
    }
  }

  tryHide(point: WorldPoint) {
    if (this.hidden) { this.hidden = false; this.say("You leave cover."); return; }
    const near = rooms.flatMap(room => room.hiding.map(h => ({ ...h, distance: Math.hypot(h.x - point.x, h.z - point.z) })))
      .filter(h => h.distance < 4.1).sort((a, b) => a.distance - b.distance)[0];
    if (near) { this.hidden = true; this.say(`You fold into ${near.name}. Hold still.`); this.makeNoise(point, 0.035, "hiding"); }
    else this.say("No cover close enough.");
  }

  toggleFlashlight(point: WorldPoint) {
    if (this.battery <= 0) { this.say("No battery left."); return; }
    this.flashlight = !this.flashlight;
    this.makeNoise(point, 0.025, "flashlight click");
    this.say(this.flashlight ? "Flashlight on." : "Darkness, then.");
  }

  dropItem(point: WorldPoint, slotIndex = this.inventory.length - 1) {
    const item = slotIndex >= 0 ? this.inventory.splice(slotIndex, 1)[0] : undefined;
    if (!item) { this.say("Your hands are empty."); return; }
    const newItem: WorldItem = { id: `dropped-${Date.now()}`, type: item.id, name: item.name, point: { x: point.x + 0.6, z: point.z + 0.5 }, collected: false };
    this.items.push(newItem);
    this.makeNoise(point, 0.28, "dropped item");
    this.say(`Dropped ${item.name}.`);
  }

  useItem(point: WorldPoint, slotIndex = 0) {
    const item = this.inventory[slotIndex];
    if (item?.id === "medkit" && this.health < 100) {
      this.inventory.splice(slotIndex, 1); this.health = Math.min(100, this.health + 45); this.say("Field dressing applied."); return;
    }
    if (item?.id === "battery" && this.battery < 85) {
      this.inventory.splice(slotIndex, 1); this.battery = 100; this.say("Flashlight cell replaced."); return;
    }
    if (item?.id === "noiseMaker") {
      this.inventory.splice(slotIndex, 1); this.makeNoise(point, 0.78, "clockwork decoy"); this.say("A little clockwork starts ticking somewhere nearby."); return;
    }
    this.say("No usable item selected.");
  }

  ping(point: WorldPoint) { this.makeNoise(point, 0.24, "survivor ping"); this.say("Signal ping sent."); }

  monsterHit() {
    if (this.damageCooldown > 0 || this.phase !== "playing") return;
    this.damageCooldown = 3.2;
    this.health = Math.max(0, this.health - 52);
    this.stamina = Math.max(0, this.stamina - 25);
    if (this.hidden) {
      this.hidden = false;
      this.say("COLE RIPPED OPEN YOUR COVER!");
    }
    if (this.health <= 0) {
      this.phase = "deathCinematic";
      this.deathCinematicTimer = 3.2;
      this.say("SIGNAL SEVERED — HARVESTED BY COLE.");
    } else {
      this.say("The Listener catches your shoulder. Break away.");
    }
  }

  crankDynamo(point: WorldPoint): boolean {
    if (this.phase !== "playing") return false;
    this.battery = Math.min(100, this.battery + 22);
    this.makeNoise(point, 0.38, "dynamo crank");
    this.say(`Dynamo wound (+22% battery: ${Math.round(this.battery)}%). Gears clattered.`);
    return true;
  }

  throwBottle(from: WorldPoint, dirX: number, dirZ: number): WorldPoint | null {
    if (this.phase !== "playing" || this.bottles <= 0) {
      if (this.bottles <= 0) this.say("No bottles left to throw.");
      return null;
    }
    this.bottles--;
    const dist = 9.5;
    const target: WorldPoint = { x: from.x + dirX * dist, z: from.z + dirZ * dist };
    this.makeNoise(target, 0.95, "glass bottle shatter");
    this.say(`Bottle shattered across the hall! (${this.bottles} left).`);
    return target;
  }

  count(type: ItemId) { return this.inventory.filter(item => item.id === type).length; }
  get relayParts() { return this.count("fuse") + this.count("spool") + this.count("valve"); }
  get objective() {
    if (!this.relayReady) return "Find fuse, copper spool & brass valve · align relay lamps";
    if (!this.gateOpen) return "Reach the Black Yard · fit key & fuel to the iron gate";
    return "GET OUT — cross the open gate";
  }

  finish(won: boolean) {
    if (this.phase !== "playing" && this.phase !== "deathCinematic") return;
    this.phase = "results";
    if (won) this.escapes = 1;
    this.say(won ? "YOU ESCAPED — the signal made it out." : "THE ESTATE KEEPS ITS QUIET.");
  }

  setMonsterMode(mode: HudSnapshot["monsterMode"]) { this.monsterMode = mode; }
  setMonsterDistance(distance: number) { this.monsterDistance = distance; }
  say(message: string) { this.notice = message; this.noticeTimer = 5; }

  snapshot(): HudSnapshot {
    return {
      phase: this.phase, elapsed: this.elapsed, remaining: Math.max(0, this.maxTime - this.elapsed),
      stamina: this.stamina, health: this.health, noise: this.noise, flashlight: this.flashlight,
      battery: this.battery, inventory: [...this.inventory], objective: this.objective,
      relayParts: this.relayParts, relayReady: this.relayReady, gateOpen: this.gateOpen,
      relayPuzzleActive: this.relayPuzzleActive, puzzlePattern: [...this.puzzlePattern], puzzleIndex: this.puzzleIndex,
      hidden: this.hidden, bottles: this.bottles, holdingBreath: this.holdingBreath,
      monsterMode: this.monsterMode, monsterDistance: this.monsterDistance,
      notice: this.noticeTimer > 0 ? this.notice : "", room: "", escapes: this.escapes, demo: this.demo,
      dossiersRead: this.readDossiers.size,
      totalDossiers: LORE_DOCUMENTS.length,
      activeDossier: this.activeDossier,
    };
  }
}
