"use client";

import { Lock, Timer } from "@phosphor-icons/react";
import { motion } from "framer-motion";
import { CATEGORIES, piece, shopPieces, type PieceDef } from "../model/pieces";
import { canAfford } from "../model/world";
import { useGame } from "./context";
import { ECO_GRADE, chips, dur } from "./format";

/** The build drawer: pick a category, then a piece; then tap or drag on the map. */
export function Shop() {
  const store = useGame();
  const cat = store.category;
  if (!cat) return null;
  const items = shopPieces(cat);
  const selected = store.tool.kind === "build" ? piece(store.tool.id) : null;
  return (
    <motion.section
      className="gh-shop"
      aria-label="Build"
      initial={{ y: 40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 40, opacity: 0, transition: { duration: 0.18 } }}
      transition={{ type: "spring", stiffness: 380, damping: 32 }}
    >
      <div className="gh-shop__tabs" role="tablist">
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={c.id === cat}
            className={c.id === cat ? "is-on" : undefined}
            onClick={() => store.setCategory(c.id)}
          >
            {c.name}
          </button>
        ))}
      </div>
      <div className="gh-shop__cards">
        {items.map((p) => (
          <Card key={p.id} p={p} on={selected?.id === p.id} />
        ))}
      </div>
      {selected && (
        <div className="gh-shop__detail">
          <span className={`gh-grade gh-grade--${ECO_GRADE[selected.id] ?? "C"}`} title="Eco grade (game estimate)">
            {ECO_GRADE[selected.id] ?? "C"}
          </span>
          <span>
            <b>{selected.name}.</b> {selected.desc} <em>{selected.tip}</em>
          </span>
          <span className="gh-card__chips gh-shop__chips">
            {chips(selected).map((c) => (
              <i key={c.text} className={`gh-chip gh-chip--${c.tone}`}>
                {c.text}
              </i>
            ))}
          </span>
          <span className="gh-shop__how">{selected.kind === "ground" || selected.kind === "nature" || selected.kind === "block" ? "Tap or drag on the map" : "Tap the map to place"} · Esc to stop</span>
        </div>
      )}
    </motion.section>
  );
}

function Card({ p, on }: { p: PieceDef; on: boolean }) {
  const store = useGame();
  const t = store.town;
  const locked = p.unlock > t.th;
  const afford = canAfford(t, p.cost);
  const grade = ECO_GRADE[p.id] ?? "C";
  return (
    <button
      type="button"
      className={`gh-card ${on ? "is-on" : ""} ${locked ? "is-locked" : ""} ${!afford && !locked ? "is-poor" : ""}`}
      onClick={() => {
        if (locked) {
          store.toast(`${p.name} unlocks at Town Hall ${p.unlock}`, "info");
          return;
        }
        store.setTool(on ? { kind: "none" } : { kind: "build", id: p.id });
      }}
      aria-pressed={on}
      aria-label={`${p.name}, ${p.cost.coins} coins${p.cost.mats ? ` and ${p.cost.mats} materials` : ""}${locked ? `, locked until Town Hall ${p.unlock}` : ""}, eco grade ${grade}`}
    >
      <span className={`gh-grade gh-grade--${grade}`} aria-hidden="true">
        {grade}
      </span>
      <span className="gh-card__pic" aria-hidden="true">
        {store.previews[p.id] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={store.previews[p.id]} alt="" />
        ) : null}
      </span>
      <span className="gh-card__name">{p.name}</span>
      <span className="gh-card__chips">
        {chips(p)
          .slice(0, 2)
          .map((c) => (
            <i key={c.text} className={`gh-chip gh-chip--${c.tone}`}>
              {c.text}
            </i>
          ))}
      </span>
      <span className="gh-card__cost">
        {p.cost.coins > 0 && <span className="gh-cost gh-cost--coins">{p.cost.coins}</span>}
        {p.cost.mats > 0 && <span className="gh-cost gh-cost--mats">{p.cost.mats}</span>}
        {p.time > 0 && (
          <span className="gh-cost gh-cost--time">
            <Timer weight="bold" aria-hidden="true" />
            {dur(p.time)}
          </span>
        )}
      </span>
      {locked && (
        <span className="gh-card__lock">
          <Lock weight="fill" aria-hidden="true" /> Town Hall {p.unlock}
        </span>
      )}
    </button>
  );
}
