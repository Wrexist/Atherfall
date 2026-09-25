import { useMemo, useState } from "react";
import { ARCHETYPE_LIST, ARCHETYPES, ABILITY_UNLOCK_LEVELS } from "../data/archetypes";
import { ABILITIES } from "../data/combat";
import { ENEMIES } from "../data/enemies";
import { ITEMS, MODIFIERS, RARITY_COLOR, RARITY_LABEL, RARITY_ORDER, SLOTS, SLOT_LABEL, type EquipSlot, type Rarity } from "../data/items";
import { QUESTS } from "../data/quests";
import { REGIONS } from "../world/terrain";
import { VILLAGE_REGION, statsFor, useGame, type InvEntry, type JournalTab } from "../core/store";
import { FORGE, abilityUnlocked, compareToEquipped, forgePreview, itemStats, salvageValue, sellValue, xpForLevel } from "../core/rules";
import { SlotIcon } from "./Cooldowns";
import { WorldMap } from "./WorldMap";

const TABS: Array<{ id: JournalTab; label: string; key: string }> = [
  { id: "satchel", label: "Satchel", key: "I" },
  { id: "forge", label: "Forge", key: "" },
  { id: "build", label: "Build", key: "B" },
  { id: "codex", label: "Codex", key: "K" },
  { id: "map", label: "Map", key: "N" },
];

function itemName(e: InvEntry) {
  const d = ITEMS[e.itemId];
  return `${d?.name ?? e.itemId}${e.plus ? ` +${e.plus}` : ""}`;
}

function StatLine({ label, value, delta, suffix = "" }: { label: string; value: number | string; delta?: number | undefined; suffix?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-xs">
      <span className="text-[var(--parchment)]/65">{label}</span>
      <span className="font-semibold text-[var(--parchment)]">
        {value}
        {suffix}
        {delta !== undefined && delta !== 0 && (
          <span className={`ml-1.5 ${delta > 0 ? "text-[#9fe39a]" : "text-[#f0a595]"}`}>
            {delta > 0 ? "▲" : "▼"}
            {Math.abs(delta)}
            {suffix}
          </span>
        )}
      </span>
    </div>
  );
}

function ItemStatsBlock({ entry }: { entry: InvEntry }) {
  const def = ITEMS[entry.itemId]!;
  const st = itemStats(def, entry.plus);
  return (
    <div className="space-y-0.5">
      {st.attack > 0 && <StatLine label="Attack" value={`+${st.attack}`} />}
      {st.defense > 0 && <StatLine label="Defense" value={`+${st.defense}`} />}
      {st.health > 0 && <StatLine label="Health" value={`+${st.health}`} />}
      {st.crit > 0 && <StatLine label="Critical" value={`+${st.crit}`} suffix="%" />}
      {def.mod && (
        <p className="pt-1 text-xs text-[var(--gilt)]">
          {MODIFIERS[def.mod].name}: <span className="text-[var(--parchment)]/85">{MODIFIERS[def.mod].text}</span>
        </p>
      )}
    </div>
  );
}

function ItemTile({
  entry,
  selected,
  marked,
  locked,
  onClick,
}: {
  entry: InvEntry;
  selected: boolean;
  marked?: boolean;
  locked?: boolean;
  onClick: () => void;
}) {
  const def = ITEMS[entry.itemId]!;
  return (
    <button
      data-testid={`item-${entry.itemId}`}
      onClick={onClick}
      className={`relative flex min-h-[3.4rem] flex-col items-start justify-between rounded-md border bg-[var(--ink)]/50 p-1.5 text-left ${
        selected ? "ring-2 ring-[var(--gilt)]" : ""
      }`}
      style={{ borderColor: RARITY_COLOR[def.rarity] }}
    >
      <span className="line-clamp-2 text-[11px] leading-tight text-[var(--parchment)]">{itemName(entry)}</span>
      <span className="flex w-full justify-between text-[9px] uppercase tracking-wide" style={{ color: RARITY_COLOR[def.rarity] }}>
        <span>{SLOT_LABEL[def.slot]}</span>
        <span className={locked ? "text-[#f0a595]" : "text-[var(--parchment)]/50"}>Lv{def.level}</span>
      </span>
      {marked && <span className="absolute right-1 top-1 h-3 w-3 rounded-sm border border-[var(--parchment)] bg-[#e8735a]" aria-label="marked" />}
    </button>
  );
}

