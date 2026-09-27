import { describe, expect, it } from "vitest";
import { ListenerAI } from "../client/src/game/monster";
import type { MonsterCallbacks } from "../client/src/game/monster";
import type { NoiseEvent } from "../client/src/game/types";

describe("ListenerAI evidence and pursuit", () => {
  it("uses a distant, seed-varied opening patrol instead of an immediate spawn ambush", () => {
    const callbacks: MonsterCallbacks = {
      onAttack: () => undefined,
      onMode: () => undefined,
      onNotice: () => undefined,
    };
    for (let seed = 0; seed < 12; seed++) {
      const listener = new ListenerAI(callbacks, seed);
      expect(Math.hypot(listener.x + 17, listener.z + 14)).toBeGreaterThan(19);
    }
  });

  it("investigates audible events without receiving the player's exact position for free", () => {
    const modes: string[] = [];
    const callbacks: MonsterCallbacks = {
      onAttack: () => undefined,
      onMode: mode => modes.push(mode),
      onNotice: () => undefined,
    };
    const listener = new ListenerAI(callbacks, 0);
    const noise: NoiseEvent = {
      point: { x: 3, z: 2 },
      radius: 16,
      intensity: 0.8,
      kind: "clockwork decoy",
      at: performance.now(),
    };

    listener.update(0.1, { x: 10, z: 10 }, true, false, [noise], false, false);

    expect(listener.mode).toBe("investigate");
    expect(modes).toContain("investigate");
    expect(listener.x).not.toBe(10);
    expect(listener.z).not.toBe(10);
  });

  it("chases a visible survivor, but hidden survivors remain unseen unless they make noise", () => {
    const callbacks: MonsterCallbacks = {
      onAttack: () => undefined,
      onMode: () => undefined,
      onNotice: () => undefined,
    };
    const listener = new ListenerAI(callbacks, 0);

    listener.update(0.1, { x: 2, z: 1 }, false, false, [], true, false);
    expect(listener.mode).toBe("chase");

    const hiddenListener = new ListenerAI(callbacks, 0);
    hiddenListener.update(0.1, { x: 2, z: 1 }, true, false, [], true, false);
    expect(hiddenListener.mode).toBe("patrol");

    const loudNoise: NoiseEvent = {
      point: { x: 2, z: 1 },
      radius: 14,
      intensity: 0.65,
      kind: "running steps",
      at: performance.now(),
    };
    hiddenListener.update(0.1, { x: 2, z: 1 }, true, false, [loudNoise], false, false);
    expect(hiddenListener.mode).toBe("investigate");
  });

  it("searches the last known position after a hidden survivor breaks a chase", () => {
    const listener = new ListenerAI({
      onAttack: () => undefined,
      onMode: () => undefined,
      onNotice: () => undefined,
    }, 0);
    const player = { x: 2, z: 1 };

    listener.update(0.1, player, false, false, [], true, false);
    expect(listener.mode).toBe("chase");
    for (let i = 0; i < 40; i++) listener.update(0.1, player, true, false, [], false, false);

    expect(listener.mode).toBe("search");
  });
});
