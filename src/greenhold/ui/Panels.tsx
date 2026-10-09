"use client";

import { CheckCircle, Circle, Star } from "@phosphor-icons/react";
import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { PIECES, piece } from "../model/pieces";
import { STAR_NAMES, airLabel, homeCapacity, nextUpgrade } from "../model/sim";
import { WORLDS } from "../model/worlds";
import { CHEST_CAP, MAX_HEIGHT, TH_TITLES, removeInfo, thUpgradeCheck } from "../model/world";
import { useGame } from "./context";
import { ECO_GRADE, chips, fmt } from "./format";

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>(".gh-modal__body button, .gh-modal__body input, header button")?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && ref.current) {
        const f = Array.from(ref.current.querySelectorAll<HTMLElement>("button:not([disabled])"));
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("keydown", key);
      opener?.focus?.();
    };
  }, [onClose]);
  return (
    <motion.div className="gh-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.15 } }} onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <motion.div
        ref={ref}
        className="gh-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        initial={{ y: 24, scale: 0.96, opacity: 0 }}
        animate={{ y: 0, scale: 1, opacity: 1 }}
        exit={{ y: 12, scale: 0.98, opacity: 0, transition: { duration: 0.15 } }}
        transition={{ type: "spring", stiffness: 420, damping: 30 }}
      >
        <header className="gh-modal__head">
          <h2 className="gh-display">{title}</h2>
          <button type="button" className="gh-x gh-x--big" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div className="gh-modal__body">{children}</div>
      </motion.div>
    </motion.div>
  );
}

export function IntroPanel() {
  const store = useGame();
  const t = store.town;
  const world = WORLDS[t.world];
  const close = () => store.openPanel(null);
  return (
    <Modal title={`World ${t.world + 1}: ${world.name}`} onClose={close}>
      <div className="gh-world-hero" aria-hidden="true">
        {world.emoji}
      </div>
      <p className="gh-lead">
        <b>The problem:</b> {world.problem}
      </p>
      <p className="gh-lead">
        <b>Your mission:</b> {world.mission}
      </p>
      <p className="gh-small gh-muted">Drag to move, scroll to zoom. Tap Build to place things. Numbers are simplified game values.</p>
      <div className="gh-row gh-row--end">
        <button type="button" className="gh-btn gh-btn--green gh-btn--big" onClick={close}>
          Let&rsquo;s go
        </button>
      </div>
    </Modal>
  );
}

/** Every world: which are open, which are done, and a way to play them. */
export function WorldsPanel() {
  const store = useGame();
  const t = store.town;
  const [confirm, setConfirm] = useState<number | null>(null);
  return (
    <Modal title="Worlds" onClose={() => store.openPanel(null)}>
      <ol className="gh-worlds">
        {WORLDS.map((w, i) => {
          const locked = i > store.progress.unlocked;
          const done = store.progress.done.includes(i);
          const here = i === t.world;
          const got = here ? t.goal : done ? w.achievements.length : 0;
          return (
            <li key={w.name} className={`gh-world ${locked ? "is-locked" : ""} ${here ? "is-here" : ""}`}>
              <span className="gh-world__emoji" aria-hidden="true">
                {locked ? "🔒" : w.emoji}
              </span>
              <span className="gh-world__body">
                <b>
                  {i + 1}. {w.name} {done && <span className="gh-world__done">Complete</span>}
                </b>
                <small>{locked ? "Finish the world before to unlock." : w.problem}</small>
                {!locked && (
                  <span className="gh-progress" aria-label={`${got} of ${w.achievements.length} achievements`}>
                    {w.achievements.map((a, k) => (
                      <i key={a.id} className={k < got ? "is-done" : undefined} />
                    ))}
                  </span>
                )}
              </span>
              {!locked &&
                (here ? (
                  <span className="gh-small gh-muted">You&rsquo;re here</span>
                ) : confirm === i ? (
                  <span className="gh-world__confirm">
                    <small>Leave this town?</small>
                    <button type="button" className="gh-btn gh-btn--green" onClick={() => store.playWorld(i)}>
                      Go
                    </button>
                  </span>
                ) : (
                  <button type="button" className="gh-btn gh-btn--green" onClick={() => setConfirm(i)}>
                    Play
                  </button>
                ))}
            </li>
          );
        })}
      </ol>
      <p className="gh-small gh-muted">Moving to another world starts a fresh town there. Finished worlds stay finished.</p>
    </Modal>
  );
}

