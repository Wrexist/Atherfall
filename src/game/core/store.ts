import { create } from "zustand";
import { ITEMS, type EquipSlot, type ItemDef } from "../data/items";
import { STARTER_QUEST } from "../data/quests";
import { sfx } from "./audio";

export type Screen = "loading" | "title" | "playing" | "paused" | "dead";
export type Quality = "low" | "medium" | "high";

export interface InvEntry {
  uid: string;
  itemId: string;
}

export interface Toast {
  id: number;
  text: string;
  tone: "info" | "good" | "bad" | "quest";
}

export interface Dialogue {
  name: string;
  lines: string[];
}

export interface DerivedStats {
  attack: number;
  defense: number;
  maxHp: number;
}

export interface GameState {
  screen: Screen;
  quality: Quality;
  muted: boolean;
  loadProgress: number;
  hasSave: boolean;

  hp: number;
  level: number;
  xp: number;
  gold: number;
  potions: number;

  inventory: InvEntry[];
  equipped: Record<EquipSlot, string | null>;

  questStep: number;
  questKills: number;
  questComplete: boolean;
  shoreUnlocked: boolean;

  region: string | null;
  interactPrompt: string | null;
  dialogue: Dialogue | null;
  bossBar: { name: string; hp: number; max: number } | null;
  inventoryOpen: boolean;
  toasts: Toast[];
  deaths: number;
  kills: number;
  elapsed: number;
}

export interface GameActions {
  setScreen: (s: Screen) => void;
  setQuality: (q: Quality) => void;
  setMuted: (m: boolean) => void;
  setLoadProgress: (n: number) => void;
  toast: (text: string, tone?: Toast["tone"]) => void;
  addItem: (itemId: string) => void;
  equip: (uid: string) => void;
  unequip: (slot: EquipSlot) => void;
  dropItem: (uid: string) => void;
  usePotion: () => void;
  addXp: (n: number) => void;
  setHp: (hp: number) => void;
  advanceQuest: () => void;
  registerKill: (enemyType: string) => void;
  openDialogue: (d: Dialogue | null) => void;
  toggleInventory: (v?: boolean) => void;
  hydrate: (partial: Partial<GameState>) => void;
  resetProgress: () => void;
}

export function xpForLevel(level: number) {
  return Math.round(120 * Math.pow(level, 1.35));
}

export function statsFor(state: Pick<GameState, "level" | "equipped">): DerivedStats {
  let attack = 6 + state.level * 2;
  let defense = 2 + state.level;
  let maxHp = 100 + (state.level - 1) * 18;
  (Object.keys(state.equipped) as EquipSlot[]).forEach((slot) => {
    const id = state.equipped[slot];
    const def: ItemDef | undefined = id ? ITEMS[id] : undefined;
    if (!def) return;
    attack += def.attack ?? 0;
    defense += def.defense ?? 0;
    maxHp += def.health ?? 0;
  });
  return { attack, defense, maxHp };
}

let toastId = 0;
let uidCounter = 0;
export function newUid() {
  uidCounter += 1;
  return `i${Date.now().toString(36)}${uidCounter}`;
}

const INITIAL: GameState = {
  screen: "loading",
  quality: "medium",
  muted: false,
  loadProgress: 0,
  hasSave: false,
  hp: 100,
  level: 1,
  xp: 0,
  gold: 0,
  potions: 2,
  inventory: [],
  equipped: { weapon: null, armor: null, trinket: null },
  questStep: 0,
  questKills: 0,
  questComplete: false,
  shoreUnlocked: false,
  region: "village",
  interactPrompt: null,
  dialogue: null,
  bossBar: null,
  inventoryOpen: false,
  toasts: [],
  deaths: 0,
  kills: 0,
  elapsed: 0,
};

