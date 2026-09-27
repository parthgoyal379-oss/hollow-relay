import { useEffect, useRef } from "react";
import { Engine } from "@babylonjs/core/Engines/engine";
import { createGameScene, type GameHandle } from "@/game/scene";

export default function GameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || startedRef.current) return;
    startedRef.current = true;
    const engine = new Engine(canvas, true, {
      preserveDrawingBuffer: true,
      stencil: true,
      adaptToDeviceRatio: true,
      powerPreference: "high-performance",
    });
    let handle: GameHandle | null = null;
    let cancelled = false;
    createGameScene(engine, canvas).then(result => {
      if (cancelled) { result.dispose(); return; }
      handle = result;
      engine.runRenderLoop(() => result.scene.render());
    }).catch(error => {
      console.error("The Hollow Relay failed to start", error);
    });
    const onResize = () => engine.resize();
    window.addEventListener("resize", onResize);
    return () => {
      cancelled = true;
      window.removeEventListener("resize", onResize);
      if (handle) engine.stopRenderLoop();
      handle?.dispose();
      engine.dispose();
      startedRef.current = false;
    };
  }, []);

  return <canvas ref={canvasRef} className="game-canvas" aria-label="The Hollow Relay game canvas" style={{ touchAction: "none" }} />;
}
