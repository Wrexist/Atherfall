import { useMemo, useState } from "react";
import { ARCHETYPE_LIST, ARCHETYPES, ABILITY_UNLOCK_LEVELS } from "../data/archetypes";
import { ABILITIES } from "../data/combat";
import { ENEMIES } from "../data/enemies";
import {
  ITEMS,
  MODIFIERS,
  RARITY_COLOR,
  RARITY_LABEL,
  RARITY_ORDER,
  SLOTS,
  SLOT_LABEL,
  type EquipSlot,
  type Rarity,
} from "../data/items";
import { QUESTS } from "../data/quests";
import { REGIONS } from "../world/terrain";
import { VILLAGE_REGION, statsFor, useGame, type InvEntry, type JournalTab } from "../core/store";
import { saveNow } from "../core/sim";
import {
  FORGE,
  abilityUnlocked,
  compareToEquipped,
  forgePreview,
  itemStats,
  salvageValue,
  sellValue,
  xpForLevel,
} from "../core/rules";
import { SlotIcon, type SlotId } from "./Cooldowns";
import { WorldMap } from "./WorldMap";
import { useThreatened } from "./layout";
import {
  BTN,
  CARD,
  CLASS_TONE,
  Glyph,
  H3,
  ItemTile,
  StatChip,
  classIconUrl,
  type GlyphId,
} from "./kit";

const TABS: Array<{ id: JournalTab; label: string; key: string; icon: GlyphId }> = [
  { id: "satchel", label: "Bag", key: "I", icon: "bag" },
  { id: "forge", label: "Forge", key: "", icon: "forge" },
  { id: "build", label: "Hero", key: "B", icon: "hero" },
  { id: "codex", label: "Codex", key: "K", icon: "codex" },
  { id: "map", label: "Map", key: "N", icon: "map" },
];

function itemName(e: InvEntry) {
  const d = ITEMS[e.itemId];
  return `${d?.name ?? e.itemId}${e.plus ? ` +${e.plus}` : ""}`;
}

const FILTERS: Array<{ id: EquipSlot | "all"; label: string; icon?: GlyphId }> = [
  { id: "all", label: "All" },
  { id: "weapon", label: "Weapons", icon: "attack" },
  { id: "armor", label: "Armour", icon: "defense" },
  { id: "accessory", label: "Trinkets", icon: "crit" },
  { id: "relic", label: "Relics", icon: "shard" },
];

/** Order the bag: best first (rarity, then level, then upgrades). */
function byBest(a: InvEntry, b: InvEntry) {
  const da = ITEMS[a.itemId];
  const db = ITEMS[b.itemId];
  if (!da || !db) return 0;
  return (
    RARITY_ORDER.indexOf(db.rarity) - RARITY_ORDER.indexOf(da.rarity) ||
    db.level - da.level ||
    b.plus - a.plus
  );
}

function Wallet({ gold, shards }: { gold: number; shards: number }) {
  return (
    <div data-testid="wallet" className="flex flex-wrap gap-2">
      <span className="flex items-center gap-1.5 rounded-full bg-[var(--ink)]/60 py-1 pl-1.5 pr-3 text-sm font-extrabold">
        <Glyph id="ember" className="h-5 w-5" />
        {gold} <span className="text-xs font-bold text-[var(--parchment)]/60">embers</span>
      </span>
      <span className="flex items-center gap-1.5 rounded-full bg-[var(--ink)]/60 py-1 pl-1.5 pr-3 text-sm font-extrabold">
        <Glyph id="shard" className="h-5 w-5" />
        {shards} <span className="text-xs font-bold text-[var(--parchment)]/60">Aether Shards</span>
      </span>
    </div>
  );
}

// ------------------------------------------------------------------ Satchel