/** Every achievement in this world: done, next, and still to come. */
export function GoalsPanel() {
  const store = useGame();
  const t = store.town;
  const world = WORLDS[t.world];
  return (
    <Modal title={`Goals · ${world.name}`} onClose={() => store.openPanel(null)}>
      <p className="gh-small gh-muted">{world.mission}</p>
      <ol className="gh-goals">
        {world.achievements.map((a, k) => {
          const state = k < t.goal ? "done" : k === t.goal ? "now" : "later";
          return (
            <li key={a.id} className={`is-${state}`}>
              {state === "done" ? <CheckCircle weight="fill" aria-label="done" /> : <Circle weight={state === "now" ? "fill" : "bold"} aria-label={state === "now" ? "current goal" : "to come"} />}
              <span>
                <b>{a.name}</b>
                {state !== "done" && <small>{a.why}</small>}
              </span>
              <span className="gh-cost">{a.coins}</span>
            </li>
          );
        })}
      </ol>
      <p className="gh-small gh-muted">Goals unlock one at a time. Finish them all to open the next world.</p>
    </Modal>
  );
}

/** Shown when the last achievement in a world is earned. */
export function CompletePanel() {
  const store = useGame();
  const t = store.town;
  const world = WORLDS[t.world];
  // The next world still to finish (usually the one after this).
  const order = [...WORLDS.keys()].map((k) => (t.world + 1 + k) % WORLDS.length);
  const nextIndex = order.find((k) => k !== t.world && !store.progress.done.includes(k) && k <= store.progress.unlocked);
  const next = nextIndex !== undefined ? WORLDS[nextIndex] : undefined;
  const s = store.sim.stats;
  return (
    <Modal title="World complete!" onClose={() => store.openPanel(null)}>
      <div className="gh-world-hero gh-world-hero--win" aria-hidden="true">
        🏆
      </div>
      <p className="gh-lead">
        You turned <b>{world.name}</b> around: {Math.floor(t.residents)} happy residents, air that&rsquo;s {airLabel(s.homeAir).label.toLowerCase()}, and {Math.round(s.energy.cleanShare * 100)}% clean power.
      </p>
      <ul className="gh-checks">
        {world.achievements.map((a) => (
          <Check key={a.id} ok text={a.name} />
        ))}
      </ul>
      {next ? (
        <>
          <p className="gh-callout">
            <b>Next: {next.name}</b> {next.emoji}
            <br />
            {next.problem}
          </p>
          <div className="gh-row gh-row--between">
            <button type="button" className="gh-btn" onClick={() => store.openPanel(null)}>
              Keep building here
            </button>
            <button type="button" className="gh-btn gh-btn--green gh-btn--big" onClick={() => store.playWorld(nextIndex!)}>
              Go to {next.name}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="gh-callout">You finished every world. Each one showed a real fix: clean power, walkable streets, and green, self-sufficient towns. 🌍</p>
          <div className="gh-row gh-row--end">
            <button type="button" className="gh-btn gh-btn--green" onClick={() => store.openPanel(null)}>
              Keep building
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}

export function TownHallPanel() {
  const store = useGame();
  const t = store.town;
  const s = store.sim.stats;
  const next = nextUpgrade(t);
  const check = thUpgradeCheck(t, s.starCount);
  const unlocks = next ? PIECES.filter((p) => p.unlock === t.th + 1) : [];
  return (
    <Modal title={`Town Hall · level ${t.th}`} onClose={() => store.openPanel(null)}>
      <div className="gh-th__chest">
        <span>
          Taxes waiting: <b>{fmt(t.chest)}</b> / {fmt(CHEST_CAP[t.th])} coins
          <small className="gh-muted">
            {" "}
            · earning {fmt(s.taxRate * 60 + s.income)} a minute{s.income > 0 ? `, ${fmt(s.income)} of it from shops and cafés` : ""}
          </small>
        </span>
        <button type="button" className="gh-btn gh-btn--gold" disabled={t.chest < 1} onClick={() => store.collect()}>
          Collect
        </button>
      </div>
      {next ? (
        <>
          <h3 className="gh-h3">Upgrade to {TH_TITLES[t.th + 1]}</h3>
          <ul className="gh-checks">
            <Check ok={Math.floor(t.residents) >= next.residents} text={`${next.residents} residents (now ${Math.floor(t.residents)})`} />
            <Check ok={s.starCount >= next.stars} text={`${next.stars} eco ${next.stars === 1 ? "star" : "stars"} (now ${s.starCount})`} />
            <Check ok={t.coins >= next.coins} text={`${fmt(next.coins)} coins`} />
          </ul>
          <p className="gh-small">
            Unlocks buildings up to {MAX_HEIGHT[t.th + 1]} blocks tall{unlocks.length ? `, plus ${unlocks.map((p) => p.name.toLowerCase()).join(" and ")}` : ""}.
          </p>
          <div className="gh-row gh-row--between">
            <span className="gh-small gh-muted">{check.ok ? "Ready!" : check.reason}</span>
            <button type="button" className="gh-btn gh-btn--green" disabled={!check.ok} onClick={() => store.upgradeTownHall() && store.openPanel(null)}>
              Upgrade · {fmt(next.coins)} coins
            </button>
          </div>
        </>
      ) : (
        <p className="gh-callout">Your Town Hall is fully upgraded. 🌍</p>
      )}
    </Modal>
  );
}

function Check({ ok, text }: { ok: boolean; text: string }) {
  return (
    <li className={ok ? "is-ok" : undefined}>
      {ok ? <CheckCircle weight="fill" aria-label="done" /> : <Circle weight="bold" aria-label="not yet" />} {text}
    </li>
  );
}

export function StarsPanel() {
  const store = useGame();
  const s = store.sim.stats;
  const now = [`${Math.round(s.energy.cleanShare * 100)}% clean now`, `Air at homes: ${airLabel(s.homeAir).label}`, `${Math.round(s.travel.carShare * 100)}% drive now`];
  return (
    <Modal title="Eco stars" onClose={() => store.openPanel(null)}>
      <p className="gh-lead">Three parts of a sustainable town. Stars count once 4 people live here, and they unlock Town Hall upgrades.</p>
      <ul className="gh-starlist">
        {STAR_NAMES.map((st, k) => (
          <li key={st.name} className={s.stars[k] ? "is-on" : undefined}>
            <Star weight="fill" aria-hidden="true" />
            <span>
              <b>{st.name}</b>
              <small>{st.how}</small>
            </span>
            <span className="gh-starlist__now">{now[k]}</span>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

export function SettingsPanel() {
  const store = useGame();
  const [confirm, setConfirm] = useState(false);
  return (
    <Modal title="Settings" onClose={() => store.openPanel(null)}>
      <div className="gh-setting">
        <span>Sound effects</span>
        <button type="button" className={`gh-switch ${store.sound ? "is-on" : ""}`} role="switch" aria-checked={store.sound} onClick={() => store.setSound(!store.sound)}>
          <i />
        </button>
      </div>
      <p className="gh-small">
        Drag to move · scroll, pinch or +/− to zoom · arrow keys work too. While building, right-drag to move the map. Esc stops building.
      </p>
      <p className="gh-small gh-muted">
        Numbers are simplified game values chosen so choices point the same way as real life: coal is cheap to build but smoky and costly to run, timber stores carbon, trees clean the air. Your town is saved on this device.
      </p>
      <div className="gh-row gh-row--between">
        {confirm ? (
          <>
            <span className="gh-small">Start this world over? Your town here will be lost.</span>
            <span className="gh-row">
              <button type="button" className="gh-btn" onClick={() => setConfirm(false)}>
                Keep my town
              </button>
              <button type="button" className="gh-btn gh-btn--red" onClick={() => store.reset()}>
                Start over
              </button>
            </span>
          </>
        ) : (
          <button type="button" className="gh-btn gh-btn--red-soft" onClick={() => setConfirm(true)}>
            Restart this world…
          </button>
        )}
      </div>
    </Modal>
  );
}

/** What's on the tapped tile, and a quick way to remove it. */
export function InfoCard() {
  const store = useGame();
  const i = store.selected;
  if (i === null) return null;
  const t = store.town;
  const c = t.cols[i];
  const s = store.sim.stats;
  const tp = c.s.length ? piece(c.s[c.s.length - 1]) : null;
  const ground = c.g === "road" || c.g === "path" || c.g === "bike" ? piece(c.g) : null;
  const main = tp ?? ground;
  const blocks = c.s.filter((id) => piece(id).kind === "block").length;
  const rem = removeInfo(t, i);
  const status = s.homes.includes(i)
    ? `Home for ${homeCapacity(t, i)} people`
    : s.noRoof.includes(i)
      ? "Needs a roof before anyone can live here"
      : s.noAccess.includes(i)
        ? "Needs a road or path within 2 tiles"
        : null;
  return (
    <motion.aside className="gh-info" initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 20, opacity: 0, transition: { duration: 0.15 } }} aria-label="Selected">
      <header>
        <h2 className="gh-display">{blocks ? `${blocks}-storey building` : (main?.name ?? "Open ground")}</h2>
        <button type="button" className="gh-x" aria-label="Close" onClick={() => store.select(null)}>
          ×
        </button>
      </header>
      {status && <p className={`gh-status ${s.homes.includes(i) ? "is-good" : "is-warn"}`}>{status}</p>}
      {main && (
        <>
          <p className="gh-small">
            {main.desc} {ECO_GRADE[main.id] && <b>Eco grade {ECO_GRADE[main.id]}.</b>}
          </p>
          <span className="gh-card__chips">
            {chips(main).map((ch) => (
              <i key={ch.text} className={`gh-chip gh-chip--${ch.tone}`}>
                {ch.text}
              </i>
            ))}
          </span>
          {main.tip && <p className="gh-tip">💡 {main.tip}</p>}
        </>
      )}
      {rem.ok && (
        <button type="button" className="gh-btn gh-btn--red-soft" onClick={() => store.removeAt(i)}>
          {rem.removed === "rock" ? "Clear (−20 coins)" : `Remove ${rem.removed ? piece(rem.removed).name.toLowerCase() : ""} (+${rem.coins ?? 0} coins)`}
        </button>
      )}
    </motion.aside>
  );
}