export const useGame = create<GameState & GameActions>((set, get) => ({
  ...INITIAL,

  setScreen: (screen) => set({ screen }),
  setQuality: (quality) => set({ quality }),
  setMuted: (muted) => set({ muted }),
  setLoadProgress: (loadProgress) => set({ loadProgress }),

  toast: (text, tone = "info") => {
    toastId += 1;
    const id = toastId;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, text, tone }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 3800);
  },

  addItem: (itemId) => {
    const def = ITEMS[itemId];
    if (!def) return;
    set((s) => ({ inventory: [...s.inventory, { uid: newUid(), itemId }] }));
    get().toast(`Looted ${def.name}`, "good");
  },

  equip: (uid) => {
    const s = get();
    const entry = s.inventory.find((i) => i.uid === uid);
    if (!entry) return;
    const def = ITEMS[entry.itemId];
    if (!def) return;
    const prev = s.equipped[def.slot];
    const inventory = s.inventory.filter((i) => i.uid !== uid);
    if (prev) inventory.push({ uid: newUid(), itemId: prev });
    const equipped = { ...s.equipped, [def.slot]: def.id };
    const maxHp = statsFor({ level: s.level, equipped }).maxHp;
    set({ inventory, equipped, hp: Math.min(s.hp + (def.health ?? 0), maxHp) });
    sfx.pickup();
    get().toast(`Equipped ${def.name}`, "good");
  },

  unequip: (slot) => {
    const s = get();
    const id = s.equipped[slot];
    if (!id) return;
    const equipped = { ...s.equipped, [slot]: null };
    const maxHp = statsFor({ level: s.level, equipped }).maxHp;
    set({
      equipped,
      inventory: [...s.inventory, { uid: newUid(), itemId: id }],
      hp: Math.min(s.hp, maxHp),
    });
    sfx.ui();
  },

  dropItem: (uid) => {
    set((s) => ({ inventory: s.inventory.filter((i) => i.uid !== uid) }));
    sfx.ui();
  },

  usePotion: () => {
    const s = get();
    if (s.potions <= 0 || s.screen !== "playing") return;
    const max = statsFor(s).maxHp;
    if (s.hp >= max) {
      get().toast("Already at full health", "info");
      return;
    }
    set({ potions: s.potions - 1, hp: Math.min(max, s.hp + Math.round(max * 0.45)) });
    sfx.heal();
    get().toast("Sunbloom Draught restores your wounds", "good");
  },

  addXp: (n) => {
    const s = get();
    let xp = s.xp + n;
    let level = s.level;
    let leveled = false;
    while (xp >= xpForLevel(level)) {
      xp -= xpForLevel(level);
      level += 1;
      leveled = true;
    }
    if (leveled) {
      const maxHp = statsFor({ level, equipped: s.equipped }).maxHp;
      set({ xp, level, hp: maxHp });
      sfx.levelUp();
      get().toast(`Level ${level} — you feel steadier`, "good");
    } else {
      set({ xp });
    }
  },

  setHp: (hp) => set({ hp }),

  advanceQuest: () => {
    const s = get();
    if (s.questComplete) return;
    const next = s.questStep + 1;
    sfx.quest();
    if (next >= STARTER_QUEST.steps.length) {
      // One-time reward, guarded by questComplete above.
      set({ questStep: next, questComplete: true, shoreUnlocked: true, gold: s.gold + 50, potions: s.potions + 2 });
      get().toast(STARTER_QUEST.completionTitle, "quest");
      get().toast("Reward: 50 embers, 2 Sunbloom Draughts, Tidewrack Shore unlocked", "good");
      get().addXp(120);
    } else {
      set({ questStep: next, questKills: 0 });
      get().toast(STARTER_QUEST.steps[next]!.title, "quest");
    }
  },

  registerKill: (enemyType) => {
    const s = get();
    set({ kills: s.kills + 1 });
    const step = STARTER_QUEST.steps[s.questStep];
    if (step && step.kind === "kill" && step.enemy === enemyType) {
      const questKills = s.questKills + 1;
      if (questKills >= step.count) {
        set({ questKills });
        get().advanceQuest();
      } else {
        set({ questKills });
        get().toast(`${questKills}/${step.count} Bramblekin culled`, "quest");
      }
    }
    if (step && step.kind === "boss" && step.enemy === enemyType) {
      get().advanceQuest();
    }
  },

  openDialogue: (dialogue) => set({ dialogue }),
  toggleInventory: (v) => set((s) => ({ inventoryOpen: v ?? !s.inventoryOpen })),

  hydrate: (partial) => set(partial as Partial<GameState & GameActions>),

  resetProgress: () =>
    set({
      ...INITIAL,
      screen: get().screen,
      quality: get().quality,
      muted: get().muted,
      loadProgress: 1,
      hasSave: false,
    }),
}));
