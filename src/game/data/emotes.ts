// Emotes: small social gestures other players see over the live channel.
// Pure data; the simulation reads these.

export type EmoteId = "wave" | "cheer" | "sit";

export interface EmoteDef {
  id: EmoteId;
  name: string;
  /** How long it plays; sitting lasts until you move. */
  seconds: number;
  /** Desktop key. */
  key: string;
}

export const EMOTES: EmoteDef[] = [
  { id: "wave", name: "Wave", seconds: 2.2, key: "KeyV" },
  { id: "cheer", name: "Cheer", seconds: 2.6, key: "KeyC" },
  { id: "sit", name: "Sit", seconds: Number.POSITIVE_INFINITY, key: "KeyX" },
];

export const EMOTE_BY_ID: Record<EmoteId, EmoteDef> = Object.fromEntries(
  EMOTES.map((e) => [e.id, e]),
) as Record<EmoteId, EmoteDef>;
