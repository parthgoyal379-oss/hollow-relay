export interface LoreDocument {
  id: string;
  title: string;
  subtitle: string;
  date: string;
  roomName: string;
  roomId: string;
  point: { x: number; z: number };
  classifiedStamp?: string;
  lines: string[];
  footer?: string;
}

export const LORE_DOCUMENTS: LoreDocument[] = [
  {
    id: "doc-archive-vance",
    title: "MEMORANDUM: FREQUENCY 734.2 kHz",
    subtitle: "OFFICE OF NAVAL RESEARCH — DIVISION 9",
    date: "OCTOBER 14, 1947",
    roomName: "Flooded Archive",
    roomId: "archive",
    point: { x: -10.5, z: -17.0 },
    classifiedStamp: "TOP SECRET // LEVEL 5",
    lines: [
      "To all Telegraph & Acoustic Staff:",
      "Effective 02:00, standard North Atlantic maritime channels are suspended. Receiver Array B is to remain locked onto 734.2 kHz indefinitely.",
      "Do not attempt to log the carrier tone in the Admiralty ledger. If you hear voices speaking in cadence below 18 Hertz, do not respond. Take 15ml of chloral hydrate and report to the quarantine wing immediately.",
      "Dr. Vance's hypothesis has been confirmed: the signal is not artificial. It originates from the abyssal trench 40 miles off Blackwater Point. It is alive, and it is searching for an acoustic medium."
    ],
    footer: "DESTROY AFTER READING // PENALTY FOR DISCLOSURE: TREASON"
  },
  {
    id: "doc-dormitory-reed",
    title: "JOURNAL ENTRY: THE TURNING",
    subtitle: "RECOVERED NOTEBOOK OF NURSE M. REED",
    date: "NOVEMBER 03, 1947",
    roomName: "North Dormitory",
    roomId: "dormitory",
    point: { x: -14.2, z: 14.5 },
    classifiedStamp: "QUARANTINE RECORD",
    lines: [
      "Chief Engineer Jonathan Cole hasn't spoken a human word in four days. He sits in the dark and clicks his teeth in sync with the storm outside.",
      "When I brought his broth, I noticed his ears... the flesh has fused shut, calcifying into hard ridged horn like a hollow conch shell. He pulled out both his eyes with his bare fingers yesterday. He told Dr. Vance: 'Eyes are useless grease. The room is made of ringing stone.'",
      "He knows where we are without looking. When I dropped my fountain pen in the corridor, he broke through the door in two strides. He tracks the echo of your blood pumping. God help us, he isn't sick... he's evolving into an acoustic predator."
    ],
    footer: "Page stained with dried blood and charcoal dust."
  },
  {
    id: "doc-gallery-autopsy",
    title: "AUTOPSY REPORT NO. 44-B",
    subtitle: "SUBJECT: TELEGRAPH OPERATOR EVANS (DECEASED)",
    date: "NOVEMBER 12, 1947",
    roomName: "Portrait Gallery",
    roomId: "gallery",
    point: { x: 0.5, z: 14.2 },
    classifiedStamp: "BIO-ACOUSTIC HAZARD",
    lines: [
      "External Examination: Severe hemorrhaging from both auditory canals. Cranial sutures along the temporal bones have expanded by 34mm.",
      "Internal Examination: The cochlea and stirrup have elongated into serrated resonance filaments that pierce directly into the cerebellum. The brain tissue has been re-wired: acoustic input directly triggers predatory motor reflex.",
      "Behavioral Analysis: The organism (designated 'THE LISTENER') possesses zero optical vision. Light from flashlights does not reveal your position unless reflected into its facial cavity.",
      "SURVIVAL PROTOCOL: Crouch. Break line of sight behind wardrobes. If pursued, do not run in straight corridors."
    ],
    footer: "DR. ALISTAIR VANCE — CHIEF PATHOLOGIST"
  },
  {
    id: "doc-dining-cross",
    title: "ELEANOR CROSS'S LAST BROADCAST",
    subtitle: "SCRIBED ON TELEGRAPH RIBBON",
    date: "NOVEMBER 18, 1947 — 02:40 AM",
    roomName: "The Dining Room",
    roomId: "dining",
    point: { x: -13.8, z: 0.8 },
    classifiedStamp: "SURVIVOR LOG",
    lines: [
      "If anyone reaches Blackwater alive: I did what had to be done.",
      "Vance went mad. He tried to amplify the 734 kHz broadcast through the coastal transmitter. Cole butchered the medical staff. I severed the main bus and hid the three calibration modules across the estate:",
      "1. The Silver Vacuum Tube (Oscillator)",
      "2. The Copper Induction Spool (Carrier)",
      "3. The High-Pressure Mercury Valve (Regulator)",
      "Collect all three. Insert them into the Master Relay Console in the center hall, then match the three-lamp sequence. Once calibrated, the radio will broadcast a distress frequency to the offshore coast guard and release the yard gate.",
      "Do not let Cole intercept you. The road is flooded. The gate is our only exit."
    ],
    footer: "ELEANOR CROSS — CHIEF RADIO OPERATOR (3RD CLASS)"
  },
  {
    id: "doc-boiler-gate",
    title: "GATE HYDRAULIC MANUAL",
    subtitle: "ESTATE DEFENSE PROTOCOL",
    date: "OCTOBER 1944",
    roomName: "Boiler Annex",
    roomId: "boiler",
    point: { x: 14.2, z: -13.8 },
    classifiedStamp: "RESTRICTED",
    lines: [
      "The Blackwater Iron Perimeter Gate is operated by a heavy hydraulic ram. In case of storm power loss or facility lockdown:",
      "STEP 1: The Master Relay must be transmitting (energizes the electronic solenoid release).",
      "STEP 2: The hydraulic reservoir must be primed with one 20-Liter Military Kerosene Fuel Canister (stored on the boiler shelf).",
      "STEP 3: The double-bitted Iron Gate Key must be inserted into the master cylinder outside.",
      "WARNING: Opening the hydraulic gate produces high-decibel metal screeching (approx. 95 dB). Any acoustic entities within 150 meters will be drawn immediately. Prepare to evacuate through the gate without delay."
    ],
    footer: "WAR DEPARTMENT // COASTAL INSTALLATIONS COMMAND"
  }
];

