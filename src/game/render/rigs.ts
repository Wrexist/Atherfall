// Which clip each game animation state plays, and how big each model is drawn.
//
// Two families of models: the original Kenney minis (one small clip set baked
// into each file) and KayKit characters (one shared rig; clips ship once in
// animations.glb and bind to any KayKit model by bone name).

/** Shared KayKit animation library (see scripts/models/build-kaykit.mjs). */
export const KAYKIT_ANIMATIONS = "/models/kaykit/animations.glb";

/** Clip name per logical animation state, Kenney minis. */
export const KENNEY_CLIPS: Record<string, string> = {
  idle: "idle",
  walk: "walk",
  sprint: "sprint",
  jump: "jump",
  fall: "fall",
  attack: "attack-melee-right",
  attack1: "attack-melee-right",
  attack2: "attack-melee-left",
  attack3: "attack-melee-right",
  dodge: "crouch",
  burst: "attack-kick-right",
  ward: "interact-left",
  hit: "fall",
  swim: "walk",
  tread: "idle",
  climb: "jump",
  hang: "static",
  windup: "interact-right",
  die: "die",
  talk: "emote-yes",
};

/** KayKit defaults: a sword-and-board fighter. */
const KAYKIT_CLIPS: Record<string, string> = {
  idle: "Idle",
  walk: "Walking_A",
  sprint: "Running_A",
  jump: "Jump_Idle",
  fall: "Jump_Idle",
  attack: "1H_Melee_Attack_Chop",
  attack1: "1H_Melee_Attack_Slice_Diagonal",
  attack2: "1H_Melee_Attack_Slice_Horizontal",
  attack3: "2H_Melee_Attack_Spin",
  dodge: "Dodge_Forward",
  burst: "2H_Melee_Attack_Spin",
  ward: "Block",
  hit: "Hit_A",
  swim: "Walking_B",
  tread: "Idle",
  climb: "Jump_Idle",
  hang: "Jump_Idle",
  windup: "Block",
  die: "Death_A",
  talk: "Interact",
};

export interface RigInfo {
  kind: "kenney" | "kaykit";
  /** Multiplies the game's size for this character (sizes were tuned on Kenney minis). */
  scale: number;
  clips: Record<string, string>;
  /**
   * Kenney minis have no roll, spin or flinch clips, so those are faked by
   * rotating the whole body; KayKit has real clips for them.
   */
  proceduralMoves: boolean;
}

const KENNEY: RigInfo = { kind: "kenney", scale: 1, clips: KENNEY_CLIPS, proceduralMoves: true };

/** KayKit characters stand ~2.4 units tall; this puts them a touch larger than the old minis. */
const KAYKIT_SCALE = 0.38;

const kaykit = (overrides: Record<string, string> = {}): RigInfo => ({
  kind: "kaykit",
  scale: KAYKIT_SCALE,
  clips: { ...KAYKIT_CLIPS, ...overrides },
  proceduralMoves: false,
});

const SKELETON = {
  walk: "Walking_D_Skeletons",
  sprint: "Running_A",
  windup: "Taunt",
  die: "Death_C_Skeletons",
};

/** Rig per model file. Anything not listed is a Kenney mini. */
export const RIGS: Record<string, RigInfo> = {
  "/models/kaykit/knight.glb": kaykit(),
  "/models/kaykit/ranger.glb": kaykit({
    attack1: "1H_Ranged_Shoot",
    attack2: "1H_Ranged_Shoot",
    attack3: "1H_Ranged_Shoot",
    burst: "1H_Ranged_Shoot",
    ward: "Use_Item",
  }),
  "/models/kaykit/mage.glb": kaykit({
    attack1: "Spellcast_Shoot",
    attack2: "Spellcast_Shoot",
    attack3: "Spellcast_Shoot",
    burst: "Spellcast_Long",
    ward: "Spellcast_Raise",
  }),
  "/models/kaykit/rogue.glb": kaykit(),
  "/models/kaykit/barbarian.glb": kaykit(),
  "/models/kaykit/elder.glb": kaykit(),
  "/models/kaykit/skeleton-minion.glb": kaykit(SKELETON),
  "/models/kaykit/skeleton-warrior.glb": kaykit({ ...SKELETON, attack: "2H_Melee_Attack_Chop" }),
  "/models/kaykit/skeleton-rogue.glb": kaykit({ ...SKELETON, attack: "1H_Melee_Attack_Stab" }),
  "/models/kaykit/skeleton-mage.glb": kaykit({
    ...SKELETON,
    attack: "Spellcast_Shoot",
    windup: "Spellcast_Raise",
  }),
};

export function rigFor(url: string): RigInfo {
  return RIGS[url] ?? KENNEY;
}