// ------------------------------------------------------------------ Satchel

function Satchel() {
  const s = useGame();
  const [selected, setSelected] = useState<string | null>(null);
  const [marked, setMarked] = useState<Set<string>>(new Set());
  const stats = statsFor(s);
  const sel = s.inventory.find((i) => i.uid === selected) ?? null;
  const cmp = sel ? compareToEquipped(s.archetype, s.level, s.equipped, sel) : null;
  const selDef = sel ? ITEMS[sel.itemId] : null;
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
  const markRarity = (r: Rarity) => setMarked(new Set(s.inventory.filter((i) => ITEMS[i.itemId]?.rarity === r).map((i) => i.uid)));
  const dispose = (mode: "sell" | "salvage") => {
    s.disposeBatch(Array.from(marked), mode);
    setMarked(new Set());
    setSelected(null);
  };

  return (
    <div className="grid gap-4 md:grid-cols-[15rem_1fr]">
      <div className="space-y-3">
        <div>
          <h3 className="mb-1.5 text-[10px] uppercase tracking-[0.2em] text-[var(--gilt)]">Worn</h3>
          <div className="grid grid-cols-2 gap-1.5 md:grid-cols-1">
            {SLOTS.map((slot) => {
              const e = s.equipped[slot];
              const def = e ? ITEMS[e.itemId] : null;
              return (
                <div key={slot} data-testid={`worn-${slot}`} className="flex items-center justify-between gap-2 rounded-md border border-[var(--gilt)]/20 bg-[var(--ink)]/40 px-2 py-1.5">
                  <div className="min-w-0">
                    <div className="text-[9px] uppercase tracking-wider text-[var(--parchment)]/50">{SLOT_LABEL[slot]}</div>
                    <div className="truncate text-xs" style={{ color: def ? RARITY_COLOR[def.rarity] : undefined }}>
                      {e ? itemName(e) : <span className="text-[var(--parchment)]/35">Empty</span>}
                    </div>
                  </div>
                  {e && (
                    <button className="shrink-0 text-[10px] text-[var(--parchment)]/60 underline" onClick={() => s.unequip(slot)}>
                      Remove
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <div className="rounded-md border border-[var(--gilt)]/20 bg-[var(--ink)]/40 p-2">
          <h3 className="mb-1 text-[10px] uppercase tracking-[0.2em] text-[var(--gilt)]">Standing</h3>
          <StatLine label="Attack" value={stats.attack} delta={cmp?.delta.attack} />
          <StatLine label="Defense" value={stats.defense} delta={cmp?.delta.defense} />
          <StatLine label="Max health" value={stats.maxHp} delta={cmp?.delta.maxHp} />
          <StatLine label="Critical" value={Math.round(stats.crit * 100)} suffix="%" delta={cmp?.delta.crit} />
          <div data-testid="wallet" className="mt-1.5 border-t border-[var(--gilt)]/15 pt-1.5 text-xs text-[var(--gilt)]">
            {s.gold} embers · {s.shards} Aether Shards
          </div>
        </div>
      </div>

      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-[10px] uppercase tracking-[0.2em] text-[var(--gilt)]">Carried ({s.inventory.length})</h3>
          <span className="text-[10px] text-[var(--parchment)]/50">Mark:</span>
          {RARITY_ORDER.slice(0, 3).map((r) => (
            <button key={r} onClick={() => markRarity(r)} className="rounded border px-1.5 py-0.5 text-[10px]" style={{ borderColor: RARITY_COLOR[r], color: RARITY_COLOR[r] }}>
              all {RARITY_LABEL[r]}
            </button>
          ))}
          {marked.size > 0 && (
            <button className="text-[10px] text-[var(--parchment)]/60 underline" onClick={() => setMarked(new Set())}>
              clear
            </button>
          )}
        </div>
        {s.inventory.length === 0 ? (
          <p className="text-xs text-[var(--parchment)]/50">Nothing carried. Defeated foes drop gear — walk over it to pick it up.</p>
        ) : (
          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 lg:grid-cols-5">
            {s.inventory.map((e) => (
              <ItemTile
                key={e.uid}
                entry={e}
                selected={e.uid === selected}
                marked={marked.has(e.uid)}
                locked={(ITEMS[e.itemId]?.level ?? 1) > s.level}
                onClick={() => setSelected(e.uid)}
              />
            ))}
          </div>
        )}

        {marked.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-[#e8735a]/40 bg-[#e8735a]/10 p-2 text-xs">
            <span className="text-[var(--parchment)]">{marked.size} marked</span>
            <button data-testid="sell-batch" onClick={() => dispose("sell")} className="rounded border border-[var(--gilt)]/50 px-2 py-1 text-[var(--parchment)] hover:bg-[var(--gilt)]/20">
              Sell for {sellTotal} embers
            </button>
            <button data-testid="salvage-batch" onClick={() => dispose("salvage")} className="rounded border border-[#b9a4ff]/60 px-2 py-1 text-[var(--parchment)] hover:bg-[#b9a4ff]/20">
              Salvage for {salvageTotal} shards
            </button>
          </div>
        )}

        {sel && selDef && cmp && (
          <div className="rounded-md border p-2.5" style={{ borderColor: RARITY_COLOR[selDef.rarity] }}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <div className="font-display text-base" style={{ color: RARITY_COLOR[selDef.rarity] }}>
                  {itemName(sel)}
                </div>
                <div className="text-[10px] uppercase tracking-wider text-[var(--parchment)]/55">
                  {RARITY_LABEL[selDef.rarity]} {SLOT_LABEL[selDef.slot]} · requires level {selDef.level}
                  {selDef.boss ? " · boss reward" : ""}
                </div>
              </div>
            </div>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <ItemStatsBlock entry={sel} />
              <div data-testid="compare" className="rounded bg-[var(--ink)]/40 p-2">
                <div className="mb-1 text-[10px] uppercase tracking-wider text-[var(--parchment)]/55">
                  {cmp.replaces ? `If it replaces ${itemName(cmp.replaces)}` : "Fills an empty slot"}
                </div>
                <StatLine label="Attack" value={cmp.after.attack} delta={cmp.delta.attack} />
                <StatLine label="Defense" value={cmp.after.defense} delta={cmp.delta.defense} />
                <StatLine label="Max health" value={cmp.after.maxHp} delta={cmp.delta.maxHp} />
                <StatLine label="Critical" value={Math.round(cmp.after.crit * 100)} suffix="%" delta={cmp.delta.crit} />
              </div>
            </div>
            <p className="mt-2 text-xs italic text-[var(--parchment)]/55">{selDef.flavor}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                data-testid={`equip-${selDef.id}`}
                disabled={selDef.level > s.level}
                onClick={() => {
                  s.equip(sel.uid);
                  setSelected(null);
                }}
                className="rounded-md border border-[var(--gilt)]/60 bg-[var(--gilt)]/20 px-3 py-1.5 text-xs font-semibold text-[var(--parchment)] disabled:opacity-40"
              >
                {selDef.level > s.level ? `Requires level ${selDef.level}` : "Equip"}
              </button>
              <button onClick={() => toggleMark(sel.uid)} className="rounded-md border border-[var(--parchment)]/30 px-3 py-1.5 text-xs text-[var(--parchment)]">
                {marked.has(sel.uid) ? "Unmark" : "Mark to sell / salvage"}
              </button>
            </div>
          </div>
        )}
      </div>
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

  return (
    <div className="grid gap-4 md:grid-cols-[1fr_18rem]">
      <div className="min-w-0 space-y-2">
        <p className="text-xs text-[var(--parchment)]/70">
          Oda raises an item one step at a time, up to +{FORGE.maxPlus}. Each step adds {Math.round(FORGE.perPlus * 100)}% of the item's base stats
          (at least +1 each). Steps to +3 always succeed; +4 is 75%, +5 is 50%. A failed attempt spends the embers, returns half the shards,
          and never damages the item.
        </p>
        {!inVillage && <p className="rounded border border-[#e8735a]/40 bg-[#e8735a]/10 p-2 text-xs text-[#f0a595]">The forge is in Emberhollow. You can plan here, but upgrading needs Oda.</p>}
        <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
          {all.map(({ e, worn }) => (
            <div key={e.uid} className="relative">
              <ItemTile entry={e} selected={chosen?.uid === e.uid} onClick={() => setPick(e.uid)} />
              {worn && <span className="absolute -top-1.5 left-1 rounded bg-[var(--gilt)] px-1 text-[8px] font-bold text-[var(--ink)]">WORN</span>}
            </div>
          ))}
        </div>
        {all.length === 0 && <p className="text-xs text-[var(--parchment)]/50">No gear to upgrade yet.</p>}
      </div>
      {chosen && def && preview && (
        <div data-testid="forge-preview" className="rounded-md border p-3" style={{ borderColor: RARITY_COLOR[def.rarity] }}>
          <div className="font-display text-base" style={{ color: RARITY_COLOR[def.rarity] }}>
            {def.name} +{chosen.plus} → +{Math.min(FORGE.maxPlus, chosen.plus + 1)}
          </div>
          <div className="mt-2 space-y-0.5">
            {(["attack", "defense", "health"] as const).map((k) =>
              preview.from[k] > 0 ? (
                <StatLine key={k} label={k === "health" ? "Health" : k[0]!.toUpperCase() + k.slice(1)} value={preview.to[k]} delta={preview.to[k] - preview.from[k]} />
              ) : null,
            )}
          </div>
          {chosen.plus < FORGE.maxPlus && (
            <div className="mt-3 space-y-0.5 border-t border-[var(--gilt)]/15 pt-2 text-xs">
              <StatLine label="Embers" value={`${preview.cost.gold} (have ${s.gold})`} />
              <StatLine label="Aether Shards" value={`${preview.cost.shards} (have ${s.shards})`} />
              <StatLine label="Success chance" value={Math.round(preview.cost.chance * 100)} suffix="%" />
            </div>
          )}
          <button
            data-testid="forge-upgrade"
            disabled={!preview.canUpgrade || !inVillage}
            onClick={() => s.forge(chosen.uid)}
            className="mt-3 w-full rounded-md border border-[var(--gilt)]/60 bg-[var(--gilt)]/20 px-3 py-2 text-sm font-semibold text-[var(--parchment)] disabled:opacity-40"
          >
            {!inVillage ? "Visit Oda in Emberhollow" : preview.canUpgrade ? `Upgrade for ${preview.cost.gold} embers + ${preview.cost.shards} shards` : preview.reason}
          </button>
          <p className="mt-2 text-[10px] text-[var(--parchment)]/50">Shards come from salvaging gear in the satchel, and from bosses.</p>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ Build

function Build() {
  const s = useGame();
  const inVillage = s.regionId === VILLAGE_REGION;
  const arch = ARCHETYPES[s.archetype];
  const stats = statsFor(s);
  const need = xpForLevel(s.level);
  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-3">
        {ARCHETYPE_LIST.map((a) => {
          const active = a.id === s.archetype;
          return (
            <div key={a.id} className={`rounded-md border p-2.5 ${active ? "border-[var(--gilt)] bg-[var(--gilt)]/10" : "border-[var(--parchment)]/15 bg-[var(--ink)]/40"}`}>
              <div className="font-display text-sm text-[var(--parchment)]">{a.name}</div>
              <div className="text-[10px] uppercase tracking-wider text-[var(--gilt)]">{a.role}</div>
              <p className="mt-1 text-xs text-[var(--parchment)]/70">{a.description}</p>
              <p className="mt-1 text-[10px] text-[var(--parchment)]/55">
                Abilities: {a.abilities.map((id) => ABILITIES[id].name).join(", ")}
              </p>
              <button
                data-testid={`path-${a.id}`}
                disabled={active || !inVillage}
                onClick={() => s.setArchetype(a.id)}
                className="mt-2 w-full rounded border border-[var(--gilt)]/50 px-2 py-1 text-xs text-[var(--parchment)] disabled:opacity-40"
              >
                {active ? "Current path" : inVillage ? `Walk the ${a.name} path` : "Change in Emberhollow"}
              </button>
            </div>
          );
        })}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-md border border-[var(--gilt)]/20 bg-[var(--ink)]/40 p-2.5">
          <h3 className="text-[10px] uppercase tracking-[0.2em] text-[var(--gilt)]">
            {arch.name} · Level {s.level}
          </h3>
          <p className="mb-1 text-[10px] text-[var(--parchment)]/55">
            {s.xp} / {need} XP to level {s.level + 1}
          </p>
          <StatLine label="Attack" value={stats.attack} />
          <StatLine label="Defense" value={stats.defense} />
          <StatLine label="Max health" value={stats.maxHp} />
          <StatLine label="Critical" value={Math.round(stats.crit * 100)} suffix="%" />
          {Object.entries(stats.mods).map(([id, v]) => (
            <p key={id} className="text-xs text-[var(--gilt)]">
              {MODIFIERS[id as keyof typeof MODIFIERS].name} ×{Math.round((v ?? 0) / MODIFIERS[id as keyof typeof MODIFIERS].value)} —{" "}
              <span className="text-[var(--parchment)]/80">{MODIFIERS[id as keyof typeof MODIFIERS].text}</span>
            </p>
          ))}
        </div>
        <div className="rounded-md border border-[var(--gilt)]/20 bg-[var(--ink)]/40 p-2.5">
          <h3 className="mb-1 text-[10px] uppercase tracking-[0.2em] text-[var(--gilt)]">Ability path</h3>
          {arch.abilities.map((id, i) => {
            const on = abilityUnlocked(s.level, i);
            return (
              <div key={id} className={`flex items-start gap-2 py-1 ${on ? "" : "opacity-50"}`}>
                <span className="mt-0.5 text-[var(--parchment)]">
                  <SlotIcon id={id} className="h-5 w-5" />
                </span>
                <div>
                  <div className="text-xs font-semibold text-[var(--parchment)]">
                    {i + 1}. {ABILITIES[id].name} <span className="font-normal text-[var(--gilt)]">· {on ? "unlocked" : `level ${ABILITY_UNLOCK_LEVELS[i]}`}</span>
                  </div>
                  <div className="text-[11px] text-[var(--parchment)]/65">
                    {ABILITIES[id].description} ({ABILITIES[id].cooldown}s)
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="rounded-md border border-[var(--gilt)]/20 bg-[var(--ink)]/40 p-2.5">
        <h3 className="mb-1 text-[10px] uppercase tracking-[0.2em] text-[var(--gilt)]">Road ahead</h3>
        <ol className="space-y-0.5 text-xs text-[var(--parchment)]/80">
          <li>1. Emberhollow → Whisperpine Woods (Bramblekin, level 1–2)</li>
          <li>2. The Sunken Arch (Hollow Sentinels, Thornmaw — level 3–4)</li>
          <li>3. Barrow of Lanterns dungeon (Shades, Wardens, the Lantern King — level 5–7)</li>
        </ol>
        {QUESTS.map((q, i) => (
          <p key={q.id} className="mt-1 text-[11px] text-[var(--parchment)]/60">
            {q.name} (level {q.recommendedLevel}):{" "}
            {s.questIdx > i || s.questComplete ? "complete" : s.questIdx === i ? `in progress — ${q.steps[s.questStep]?.title ?? ""}` : "locked"}
          </p>
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Codex

function Codex() {
  const c = useGame((s) => s.codex);
  const [tab, setTab] = useState<"enemies" | "places" | "items">("enemies");
  const enemies = Object.values(ENEMIES);
  const items = Object.values(ITEMS);
  const places = Object.entries(REGIONS);
  const count = { enemies: `${c.seen.length}/${enemies.length}`, places: `${c.places.length}/${places.length}`, items: `${c.items.length}/${items.length}` };
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {(["enemies", "places", "items"] as const).map((t) => (
          <button
            key={t}
            data-testid={`codex-${t}`}
            onClick={() => setTab(t)}
            className={`rounded border px-2.5 py-1 text-xs capitalize ${tab === t ? "border-[var(--gilt)] bg-[var(--gilt)]/15 text-[var(--parchment)]" : "border-[var(--parchment)]/20 text-[var(--parchment)]/65"}`}
          >
            {t} {count[t]}
          </button>
        ))}
      </div>
      {tab === "enemies" && (
        <div className="grid gap-2 sm:grid-cols-2">
          {enemies.map((e) => {
            const known = c.seen.includes(e.id);
            return (
              <div key={e.id} className="rounded-md border border-[var(--parchment)]/15 bg-[var(--ink)]/40 p-2">
                <div className="flex justify-between text-xs">
                  <span className="font-semibold text-[var(--parchment)]">{known ? e.name : "???"}</span>
                  <span className="text-[var(--gilt)]">
                    {known ? `Lv ${e.level}${e.boss ? " boss" : ""} · defeated ${c.kills[e.id] ?? 0}` : "not yet encountered"}
                  </span>
                </div>
                {known && <p className="mt-1 text-[11px] text-[var(--parchment)]/65">{e.lore}</p>}
              </div>
            );
          })}
        </div>
      )}
      {tab === "places" && (
        <div className="grid gap-2 sm:grid-cols-2">
          {places.map(([id, r]) => (
            <div key={id} className="rounded-md border border-[var(--parchment)]/15 bg-[var(--ink)]/40 p-2 text-xs">
              <span className={c.places.includes(id) ? "text-[var(--parchment)]" : "text-[var(--parchment)]/35"}>
                {c.places.includes(id) ? r.label : "Undiscovered"}
              </span>
            </div>
          ))}
        </div>
      )}
      {tab === "items" && (
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((d) => {
            const got = c.items.includes(d.id);
            return (
              <div key={d.id} className="rounded-md border bg-[var(--ink)]/40 p-1.5 text-[11px]" style={{ borderColor: got ? RARITY_COLOR[d.rarity] : "rgba(243,228,200,0.12)" }}>
                <div style={{ color: got ? RARITY_COLOR[d.rarity] : undefined }} className={got ? "" : "text-[var(--parchment)]/30"}>
                  {got ? d.name : "Unknown"}
                </div>
                <div className="text-[9px] uppercase text-[var(--parchment)]/45">
                  {SLOT_LABEL[d.slot as EquipSlot]} · Lv{d.level}
                  {d.boss ? " · boss" : ""}
                </div>
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
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-[var(--ink)]/55 p-2 sm:p-6" onClick={() => toggle(false)}>
      <div
        data-testid="journal"
        className="flex max-h-full w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-[var(--gilt)]/30 bg-[var(--panel)]/95 shadow-2xl backdrop-blur"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 border-b border-[var(--gilt)]/20 px-3 py-2">
          <div className="flex gap-1 overflow-x-auto">
            {TABS.map((t) => (
              <button
                key={t.id}
                data-testid={`tab-${t.id}`}
                onClick={() => toggle(true, t.id)}
                className={`whitespace-nowrap rounded-md px-3 py-1.5 font-display text-xs tracking-[0.15em] ${
                  tab === t.id ? "bg-[var(--gilt)]/25 text-[var(--parchment)]" : "text-[var(--parchment)]/60 hover:text-[var(--parchment)]"
                }`}
              >
                {t.label.toUpperCase()}
                {t.key && <span className="ml-1.5 hidden font-mono text-[9px] text-[var(--gilt)] [@media(pointer:fine)]:inline">{t.key}</span>}
              </button>
            ))}
          </div>
          <button onClick={() => toggle(false)} className="rounded-md border border-[var(--parchment)]/25 px-2.5 py-1 text-xs text-[var(--parchment)]">
            Close
          </button>
        </div>
        <div className="overflow-y-auto p-3 sm:p-4">
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
