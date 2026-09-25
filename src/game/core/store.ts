import { create } from "zustand";
import { ARCHETYPES, type ArchetypeId } from "../data/archetypes";
import { ITEMS, type EquipSlot } from "../data/items";
import { QUESTS } from "../data/quests";
import { sfx } from "./audio";
import { clearSaveStorage, emptyCodex, type Codex, type Quality } from "./persistence";
import {
  EMPTY_EQUIPPED,
  MAX_LEVEL,
  applyForge,
  batchDispose,
  equipItem,
  statsFor as rulesStats,
  unequipItem,
  xpForLevel,
  type Bag,
  type DerivedStats,
  type Equipped,
  type InvEntry,
} from "./rules";

export type { InvEntry, DerivedStats, Quality };
export { xpForLevel };

export type Screen = "loading" | "title" | "playing" | "paused" | "dead";
export type JournalTab = "satchel" | "forge" | "build" | "codex" | "map";

export interface Toast {
  id: number;
  text: string;
  tone: "info" | "good" | "bad" | "quest";
}

export interface Dialogue {
  name: string;
  lines: string[];
}

export interface GameState {
  screen: Screen;
  quality: Quality;
  muted: boolean;
  loadProgress: number;
  hasSave: boolean;

  archetype: ArchetypeId;
  hp: number;
  level: number;
  xp: number;
  gold: number;
  shards: number;
  potions: number;

  inventory: InvEntry[];
  equipped: Equipped;

  questIdx: number;
  questStep: number;
  questKills: number;
  /** Every quest in the line is finished. */
  questComplete: boolean;
  barrowUnlocked: boolean;
  codex: Codex;
  /** Discovered fast-travel waypoints. */
  waypoints: string[];
  /** Opened secret caches. */
  secrets: string[];
  /** Landmarks whose story has been read. */
  landmarks: string[];

  region: string | null;
  regionId: string | null;
  interactPrompt: string | null;
  dialogue: Dialogue | null;
  bossBar: { name: string; hp: number; max: number; phase: number } | null;
  inventoryOpen: boolean;
  journalTab: JournalTab;
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
  addItem: (itemId: string, quiet?: boolean) => void;
  equip: (uid: string) => void;
  unequip: (slot: EquipSlot) => void;
  disposeBatch: (uids: string[], mode: "sell" | "salvage") => void;
  forge: (uid: string, roll?: number) => void;
  setArchetype: (id: ArchetypeId) => void;
  usePotion: () => void;
  addXp: (n: number) => void;
  setHp: (hp: number) => void;
  advanceQuest: () => void;
  registerKill: (enemyType: string) => void;
  seeEnemy: (enemyType: string) => void;
  discoverPlace: (regionId: string) => void;
  openDialogue: (d: Dialogue | null) => void;
  toggleInventory: (v?: boolean, tab?: JournalTab) => void;
  hydrate: (partial: Partial<GameState>) => void;
  resetProgress: () => void;
}

/** Village services (forge, archetype change) are only offered here. */
export const VILLAGE_REGION = "village";

export function statsFor(s: Pick<GameState, "archetype" | "level" | "equipped">): DerivedStats {
  return rulesStats(s.archetype ?? "vanguard", s.level, s.equipped);
}

export function currentQuest(s: Pick<GameState, "questIdx">) {
  return QUESTS[s.questIdx];
}

let toastId = 0;
let uidCounter = 0;
export function newUid() {
  uidCounter += 1;
  return `i${Date.now().toString(36)}${uidCounter}`;
}

/** Phones and tablets start on Low (no shadows, lower resolution) — smooth first, pretty second. */
export function defaultQuality(): Quality {
  if (typeof window === "undefined" || !window.matchMedia) return "medium";
  const touch = window.matchMedia("(pointer: coarse)").matches;
  const weak = (navigator.hardwareConcurrency ?? 8) <= 4;
  return touch || weak ? "low" : "medium";
}

const INITIAL: GameState = {
  screen: "loading",
  quality: defaultQuality(),
  muted: false,
  loadProgress: 0,
  hasSave: false,
  archetype: "vanguard",
  hp: 110,
  level: 1,
  xp: 0,
  gold: 0,
  shards: 0,
  potions: 2,
  inventory: [],
  equipped: { ...EMPTY_EQUIPPED },
  questIdx: 0,
  questStep: 0,
  questKills: 0,
  questComplete: false,
  barrowUnlocked: false,
  codex: emptyCodex(),
  waypoints: ["emberhollow"],
  secrets: [],
  landmarks: [],
  region: "Emberhollow",
  regionId: "village",
  interactPrompt: null,
  dialogue: null,
  bossBar: null,
  inventoryOpen: false,
  journalTab: "satchel",
  toasts: [],
  deaths: 0,
  kills: 0,
  elapsed: 0,
};

