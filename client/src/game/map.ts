import type { MapNode, WorldPoint } from "./types";

export interface Room extends MapNode {
  width: number;
  depth: number;
  color: string;
  hiding: Array<{ x: number; z: number; name: string }>;
}

const raw = [
  { id: "relay", name: "Relay Hall", col: 0, row: 0, color: "#343631" },
  { id: "dining", name: "The Dining Room", col: -1, row: 0, color: "#3a332d" },
  { id: "conservatory", name: "Rain Conservatory", col: 1, row: 0, color: "#273332" },
  { id: "dormitory", name: "North Dormitory", col: -1, row: 1, color: "#373330" },
  { id: "gallery", name: "Portrait Gallery", col: 0, row: 1, color: "#33302c" },
  { id: "kitchen", name: "Cold Kitchen", col: 1, row: 1, color: "#343532" },
  { id: "archive", name: "Flooded Archive", col: -1, row: -1, color: "#303537" },
  { id: "stairwell", name: "Service Stair", col: 0, row: -1, color: "#353332" },
  { id: "boiler", name: "Boiler Annex", col: 1, row: -1, color: "#41352b" },
  { id: "tunnel", name: "Signal Tunnel", col: 0, row: -2, color: "#292e2d" },
  { id: "yard", name: "The Black Yard", col: 1, row: -2, color: "#202722" },
  { id: "gate", name: "Iron Gate", col: 2, row: -2, color: "#262a27" },
];

const roomSize = 12;
const step = 14;
const byGrid = new Map(raw.map(r => [`${r.col},${r.row}`, r]));

export const rooms: Room[] = raw.map(r => {
  const neighbors = [
    [r.col - 1, r.row], [r.col + 1, r.row], [r.col, r.row - 1], [r.col, r.row + 1],
  ].map(([c, y]) => byGrid.get(`${c},${y}`)?.id).filter((v): v is string => Boolean(v));
  const x = r.col * step;
  const z = r.row * step;
  return {
    id: r.id, name: r.name, col: r.col, row: r.row, x, z, width: roomSize, depth: roomSize,
    color: r.color, neighbors,
    hiding: [
      { x: x - 3.6, z: z + 3.5, name: "wardrobe" },
      { x: x + 3.6, z: z - 3.5, name: "under the table" },
    ],
  };
});

export const roomById = new Map(rooms.map(room => [room.id, room]));

export const spawnPoints: WorldPoint[] = [
  { x: -17, z: -14 }, { x: 3, z: 0 }, { x: 14, z: -26 },
  { x: -14, z: 14 }, { x: 14, z: 14 }, { x: 0, z: -17 },
  { x: 14, z: 0 }, { x: -14, z: 0 }, { x: 0, z: -28 },
  { x: 28, z: -28 },
];

export function roomAt(x: number, z: number) {
  return rooms.find(room => Math.abs(x - room.x) <= room.width / 2 && Math.abs(z - room.z) <= room.depth / 2)?.name ?? "Service Passage";
}

export function nearestRoom(x: number, z: number): Room {
  return rooms.reduce((best, room) => Math.hypot(room.x - x, room.z - z) < Math.hypot(best.x - x, best.z - z) ? room : best, rooms[0]!);
}

export function routeTo(fromId: string, toId: string): string[] {
  if (fromId === toId) return [fromId];
  const queue: string[][] = [[fromId]];
  const visited = new Set([fromId]);
  while (queue.length) {
    const path = queue.shift()!;
    const room = roomById.get(path[path.length - 1]!);
    for (const neighbor of room?.neighbors ?? []) {
      if (visited.has(neighbor)) continue;
      const next = [...path, neighbor];
      if (neighbor === toId) return next;
      visited.add(neighbor);
      queue.push(next);
    }
  }
  return [fromId];
}

export function isWalkable(x: number, z: number, radius = 0.36) {
  const room = rooms.some(r => Math.abs(x - r.x) <= r.width / 2 - radius && Math.abs(z - r.z) <= r.depth / 2 - radius);
  if (room) return true;
  return rooms.some(r => r.neighbors.some(id => {
    const n = roomById.get(id);
    if (!n) return false;
    if (r.row === n.row) {
      const minX = Math.min(r.x, n.x) + r.width / 2 - radius;
      const maxX = Math.max(r.x, n.x) - n.width / 2 + radius;
      return x >= minX && x <= maxX && Math.abs(z - r.z) <= 1.31;
    }
    const minZ = Math.min(r.z, n.z) + r.depth / 2 - radius;
    const maxZ = Math.max(r.z, n.z) - n.depth / 2 + radius;
    return z >= minZ && z <= maxZ && Math.abs(x - r.x) <= 1.31;
  }));
}

export function lineWalkable(a: WorldPoint, b: WorldPoint) {
  const length = Math.hypot(b.x - a.x, b.z - a.z);
  const steps = Math.max(1, Math.ceil(length / 0.35));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (!isWalkable(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, 0.04)) return false;
  }
  return true;
}