function ItemSheet({
  entry,
  wornSlot,
  onClose,
}: {
  entry: InvEntry;
  /** Set when the item is worn: offers Unequip instead of Equip/Sell. */
  wornSlot: EquipSlot | null;
  onClose: () => void;
}) {
  const s = useGame();
  const def = ITEMS[entry.itemId]!;
  const st = itemStats(def, entry.plus);
  const cmp = wornSlot ? null : compareToEquipped(s.archetype, s.level, s.equipped, entry);
  const tooHigh = def.level > s.level;
  return (
    <div
      className="absolute inset-x-0 bottom-0 z-10 max-h-[78%] overflow-y-auto overscroll-contain rounded-t-3xl border-t-2 p-4 shadow-[0_-12px_30px_rgba(0,0,0,0.5)] sm:inset-x-auto sm:right-4 sm:bottom-4 sm:w-[24rem] sm:rounded-3xl sm:border-2"
      style={{ borderColor: RARITY_COLOR[def.rarity], background: "var(--panel)" }}
      role="dialog"
      aria-label={def.name}
    >
      <div className="flex items-start gap-3">
        <ItemTile entry={entry} size="lg" />
        <div className="min-w-0 flex-1">
          <div
            className="font-display text-xl leading-tight text-outline"
            style={{ color: RARITY_COLOR[def.rarity] }}
          >
            {itemName(entry)}
          </div>
          <div className="mt-0.5 text-xs font-bold text-[var(--parchment)]/70">
            {RARITY_LABEL[def.rarity]} {SLOT_LABEL[def.slot].toLowerCase()} · level {def.level}
            {def.boss ? " · boss reward" : ""}
          </div>
          {tooHigh && !wornSlot && (
            <div className="mt-1 inline-flex items-center gap-1 rounded-md bg-[#c0392b] px-1.5 py-0.5 text-[11px] font-extrabold text-white">
              <Glyph id="lock" className="h-3 w-3" color="#fff" /> Needs level {def.level}
            </div>
          )}
        </div>
        <button
          onClick={onClose}
          aria-label="Close item"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[var(--ink)]/60"
        >
          <Glyph id="close" className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-1.5">
        {st.attack > 0 && <StatChip icon="attack" title="Attack" value={`+${st.attack}`} />}
        {st.defense > 0 && <StatChip icon="defense" title="Defense" value={`+${st.defense}`} />}
        {st.health > 0 && <StatChip icon="health" title="Health" value={`+${st.health}`} />}
        {st.crit > 0 && <StatChip icon="crit" title="Critical" value={`+${st.crit}`} suffix="%" />}
      </div>
      {def.mod && (
        <p className="mt-2 rounded-xl bg-[var(--gilt)]/12 px-2.5 py-1.5 text-xs font-bold text-[var(--parchment)]">
          <span className="text-[var(--gilt)]">{MODIFIERS[def.mod].name}:</span>{" "}
          {MODIFIERS[def.mod].text}
        </p>
      )}

      {cmp && (
        <div data-testid="compare" className="mt-3 rounded-2xl bg-[var(--ink)]/45 p-2.5">
          <div className="mb-1.5 text-[11px] font-extrabold uppercase tracking-wider text-[var(--parchment)]/60">
            {cmp.replaces ? `Instead of ${itemName(cmp.replaces)}` : "Fills an empty slot"}
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <StatChip
              icon="attack"
              title="Attack"
              value={cmp.after.attack}
              delta={cmp.delta.attack}
            />
            <StatChip
              icon="defense"
              title="Defense"
              value={cmp.after.defense}
              delta={cmp.delta.defense}
            />
            <StatChip
              icon="health"
              title="Max health"
              value={cmp.after.maxHp}
              delta={cmp.delta.maxHp}
            />
            <StatChip
              icon="crit"
              title="Critical"
              value={Math.round(cmp.after.crit * 100)}
              suffix="%"
              delta={cmp.delta.crit}
            />
          </div>
        </div>
      )}

      <p className="mt-2 text-xs italic text-[var(--parchment)]/60">{def.flavor}</p>

      <div className="mt-3 flex flex-wrap gap-2">
        {wornSlot ? (
          <button
            className={`${BTN.secondary} flex-1`}
            onClick={() => {
              s.unequip(wornSlot);
              onClose();
            }}
          >
            Take off
          </button>
        ) : (
          <>
            <button
              data-testid={`equip-${def.id}`}
              disabled={tooHigh}
              onClick={() => {
                s.equip(entry.uid);
                onClose();
              }}
              className={`${BTN.primary} flex-[2]`}
            >
              {tooHigh ? `Level ${def.level}` : "Equip"}
            </button>
            <button
              data-testid="sell-one"
              className={`${BTN.secondary} flex-1`}
              onClick={() => {
                s.disposeBatch([entry.uid], "sell");
                onClose();
              }}
            >
              <Glyph id="ember" className="h-4 w-4" />
              {sellValue(entry)}
            </button>
            <button
              data-testid="salvage-one"
              className={`${BTN.shard} flex-1`}
              onClick={() => {
                s.disposeBatch([entry.uid], "salvage");
                onClose();
              }}
            >
              <Glyph id="shard" className="h-4 w-4" />
              {salvageValue(entry)}
            </button>
          </>
        )}
      </div>
      {!wornSlot && (
        <p className="mt-1.5 text-center text-[11px] font-bold text-[var(--parchment)]/50">
          Sell for embers, or salvage into Aether Shards for the forge.
        </p>
      )}
    </div>
  );
}

