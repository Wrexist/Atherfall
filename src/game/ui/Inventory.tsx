import { ITEMS, RARITY_COLOR, RARITY_LABEL, type EquipSlot } from "../data/items";
import { statsFor, useGame } from "../core/store";

const SLOTS: EquipSlot[] = ["weapon", "armor", "trinket"];

function StatLine({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between text-xs text-[var(--parchment)]/80">
      <span>{label}</span>
      <span className="text-[var(--gilt)]">{value}</span>
    </div>
  );
}

export function InventoryPanel() {
  const s = useGame();
  const stats = statsFor(s);
  if (!s.inventoryOpen) return null;

  return (
    <div className="pointer-events-auto fixed inset-0 z-30 flex items-center justify-center bg-[var(--ink)]/45 p-4">
      <div className="max-h-[88vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-[var(--gilt)]/30 bg-[var(--panel)]/95 p-5 shadow-2xl backdrop-blur">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl tracking-[0.18em] text-[var(--parchment)]">SATCHEL</h2>
          <button
            className="rounded-md border border-[var(--gilt)]/30 px-3 py-1 text-xs text-[var(--parchment)] hover:bg-[var(--gilt)]/15"
            onClick={() => s.toggleInventory(false)}
          >
            Close (I)
          </button>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-[1fr_1.4fr]">
          <div className="space-y-3">
            <div className="rounded-lg border border-[var(--gilt)]/20 p-3">
              <div className="mb-2 text-[10px] uppercase tracking-[0.2em] text-[var(--gilt)]">Worn</div>
              <div className="space-y-2">
                {SLOTS.map((slot) => {
                  const id = s.equipped[slot];
                  const def = id ? ITEMS[id] : null;
                  return (
                    <div key={slot} className="flex items-center justify-between gap-2 rounded-md bg-[var(--ink)]/40 px-2.5 py-2">
                      <div className="min-w-0">
                        <div className="text-[10px] uppercase tracking-wider text-[var(--parchment)]/50">{slot}</div>
                        <div
                          className="truncate text-sm"
                          style={{ color: def ? RARITY_COLOR[def.rarity] : "var(--parchment)" }}
                        >
                          {def?.name ?? "—"}
                        </div>
                      </div>
                      {def && (
                        <button
                          className="shrink-0 rounded border border-[var(--gilt)]/30 px-2 py-1 text-[10px] text-[var(--parchment)] hover:bg-[var(--gilt)]/15"
                          onClick={() => s.unequip(slot)}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="rounded-lg border border-[var(--gilt)]/20 p-3">
              <div className="mb-2 text-[10px] uppercase tracking-[0.2em] text-[var(--gilt)]">Standing</div>
              <StatLine label="Attack" value={stats.attack} />
              <StatLine label="Defence" value={stats.defense} />
              <StatLine label="Max health" value={stats.maxHp} />
              <StatLine label="Draughts" value={s.potions} />
              <StatLine label="Embers" value={s.gold} />
            </div>
          </div>

          <div>
            <div className="mb-2 text-[10px] uppercase tracking-[0.2em] text-[var(--gilt)]">
              Carried ({s.inventory.length})
            </div>
            {s.inventory.length === 0 ? (
              <p className="rounded-lg border border-dashed border-[var(--gilt)]/25 p-6 text-center text-xs text-[var(--parchment)]/60">
                Empty. Fell enemies in Whisperpine Woods and walk over what they drop.
              </p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {s.inventory.map((entry) => {
                  const def = ITEMS[entry.itemId];
                  if (!def) return null;
                  const color = RARITY_COLOR[def.rarity];
                  return (
                    <div
                      key={entry.uid}
                      className="rounded-lg border p-2.5"
                      style={{ borderColor: `${color}55`, background: "rgba(0,0,0,0.18)" }}
                    >
                      <div className="text-sm font-medium" style={{ color }}>
                        {def.name}
                      </div>
                      <div className="text-[10px] uppercase tracking-wider text-[var(--parchment)]/50">
                        {RARITY_LABEL[def.rarity]} · {def.slot}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-[var(--parchment)]/80">
                        {def.attack ? <span>+{def.attack} atk</span> : null}
                        {def.defense ? <span>+{def.defense} def</span> : null}
                        {def.health ? <span>+{def.health} hp</span> : null}
                      </div>
                      <p className="mt-1 text-[10px] italic leading-snug text-[var(--parchment)]/45">{def.flavor}</p>
                      <div className="mt-2 flex gap-2">
                        <button
                          className="rounded border border-[var(--gilt)]/40 bg-[var(--gilt)]/15 px-2.5 py-1 text-[11px] text-[var(--parchment)] hover:bg-[var(--gilt)]/30"
                          onClick={() => s.equip(entry.uid)}
                        >
                          Equip
                        </button>
                        <button
                          className="rounded border border-[var(--gilt)]/20 px-2.5 py-1 text-[11px] text-[var(--parchment)]/70 hover:bg-[var(--ink)]/40"
                          onClick={() => s.dropItem(entry.uid)}
                        >
                          Discard
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
