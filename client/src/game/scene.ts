import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { SpotLight } from "@babylonjs/core/Lights/spotLight";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Ray } from "@babylonjs/core/Culling/ray";
import { Scene } from "@babylonjs/core/scene";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera";
import type { Engine } from "@babylonjs/core/Engines/engine";
import { DefaultRenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline";
import { GlowLayer } from "@babylonjs/core/Layers/glowLayer";
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { assets } from "./assets";
import { AudioDirector } from "./audio";
import { CoopUI } from "./coopUi";
import { InputController } from "./input";
import { RoomClient, type OnlinePlayerState, type OnlineRoomState } from "./net";
import { ProximityVoice } from "./voice";
import { ListenerAI } from "./monster";
import { nearestRoom, roomAt, roomById, rooms, routeTo } from "./map";
import type { HudSnapshot, ItemId } from "./types";
import { GameUI } from "./ui";
import { GameWorld } from "./world";
import { LORE_DOCUMENTS } from "./story";

export interface GameHandle {
  scene: Scene;
  dispose(): void;
}

type Box = { x: number; z: number; hx: number; hz: number; mesh?: Mesh };

const itemColors: Record<ItemId, Color3> = {
  fuse: new Color3(0.78, 0.24, 0.12), spool: new Color3(0.74, 0.55, 0.26),
  valve: new Color3(0.52, 0.61, 0.49), gateKey: new Color3(0.81, 0.71, 0.45),
  fuelCell: new Color3(0.44, 0.57, 0.36), medkit: new Color3(0.63, 0.68, 0.59),
  noiseMaker: new Color3(0.49, 0.36, 0.56), battery: new Color3(0.77, 0.65, 0.34),
};

export async function createGameScene(engine: Engine, canvas: HTMLCanvasElement): Promise<GameHandle> {
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.012, 0.016, 0.018, 1);
  scene.fogMode = Scene.FOGMODE_EXP;
  scene.fogDensity = 0.0135;
  scene.fogColor = new Color3(0.05, 0.065, 0.058);
  scene.collisionsEnabled = false;

  const hemi = new HemisphericLight("estate-ambient", new Vector3(0, 1, 0), scene);
  hemi.intensity = 1.35;
  hemi.diffuse = new Color3(0.50, 0.56, 0.52);
  hemi.groundColor = new Color3(0.22, 0.19, 0.17);

  const cam = new UniversalCamera("survivor-view", new Vector3(-17, 1.62, -14), scene);
  cam.minZ = 0.08; cam.maxZ = 90; cam.fov = 1.08;
  cam.rotation = new Vector3(0, 0.12, 0);
  cam.speed = 0; cam.inertia = 0;
  scene.activeCamera = cam;

  // AAA Cinematic Post-Processing Pipeline
  const pipeline = new DefaultRenderingPipeline("horrorPipeline", true, scene, [cam]);
  pipeline.bloomEnabled = true;
  pipeline.bloomThreshold = 0.78;
  pipeline.bloomWeight = 0.40;
  pipeline.bloomKernel = 32;
  pipeline.bloomScale = 0.5;

  pipeline.chromaticAberrationEnabled = true;
  pipeline.chromaticAberration.aberrationAmount = 14;
  pipeline.chromaticAberration.radialIntensity = 1.2;

  pipeline.grainEnabled = true;
  pipeline.grain.intensity = 14;
  pipeline.grain.animated = true;

  pipeline.sharpenEnabled = true;
  pipeline.sharpen.edgeAmount = 0.22;

  const glow = new GlowLayer("glowLayer", scene, {
    mainTextureRatio: 0.5,
    blurKernelSize: 16,
  });
  glow.intensity = 0.65;

  // Atmospheric Volumetric Floating Dust Particles (drifting in the flashlight cone)
  const dustTex = new DynamicTexture("dustTexture", 32, scene, false);
  const dustCtx = dustTex.getContext();
  const grad = dustCtx.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, "rgba(230, 215, 185, 0.9)");
  grad.addColorStop(0.4, "rgba(200, 185, 160, 0.4)");
  grad.addColorStop(1, "rgba(200, 185, 160, 0)");
  dustCtx.fillStyle = grad;
  dustCtx.fillRect(0, 0, 32, 32);
  dustTex.update();

  const dust = new ParticleSystem("ambientDust", 70, scene);
  dust.particleTexture = dustTex;
  dust.emitter = cam.position;
  dust.minEmitBox = new Vector3(-2.8, -1.8, 0.6);
  dust.maxEmitBox = new Vector3(2.8, 1.8, 6.5);
  dust.color1 = new Color4(0.85, 0.82, 0.70, 0.35);
  dust.color2 = new Color4(0.65, 0.62, 0.52, 0.18);
  dust.colorDead = new Color4(0, 0, 0, 0);
  dust.minSize = 0.015;
  dust.maxSize = 0.045;
  dust.minLifeTime = 3.5;
  dust.maxLifeTime = 7.0;
  dust.emitRate = 18;
  dust.gravity = new Vector3(0, -0.006, 0);
  dust.direction1 = new Vector3(-0.015, -0.015, 0.04);
  dust.direction2 = new Vector3(0.015, 0.015, 0.08);
  dust.start();

  const wallMaterial = new StandardMaterial("damp-lime-plaster", scene);
  const wallTexture = new Texture(assets.plaster, scene, false, false, Texture.TRILINEAR_SAMPLINGMODE);
  wallTexture.uScale = 2.4; wallTexture.vScale = 1.15;
  wallMaterial.diffuseTexture = wallTexture; wallMaterial.diffuseColor = new Color3(0.62, 0.66, 0.58);
  wallMaterial.specularColor = new Color3(0.08, 0.08, 0.07);
  const floorMaterial = new StandardMaterial("rain-swollen-oak", scene);
  const floorTexture = new Texture(assets.wood, scene, false, false, Texture.TRILINEAR_SAMPLINGMODE);
  floorTexture.uScale = 3.6; floorTexture.vScale = 3.6;
  floorMaterial.diffuseTexture = floorTexture; floorMaterial.diffuseColor = new Color3(0.56, 0.51, 0.42);
  floorMaterial.specularColor = new Color3(0.1, 0.095, 0.075);
  const outdoorMat = new StandardMaterial("wet-earth", scene);
  outdoorMat.diffuseColor = new Color3(0.075, 0.095, 0.071); outdoorMat.specularColor = new Color3(0.035, 0.04, 0.03);
  const darkWood = makeMat(scene, "blackened-wood", new Color3(0.105, 0.082, 0.061));
  const trimMat = makeMat(scene, "oxidized-iron", new Color3(0.14, 0.18, 0.16), new Color3(0.04, 0.055, 0.045));
  const amberMat = makeMat(scene, "amber-lantern", new Color3(0.22, 0.13, 0.055), new Color3(0.78, 0.43, 0.12));
  const redMat = makeMat(scene, "warning-red", new Color3(0.27, 0.025, 0.018), new Color3(0.72, 0.04, 0.015));
  const furnitureMat = makeMat(scene, "dust-cloth", new Color3(0.17, 0.18, 0.15));
  const entityMat = makeMat(scene, "listener-shadow", new Color3(0.012, 0.016, 0.015), new Color3(0.012, 0.018, 0.014));
  const eyeMat = makeMat(scene, "listener-ember", new Color3(0.27, 0.055, 0.02), new Color3(0.62, 0.075, 0.025));

  const colliders: Box[] = [];
  const wallMeshes = new Set<Mesh>();
  const gateBars: Mesh[] = [];
  const itemMeshes = new Map<string, Mesh>();
  const staticLights: PointLight[] = [];
  const mesh = (name: string, source: Mesh, material: StandardMaterial, position: Vector3) => {
    source.name = name; source.material = material; source.position.copyFrom(position); return source;
  };
  const addBox = (name: string, x: number, y: number, z: number, w: number, h: number, d: number, material: StandardMaterial, collider = false) => {
    const part = MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, scene);
    part.position.set(x, y, z); part.material = material; part.isPickable = false;
    if (collider) colliders.push({ x, z, hx: w / 2, hz: d / 2, mesh: part });
    return part;
  };
  const addWall = (x: number, z: number, w: number, d: number) => {
    const part = addBox("plaster-wall", x, 2.08, z, w, 4.16, d, wallMaterial, true);
    part.metadata = { blocksSight: true }; part.isPickable = true; wallMeshes.add(part);
    return part;
  };
  const placeWallSide = (room: typeof rooms[number], side: "north" | "south" | "east" | "west", hasDoor: boolean) => {
    const half = room.width / 2; const thickness = 0.34; const opening = hasDoor ? 3.35 : 0;
    const gap = opening / 2;
    const vertical = side === "east" || side === "west";
    const x = side === "east" ? room.x + half : side === "west" ? room.x - half : room.x;
    const z = side === "north" ? room.z + half : side === "south" ? room.z - half : room.z;
    if (hasDoor) {
      const len = half - gap;
      if (vertical) {
        addWall(x, z + (gap + len / 2), thickness, len);
        addWall(x, z - (gap + len / 2), thickness, len);
        addBox("door-lintel", x, 3.72, z, thickness, 0.82, opening, darkWood);
        addBox("door-post", x, 1.82, z + gap + 0.08, thickness * 1.3, 3.64, 0.16, darkWood);
        addBox("door-post", x, 1.82, z - gap - 0.08, thickness * 1.3, 3.64, 0.16, darkWood);
      } else {
        addWall(x + gap + len / 2, z, len, thickness);
        addWall(x - gap - len / 2, z, len, thickness);
        addBox("door-lintel", x, 3.72, z, opening, 0.82, thickness, darkWood);
        addBox("door-post", x + gap + 0.08, 1.82, z, 0.16, 3.64, thickness * 1.3, darkWood);
        addBox("door-post", x - gap - 0.08, 1.82, z, 0.16, 3.64, thickness * 1.3, darkWood);
      }
    } else {
      addWall(x, z, vertical ? thickness : room.width + thickness, vertical ? room.depth + thickness : thickness);
    }
  };

  for (const room of rooms) {
    const isOutside = room.id === "yard" || room.id === "gate";
    const floor = MeshBuilder.CreateGround(`${room.id}-floor`, { width: room.width, height: room.depth, subdivisions: 1 }, scene);
    floor.position.set(room.x, 0, room.z); floor.material = isOutside ? outdoorMat : floorMaterial; floor.isPickable = false;
    const ceiling = addBox(`${room.id}-ceiling`, room.x, 4.22, room.z, room.width, 0.18, room.depth, isOutside ? outdoorMat : darkWood);
    ceiling.isPickable = false;
    const hasNorth = room.neighbors.some(id => roomById.get(id)?.row === room.row + 1);
    const hasSouth = room.neighbors.some(id => roomById.get(id)?.row === room.row - 1);
    const hasEast = room.neighbors.some(id => roomById.get(id)?.col === room.col + 1);
    const hasWest = room.neighbors.some(id => roomById.get(id)?.col === room.col - 1);
    placeWallSide(room, "north", hasNorth); placeWallSide(room, "south", hasSouth);
    placeWallSide(room, "east", hasEast); placeWallSide(room, "west", hasWest);
    if (room.id !== "yard" && room.id !== "gate") {
      const lamp = addBox(`${room.id}-ceiling-lamp`, room.x, 3.98, room.z, 0.56, 0.13, 0.3, room.id === "relay" ? redMat : amberMat);
      lamp.isPickable = false;
      const isLitRoom = ["relay", "gallery", "boiler", "dining", "archive", "dormitory", "conservatory"].includes(room.id);
      if (isLitRoom) {
        const light = new PointLight(`${room.id}-practical-light`, new Vector3(room.x, 3.6, room.z), scene);
        light.diffuse = room.id === "relay" ? new Color3(0.78, 0.32, 0.14) : room.id === "archive" ? new Color3(0.38, 0.58, 0.62) : room.id === "conservatory" ? new Color3(0.42, 0.62, 0.52) : new Color3(0.72, 0.50, 0.25);
        light.intensity = room.id === "relay" ? 0.75 : 0.48; light.range = 14; staticLights.push(light);
      }
    }

    // Furniture provides readable cover silhouettes and shallow collision volumes.
    const wardrobeX = room.x - 3.65; const wardrobeZ = room.z + 3.55;
    const wardrobe = addBox(`${room.id}-wardrobe`, wardrobeX, 1.15, wardrobeZ, 1.25, 2.3, 1.1, darkWood, true);
    addBox(`${room.id}-wardrobe-panel`, wardrobeX, 1.17, wardrobeZ - 0.57, 1.08, 1.95, 0.035, furnitureMat);
    addBox(`${room.id}-wardrobe-knob`, wardrobeX + 0.4, 1.12, wardrobeZ - 0.61, 0.07, 0.08, 0.055, trimMat);
    wardrobe.metadata = { hiding: true };
    const tableX = room.x + 3.25; const tableZ = room.z - 3.5;
    addBox(`${room.id}-low-table`, tableX, 0.72, tableZ, 1.9, 0.18, 1.35, darkWood, true);
    for (const dx of [-0.75, 0.75]) for (const dz of [-0.48, 0.48]) addBox(`${room.id}-table-leg`, tableX + dx, 0.34, tableZ + dz, 0.12, 0.7, 0.12, darkWood);
    if (room.id === "relay") {
      addBox("relay-console-body", 0, 1.4, -1.4, 4.2, 2.8, 0.8, darkWood, true);
      addBox("relay-console-face", 0, 2, -0.96, 3.85, 1.42, 0.08, trimMat);
      for (let i = 0; i < 3; i++) {
        const x = (i - 1) * 1.22;
        const dial = MeshBuilder.CreateCylinder(`signal-lamp-${i + 1}`, { diameter: 0.38, height: 0.16, tessellation: 16 }, scene);
        dial.rotation.x = Math.PI / 2; dial.position.set(x, 1.98, -0.89); dial.material = redMat; dial.isPickable = false;
        addBox(`lamp-label-${i + 1}`, x, 1.55, -0.87, 0.48, 0.22, 0.08, darkWood);
      }
      addBox("console-bottom", 0, 0.92, -0.93, 2.5, 0.12, 0.1, trimMat);
    }
    if (room.id === "gate") {
      for (let i = 0; i < 7; i++) gateBars.push(addBox(`gate-iron-bar-${i}`, 28 + (i - 3) * 0.55, 1.7, -34, 0.12, 3.4, 0.14, trimMat, true));
      addBox("gate-beam", 28, 3.4, -34, 4.2, 0.16, 0.18, trimMat);
    }
  }

  // Build enclosed corridors between adjacent rooms to eliminate empty voids and falling out
  const visitedPairs = new Set<string>();
  for (const room of rooms) {
    for (const neighborId of room.neighbors) {
      const pairKey = [room.id, neighborId].sort().join("--");
      if (visitedPairs.has(pairKey)) continue;
      visitedPairs.add(pairKey);

      const n = roomById.get(neighborId);
      if (!n) continue;

      const isOutside = (room.id === "yard" || room.id === "gate") && (n.id === "yard" || n.id === "gate");
      const corridorFloorMat = isOutside ? outdoorMat : floorMaterial;
      const corridorCeilMat = isOutside ? outdoorMat : darkWood;
      const doorSpan = 3.35;
      const halfDoor = doorSpan / 2;

      if (room.row === n.row) {
        // Horizontal connection (East - West)
        const leftRoom = room.col < n.col ? room : n;
        const rightRoom = room.col < n.col ? n : room;
        const gapX = (leftRoom.x + 6 + rightRoom.x - 6) / 2;
        const gapLen = 2.0;
        const z = room.z;

        const cFloor = MeshBuilder.CreateGround(`corridor-floor-${pairKey}`, { width: gapLen, height: doorSpan, subdivisions: 1 }, scene);
        cFloor.position.set(gapX, 0, z); cFloor.material = corridorFloorMat; cFloor.isPickable = false;

        const cCeil = addBox(`corridor-ceiling-${pairKey}`, gapX, 4.22, z, gapLen, 0.18, doorSpan, corridorCeilMat);
        cCeil.isPickable = false;

        addWall(gapX, z + halfDoor, gapLen, 0.34);
        addWall(gapX, z - halfDoor, gapLen, 0.34);
      } else if (room.col === n.col) {
        // Vertical connection (North - South)
        const bottomRoom = room.row < n.row ? room : n;
        const topRoom = room.row < n.row ? n : room;
        const gapZ = (bottomRoom.z + 6 + topRoom.z - 6) / 2;
        const gapLen = 2.0;
        const x = room.x;

        const cFloor = MeshBuilder.CreateGround(`corridor-floor-${pairKey}`, { width: doorSpan, height: gapLen, subdivisions: 1 }, scene);
        cFloor.position.set(x, 0, gapZ); cFloor.material = corridorFloorMat; cFloor.isPickable = false;

        const cCeil = addBox(`corridor-ceiling-${pairKey}`, x, 4.22, gapZ, doorSpan, 0.18, gapLen, corridorCeilMat);
        cCeil.isPickable = false;

        addWall(x + halfDoor, gapZ, 0.34, gapLen);
        addWall(x - halfDoor, gapZ, 0.34, gapLen);
      }
    }
  }

  // A rain-blackened outer path and a broken perimeter are visible through the open yard.
  for (let i = 0; i < 12; i++) {
    const x = 18 + Math.sin(i * 2.3) * 10;
    const z = -30 + Math.cos(i * 1.9) * 11;
    const trunk = MeshBuilder.CreateCylinder(`dead-tree-${i}`, { diameterTop: 0.18, diameterBottom: 0.48, height: 4.8, tessellation: 6 }, scene);
    trunk.position.set(x, 2.4, z); trunk.rotation.z = Math.sin(i) * 0.12; trunk.material = darkWood; trunk.isPickable = false;
    for (let branch = 0; branch < 2; branch++) {
      const limb = addBox(`dead-limb-${i}-${branch}`, x + (branch ? 0.8 : -0.7), 3.7, z, 1.8, 0.13, 0.16, darkWood);
      limb.rotation.z = branch ? -0.28 : 0.26;
    }
  }
  for (let i = 0; i < 6; i++) addBox(`path-stone-${i}`, 16 + i * 2.2, 0.05, -26 + (i % 2) * 1.1, 1.6, 0.1, 1, outdoorMat);

  const flashlight = new SpotLight("handheld-beam", new Vector3(0.18, -0.15, 0.25), new Vector3(0, 0, 1), 1.05, 1.15, scene);
  flashlight.parent = cam; flashlight.range = 44; flashlight.intensity = 5.2; flashlight.diffuse = new Color3(0.98, 0.93, 0.84); flashlight.setEnabled(false);

  const torchFill = new PointLight("torch-fill", new Vector3(0.12, -0.12, 0.35), scene);
  torchFill.parent = cam; torchFill.range = 16; torchFill.intensity = 0.92; torchFill.diffuse = new Color3(0.95, 0.88, 0.74); torchFill.setEnabled(false);

  // Volumetric Flashlight Beam Cone
  const beamCone = MeshBuilder.CreateCylinder("torch-beam-cone", {
    diameterTop: 0.12,
    diameterBottom: 4.6,
    height: 16,
    tessellation: 16,
  }, scene);
  beamCone.parent = cam;
  beamCone.position = new Vector3(0.18, -0.15, 8.2);
  beamCone.rotation.x = Math.PI / 2;
  const beamMat = new StandardMaterial("beam-mat", scene);
  beamMat.diffuseColor = new Color3(0, 0, 0);
  beamMat.emissiveColor = new Color3(0.95, 0.88, 0.72).scale(0.045);
  beamMat.alpha = 0.055;
  beamMat.backFaceCulling = false;
  beamCone.material = beamMat;
  beamCone.isPickable = false;
  beamCone.setEnabled(false);

  const setTorch = (enabled: boolean) => {
    flashlight.setEnabled(enabled);
    torchFill.setEnabled(enabled);
    beamCone.setEnabled(enabled);
  };

  const dossierMat = makeMat(scene, "classified-dossier-paper", new Color3(0.72, 0.64, 0.45), new Color3(0.25, 0.2, 0.12));
  for (const doc of LORE_DOCUMENTS) {
    const folder = MeshBuilder.CreateBox(`doc-${doc.id}`, { width: 0.46, height: 0.04, depth: 0.58 }, scene);
    folder.position.set(doc.point.x, 0.74, doc.point.z);
    folder.material = dossierMat;
    folder.isPickable = false;
    const seal = MeshBuilder.CreateBox(`doc-seal-${doc.id}`, { width: 0.18, height: 0.045, depth: 0.12 }, scene);
    seal.position.set(doc.point.x, 0.745, doc.point.z);
    seal.material = redMat;
    seal.isPickable = false;
  }

  const handMat = makeMat(scene, "oilskin-glove", new Color3(0.07, 0.075, 0.061));
  const leftHand = MeshBuilder.CreateSphere("left-glove", { diameter: 0.28, segments: 8 }, scene);
  leftHand.parent = cam; leftHand.position = new Vector3(-0.31, -0.36, 0.58); leftHand.scaling = new Vector3(1.25, 0.7, 1.1); leftHand.material = handMat; leftHand.isPickable = false;
  const rightHand = MeshBuilder.CreateSphere("right-glove", { diameter: 0.28, segments: 8 }, scene);
  rightHand.parent = cam; rightHand.position = new Vector3(0.31, -0.39, 0.6); rightHand.scaling = new Vector3(1.1, 0.7, 1.2); rightHand.material = handMat; rightHand.isPickable = false;
  const heldLamp = MeshBuilder.CreateCylinder("held-lantern", { diameterTop: 0.12, diameterBottom: 0.17, height: 0.36, tessellation: 10 }, scene);
  heldLamp.parent = cam; heldLamp.position = new Vector3(0.2, -0.29, 0.49); heldLamp.rotation.x = 0.28; heldLamp.material = trimMat; heldLamp.isPickable = false;

  const world = new GameWorld(new URLSearchParams(location.search).has("demo"));
  const audio = new AudioDirector();
  const seed = world.demo ? 4242 : Math.floor(Math.random() * 900000);
  let cameraTrauma = 0;
  let headBobTimer = 0;
  let breatheTimer = 0;
  let handSwayX = 0;
  let handSwayY = 0;
  let lookDeltaX = 0;
  let lookDeltaY = 0;
  let lastRecordedHealth = 100;

  const monster = new ListenerAI({
    onAttack: () => {
      if (!world.demo) {
        world.monsterHit();
        cameraTrauma = 1.0;
        audio.cue(44, 0.45, 0.28);
      }
    },
    onMode: mode => {
      world.setMonsterMode(mode);
      if (mode === "chase" || mode === "enraged") {
        cameraTrauma = Math.max(cameraTrauma, 0.45);
      }
    },
    onNotice: message => { world.say(message); audio.cue(58, 0.55, 0.14); },
  }, seed);
  const input = new InputController(canvas, (dx, dy) => {
    if (world.phase === "playing") {
      cam.rotation.y += dx;
      cam.rotation.x = Math.max(-1.25, Math.min(1.25, cam.rotation.x + dy));
      lookDeltaX += dx;
      lookDeltaY += dy;
    }
  });
  let currentSlot = 0;
  const roomClient = new RoomClient();
  const voice = new ProximityVoice();
  let onlineState: OnlineRoomState | null = null;
  let onlineNotice = "";
  let coopUI: CoopUI;
  coopUI = new CoopUI({
    onCreate: name => { coopUI.setStatus("Opening a private room…"); roomClient.create(name); },
    onJoin: (code, name) => { if (code.length !== 5) { coopUI.setStatus("Enter the five-character room code.", true); return; } coopUI.setStatus("Joining the room…"); roomClient.join(code, name); },
    onReady: ready => roomClient.ready(ready),
    onVoiceToggle: async enabled => {
      try {
        if (enabled) { await voice.enable(); if (onlineState) await voice.sync(roomClient.playerId, onlineState.players.map(player => player.id)); }
        else voice.mute(true);
        return true;
      } catch (error) { coopUI.setStatus(error instanceof Error ? error.message : "Microphone permission was unavailable.", true); return false; }
    },
    onStart: () => roomClient.start(),
    onLeave: () => { roomClient.leave(); voice.dispose(); onlineState = null; remotePlayers.forEach(model => { model.body.dispose(); model.head.dispose(); }); remotePlayers.clear(); world.phase = "title"; world.hidden = false; coopUI.reset(); coopUI.open(); coopUI.setStatus("You left the room. Create or join another shift."); },
    onClose: () => { if (roomClient.code) roomClient.leave(); else roomClient.close(); voice.dispose(); onlineState = null; world.phase = "title"; coopUI.reset(); coopUI.close(); },
  });
  roomClient.onStatus = status => {
    if (status === "connecting") coopUI.setStatus("Connecting to the room service…");
    else if (status === "reconnecting") coopUI.setStatus("Connection interrupted. Reconnecting…", true);
  };
  voice.onSignal = (target, payload) => roomClient.signal(target, payload);
  voice.onStatus = (message, error) => coopUI.setStatus(message, error);
  const ui = new GameUI(input, {
    onLobby: () => undefined,
    onCoop: () => coopUI.open(),
    onStart: () => {
      audio.unlock();
      input.requestLock();
      world.start(seed);
      world.flashlight = true;
      setTorch(true);
      monster.reset(seed);
      cam.position.set(-17, 1.62, -14);
      cam.rotation.set(0, 0.2, 0);
      currentSlot = 0;
      demoStarted = false;
      gateWasOpen = false;
      gateBars.forEach(bar => bar.setEnabled(true));
      audio.cue(190, 0.2, 0.1);
    },
    onInteract: () => {
      if (world.activeDossier) { world.closeDossier(); audio.pageRustle(); return; }
      if (onlineState?.phase === "playing") roomClient.action("interact");
      else interact();
    },
    onCloseDossier: () => {
      world.closeDossier();
      audio.pageRustle();
    },
    onSwitch: index => { currentSlot = index; },
    onHide: () => onlineState?.phase === "playing" ? roomClient.action("hide") : world.tryHide(cameraWorld()),
    onFlashlight: () => {
      if (onlineState?.phase === "playing") roomClient.action("flashlight");
      else {
        world.toggleFlashlight(cameraWorld());
        setTorch(world.flashlight);
      }
      audio.flashlightSwitch(world.flashlight);
    },
    onPing: () => { if (onlineState?.phase === "playing") roomClient.action("ping"); else world.ping(cameraWorld()); audio.cue(320, 0.1, 0.05); },
    onDrop: () => onlineState?.phase === "playing" ? roomClient.action("drop", currentSlot) : world.dropItem(cameraWorld(), currentSlot),
    onUse: () => onlineState?.phase === "playing" ? roomClient.action("use", currentSlot) : world.useItem(cameraWorld(), currentSlot),
    onPuzzleSwitch: index => { if (onlineState?.phase === "playing") roomClient.action("switch", index); else world.activateSwitch(index, cameraWorld()); audio.cue(220 + index * 40, 0.11, 0.06); },
    onCallout: phrase => { if (onlineState?.phase === "playing") roomClient.callout(phrase); else world.say(phrase); },
    onPause: () => {
      world.closeDossier();
      if (onlineState?.phase === "playing") { world.say("A shared shift cannot pause. Leave the room to step away."); return; }
      if (world.phase === "playing") world.phase = "paused";
      else if (world.phase === "paused") { world.phase = "playing"; input.requestLock(); }
      else if (world.phase === "title") return;
      else if (world.phase === "results") world.phase = "title";
    },
    onMenu: () => {
      world.closeDossier();
      if (onlineState) { roomClient.leave(); voice.dispose(); onlineState = null; remotePlayers.forEach(model => { model.body.dispose(); model.head.dispose(); }); remotePlayers.clear(); }
      world.phase = "title";
      world.hidden = false;
      coopUI.reset();
    },
    onAction: (action, down) => input.setAction(action, down),
    onJoystick: (x, y) => input.setJoystick(x, y),
  });
  if (import.meta.env.DEV && new URLSearchParams(location.search).has("coop")) coopUI.open();
  roomClient.onEvent = event => {
    if (event.type === "error") { coopUI.setStatus(event.message, true); return; }
    if (event.type === "joined") { coopUI.setStatus(`Connected to room ${event.code}.`); return; }
    if (event.type === "signal") { void voice.handleSignal(event.from, event.payload); return; }
    if (event.type !== "state") return;
    const state = event as OnlineRoomState;
    onlineState = state;
    coopUI.showRoom(state, roomClient.playerId);
    const wasPlaying = world.phase === "playing" || world.phase === "paused";
    if (state.phase === "playing" && !wasPlaying) {
      audio.unlock();
      input.requestLock();
      world.start(state.seed);
      world.flashlight = true;
      setTorch(true);
      gateWasOpen = false;
      gateBars.forEach(bar => bar.setEnabled(true));
    }
    if (world.phase !== "paused") world.phase = state.phase === "playing" ? "playing" : state.phase === "results" ? "results" : "title";
    world.elapsed = state.elapsed; world.items = state.items;
    world.relayReady = state.relayReady; world.relayPuzzleActive = state.relayPuzzleActive; world.puzzlePattern = state.puzzlePattern; world.puzzleIndex = state.puzzleIndex; world.gateOpen = state.gateOpen;
    world.monsterMode = state.monster.mode;
    const me = state.players.find(player => player.id === roomClient.playerId);
    if (me) {
      world.health = me.health; world.stamina = me.stamina; world.inventory = me.inventory.map(item => ({ ...item })); world.hidden = me.hidden;
      world.flashlight = me.flashlight; world.battery = me.battery; setTorch(me.flashlight);
      if (Math.hypot(cam.position.x - me.x, cam.position.z - me.z) > 3.0) {
        cam.position.x = me.x;
        cam.position.z = me.z;
      }
    }
    world.escapes = state.players.filter(player => player.escaped).length;
    if (state.notice && state.notice !== onlineNotice) { onlineNotice = state.notice; world.say(state.notice); }
    for (const player of state.players) {
      if (player.id === roomClient.playerId) continue;
      let model = remotePlayers.get(player.id);
      if (!model) {
        const remoteBody = MeshBuilder.CreateCapsule(`survivor-${player.id}`, { height: 1.7, radius: 0.28, tessellation: 6, subdivisions: 1 }, scene);
        remoteBody.material = survivorMat; remoteBody.isPickable = false;
        const remoteHead = MeshBuilder.CreateSphere(`survivor-head-${player.id}`, { diameter: 0.38, segments: 7 }, scene);
        remoteHead.material = survivorMat; remoteHead.isPickable = false;
        model = { body: remoteBody, head: remoteHead, target: { x: player.x, z: player.z, yaw: player.yaw }, state: player };
        remotePlayers.set(player.id, model);
      }
      model.target = { x: player.x, z: player.z, yaw: player.yaw }; model.state = player;
    }
    for (const [id, model] of remotePlayers) if (!state.players.some(player => player.id === id)) { model.body.dispose(); model.head.dispose(); remotePlayers.delete(id); }
    ui.renderTeam(state.players, roomClient.playerId);
    if (voice.isActive) void voice.sync(roomClient.playerId, state.players.filter(player => player.connected).map(player => player.id));
  };

  const createItemMesh = (item: GameWorld["items"][number]) => {
    let itemMesh: Mesh;
    if (item.type === "valve") {
      itemMesh = MeshBuilder.CreateTorus(item.id, { diameter: 0.48, thickness: 0.08, tessellation: 12 }, scene);
      itemMesh.rotation.x = Math.PI / 2;
    } else if (item.type === "spool") {
      itemMesh = MeshBuilder.CreateCylinder(item.id, { diameterTop: 0.38, diameterBottom: 0.38, height: 0.24, tessellation: 10 }, scene);
      itemMesh.rotation.z = Math.PI / 2;
    } else if (item.type === "gateKey") {
      itemMesh = MeshBuilder.CreateTorus(item.id, { diameter: 0.3, thickness: 0.06, tessellation: 10 }, scene);
      itemMesh.rotation.x = Math.PI / 2;
    } else {
      itemMesh = MeshBuilder.CreateBox(item.id, { width: 0.28, height: 0.18, depth: 0.42 }, scene);
    }
    itemMesh.name = item.id; itemMesh.position.set(item.point.x, 0.32, item.point.z); itemMesh.isPickable = false;
    itemMesh.material = makeMat(scene, `glint-${item.id}`, itemColors[item.type], itemColors[item.type].scale(0.14));
    return itemMesh;
  };

  // ==========================================
  // CHIEF ENGINEER COLE — BIO-ACOUSTIC PREDATOR
  // ==========================================
  const coleMat = makeMat(scene, "listener-necrotic-hide", new Color3(0.025, 0.028, 0.026), new Color3(0.018, 0.012, 0.01));
  const boneMat = makeMat(scene, "listener-bone-carapace", new Color3(0.32, 0.28, 0.22), new Color3(0.05, 0.04, 0.03));
  const coreMat = makeMat(scene, "listener-resonator-core", new Color3(0.55, 0.15, 0.05), new Color3(0.85, 0.22, 0.06));

  const body = MeshBuilder.CreateCapsule("listener-body", { height: 2.35, radius: 0.36, tessellation: 8, subdivisions: 2 }, scene);
  body.material = coleMat; body.isPickable = false;

  const core = MeshBuilder.CreateSphere("listener-core", { diameter: 0.3, segments: 6 }, scene);
  core.material = coreMat; core.isPickable = false;

  const head = MeshBuilder.CreateSphere("listener-head", { diameter: 0.54, segments: 8 }, scene);
  head.material = coleMat; head.isPickable = false;

  const acousticDish = MeshBuilder.CreateCylinder("listener-dish", { diameterTop: 0.38, diameterBottom: 0.12, height: 0.16, tessellation: 10 }, scene);
  acousticDish.material = boneMat; acousticDish.rotation.z = Math.PI / 2.8; acousticDish.isPickable = false;

  const eyeA = MeshBuilder.CreateSphere("listener-eye-left", { diameter: 0.09, segments: 6 }, scene);
  const eyeB = MeshBuilder.CreateSphere("listener-eye-right", { diameter: 0.09, segments: 6 }, scene);
  eyeA.material = eyeMat; eyeB.material = eyeMat; eyeA.isPickable = eyeB.isPickable = false;

  const armA = MeshBuilder.CreateCylinder("listener-arm-left", { diameterTop: 0.12, diameterBottom: 0.18, height: 1.35, tessellation: 6 }, scene);
  armA.material = coleMat; armA.isPickable = false;

  // Mutated Harvester Claw Arm (Right Arm)
  const armB = MeshBuilder.CreateCylinder("listener-arm-right", { diameterTop: 0.18, diameterBottom: 0.26, height: 1.5, tessellation: 6 }, scene);
  armB.material = boneMat; armB.isPickable = false;

  const spineSpikes: Mesh[] = [];
  for (let i = 0; i < 5; i++) {
    const spike = MeshBuilder.CreateCylinder(`listener-spine-${i}`, { diameterTop: 0.01, diameterBottom: 0.09, height: 0.32 + (2 - Math.abs(i - 2)) * 0.08, tessellation: 4 }, scene);
    spike.material = boneMat; spike.isPickable = false;
    spineSpikes.push(spike);
  }

  const clawTalons: Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const talon = MeshBuilder.CreateCylinder(`listener-talon-${i}`, { diameterTop: 0.01, diameterBottom: 0.045, height: 0.28, tessellation: 4 }, scene);
    talon.material = boneMat; talon.isPickable = false;
    clawTalons.push(talon);
  }

  // Sonic Shockwave Floor Ring
  const sonicWave = MeshBuilder.CreateTorus("sonic-shockwave", { diameter: 1.0, thickness: 0.08, tessellation: 24 }, scene);
  const sonicMat = new StandardMaterial("sonic-wave-mat", scene);
  sonicMat.emissiveColor = new Color3(0.95, 0.35, 0.08);
  sonicMat.alpha = 0;
  sonicWave.material = sonicMat;
  sonicWave.position.y = 0.08;
  sonicWave.isPickable = false;
  let sonicPulseProgress = 1.0;
  const survivorMat = makeMat(scene, "co-op-survivor", new Color3(0.22, 0.24, 0.2), new Color3(0.12, 0.08, 0.035));
  const remotePlayers = new Map<string, { body: Mesh; head: Mesh; target: { x: number; z: number; yaw: number }; state: OnlinePlayerState }>();

  const cameraWorld = () => ({ x: cam.position.x, z: cam.position.z });
  const getNearestInteractable = () => {
    const point = cameraWorld();
    if (world.activeDossier) return "CLOSE DOSSIER [E / ESC]";
    const item = world.nearestItem(point);
    if (item) return `TAKE ${item.name.toUpperCase()}`;
    const dossier = world.nearestDossier(point);
    if (dossier && world.dossierCooldown <= 0) return `READ DOSSIER · ${dossier.title} [E]`;
    if (Math.hypot(point.x, point.z) < 5.4 && !world.relayReady) return world.relayPuzzleActive ? "ALIGN THE SIGNAL LAMPS · 1 / 2 / 3" : "EXAMINE THE RELAY CONSOLE";
    if (Math.hypot(point.x - 28, point.z + 28) < 5 && !world.gateOpen) return world.relayReady ? "UNLOCK THE IRON GATE" : "THE GATE IS DEAD";
    if (Math.hypot(point.x - 28, point.z + 28) < 5 && world.gateOpen) return "ESCAPE THROUGH THE GATE";
    const hiding = rooms.flatMap(room => room.hiding).some(h => Math.hypot(point.x - h.x, point.z - h.z) < 2.8);
    if (hiding) return "HIDE · HOLD STILL";
    return "";
  };
  const interact = () => {
    const point = cameraWorld();
    if (world.activeDossier) {
      world.closeDossier();
      audio.pageRustle();
      return;
    }
    const dossier = world.nearestDossier(point);
    if (!world.nearestItem(point) && dossier && world.dossierCooldown <= 0) {
      world.interact(point);
      audio.pageRustle();
      return;
    }
    const prevCount = world.inventory.length;
    world.interact(point);
    if (world.inventory.length > prevCount) {
      audio.pickupItem();
    } else {
      audio.cue(170, 0.1, 0.04);
    }
  };

  let prevTime = performance.now();
  let currentRoom = "";
  let gateWasOpen = false;
  let frameCount = 0;
  let demoBooted = false;
  let demoStarted = false;
  let pilotTimer = 0;
  let pilotQueue: Array<{ x: number; z: number; kind: "item" | "point" }> = [];
  let pilotStage = 0;
  const planDemo = () => {
    const required: ItemId[] = ["fuse", "spool", "valve"];
    pilotQueue = required.map(type => {
      const item = world.items.find(entry => entry.type === type)!;
      return { ...item.point, kind: "item" as const };
    });
    pilotQueue.push({ x: 0, z: 0, kind: "point" });
    pilotStage = 0;
  };
  const demoUpdate = (dt: number) => {
    if (!world.demo || world.phase !== "playing") return;
    if (!demoStarted) { demoStarted = true; pilotTimer = 2.5; planDemo(); }
    pilotTimer -= dt;
    if (pilotTimer > 0) return;
    let goal = pilotQueue[0];
    if (pilotStage === 1 && world.relayReady) {
      const extras = ["gateKey", "fuelCell"] as ItemId[];
      pilotQueue = extras.map(type => { const item = world.items.find(entry => entry.type === type)!; return { ...item.point, kind: "item" as const }; });
      pilotQueue.push({ x: 28, z: -28, kind: "point" }); pilotStage = 2;
      goal = pilotQueue[0];
    }
    if (!goal) {
      if (pilotStage === 0) {
        world.relayPuzzleActive = true;
        for (let i = 0; i < 3; i++) world.activateSwitch(world.puzzlePattern[i]!, { x: 0, z: 0 });
        pilotStage = 1; planDemo(); return;
      }
      if (pilotStage === 2) { world.gateOpen = true; world.say("THE GATE OPENS. RUN."); pilotStage = 3; pilotQueue = [{ x: 28, z: -28, kind: "point" }]; return; }
      world.finish(true); return;
    }
    const dx = goal.x - cam.position.x; const dz = goal.z - cam.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance < (goal.kind === "item" ? 1.55 : 4.1)) {
      input.setJoystick(0, 0);
      if (goal.kind === "item") { world.interact(cameraWorld()); pilotQueue.shift(); pilotTimer = 0.5; }
      else {
        pilotQueue.shift();
        if (!pilotQueue.length && pilotStage === 0) {
          world.relayPuzzleActive = true;
          for (let i = 0; i < 3; i++) world.activateSwitch(world.puzzlePattern[i]!, { x: 0, z: 0 });
          pilotStage = 1;
        } else if (!pilotQueue.length && pilotStage === 2) { world.gateOpen = true; world.finish(true); }
      }
    } else {
      const waypointRoom = nearestRoom(goal.x, goal.z);
      const playerRoom = nearestRoom(cam.position.x, cam.position.z);
      const path = routeTo(playerRoom.id, waypointRoom.id);
      const nextRoom = path.length > 1 ? roomById.get(path[1]!) : undefined;
      const doorway = nextRoom ? { x: (playerRoom.x + nextRoom.x) / 2, z: (playerRoom.z + nextRoom.z) / 2 } : goal;
      const target = distance > 8 && nextRoom ? doorway : goal;
      const tx = target.x - cam.position.x; const tz = target.z - cam.position.z;
      const yaw = Math.atan2(tx, tz);
      cam.rotation.y = yaw;
      input.setJoystick(0, -1);
      input.setAction("sprint", true);
    }
  };

  const onFrame = () => {
    frameCount += 1;
    const now = performance.now();
    const dt = Math.min(0.05, Math.max(0, (now - prevTime) / 1000));
    prevTime = now;
    const gameDt = world.demo ? dt * 2 : dt;
    if (world.demo && world.phase === "title" && !demoBooted) {
      demoBooted = true;
      world.start(seed); world.flashlight = true; setTorch(true); monster.reset(seed);
      cam.position.set(-17, 1.62, -14); cam.rotation.set(0, 0.2, 0);
    }
    if (world.phase !== "playing") {
      const snapshot = world.snapshot(); snapshot.room = roomAt(cam.position.x, cam.position.z);
      ui.render(snapshot, world.items.filter(item => item.collected).length, currentSlot);
      ui.renderTeam(onlineState?.players ?? [], roomClient.playerId);
      return;
    }
      if (onlineState?.phase !== "playing") demoUpdate(gameDt);
      const move = input.movement();
      const isMoving = Math.hypot(move.x, move.z) > 0.08;
      const crouched = input.down("crouch") || world.hidden;
      const sprinting = input.down("sprint") && world.stamina > 4 && !crouched;
      const speed = sprinting ? 5.1 : crouched ? 1.7 : 3.15;
      const fx = Math.sin(cam.rotation.y); const fz = Math.cos(cam.rotation.y);
      const rx = Math.cos(cam.rotation.y); const rz = -Math.sin(cam.rotation.y);
      const dx = (fx * -move.z + rx * move.x) * speed * gameDt;
      const dz = (fz * -move.z + rz * move.x) * speed * gameDt;
      const radius = 0.36;
      const blocked = (x: number, z: number) => colliders.some(box => (!box.mesh || box.mesh.isEnabled()) && x + radius > box.x - box.hx && x - radius < box.x + box.hx && z + radius > box.z - box.hz && z - radius < box.z + box.hz);
      if (!world.hidden) {
        const nextX = cam.position.x + dx;
        if (!blocked(nextX, cam.position.z)) cam.position.x = nextX;
        const nextZ = cam.position.z + dz;
        if (!blocked(cam.position.x, nextZ)) cam.position.z = nextZ;
      }
      // First-person head bobbing & breathing
      breatheTimer += gameDt * 1.8;
      const breatheY = Math.sin(breatheTimer) * 0.007;

      let bobY = 0;
      let bobX = 0;
      if (isMoving && !world.hidden) {
        headBobTimer += gameDt * (sprinting ? 12.5 : crouched ? 5.5 : 8.0);
        const ampY = sprinting ? 0.038 : crouched ? 0.012 : 0.022;
        const ampX = sprinting ? 0.022 : crouched ? 0.008 : 0.014;
        bobY = Math.sin(headBobTimer) * ampY;
        bobX = Math.cos(headBobTimer * 0.5) * ampX;
      } else {
        headBobTimer = 0;
      }

      const targetY = (crouched ? 1.0 : 1.62) + bobY + breatheY;
      cam.position.y += (targetY - cam.position.y) * Math.min(1, gameDt * 8);

      // Camera Roll / Strafe Banking
      const targetRoll = move.x * -0.022;
      cam.rotation.z += (targetRoll - cam.rotation.z) * Math.min(1, gameDt * 8);

      // Dynamic Sprint FOV Kick
      const targetFov = sprinting ? 1.16 : crouched ? 1.04 : 1.08;
      cam.fov += (targetFov - cam.fov) * Math.min(1, gameDt * 6);

      // Camera Trauma Screen Shake
      if (world.health < lastRecordedHealth) {
        cameraTrauma = Math.min(1.0, cameraTrauma + (lastRecordedHealth - world.health) * 0.025 + 0.45);
        lastRecordedHealth = world.health;
      }
      if (cameraTrauma > 0.01) {
        cameraTrauma *= Math.pow(0.06, gameDt);
        cam.position.x += (Math.random() - 0.5) * cameraTrauma * 0.07;
        cam.position.y += (Math.random() - 0.5) * cameraTrauma * 0.07;
      }

      // Hands & Flashlight Inertia / Lag
      const targetSwayX = -lookDeltaX * 0.06;
      const targetSwayY = -lookDeltaY * 0.06;
      handSwayX += (targetSwayX - handSwayX) * Math.min(1, gameDt * 12);
      handSwayY += (targetSwayY - handSwayY) * Math.min(1, gameDt * 12);
      lookDeltaX *= Math.pow(0.01, gameDt);
      lookDeltaY *= Math.pow(0.01, gameDt);

      leftHand.position.set(-0.31 + handSwayX * 0.6 - bobX * 0.5, -0.36 + handSwayY * 0.6 + bobY * 0.6 + breatheY, 0.58);
      rightHand.position.set(0.31 + handSwayX * 0.7 - bobX * 0.6, -0.39 + handSwayY * 0.7 + bobY * 0.7 + breatheY, 0.6);
      heldLamp.position.set(0.2 + handSwayX * 0.8 - bobX * 0.7, -0.29 + handSwayY * 0.8 + bobY * 0.8 + breatheY, 0.49);

      // Flashlight voltage flicker
      if (world.flashlight) {
        const distToMonster = Math.hypot(cam.position.x - monster.x, cam.position.z - monster.z);
        const flickerChance = world.battery < 20 ? 0.16 : distToMonster < 8.5 ? 0.08 : 0.003;
        flashlight.intensity = Math.random() < flickerChance ? 1.0 + Math.random() * 2.0 : 5.2;
      }

      if (onlineState?.phase === "playing") {
        roomClient.move({ x: cam.position.x, z: cam.position.z, yaw: cam.rotation.y, moving: isMoving, sprinting, crouched });
      } else world.update(gameDt, cameraWorld(), isMoving, sprinting);
      if (input.justPressed("interact")) onlineState?.phase === "playing" ? roomClient.action("interact") : interact();
      if (input.justPressed("hide")) onlineState?.phase === "playing" ? roomClient.action("hide") : world.tryHide(cameraWorld());
      if (input.justPressed("flashlight")) { if (onlineState?.phase === "playing") roomClient.action("flashlight"); else { world.toggleFlashlight(cameraWorld()); setTorch(world.flashlight); } audio.cue(260, 0.05, 0.035); }
      if (input.justPressed("ping")) onlineState?.phase === "playing" ? roomClient.action("ping") : world.ping(cameraWorld());
      if (input.justPressed("drop")) onlineState?.phase === "playing" ? roomClient.action("drop", currentSlot) : world.dropItem(cameraWorld(), currentSlot);
      if (input.justPressed("use")) onlineState?.phase === "playing" ? roomClient.action("use", currentSlot) : world.useItem(cameraWorld(), currentSlot);
      if (input.justPressed("pause")) { if (onlineState?.phase === "playing") world.say("A shared shift cannot pause."); else world.phase = "paused"; }
      if (input.justPressed("sprint") && !sprinting) world.say("Your breath is still recovering.");

      for (const item of world.items) {
        let itemMesh = itemMeshes.get(item.id);
        if (!itemMesh) { itemMesh = createItemMesh(item); itemMeshes.set(item.id, itemMesh); }
        itemMesh.position.x = item.point.x; itemMesh.position.z = item.point.z;
        itemMesh.setEnabled(!item.collected);
        if (!item.collected) {
          itemMesh.position.y = 0.35 + Math.sin(now * 0.003 + item.point.x) * 0.055;
          itemMesh.rotation.y = now * 0.0018;
        }
      }
      const p = cameraWorld();
      if (world.gateOpen && !gateWasOpen) { gateBars.forEach(bar => bar.setEnabled(false)); gateWasOpen = true; }
      if (onlineState?.phase === "playing") {
        monster.x += (onlineState.monster.x - monster.x) * 0.42;
        monster.z += (onlineState.monster.z - monster.z) * 0.42;
        monster.yaw += Math.atan2(Math.sin(onlineState.monster.yaw - monster.yaw), Math.cos(onlineState.monster.yaw - monster.yaw)) * 0.42;
        monster.mode = onlineState.monster.mode;
      } else {
        const toPlayer = new Vector3(p.x - monster.x, 0.45 - 1.22, p.z - monster.z);
        const localDistance = Math.hypot(p.x - monster.x, p.z - monster.z);
        const sightRay = new Ray(new Vector3(monster.x, 1.35, monster.z), toPlayer.normalize(), Math.max(0.1, localDistance));
        const obstruction = scene.pickWithRay(sightRay, target => target instanceof Mesh && Boolean(target.metadata?.blocksSight));
        const visible = !(obstruction?.hit && obstruction.distance < localDistance - 0.75);
        const finalPhase = world.elapsed >= world.maxTime - (world.demo ? 24 : 180);
        monster.update(gameDt, p, world.hidden, world.flashlight, world.noiseEvents, visible, finalPhase);
      }
      const distance = Math.hypot(p.x - monster.x, p.z - monster.z);
      world.setMonsterDistance(distance);

      const enraged = monster.mode === "chase" || monster.mode === "enraged";
      const stride = Math.sin(now * (enraged ? 0.012 : 0.0055));
      const mBobY = Math.abs(Math.sin(now * (enraged ? 0.012 : 0.0055))) * 0.06;

      // Pulse the bio-acoustic chest cavity
      const pulseSpeed = enraged ? 0.014 : 0.006;
      const pulse = 0.65 + Math.sin(now * pulseSpeed) * 0.35;
      coreMat.emissiveColor = enraged ? new Color3(0.98, 0.25, 0.05).scale(pulse) : new Color3(0.75, 0.18, 0.04).scale(pulse);
      core.scaling.set(0.9 + pulse * 0.25, 0.9 + pulse * 0.25, 0.9 + pulse * 0.25);

      body.position.set(monster.x, 1.22 + mBobY, monster.z);
      body.rotation.y = monster.yaw;
      body.rotation.x = enraged ? 0.28 : 0.12;

      core.position.set(monster.x + Math.sin(monster.yaw) * 0.12, 1.38 + mBobY, monster.z + Math.cos(monster.yaw) * 0.12);

      // Spine dorsal spikes
      for (let i = 0; i < spineSpikes.length; i++) {
        const yOff = 0.85 + i * 0.24 + mBobY;
        const distBack = -0.26;
        spineSpikes[i].position.set(
          monster.x + Math.sin(monster.yaw + Math.PI) * distBack,
          yOff,
          monster.z + Math.cos(monster.yaw + Math.PI) * distBack
        );
        spineSpikes[i].rotation.y = monster.yaw;
        spineSpikes[i].rotation.x = Math.PI / 2.6;
        spineSpikes[i].isVisible = true;
      }

      // Head with bio-acoustic dish & twitch
      const headTwitch = (monster.mode === "search" || monster.mode === "investigate") && Math.sin(now * 0.02) > 0.88 ? Math.sin(now * 0.08) * 0.28 : 0;
      head.position.set(monster.x + Math.sin(monster.yaw) * 0.24, 2.38 + mBobY, monster.z + Math.cos(monster.yaw) * 0.24);
      head.rotation.y = monster.yaw + headTwitch;

      acousticDish.position.set(head.position.x + Math.cos(monster.yaw) * 0.26, head.position.y + 0.1, head.position.z - Math.sin(monster.yaw) * 0.26);
      acousticDish.rotation.y = monster.yaw + 0.4;
      acousticDish.isVisible = true;

      eyeA.position.set(head.position.x - Math.cos(monster.yaw) * 0.13 + Math.sin(monster.yaw) * 0.18, head.position.y + 0.04, head.position.z + Math.sin(monster.yaw) * 0.13 + Math.cos(monster.yaw) * 0.18);
      eyeB.position.set(head.position.x + Math.cos(monster.yaw) * 0.13 + Math.sin(monster.yaw) * 0.18, head.position.y + 0.04, head.position.z - Math.sin(monster.yaw) * 0.13 + Math.cos(monster.yaw) * 0.18);

      eyeMat.emissiveColor = enraged ? new Color3(0.98, 0.16, 0.04) : new Color3(0.68, 0.07, 0.02);

      // Asymmetric arms stride
      const armSpread = 0.44;
      armA.position.set(monster.x - Math.cos(monster.yaw) * armSpread, 1.25 + mBobY, monster.z + Math.sin(monster.yaw) * armSpread);
      armA.rotation.x = stride * 0.55;
      armA.rotation.z = 0.18;

      armB.position.set(monster.x + Math.cos(monster.yaw) * (armSpread + 0.06), 1.18 + mBobY, monster.z - Math.sin(monster.yaw) * (armSpread + 0.06));
      armB.rotation.x = -stride * 0.65;
      armB.rotation.z = -0.22;

      // Claw talons on arm B
      for (let i = 0; i < clawTalons.length; i++) {
        const tOffset = (i - 1) * 0.08;
        clawTalons[i].position.set(armB.position.x + Math.sin(monster.yaw) * 0.12, armB.position.y - 0.72, armB.position.z + Math.cos(monster.yaw) * 0.12 + tOffset);
        clawTalons[i].rotation.x = Math.PI / 1.8 - stride * 0.4;
        clawTalons[i].rotation.y = monster.yaw;
        clawTalons[i].isVisible = true;
      }

      body.isVisible = true;
      core.isVisible = true;
      head.isVisible = true;
      armA.isVisible = true;
      armB.isVisible = true;
      eyeA.isVisible = true;
      eyeB.isVisible = true;

      // Trigger sonic shockwave pulse on mode transition or when close
      if (enraged && sonicPulseProgress >= 1.0) {
        sonicPulseProgress = 0;
        sonicWave.position.set(monster.x, 0.08, monster.z);
      }
      if (sonicPulseProgress < 1.0) {
        sonicPulseProgress += gameDt * 1.8;
        const currentScale = 0.5 + sonicPulseProgress * 12.0;
        sonicWave.scaling.set(currentScale, 1.0, currentScale);
        sonicMat.alpha = Math.max(0, (1.0 - sonicPulseProgress) * 0.45);
      } else {
        sonicMat.alpha = 0;
      }

      // Dynamic chromatic aberration increase during chase or low health
      if (pipeline.chromaticAberration) {
        const targetAberration = enraged ? 58 : world.health < 40 ? 44 : 14;
        pipeline.chromaticAberration.aberrationAmount += (targetAberration - pipeline.chromaticAberration.aberrationAmount) * Math.min(1, gameDt * 4);
      }

      // Flicker practical lights when predator stalks nearby
      for (const light of staticLights) {
        const lightDist = Math.hypot(light.position.x - monster.x, light.position.z - monster.z);
        if (lightDist < 11) {
          light.intensity = (light.name.includes("relay") ? 0.75 : 0.48) * (Math.random() < 0.14 ? 0.2 : 1.0);
        }
      }

      for (const model of remotePlayers.values()) {
        model.body.position.x += (model.target.x - model.body.position.x) * 0.28;
        model.body.position.z += (model.target.z - model.body.position.z) * 0.28;
        model.body.position.y = model.state.downed ? 0.36 : 0.86;
        model.body.rotation.y = model.target.yaw;
        model.body.isVisible = model.state.connected && !model.state.escaped && !model.state.eliminated && !model.state.hidden;
        model.head.position.set(model.body.position.x, model.state.downed ? 0.6 : 1.75, model.body.position.z);
        model.head.isVisible = model.body.isVisible;
        voice.setDistance(model.state.id, Math.hypot(p.x - model.state.x, p.z - model.state.z));
      }

      if (world.relayPuzzleActive && Math.hypot(p.x, p.z) < 5.4) {
        ui.setPrompt(`ALIGN SIGNAL LAMP ${world.puzzlePattern[world.puzzleIndex]} · PRESS E`);
        for (let i = 0; i < 3; i++) {
          const dial = scene.getMeshByName(`signal-lamp-${i + 1}`);
          if (dial?.material instanceof StandardMaterial) dial.material.emissiveColor = i + 1 === world.puzzlePattern[world.puzzleIndex] ? new Color3(0.52, 0.3, 0.07) : new Color3(0.03, 0.025, 0.02);
        }
      } else ui.setPrompt(getNearestInteractable());
      const room = roomAt(p.x, p.z);
      if (room !== currentRoom) { currentRoom = room; }
    const snapshot = world.snapshot(); snapshot.room = room;
      if (onlineState?.phase === "playing") {
        snapshot.remaining = onlineState.remaining;
        snapshot.relayParts = onlineState.teamParts;
        snapshot.monsterMode = onlineState.monster.mode;
        snapshot.gateOpen = onlineState.gateOpen;
        snapshot.relayReady = onlineState.relayReady;
        snapshot.relayPuzzleActive = onlineState.relayPuzzleActive;
      }
      ui.render(snapshot, world.items.filter(item => item.collected).length, currentSlot);
      ui.renderTeam(onlineState?.players ?? [], roomClient.playerId);
      audio.update(gameDt, monster.mode, distance, world.flashlight, isMoving, sprinting, crouched, room, p, cam.rotation.y, { x: monster.x, z: monster.z }, world.health);
  };
  const observer = scene.onBeforeRenderObservable.add(onFrame);

  if (import.meta.env.DEV) {
    Object.assign(window, {
      __hollowRelayDebug: {
        scene, camera: cam, world, monster, wallMeshes, colliders,
        get frameCount() { return frameCount; },
        get demoBooted() { return demoBooted; },
        get demoStarted() { return demoStarted; },
        get demoStage() { return pilotStage; },
        get demoWaypoints() { return pilotQueue.length; },
        get phase() { return world.phase; },
        start: () => { world.start(seed); world.flashlight = true; setTorch(true); monster.reset(seed); },
      },
    });
  }

  const onDigits = (event: KeyboardEvent) => {
    if (world.phase === "playing" && world.relayPuzzleActive && Math.hypot(cam.position.x, cam.position.z) < 5.4) {
      const digit = Number(event.key);
      if (digit >= 1 && digit <= 3) { if (onlineState?.phase === "playing") roomClient.action("switch", digit); else world.activateSwitch(digit, cameraWorld()); audio.cue(190 + digit * 28, 0.09, 0.05); }
    }
  };
  window.addEventListener("keydown", onDigits);

  return {
    scene,
    dispose() {
      if (import.meta.env.DEV) Reflect.deleteProperty(window, "__hollowRelayDebug");
      window.removeEventListener("keydown", onDigits);
      roomClient.close(); voice.dispose(); coopUI.dispose();
      remotePlayers.forEach(model => { model.body.dispose(); model.head.dispose(); }); remotePlayers.clear();
      input.dispose(); ui.dispose(); audio.dispose();
      scene.onBeforeRenderObservable.remove(observer);
      scene.dispose();
    },
  };
}

function makeMat(scene: Scene, name: string, color: Color3, emissive = new Color3(0, 0, 0)) {
  const material = new StandardMaterial(name, scene);
  material.diffuseColor = color; material.emissiveColor = emissive;
  material.specularColor = new Color3(0.07, 0.065, 0.05);
  return material;
}
