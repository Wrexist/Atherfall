// Starter quest definition. Steps are evaluated by src/game/core/quest.ts.

export type QuestStep =
  | { kind: "talk"; npc: string; title: string; hint: string }
  | { kind: "reach"; area: string; title: string; hint: string }
  | { kind: "kill"; enemy: string; count: number; title: string; hint: string }
  | { kind: "equip"; slot: "weapon"; title: string; hint: string }
  | { kind: "boss"; enemy: string; title: string; hint: string };

export interface QuestDef {
  id: string;
  name: string;
  steps: QuestStep[];
  completionTitle: string;
  completionText: string;
}

export const STARTER_QUEST: QuestDef = {
  id: "embers-of-dawnreach",
  name: "Embers of Dawnreach",
  steps: [
    {
      kind: "talk",
      npc: "sela",
      title: "Speak with Warden Sela",
      hint: "She waits by the fountain in Emberhollow.",
    },
    {
      kind: "reach",
      area: "woods",
      title: "Walk north into Whisperpine Woods",
      hint: "Follow the lantern path past the windmill.",
    },
    {
      kind: "kill",
      enemy: "bramblekin",
      count: 3,
      title: "Cull 3 Bramblekin",
      hint: "Strike, then step back before they swing.",
    },
    {
      kind: "equip",
      slot: "weapon",
      title: "Equip a looted weapon",
      hint: "Open your satchel (I) and equip a weapon.",
    },
    {
      kind: "boss",
      enemy: "thornmaw",
      title: "Defeat Thornmaw at the Sunken Arch",
      hint: "East of the woods, past the broken columns.",
    },
    {
      kind: "talk",
      npc: "sela",
      title: "Return to Warden Sela",
      hint: "Emberhollow, by the fountain.",
    },
  ],
  completionTitle: "Embers of Dawnreach — complete",
  completionText:
    "Sela presses a salt-stained map into your hand. The road to Tidewrack Shore is open, and something is still falling out of that sky.",
};
