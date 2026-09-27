import { afterEach, describe, expect, it } from "vitest";
import { RoomManager } from "./roomManager";

type Event = Record<string, any>;
class FakePeer {
  readyState = 1;
  events: Event[] = [];
  send(raw: string) { this.events.push(JSON.parse(raw) as Event); }
  last(type: string) { return [...this.events].reverse().find(event => event.type === type); }
  clear() { this.events = []; }
}
const send = (manager: RoomManager, peer: FakePeer, data: object) => manager.receive(peer, JSON.stringify(data));

describe("RoomManager", () => {
  let manager: RoomManager;
  afterEach(() => manager?.dispose());

  it("creates private five-character rooms, caps them at four, and enforces host/readiness start authority", () => {
    manager = new RoomManager();
    const peers = [new FakePeer(), new FakePeer(), new FakePeer(), new FakePeer(), new FakePeer()];
    send(manager, peers[0]!, { type: "create", name: "Host" });
    const created = peers[0]!.last("joined")!;
    expect(String(created.code)).toMatch(/^[A-Z0-9]{5}$/);
    const code = created.code;
    for (let i = 1; i < 4; i++) send(manager, peers[i]!, { type: "join", code, name: `Player ${i}` });
    send(manager, peers[4]!, { type: "join", code, name: "Overflow" });
    expect(peers[4]!.last("error")?.message).toMatch(/full/i);
    expect(peers[0]!.last("state")?.players).toHaveLength(4);

    send(manager, peers[0]!, { type: "start" });
    expect(peers[0]!.last("error")?.message).toMatch(/ready/i);
    send(manager, peers[1]!, { type: "start" });
    expect(peers[1]!.last("error")?.message).toMatch(/host/i);
    for (let i = 1; i < 4; i++) send(manager, peers[i]!, { type: "ready", ready: true });
    send(manager, peers[0]!, { type: "start" });
    const state = peers[0]!.last("state")!;
    expect(state.phase).toBe("playing");
    expect(state.items).toHaveLength(8);
    expect(state.players).toHaveLength(4);
    expect(state.seed).toBeTypeOf("number");
  });

  it("reconnects a dropped survivor with its room-scoped resume token", () => {
    manager = new RoomManager();
    const original = new FakePeer();
    send(manager, original, { type: "create", name: "Mara" });
    const joined = original.last("joined")!;
    manager.disconnected(original);
    const returning = new FakePeer();
    send(manager, returning, { type: "join", code: joined.code, name: "Mara", reconnectKey: joined.reconnectKey });
    expect(returning.last("joined")).toMatchObject({ playerId: joined.playerId, reconnected: true });
    expect(returning.last("state")?.players?.[0]).toMatchObject({ connected: true, name: "Mara" });
  });

  it("keeps rooms isolated and rejects unknown room codes", () => {
    manager = new RoomManager();
    const host = new FakePeer();
    const stranger = new FakePeer();
    send(manager, host, { type: "create", name: "One" });
    send(manager, stranger, { type: "join", code: "XXXXX", name: "Lost" });
    expect(manager.roomCount).toBe(1);
    expect(stranger.last("error")?.message).toMatch(/not found/i);
  });

  it("relays voice negotiation only to a connected room member and accepts only canned callouts", async () => {
    manager = new RoomManager();
    const host = new FakePeer(); const crew = new FakePeer();
    send(manager, host, { type: "create", name: "Host" });
    const code = host.last("joined")!.code;
    const hostId = host.last("joined")!.playerId;
    send(manager, crew, { type: "join", code, name: "Crew" });
    const crewId = crew.last("joined")!.playerId;
    host.clear(); crew.clear();
    send(manager, host, { type: "signal", target: crewId, payload: { description: { type: "offer", sdp: "safe-test" } } });
    expect(crew.last("signal")).toMatchObject({ from: hostId, payload: { description: { type: "offer" } } });
    expect(host.last("signal")).toBeUndefined();
    send(manager, host, { type: "callout", phrase: "FOLLOW ME" });
    expect(crew.last("state")?.notice).toContain("FOLLOW ME");
    await new Promise(resolve => setTimeout(resolve, 100));
    send(manager, host, { type: "callout", phrase: "<script>" });
    expect(crew.last("state")?.notice).toContain("FOLLOW ME");
  });

  it("clamps teleports to walk-speed and traversable estate cells", async () => {
    manager = new RoomManager();
    const host = new FakePeer();
    send(manager, host, { type: "create", name: "Host" });
    send(manager, host, { type: "start" });
    host.clear();
    await new Promise(resolve => setTimeout(resolve, 600));
    send(manager, host, { type: "move", x: 900, z: 900, yaw: 0, moving: true, sprinting: true, crouched: false });
    await new Promise(resolve => setTimeout(resolve, 140));
    const player = host.last("state")!.players[0];
    expect(player.x).toBeLessThan(0);
    expect(player.z).toBeLessThan(0);
    expect(Math.hypot(player.x + 17, player.z + 14)).toBeLessThan(1);
  });
});