export interface IncidentEvaluation {
  rank: "S" | "A" | "B" | "C" | "D";
  title: string;
  rankComment: string;
  timeBonus: string;
  loreScore: string;
  survivalNotes: string;
  epilogue: string;
}

export function evaluateEscape(elapsedSeconds: number, health: number, dossiersRead: number, totalDossiers: number, won: boolean): IncidentEvaluation {
  if (!won) {
    return {
      rank: "D",
      title: "SUBJECT KIA — ARCHIVE CLOSED",
      rankComment: "THE TRANSMISSION PROPAGATES",
      timeBonus: `${Math.floor(elapsedSeconds / 60)}m ${Math.floor(elapsedSeconds % 60)}s`,
      loreScore: `${dossiersRead} / ${totalDossiers} DOSSIERS`,
      survivalNotes: "Vital signs extinguished within Blackwater Estate.",
      epilogue: "The dawn never reaches the coastline. The master relay hums into overdrive, carrying Frequency 734.2 kHz across the eastern power grid. By morning, thousands of radio dials across the state begin to whisper."
    };
  }

  const minutes = elapsedSeconds / 60;
  let rank: "S" | "A" | "B" | "C" = "C";

  if (minutes < 4.5 && health >= 80 && dossiersRead >= 4) {
    rank = "S";
  } else if (minutes < 7.0 && dossiersRead >= 3) {
    rank = "A";
  } else if (minutes < 10.0) {
    rank = "B";
  }

  const epilogues: Record<"S" | "A" | "B" | "C", { comment: string; text: string }> = {
    S: {
      comment: "SPECIAL TACTICS EXCELLENCE",
      text: "03:52 AM — You smash through the heavy iron gate into the howling gale. Behind you, the Blackwater transmitter tower explodes into blue sparks as the circuit breaker ruptures. The offshore naval cutter spots your distress flare. Dr. Vance's classified research is secured in your hands. The acoustic horror dies with the house."
    },
    A: {
      comment: "EXEMPLARY SURVIVAL",
      text: "04:15 AM — You clear the perimeter stone wall as the Listener reaches the courtyard gates. The hydraulic deadbolt locks behind you. A coast guard patrol boat pulls you from the freezing surf. You survived the 1947 Blackwater incident with critical evidence intact."
    },
    B: {
      comment: "STANDARD EXTRACTION",
      text: "04:38 AM — Bloodied and exhausted, you stumble past the iron gate into the marshes. The carrier signal was broadcast, but the house remains standing. Somewhere behind the mist, Cole's footsteps echo across the wet stones."
    },
    C: {
      comment: "MARGINAL SURVIVAL",
      text: "04:55 AM — Minutes before total system collapse, you crawl through the gate. The injuries sustained will never fully heal, and in your ears, the low-frequency hum of 734.2 kHz will linger for the rest of your days."
    }
  };

  const choice = epilogues[rank];
  return {
    rank,
    title: `CASE FILE EVACUATION REPORT // RANK ${rank}`,
    rankComment: choice.comment,
    timeBonus: `${Math.floor(elapsedSeconds / 60)}m ${Math.floor(elapsedSeconds % 60)}s`,
    loreScore: `${dossiersRead} / ${totalDossiers} DOSSIERS DISCOVERED`,
    survivalNotes: `Final health: ${Math.round(health)}% · Physical state stabilized`,
    epilogue: choice.text
  };
}

