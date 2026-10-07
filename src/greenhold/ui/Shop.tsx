"use client";

import { Lock } from "@phosphor-icons/react";
import { motion } from "framer-motion";
import { CATEGORIES, piece, shopPieces, type PieceDef } from "../model/pieces";
import { useGame } from "./context";
import { ECO_GRADE, chips } from "./format";

/** The build menu: pick a tab, then a piece; then tap or drag on the map. */
export function Shop() {
  const store = useGame();
  const cat = store.category;
  if (!cat) return null;
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
          <button key={c.id} type="button" role="tab" aria-selected={c.id === cat} className={c.id === cat ? "is-on" : undefined} onClick={() => store.setCategory(c.id)}>
            {c.name}
          </button>
        ))}
      </div>
      <div className="gh-shop__cards">
        {shopPieces(cat).map((p) => (
          <Card key={p.id} p={p} on={selected?.id === p.id} />
        ))}
      </div>
      {selected && (
        <p className="gh-shop__detail">
          <span className={`gh-grade gh-grade--${ECO_GRADE[selected.id] ?? "C"}`} title="Eco grade (game estimate)">
            {ECO_GRADE[selected.id] ?? "C"}
          </span>
          <span>
            <b>{selected.name}.</b> {selected.desc} <em>{selected.tip}</em>
          </span>
        </p>
      )}
    </motion.section>
  );
}

function Card({ p, on }: { p: PieceDef; on: boolean }) {
  const store = useGame();
  const locked = p.unlock > store.town.th;
  const grade = ECO_GRADE[p.id] ?? "C";
  return (
    <button
      type="button"
      className={`gh-card ${on ? "is-on" : ""} ${locked ? "is-locked" : ""} ${!locked && store.town.coins < p.cost ? "is-poor" : ""}`}
      onClick={() => {
        if (locked) {
          store.toast(`${p.name} unlocks at Town Hall ${p.unlock}`, "info");
          return;
        }
        store.setTool(on ? { kind: "none" } : { kind: "build", id: p.id });
      }}
      aria-pressed={on}
      aria-label={`${p.name}, ${p.cost} coins${locked ? `, locked until Town Hall ${p.unlock}` : ""}, eco grade ${grade}`}
    >
      <span className={`gh-grade gh-grade--${grade}`} aria-hidden="true">
        {grade}
      </span>
      <span className="gh-card__pic" aria-hidden="true">
        {store.previews[p.id] && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={store.previews[p.id]} alt="" />
        )}
      </span>
      <span className="gh-card__name">{p.name}</span>
      <span className="gh-card__chips">
        {chips(p).map((c) => (
          <i key={c.text} className={`gh-chip gh-chip--${c.tone}`}>
            {c.text}
          </i>
        ))}
      </span>
      <span className="gh-cost">{p.cost}</span>
      {locked && (
        <span className="gh-card__lock">
          <Lock weight="fill" aria-hidden="true" /> Town Hall {p.unlock}
        </span>
      )}
    </button>
  );
}