function bagOf(s: GameState): Bag {
  return { inventory: s.inventory, equipped: s.equipped, gold: s.gold, shards: s.shards, level: s.level };
}

/**
 * Gear changes keep the amount of *missing* health the same, so swapping a
 * +HP item on and off mid-fight can never act as a free heal.
 */
function keepMissingHp(s: GameState, equipped: Equipped) {
  const oldMax = statsFor(s).maxHp;
  const newMax = statsFor({ ...s, equipped }).maxHp;
  return Math.max(1, Math.min(newMax, newMax - (oldMax - s.hp)));
}

export const useGame = create<GameState & GameActions>((set, get) => {
  /** Keep hp within the new max after any equipment/level/archetype change. */
  const clampHp = (next: Partial<GameState>, gain = 0) => {
    const s = { ...get(), ...next };
    const max = statsFor(s).maxHp;
    return Math.max(1, Math.min(max, s.hp + gain));
  };

  return {
    ...INITIAL,

    setScreen: (screen) => set({ screen }),
    setQuality: (quality) => set({ quality }),
    setMuted: (muted) => set({ muted }),
    setLoadProgress: (loadProgress) => set({ loadProgress }),

    toast: (text, tone = "info") => {
      toastId += 1;
      const id = toastId;
      set((s) => ({ toasts: [...s.toasts.slice(-3), { id, text, tone }] }));
      if (typeof window !== "undefined") {
        setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 3800);
      }
    },

    addItem: (itemId, quiet = false) => {
      const def = ITEMS[itemId];
      if (!def) return;
      const s = get();
      const codex = s.codex.items.includes(itemId) ? s.codex : { ...s.codex, items: [...s.codex.items, itemId] };
      set({ inventory: [...s.inventory, { uid: newUid(), itemId, plus: 0 }], codex });
      if (!quiet) get().toast(`Looted ${def.name}${def.boss ? " — boss reward!" : ""}`, def.boss ? "quest" : "good");
    },

    equip: (uid) => {
      const s = get();
      const r = equipItem(bagOf(s), uid);
      if (!r.ok) {
        get().toast(r.message, "bad");
        return;
      }
      set({ inventory: r.bag.inventory, equipped: r.bag.equipped, hp: keepMissingHp(s, r.bag.equipped) });
      sfx.pickup();
      get().toast(r.message, "good");
    },

    unequip: (slot) => {
      const s = get();
      const r = unequipItem(bagOf(s), slot);
      if (!r.ok) return;
      set({ inventory: r.bag.inventory, equipped: r.bag.equipped, hp: keepMissingHp(s, r.bag.equipped) });
      sfx.ui();
    },

    disposeBatch: (uids, mode) => {
      const r = batchDispose(bagOf(get()), uids, mode);
      if (!r.ok) return;
      set({ inventory: r.bag.inventory, gold: r.bag.gold, shards: r.bag.shards });
      sfx.pickup();
      get().toast(r.message, "good");
    },

    forge: (uid, roll = Math.random()) => {
      const s = get();
      if (s.regionId !== VILLAGE_REGION) {
        get().toast("The forge is in Emberhollow.", "bad");
        return;
      }
      const inBag = s.inventory.find((i) => i.uid === uid);
      const slot = (Object.keys(s.equipped) as EquipSlot[]).find((k) => s.equipped[k]?.uid === uid);
      const entry = inBag ?? (slot ? s.equipped[slot] : null);
      if (!entry) return;
      const r = applyForge(entry, { gold: s.gold, shards: s.shards }, roll);
      if (!r.ok) {
        get().toast(r.message, "bad");
        return;
      }
      const inventory = inBag ? s.inventory.map((i) => (i.uid === uid ? r.entry : i)) : s.inventory;
      const equipped = slot ? { ...s.equipped, [slot]: r.entry } : s.equipped;
      set({ gold: r.gold, shards: r.shards, inventory, equipped, hp: clampHp({ equipped }) });
      if (r.success) sfx.levelUp();
      else sfx.hurt();
      get().toast(r.message, r.success ? "good" : "bad");
    },

    setArchetype: (id) => {
      const s = get();
      if (s.archetype === id) return;
      if (s.regionId !== VILLAGE_REGION) {
        get().toast("You can change your path only in Emberhollow.", "bad");
        return;
      }
      const next = { archetype: id };
      set({ archetype: id, hp: statsFor({ ...s, ...next }).maxHp });
      sfx.quest();
      get().toast(`You walk the path of the ${ARCHETYPES[id].name}.`, "quest");
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
      while (level < MAX_LEVEL && xp >= xpForLevel(level)) {
        xp -= xpForLevel(level);
        level += 1;
      }
      if (level >= MAX_LEVEL) xp = Math.min(xp, xpForLevel(level) - 1);
      if (level > s.level) {
        const maxHp = statsFor({ ...s, level }).maxHp;
        set({ xp, level, hp: maxHp });
        sfx.levelUp();
        get().toast(`Level ${level}`, "good");
      } else {
        set({ xp });
      }
    },

    setHp: (hp) => set({ hp }),

    advanceQuest: () => {
      const s = get();
      const quest = QUESTS[s.questIdx];
      if (s.questComplete || !quest) return;
      const next = s.questStep + 1;
      sfx.quest();
      if (next < quest.steps.length) {
        set({ questStep: next, questKills: 0 });
        get().toast(quest.steps[next]!.title, "quest");
        return;
      }
      // Quest finished: one-time reward, guarded because the step index moves on.
      const r = quest.reward;
      const last = s.questIdx >= QUESTS.length - 1;
      set({
        questIdx: last ? s.questIdx : s.questIdx + 1,
        questStep: last ? next : 0,
        questKills: 0,
        questComplete: last,
        barrowUnlocked: true,
        gold: s.gold + r.gold,
        potions: s.potions + r.potions,
        shards: s.shards + r.shards,
      });
      get().toast(quest.completionTitle, "quest");
      get().toast(`Reward: ${r.text}`, "good");
      get().addXp(r.xp);
      if (!last) get().toast(`New quest: ${QUESTS[s.questIdx + 1]!.name}`, "quest");
    },

    registerKill: (enemyType) => {
      const s = get();
      const codex = { ...s.codex, kills: { ...s.codex.kills, [enemyType]: (s.codex.kills[enemyType] ?? 0) + 1 } };
      if (!codex.seen.includes(enemyType)) codex.seen = [...codex.seen, enemyType];
      set({ kills: s.kills + 1, codex });
      const step = QUESTS[s.questIdx]?.steps[s.questStep];
      if (s.questComplete || !step) return;
      if (step.kind === "kill" && step.enemy === enemyType) {
        const questKills = s.questKills + 1;
        set({ questKills });
        if (questKills >= step.count) get().advanceQuest();
        else get().toast(`${step.title.replace(/\d+/, `${questKills}/${step.count}`)}`, "quest");
      }
      if (step.kind === "boss" && step.enemy === enemyType) get().advanceQuest();
    },

    seeEnemy: (enemyType) => {
      const s = get();
      if (s.codex.seen.includes(enemyType)) return;
      set({ codex: { ...s.codex, seen: [...s.codex.seen, enemyType] } });
    },

    discoverPlace: (regionId) => {
      const s = get();
      if (s.codex.places.includes(regionId)) return;
      set({ codex: { ...s.codex, places: [...s.codex.places, regionId] } });
    },

    openDialogue: (dialogue) => set({ dialogue }),
    toggleInventory: (v, tab) =>
      set((s) => {
        const open = v ?? (tab && tab !== s.journalTab ? true : !s.inventoryOpen);
        return { inventoryOpen: open, journalTab: tab ?? s.journalTab };
      }),

    hydrate: (partial) => set(partial as Partial<GameState & GameActions>),

    resetProgress: () =>
      set({
        ...INITIAL,
        codex: emptyCodex(),
        waypoints: ["emberhollow"],
        secrets: [],
        landmarks: [],
        equipped: { ...EMPTY_EQUIPPED },
        screen: get().screen,
        quality: get().quality,
        muted: get().muted,
        loadProgress: 1,
        hasSave: false,
      }),
  };
});

export function clearSave() {
  clearSaveStorage();
  useGame.setState({ hasSave: false });
}
