// Quest line. Quests run in order; each step is evaluated by the simulation.

export type QuestStep =
  | { kind: "talk"; npc: string; title: string; hint: string }
  | { kind: "reach"; area: string; title: string; hint: string }
  | { kind: "kill"; enemy: string; count: number; title: string; hint: string }
  | { kind: "equip"; slot: "weapon"; title: string; hint: string }
  | { kind: "boss"; enemy: string; title: string; hint: string };

export interface QuestReward {
  gold: number;
  potions: number;
  xp: number;
  shards: number;
  text: string;
}

export interface QuestDef {
  id: string;
  name: string;
  recommendedLevel: string;
  steps: QuestStep[];
  completionTitle: string;
  completionText: string;
  reward: QuestReward;
}

export const QUESTS: QuestDef[] = [
  {
    id: "embers-of-dawnreach",
    name: "Embers of Dawnreach",
    recommendedLevel: "1–4",
    steps: [
      { kind: "talk", npc: "sela", title: "Speak with Warden Sela", hint: "She waits by the fountain in Emberhollow." },
      { kind: "reach", area: "woods", title: "Walk north into Whisperpine Woods", hint: "Follow the lantern path past the windmill." },
      { kind: "kill", enemy: "bramblekin", count: 3, title: "Cull 3 Bramblekin", hint: "Strike, then step back before they swing." },
      { kind: "equip", slot: "weapon", title: "Equip a looted weapon", hint: "Open your satchel (I) and equip a weapon." },
      { kind: "boss", enemy: "thornmaw", title: "Defeat Thornmaw at the Sunken Arch", hint: "East of the woods, past the broken columns." },
      { kind: "talk", npc: "sela", title: "Return to Warden Sela", hint: "Emberhollow, by the fountain." },
    ],
    completionTitle: "Embers of Dawnreach — complete",
    completionText:
      "Sela presses an iron key into your hand. West of the village, the Barrow of Lanterns has been sealed for a century. Tonight its lanterns lit themselves.",
    reward: { gold: 50, potions: 2, xp: 120, shards: 6, text: "50 embers, 2 draughts, 6 Aether Shards — the Barrow gate is open" },
  },
  {
    id: "barrow-of-lanterns",
    name: "The Barrow of Lanterns",
    recommendedLevel: "4–7",
    steps: [
      { kind: "reach", area: "barrow", title: "Enter the Barrow of Lanterns", hint: "Take the west road out of Emberhollow to the iron gate." },
      { kind: "kill", enemy: "shade", count: 4, title: "Put 4 Barrow Shades to rest", hint: "They are quick. Dodge through the swing, then punish." },
      { kind: "boss", enemy: "lanternking", title: "Defeat the Lantern King", hint: "He waits at the far end of the barrow, beyond the wardens." },
      { kind: "talk", npc: "sela", title: "Report to Warden Sela", hint: "Emberhollow, by the fountain." },
    ],
    completionTitle: "The Barrow of Lanterns — complete",
    completionText: "The lanterns are dark again. Dawnreach sleeps, for now. Whatever fell from the sky is not done with it.",
    reward: { gold: 200, potions: 3, xp: 400, shards: 12, text: "200 embers, 3 draughts, 12 Aether Shards" },
  },
];

/** Kept for older imports. */
export const STARTER_QUEST = QUESTS[0]!;
