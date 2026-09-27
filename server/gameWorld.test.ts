import { describe, expect, it } from "vitest";
import { GameWorld } from "../client/src/game/world";
import type { ItemId, WorldItem, WorldPoint } from "../client/src/game/types";

const makeItem = (type: ItemId, point: WorldPoint): WorldItem => ({
  id: `${type}-test`,
  type,
  name: type,
  point,
  collected: false,
});

function addRelayParts(world: GameWorld) {
  world.items = ["fuse", "spool", "valve"].map(type =>
    makeItem(type as ItemId, { x: 0, z: 0 }),
  );
  world.items.forEach(() => world.interact({ x: 0, z: 0 }));
}

describe("GameWorld match flow", () => {
  it("starts a normal 15-minute shift and keeps seeded item placement deterministic", () => {
    const first = new GameWorld();
    const second = new GameWorld();
    first.start(4242);
    second.start(4242);

    expect(first.phase).toBe("playing");
    expect(first.maxTime).toBe(900);
    expect(first.items.map(item => item.point)).toEqual(second.items.map(item => item.point));
  });

  it("enforces the four-slot inventory and leaves a fifth nearby item in the world", () => {
    const world = new GameWorld();
    world.start(1);
    const point = { x: 0, z: 0 };
    world.items = ["fuse", "spool", "valve", "gateKey", "fuelCell"].map(type =>
      makeItem(type as ItemId, point),
    );

    for (let i = 0; i < 5; i++) world.interact(point);

    expect(world.inventory).toHaveLength(4);
    expect(world.items.filter(item => item.collected)).toHaveLength(4);
    expect(world.items[4]?.collected).toBe(false);
    expect(world.notice).toContain("Four slots");
  });

  it("restores the randomized relay sequence, opens the keyed gate, and reaches a win result", () => {
    const world = new GameWorld();
    world.start(12);
    addRelayParts(world);
    world.interact({ x: 0, z: 0 });

    for (const signal of world.puzzlePattern) world.activateSwitch(signal, { x: 0, z: 0 });

    expect(world.relayReady).toBe(true);
    expect(world.relayParts).toBe(0);
    world.inventory.push(
      { id: "gateKey", name: "Gate Key" },
      { id: "fuelCell", name: "Fuel Canister" },
    );
    const gate = { x: 28, z: -28 };
    world.interact(gate);
    expect(world.gateOpen).toBe(true);
    expect(world.phase).toBe("playing");
    world.interact(gate);

    expect(world.phase).toBe("results");
    expect(world.escapes).toBe(1);
    expect(world.snapshot().escapes).toBe(1);
  });

  it("rejects a wrong signal lamp and resets the relay sequence", () => {
    const world = new GameWorld();
    world.start(21);
    addRelayParts(world);
    world.interact({ x: 0, z: 0 });

    const wrong = [1, 2, 3].find(value => value !== world.puzzlePattern[0])!;
    world.activateSwitch(wrong, { x: 0, z: 0 });
    expect(world.puzzleIndex).toBe(0);
    expect(world.relayReady).toBe(false);
    expect(world.notice).toContain("Sequence reset");

    world.puzzlePattern.forEach(index => world.activateSwitch(index, { x: 0, z: 0 }));
    expect(world.relayReady).toBe(true);
  });

  it("reaches a real loss result when the shift expires and uses a compact demo clock", () => {
    const normal = new GameWorld();
    normal.start(7);
    normal.update(901, { x: 0, z: 0 }, false, false);
    expect(normal.phase).toBe("results");
    expect(normal.escapes).toBe(0);

    const demo = new GameWorld(true);
    demo.start(7);
    expect(demo.maxTime).toBe(96);
    expect(demo.snapshot().remaining).toBe(96);
    demo.update(72, { x: 0, z: 0 }, false, false);
    expect(demo.snapshot().remaining).toBe(24);
    expect(demo.notice).toContain("LAST SIGNAL");
  });
});

describe("GameWorld survivor systems", () => {
  it("allows cover to hide a survivor and lets them leave it again", () => {
    const world = new GameWorld();
    world.start(2);
    world.tryHide({ x: -17, z: -14 });
    expect(world.hidden).toBe(true);
    world.tryHide({ x: -17, z: -14 });
    expect(world.hidden).toBe(false);
  });

  it("consumes a field dressing to restore health after a Listener hit", () => {
    const world = new GameWorld();
    world.start(3);
    world.monsterHit();
    world.inventory.push({ id: "medkit", name: "Field Dressing" });

    expect(world.health).toBe(48);
    world.useItem({ x: 0, z: 0 });
    expect(world.health).toBe(93);
    expect(world.count("medkit")).toBe(0);
  });

  it("uses only the selected slot and drops that same slot", () => {
    const world = new GameWorld();
    world.start(4);
    world.health = 48;
    world.inventory.push(
      { id: "gateKey", name: "Gate Key" },
      { id: "medkit", name: "Field Dressing" },
    );

    world.useItem({ x: 0, z: 0 }, 0);
    expect(world.health).toBe(48);
    world.useItem({ x: 0, z: 0 }, 1);
    expect(world.health).toBe(93);
    expect(world.inventory.map(item => item.id)).toEqual(["gateKey"]);

    world.inventory.push({ id: "battery", name: "Flashlight Cell" });
    world.dropItem({ x: 0, z: 0 }, 0);
    expect(world.inventory.map(item => item.id)).toEqual(["battery"]);
    expect(world.items.at(-1)?.type).toBe("gateKey");
  });
});