import type { ItemId } from "./types";

export interface ItemExamineInfo {
  id: ItemId;
  name: string;
  category: "RELAY COMPONENT" | "GATE HARDWARE" | "SURVIVAL GEAR" | "FIELD DECOY";
  militaryRef: string;
  weight: string;
  description: string;
  protocol: string;
}

export const ITEM_EXAMINE_DATA: Record<ItemId, ItemExamineInfo> = {
  fuse: {
    id: "fuse",
    name: "Silver Vacuum Tube (Model CV-1070)",
    category: "RELAY COMPONENT",
    militaryRef: "ONR-SPEC-47-B",
    weight: "0.45 kg",
    description: "Thorium-filament high-frequency triode amplifier tube with silvered quartz envelope. Used in coastal radar telegraph transceivers to isolate carrier waves.",
    protocol: "Slot 1 of 3 required for Master Relay Console. Essential for tuning transmitter to 734.2 kHz."
  },
  spool: {
    id: "spool",
    name: "Copper Induction Spool",
    category: "RELAY COMPONENT",
    militaryRef: "TEL-IND-800T",
    weight: "1.20 kg",
    description: "Heavy precision-wound copper choke coil encased in vulcanized gutta-percha. Suppresses stray bio-acoustic harmonic feedback across high-voltage relays.",
    protocol: "Slot 2 of 3 required for Master Relay Console. Dampens sonic resonance spikes."
  },
  valve: {
    id: "valve",
    name: "High-Pressure Hydraulic Valve",
    category: "RELAY COMPONENT",
    militaryRef: "NAV-VALVE-44",
    weight: "2.10 kg",
    description: "Cast naval bronze three-way directional flow regulator with lead gasket seals. Built to withstand subterranean steam pressure in the boiler line.",
    protocol: "Slot 3 of 3 required for Master Relay Console. Connects hydraulic line pressure."
  },
  gateKey: {
    id: "gateKey",
    name: "Blackwater Estate Gate Key",
    category: "GATE HARDWARE",
    militaryRef: "KEY-MORTISE-01",
    weight: "0.35 kg",
    description: "Hand-forged double-bitted iron key stamped with the naval anchor and owl crest. Opens the perimeter hydraulic ram deadbolt in the Black Yard.",
    protocol: "Insert into the perimeter gate lock cylinder outside along with kerosene fuel."
  },
  fuelCell: {
    id: "fuelCell",
    name: "Military Kerosene Canister",
    category: "GATE HARDWARE",
    militaryRef: "FUEL-CAN-20L",
    weight: "3.40 kg",
    description: "Heavy-gauge stamped steel jerrycan filled with high-flashpoint naval kerosene. Used to ignite the auxiliary steam pressure boiler.",
    protocol: "Pours into the hydraulic auxiliary pressure cylinder at the iron yard gate."
  },
  medkit: {
    id: "medkit",
    name: "Emergency First Aid Spray",
    category: "SURVIVAL GEAR",
    militaryRef: "MED-SPRAY-1947",
    weight: "0.50 kg",
    description: "Pressurized aerosol canister containing topical coagulant styptic, ethyl chloride analgesic, and sterile field dressing. Restores 45% vital integrity.",
    protocol: "Press [SPACE] or use from inventory to immediately treat traumatic lacerations."
  },
  noiseMaker: {
    id: "noiseMaker",
    name: "Clockwork Metronome Decoy",
    category: "FIELD DECOY",
    militaryRef: "DECOY-TICK-V2",
    weight: "0.80 kg",
    description: "Wind-up brass spring mechanism fitted with an acoustic resonating chime. Produces high-amplitude rhythmic clicking (85 dB) for 15 seconds.",
    protocol: "Drop in a corridor or adjoining room to mislead Chief Engineer Cole's hearing away from your path."
  },
  battery: {
    id: "battery",
    name: "Industrial Dry Cell Battery",
    category: "SURVIVAL GEAR",
    militaryRef: "CELL-ZINC-1.5V",
    weight: "0.65 kg",
    description: "Heavy zinc-carbon cylindrical cell with wax hermetic seal. Recharges the survivor's handheld inspection lamp to full 100% capacity.",
    protocol: "Press [SPACE] while lamp battery is depleted to restore illumination."
  }
};