function Satchel() {
  const s = useGame();
  const [selected, setSelected] = useState<string | null>(null);
  const [marking, setMarking] = useState(false);
  const [marked, setMarked] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<EquipSlot | "all">("all");
  const stats = statsFor(s);

  const wornSlot = SLOTS.find((k) => s.equipped[k]?.uid === selected) ?? null;
  const sel =
    s.inventory.find((i) => i.uid === selected) ?? (wornSlot ? s.equipped[wornSlot]! : null);
  const cmp = sel && !wornSlot ? compareToEquipped(s.archetype, s.level, s.equipped, sel) : null;
  const shown = useMemo(
    () =>
      s.inventory.filter((e) => filter === "all" || ITEMS[e.itemId]?.slot === filter).sort(byBest),
    [s.inventory, filter],
  );
  const markedEntries = s.inventory.filter((i) => marked.has(i.uid));
  const sellTotal = markedEntries.reduce((n, e) => n + sellValue(e), 0);
  const salvageTotal = markedEntries.reduce((n, e) => n + salvageValue(e), 0);

  const toggleMark = (uid: string) =>
    setMarked((m) => {
      const n = new Set(m);
      if (n.has(uid)) n.delete(uid);
      else n.add(uid);
      return n;
    });
  const markRarity = (r: Rarity) =>
    setMarked(new Set(s.inventory.filter((i) => ITEMS[i.itemId]?.rarity === r).map((i) => i.uid)));
  const dispose = (mode: "sell" | "salvage") => {
    s.disposeBatch(Array.from(marked), mode);
    setMarked(new Set());
    setMarking(false);
  };

  return (
    <div className="grid gap-3 sm:grid-cols-[17rem_1fr]">
      <div className={`${CARD} space-y-3`}>
        <h3 className={H3}>Equipped</h3>
        <div className="grid grid-cols-4 gap-1.5">
          {SLOTS.map((slot) => {
            const e = s.equipped[slot];
            return (
              <ItemTile
                key={slot}
                testId={`worn-${slot}`}
                entry={e ?? null}
                slot={slot}
                label={SLOT_LABEL[slot]}
                selected={!!e && e.uid === selected}
                onClick={e ? () => setSelected(e.uid) : undefined}
              />
            );
          })}
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <StatChip icon="attack" title="Attack" value={stats.attack} delta={cmp?.delta.attack} />
          <StatChip
            icon="defense"
            title="Defense"
            value={stats.defense}
            delta={cmp?.delta.defense}
          />
          <StatChip icon="health" title="Max health" value={stats.maxHp} delta={cmp?.delta.maxHp} />
          <StatChip
            icon="crit"
            title="Critical"
            value={Math.round(stats.crit * 100)}
            suffix="%"
            delta={cmp?.delta.crit}
          />
        </div>
        <Wallet gold={s.gold} shards={s.shards} />
      </div>

      <div className={`${CARD} min-w-0`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className={H3}>
            Bag <span className="text-[var(--parchment)]">{s.inventory.length}</span>
          </h3>
          <button
            data-testid="mark-mode"
            className={marking ? BTN.primary : BTN.ghost}
            onClick={() => {
              setMarking((m) => !m);
              setMarked(new Set());
              setSelected(null);
            }}
          >
            {marking ? "Done" : "Sell or salvage…"}
          </button>
        </div>
        <div className="mt-2 flex gap-1.5 overflow-x-auto overscroll-contain pb-1">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`flex min-h-9 shrink-0 items-center gap-1 rounded-full px-3 text-xs font-extrabold ${
                filter === f.id
                  ? "bg-[var(--gilt)] text-[#3a2206]"
                  : "bg-[var(--ink)]/55 text-[var(--parchment)]/80"
              }`}
            >
              {f.icon && <Glyph id={f.icon} className="h-4 w-4" />}
              {f.label}
            </button>
          ))}
        </div>

        {marking && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs font-bold">
            <span className="text-[var(--parchment)]/70">Tap items, or pick all:</span>
            {RARITY_ORDER.slice(0, 3).map((r) => (
              <button
                key={r}
                onClick={() => markRarity(r)}
                className="min-h-9 rounded-full border-2 px-3 font-extrabold"
                style={{ borderColor: RARITY_COLOR[r], color: RARITY_COLOR[r] }}
              >
                {RARITY_LABEL[r]}
              </button>
            ))}
            {marked.size > 0 && (
              <button
                className="min-h-9 rounded-full px-2 text-[var(--parchment)]/70 underline"
                onClick={() => setMarked(new Set())}
              >
                Clear
              </button>
            )}
          </div>
        )}

        {s.inventory.length === 0 ? (
          <p className="mt-6 text-center text-sm font-bold text-[var(--parchment)]/60">
            Your bag is empty. Beaten foes drop gear: walk over it to pick it up.
          </p>
        ) : (
          <div className="mt-2 grid grid-cols-[repeat(auto-fill,minmax(4rem,1fr))] justify-items-center gap-2">
            {shown.map((e) => (
              <ItemTile
                key={e.uid}
                testId={`item-${e.itemId}`}
                entry={e}
                selected={!marking && e.uid === selected}
                marked={marking && marked.has(e.uid)}
                locked={(ITEMS[e.itemId]?.level ?? 1) > s.level}
                onClick={() => (marking ? toggleMark(e.uid) : setSelected(e.uid))}
              />
            ))}
          </div>
        )}

        {marking && marked.size > 0 && (
          <div className="sticky bottom-0 mt-3 flex flex-wrap items-center gap-2 rounded-2xl bg-[var(--ink)]/85 p-2">
            <span className="px-1 text-sm font-extrabold">{marked.size} picked</span>
            <button
              data-testid="sell-batch"
              onClick={() => dispose("sell")}
              className={BTN.secondary}
            >
              Sell · <Glyph id="ember" className="h-4 w-4" /> {sellTotal}
            </button>
            <button
              data-testid="salvage-batch"
              onClick={() => dispose("salvage")}
              className={BTN.shard}
            >
              Salvage · <Glyph id="shard" className="h-4 w-4" /> {salvageTotal}
            </button>
          </div>
        )}
      </div>

      {sel && !marking && (
        <ItemSheet
          key={sel.uid}
          entry={sel}
          wornSlot={wornSlot}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

// ------------------------------------------------------------------ Forge

function Forge() {
  const s = useGame();
  const inVillage = s.regionId === VILLAGE_REGION;
  const all = useMemo(
    () => [
      ...SLOTS.flatMap((slot) => (s.equipped[slot] ? [{ e: s.equipped[slot]!, worn: true }] : [])),
      ...s.inventory.map((e) => ({ e, worn: false })),
    ],
    [s.equipped, s.inventory],
  );
  const [pick, setPick] = useState<string | null>(null);
  const chosen = all.find((a) => a.e.uid === pick)?.e ?? all[0]?.e ?? null;
  const preview = chosen ? forgePreview(chosen, { gold: s.gold, shards: s.shards }) : null;
  const def = chosen ? ITEMS[chosen.itemId] : null;
  const next = chosen ? Math.min(FORGE.maxPlus, chosen.plus + 1) : 0;

  return (
    <div className="grid gap-3 sm:grid-cols-[1fr_20rem]">
      <div className={`${CARD} min-w-0 space-y-2`}>
        <h3 className={H3}>Pick gear to upgrade</h3>
        <p className="text-xs font-bold text-[var(--parchment)]/70">
          Oda upgrades gear up to +{FORGE.maxPlus}. Up to +3 always works; +4 is 75% and +5 is 50%.
          A miss costs the embers and half the shards, never the item.
        </p>
        {!inVillage && (
          <p className="rounded-xl bg-[#e5533d]/20 px-2.5 py-1.5 text-xs font-extrabold text-[#ffb3a6]">
            The forge is in Emberhollow. You can plan here, but only Oda can upgrade.
          </p>
        )}
        <div className="grid grid-cols-[repeat(auto-fill,minmax(4rem,1fr))] justify-items-center gap-2">
          {all.map(({ e, worn }) => (
            <ItemTile
              key={e.uid}
              testId={`item-${e.itemId}`}
              entry={e}
              worn={worn}
              selected={chosen?.uid === e.uid}
              onClick={() => setPick(e.uid)}
            />
          ))}
        </div>
        {all.length === 0 && (
          <p className="text-sm font-bold text-[var(--parchment)]/60">No gear to upgrade yet.</p>
        )}
      </div>
      {chosen && def && preview && (
        <div
          data-testid="forge-preview"
          className="rounded-2xl border-2 bg-[var(--panel-2)] p-3"
          style={{ borderColor: RARITY_COLOR[def.rarity] }}
        >
          <div className="flex items-center gap-3">
            <ItemTile entry={chosen} size="lg" />
            <div className="min-w-0">
              <div
                className="font-display text-lg leading-tight text-outline"
                style={{ color: RARITY_COLOR[def.rarity] }}
              >
                {def.name}
              </div>
              <div className="font-display text-2xl text-outline">
                +{chosen.plus} <span className="text-[var(--gilt)]">→ +{next}</span>
              </div>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-1.5">
            {(["attack", "defense", "health"] as const).map((k) =>
              preview.from[k] > 0 ? (
                <StatChip
                  key={k}
                  icon={k}
                  title={k === "health" ? "Health" : k[0]!.toUpperCase() + k.slice(1)}
                  value={preview.to[k]}
                  delta={preview.to[k] - preview.from[k]}
                />
              ) : null,
            )}
          </div>
          {chosen.plus < FORGE.maxPlus && (
            <div className="mt-3 space-y-1.5 rounded-2xl bg-[var(--ink)]/45 p-2.5 text-sm font-extrabold">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Glyph id="ember" className="h-5 w-5" /> {preview.cost.gold}
                </span>
                <span className="text-xs text-[var(--parchment)]/60">you have {s.gold}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Glyph id="shard" className="h-5 w-5" /> {preview.cost.shards}
                </span>
                <span className="text-xs text-[var(--parchment)]/60">you have {s.shards}</span>
              </div>
              <div>
                <div className="flex justify-between text-xs">
                  <span>Success</span>
                  <span>{Math.round(preview.cost.chance * 100)}%</span>
                </div>
                <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-black/50">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#6ee06a] to-[#ffd24a]"
                    style={{ width: `${Math.round(preview.cost.chance * 100)}%` }}
                  />
                </div>
              </div>
            </div>
          )}
          <button
            data-testid="forge-upgrade"
            disabled={!preview.canUpgrade || !inVillage}
            onClick={() => {
              s.forge(chosen.uid);
              saveNow(); // a failed forge can't be undone by reloading
            }}
            className={`${BTN.primary} mt-3 w-full`}
          >
            {!inVillage
              ? "Visit Oda in Emberhollow"
              : preview.canUpgrade
                ? "Upgrade"
                : preview.reason}
          </button>
          <p className="mt-2 text-center text-[11px] font-bold text-[var(--parchment)]/55">
            Shards come from salvaging gear, and from bosses.
          </p>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ Build

function AbilityFrame({ id, tone, on }: { id: SlotId; tone: string; on: boolean }) {
  return (
    <span
      className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl border-2 ${on ? "" : "grayscale"}`}
      style={{
        borderColor: on ? tone : "#56627a",
        background: `radial-gradient(circle at 50% 35%, ${on ? tone : "#56627a"}55, #101a2b 75%)`,
        color: on ? "#fff" : "#9aa9c0",
      }}
    >
      <SlotIcon id={id} className="h-7 w-7" />
    </span>
  );
}

function Build() {
  const s = useGame();
  const inVillage = s.regionId === VILLAGE_REGION;
  const arch = ARCHETYPES[s.archetype];
  const tone = CLASS_TONE[s.archetype];
  const stats = statsFor(s);
  const need = xpForLevel(s.level);
  return (
    <div className="space-y-3">
      <div className={`${CARD} flex items-center gap-3`}>
        <span
          className="grid h-16 w-16 shrink-0 place-items-center rounded-full border-4 bg-[var(--ink)]"
          style={{ borderColor: tone }}
        >
          <img src={classIconUrl(s.archetype)} alt="" className="h-12 w-12 object-contain" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-display text-xl leading-none text-outline">{arch.name}</div>
          <div className="mt-0.5 text-xs font-extrabold" style={{ color: tone }}>
            Level {s.level}
          </div>
          <div className="mt-1.5 h-3 overflow-hidden rounded-full bg-black/55">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#ffd9b0] to-[#ff9f5a]"
              style={{ width: `${Math.min(100, (s.xp / need) * 100)}%` }}
            />
          </div>
          <div className="mt-0.5 text-[11px] font-bold text-[var(--parchment)]/60">
            {s.xp} / {need} XP to level {s.level + 1}
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className={`${CARD} space-y-2`}>
          <h3 className={H3}>Stats</h3>
          <div className="grid grid-cols-2 gap-1.5">
            <StatChip icon="attack" title="Attack" value={stats.attack} />
            <StatChip icon="defense" title="Defense" value={stats.defense} />
            <StatChip icon="health" title="Max health" value={stats.maxHp} />
            <StatChip
              icon="crit"
              title="Critical"
              value={Math.round(stats.crit * 100)}
              suffix="%"
            />
          </div>
          {Object.entries(stats.mods).map(([id, v]) => (
            <p key={id} className="text-xs font-bold text-[var(--parchment)]/80">
              <span className="text-[var(--gilt)]">
                {MODIFIERS[id as keyof typeof MODIFIERS].name} ×
                {Math.round((v ?? 0) / MODIFIERS[id as keyof typeof MODIFIERS].value)}
              </span>{" "}
              {MODIFIERS[id as keyof typeof MODIFIERS].text}
            </p>
          ))}
        </div>
        <div className={`${CARD} space-y-2`}>
          <h3 className={H3}>Abilities</h3>
          {arch.abilities.map((id, i) => {
            const on = abilityUnlocked(s.level, i);
            return (
              <div key={id} className="flex items-center gap-2.5">
                <AbilityFrame id={id} tone={tone} on={on} />
                <div className="min-w-0">
                  <div className="text-sm font-extrabold text-[var(--parchment)]">
                    {ABILITIES[id].name}{" "}
                    <span className="text-xs font-bold text-[var(--parchment)]/55">
                      {on
                        ? `${ABILITIES[id].cooldown}s`
                        : `unlocks at level ${ABILITY_UNLOCK_LEVELS[i]}`}
                    </span>
                  </div>
                  <div className="text-xs font-semibold text-[var(--parchment)]/65">
                    {ABILITIES[id].description}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className={CARD}>
        <h3 className={H3}>Class</h3>
        <p className="mt-1 text-xs font-bold text-[var(--parchment)]/60">
          Change class at any time in Emberhollow. Your level and gear stay.
        </p>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {ARCHETYPE_LIST.map((a) => {
            const active = a.id === s.archetype;
            const t = CLASS_TONE[a.id];
            return (
              <div
                key={a.id}
                className="flex flex-col rounded-2xl border-2 bg-[var(--ink)]/45 p-2.5"
                style={{ borderColor: active ? t : "transparent" }}
              >
                <div className="flex items-center gap-2">
                  <img src={classIconUrl(a.id)} alt="" className="h-11 w-11 object-contain" />
                  <div>
                    <div className="font-display text-lg leading-none text-outline">{a.name}</div>
                    <div className="text-[11px] font-extrabold uppercase" style={{ color: t }}>
                      {a.role}
                    </div>
                  </div>
                </div>
                <p className="mt-1.5 flex-1 text-xs font-semibold text-[var(--parchment)]/75">
                  {a.description}
                </p>
                <div className="mt-2 flex gap-1.5">
                  {a.abilities.map((id) => (
                    <span
                      key={id}
                      title={ABILITIES[id].name}
                      className="grid h-8 w-8 place-items-center rounded-lg border"
                      style={{ borderColor: t, color: "#fff", background: "#101a2b" }}
                    >
                      <SlotIcon id={id} className="h-5 w-5" />
                    </span>
                  ))}
                </div>
                <button
                  data-testid={`path-${a.id}`}
                  disabled={active || !inVillage}
                  onClick={() => s.setArchetype(a.id)}
                  className={`${active ? BTN.ghost : BTN.secondary} mt-2 w-full`}
                >
                  {active
                    ? "Your class"
                    : inVillage
                      ? `Become a ${a.name}`
                      : "Change in Emberhollow"}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className={CARD}>
        <h3 className={H3}>Journey</h3>
        <ol className="mt-2 space-y-1.5">
          {QUESTS.map((q, i) => {
            const done = s.questIdx > i || (s.questIdx === i && s.questComplete);
            const now = s.questIdx === i && !done;
            return (
              <li key={q.id} className="flex items-start gap-2 rounded-xl bg-[var(--ink)]/45 p-2">
                <span
                  className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-black ${
                    done
                      ? "bg-[#4fc957] text-white"
                      : now
                        ? "bg-[var(--gilt)] text-[#3a2206]"
                        : "bg-[#3a4760] text-[var(--parchment)]/60"
                  }`}
                >
                  {done ? <Glyph id="check" className="h-4 w-4" /> : i + 1}
                </span>
                <div className="min-w-0 text-sm">
                  <div className="font-extrabold">
                    {q.name}{" "}
                    <span className="text-xs font-bold text-[var(--parchment)]/55">
                      level {q.recommendedLevel}
                    </span>
                  </div>
                  <div className="text-xs font-semibold text-[var(--parchment)]/70">
                    {done ? "Complete" : now ? (q.steps[s.questStep]?.title ?? "") : "Locked"}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Codex

function Codex() {
  const c = useGame((s) => s.codex);
  const [tab, setTab] = useState<"enemies" | "places" | "items">("items");
  const enemies = Object.values(ENEMIES);
  const items = Object.values(ITEMS);
  const places = Object.entries(REGIONS);
  const count = {
    enemies: `${c.seen.length}/${enemies.length}`,
    places: `${c.places.length}/${places.length}`,
    items: `${c.items.length}/${items.length}`,
  };
  return (
    <div className="space-y-3">
      <div className="flex gap-1 rounded-full bg-[var(--ink)]/55 p-1">
        {(["items", "enemies", "places"] as const).map((t) => (
          <button
            key={t}
            data-testid={`codex-${t}`}
            onClick={() => setTab(t)}
            className={`min-h-10 flex-1 rounded-full text-xs font-extrabold capitalize ${
              tab === t ? "bg-[var(--gilt)] text-[#3a2206]" : "text-[var(--parchment)]/75"
            }`}
          >
            {t} <span className="opacity-70">{count[t]}</span>
          </button>
        ))}
      </div>
      {tab === "items" && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] justify-items-center gap-2">
          {items.map((d) => {
            const got = c.items.includes(d.id);
            return (
              <div key={d.id} className="flex w-[4.5rem] flex-col items-center gap-0.5 text-center">
                <ItemTile itemId={d.id} unknown={!got} />
                <span
                  className="line-clamp-2 text-[10px] font-bold leading-tight"
                  style={{ color: got ? RARITY_COLOR[d.rarity] : "rgba(244,241,234,0.4)" }}
                >
                  {got ? d.name : "???"}
                </span>
              </div>
            );
          })}
        </div>
      )}
      {tab === "enemies" && (
        <div className="grid gap-2 sm:grid-cols-2">
          {enemies.map((e) => {
            const known = c.seen.includes(e.id);
            return (
              <div key={e.id} className={`${CARD} p-2.5`}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-display text-base leading-tight text-outline">
                    {known ? e.name : "???"}
                  </span>
                  <span className="shrink-0 text-xs font-extrabold text-[var(--gilt)]">
                    {known ? `Lv ${e.level}${e.boss ? " · boss" : ""}` : "not met"}
                  </span>
                </div>
                {known && (
                  <>
                    <div className="text-[11px] font-bold text-[var(--parchment)]/60">
                      Defeated {c.kills[e.id] ?? 0}
                    </div>
                    <p className="mt-1 text-xs font-semibold text-[var(--parchment)]/70">
                      {e.lore}
                    </p>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
      {tab === "places" && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {places.map(([id, r]) => {
            const found = c.places.includes(id);
            return (
              <div
                key={id}
                className={`flex min-h-11 items-center gap-2 rounded-xl px-2.5 text-sm font-extrabold ${
                  found ? "bg-[var(--panel-2)]" : "bg-[var(--ink)]/45 text-[var(--parchment)]/40"
                }`}
              >
                <Glyph id="map" className="h-4 w-4" color={found ? undefined : "#56627a"} />
                {found ? r.label : "Undiscovered"}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ Shell

export function InventoryPanel() {
  const open = useGame((s) => s.inventoryOpen);
  const tab = useGame((s) => s.journalTab);
  const toggle = useGame((s) => s.toggleInventory);
  const threat = useThreatened();
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-[var(--ink)]/70 p-2 sm:p-6"
      // Keep tabs and buttons clear of the notch / Dynamic Island and home indicator.
      style={{
        paddingTop: "max(0.5rem, env(safe-area-inset-top))",
        paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))",
        paddingLeft: "max(0.5rem, env(safe-area-inset-left))",
        paddingRight: "max(0.5rem, env(safe-area-inset-right))",
      }}
      onClick={() => toggle(false)}
    >
      <div
        data-testid="journal"
        className="relative flex max-h-full w-full max-w-4xl flex-col overflow-hidden rounded-3xl border-2 border-[var(--edge)] bg-[var(--panel)] text-[var(--parchment)] shadow-[0_16px_48px_rgba(0,0,0,0.6)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-1 border-b-2 border-[var(--edge)]/60 bg-[var(--ink)]/35 px-1.5 py-1.5 sm:px-3">
          <div className="flex min-w-0 flex-1 gap-1">
            {TABS.map((t) => (
              <button
                key={t.id}
                data-testid={`tab-${t.id}`}
                onClick={() => toggle(true, t.id)}
                aria-current={tab === t.id ? "page" : undefined}
                className={`flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl px-1 sm:flex-none sm:flex-row sm:gap-1.5 sm:px-3.5 ${
                  tab === t.id
                    ? "bg-gradient-to-b from-[#ffd970] to-[#f2a93b] text-[#3a2206] shadow-[0_2px_0_#b8741a]"
                    : "text-[var(--parchment)]/80"
                }`}
              >
                <Glyph id={t.icon} className="h-6 w-6" />
                <span className="font-display text-[13px] leading-none tracking-wide sm:text-base">
                  {t.label}
                </span>
                {t.key && (
                  <span className="hidden rounded bg-black/25 px-1 font-mono text-[10px] [@media(pointer:fine)]:inline">
                    {t.key}
                  </span>
                )}
              </button>
            ))}
          </div>
          <button
            onClick={() => toggle(false)}
            aria-label="Close"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full border-b-4 border-[#7a2417] bg-gradient-to-b from-[#f0735a] to-[#cf4630]"
          >
            <Glyph id="close" className="h-5 w-5" />
          </button>
        </div>
        {/* The world doesn't pause behind the journal (it's an MMO): warn when it matters. */}
        {threat && (
          <div
            role="alert"
            className="flex items-center justify-center gap-2 bg-[#b0301f] px-3 py-1.5 text-center text-xs font-extrabold text-white"
          >
            <span className="h-2 w-2 animate-pulse rounded-full bg-[#ffd0c4]" aria-hidden />
            In combat! Enemies are attacking you, and the fight goes on while this is open.
          </div>
        )}
        <div className="overflow-y-auto overscroll-contain p-2.5 sm:p-4">
          {tab === "satchel" && <Satchel />}
          {tab === "forge" && <Forge />}
          {tab === "build" && <Build />}
          {tab === "codex" && <Codex />}
          {tab === "map" && <WorldMap />}
        </div>
      </div>
    </div>
  );
}
