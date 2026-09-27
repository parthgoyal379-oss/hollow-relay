export type MatchPhase = "title" | "lobby" | "playing" | "paused" | "results";
export type MonsterMode = "patrol" | "investigate" | "search" | "chase" | "return" | "enraged";
export type ItemId = "fuse" | "spool" | "valve" | "gateKey" | "fuelCell" | "medkit" | "noiseMaker" | "battery";

export interface WorldPoint {
  x: number;
  z: number;
}

export interface WorldItem {
  id: string;
  type: ItemId;
  name: string;
  point: WorldPoint;
  collected: boolean;
}

export interface NoiseEvent {
  point: WorldPoint;
  radius: number;
  intensity: number;
  kind: string;
  at: number;
}

export interface HudSnapshot {
  phase: MatchPhase;
  elapsed: number;
  remaining: number;
  stamina: number;
  health: number;
  noise: number;
  flashlight: boolean;
  battery: number;
  inventory: Array<{ id: ItemId; name: string }>;
  objective: string;
  relayParts: number;
  relayReady: boolean;
  relayPuzzleActive: boolean;
  puzzlePattern: number[];
  puzzleIndex: number;
  gateOpen: boolean;
  hidden: boolean;
  monsterMode: MonsterMode;
  monsterDistance: number;
  notice: string;
  room: string;
  escapes: number;
  demo: boolean;
}

export interface MapNode {
  id: string;
  name: string;
  x: number;
  z: number;
  row: number;
  col: number;
  neighbors: string[];
}
