"use client";

import { CheckCircle, Circle, Star } from "@phosphor-icons/react";
import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { PIECES, piece } from "../model/pieces";
import { GOALS, STAR_NAMES, homeCapacity } from "../model/sim";
import { CHEST_CAP, MAX_HEIGHT, MAX_TH, TH_TITLES, TH_UPGRADE, building, removeInfo, thUpgradeCheck, xy } from "../model/world";
import { useGame } from "./context";
import { ECO_GRADE, chips, dur, fmt } from "./format";

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("button, [href], input")?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && ref.current) {
        const f = Array.from(ref.current.querySelectorAll<HTMLElement>("button:not([disabled]), [href], input"));
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
        className={`gh-modal ${wide ? "gh-modal--wide" : ""}`}
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
  const close = () => store.openPanel(null);
  return (
    <Modal title="Welcome, Mayor!" onClose={close} wide>
      <p className="gh-lead">
        This land is yours to build on. <b>Build anything you like</b>, from cottages to towers. The planet keeps score.
      </p>
      <ul className="gh-intro">
        <li>
          <span>🧱</span>
          <span>
            <b>Stack blocks and add a roof.</b> Any building with a roof and a path or road nearby becomes homes, and people move in.
          </span>
        </li>
        <li>
          <span>⚡</span>
          <span>
            <b>Give them energy, water and food,</b> and deal with their waste. Clean choices often cost more at first and pay back over time.
          </span>
        </li>
        <li>
          <span>⭐</span>
          <span>
            <b>Earn five eco stars</b> for clean power, clean air, zero waste, low carbon and green travel. Stars unlock bigger Town Hall levels.
          </span>
        </li>
        <li>
          <span>🪙</span>
          <span>
            <b>Collect taxes</b> at the Town Hall. Happy towns pay more. Builds with a timer need a free builder.
          </span>
        </li>
      </ul>
      <p className="gh-small gh-muted">
        Drag to move around · scroll or pinch to zoom · arrow keys work too. Numbers are simplified game values, not real measurements.
      </p>
      <div className="gh-row gh-row--end">
        <button type="button" className="gh-btn gh-btn--green gh-btn--big" onClick={close}>
          Start building
        </button>
      </div>
    </Modal>
  );
}

export function TownHallPanel() {
  const store = useGame();
  const t = store.town;
  const s = store.sim.stats;
  const now = store.now();
  const next = t.th < MAX_TH ? TH_UPGRADE[t.th + 1] : null;
  const check = thUpgradeCheck(t, s.starCount, now);
  const upgrading = !!t.thUntil && t.thUntil > now;
  const unlocks = next ? PIECES.filter((p) => p.unlock === t.th + 1) : [];
  return (
    <Modal title={`Town Hall · level ${t.th}`} onClose={() => store.openPanel(null)} wide>
      <p className="gh-lead">
        {t.name} is a <b>{TH_TITLES[t.th]}</b>. Buildings can be up to {MAX_HEIGHT[t.th]} blocks tall.
      </p>
      <div className="gh-th__chest">
        <span>
          Tax chest: <b>{fmt(t.chest)}</b> / {fmt(CHEST_CAP[t.th])} coins · earning {fmt(s.taxRate * 60)} a minute
        </span>
        <button type="button" className="gh-btn gh-btn--gold" disabled={t.chest < 1} onClick={() => store.collect("coins")}>
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
          {unlocks.length > 0 && (
            <p className="gh-small">
              Unlocks: {unlocks.map((p) => p.name).join(", ")}, and buildings up to {MAX_HEIGHT[t.th + 1]} blocks tall.
            </p>
          )}
          <div className="gh-row gh-row--end">
            {upgrading ? (
              <span className="gh-pill">Upgrading · {dur((t.thUntil! - now) / 1000)} left</span>
            ) : (
              <button type="button" className="gh-btn gh-btn--green" disabled={!check.ok} onClick={() => store.upgradeTownHall() && store.openPanel(null)}>
                Upgrade · {fmt(next.coins)} coins · {dur(next.time)}
              </button>
            )}
          </div>
          {!check.ok && !upgrading && <p className="gh-small gh-muted gh-right">{check.reason}</p>}
        </>
      ) : (
        <p className="gh-callout">You built a Green Capital: a big, happy town that runs on clean power, clean air and almost no waste. 🌍</p>
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
  const values = [
    `${Math.round(s.energy.renewShare * 100)}% clean on average${s.energy.avgSupply < s.energy.demand ? ", and not enough for everyone" : ""}`,
    `Air at homes: ${s.homeAir.toFixed(0)}`,
    s.waste.made ? `${Math.round((s.waste.landfill / s.waste.made) * 100)}% to landfill${s.waste.overflow ? `, ${fmt(s.waste.overflow)} overflowing` : ""}` : "No waste yet",
    store.town.residents >= 1 ? `${(s.co2.made / Math.max(1, store.town.residents)).toFixed(2)} per resident per minute` : "No residents yet",
    `${Math.round(s.travel.carShare * 100)}% drive`,
  ];
  return (
    <Modal title="Eco stars" onClose={() => store.openPanel(null)} wide>
      <p className="gh-lead">Each star is a part of a sustainable town. Stars count once you have 4 residents, and they unlock Town Hall upgrades.</p>
      <ul className="gh-starlist">
        {STAR_NAMES.map((st, k) => (
          <li key={st.name} className={s.stars[k] ? "is-on" : undefined}>
            <Star weight="fill" aria-hidden="true" />
            <span>
              <b>{st.name}</b>
              <small>{st.how}</small>
            </span>
            <span className="gh-starlist__now">{values[k]}</span>
          </li>
        ))}
      </ul>
      <p className="gh-small gh-muted">Stars use daily averages for sun and wind, so they don&rsquo;t blink on and off between day and night.</p>
    </Modal>
  );
}

export function GoalsPanel() {
  const store = useGame();
  const done = new Set(store.town.goals);
  return (
    <Modal title="Goals" onClose={() => store.openPanel(null)} wide>
      <ul className="gh-goals">
        {GOALS.map((g) => (
          <li key={g.id} className={done.has(g.id) ? "is-done" : undefined}>
            {done.has(g.id) ? <CheckCircle weight="fill" aria-label="done" /> : <Circle weight="bold" aria-label="not yet" />}
            <span>
              <b>{g.name}</b>
              <small>{g.how}</small>
            </span>
            <span className="gh-goals__reward">
              <span className="gh-cost gh-cost--coins">{g.coins}</span>
              {g.mats > 0 && <span className="gh-cost gh-cost--mats">{g.mats}</span>}
            </span>
          </li>
        ))}
      </ul>
      <p className="gh-small gh-muted">Each goal pays out once.</p>
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
      <h3 className="gh-h3">Controls</h3>
      <ul className="gh-small gh-controls">
        <li>Drag (or arrow keys / WASD) to move · scroll, pinch or +/− to zoom</li>
        <li>Pick a piece in Build, then tap or drag on the map · Esc to stop</li>
        <li>While building: right-drag or hold Space to move the map</li>
        <li>Tap a building to inspect it · tap the Town Hall to upgrade</li>
      </ul>
      <h3 className="gh-h3">About the numbers</h3>
      <p className="gh-small">
        Greenhold simplifies a lot. Its numbers are game values chosen so choices point the same way as in real life: timber stores carbon while making cement releases it, coal is cheap to build but dirty and costly to run, sun and wind vary, and trees clean the air. They are not real measurements.
      </p>
      <p className="gh-small gh-muted">Your town is saved on this device only.</p>
      <div className="gh-row gh-row--between">
        {confirm ? (
          <>
            <span className="gh-small">Start a new town? This can&rsquo;t be undone.</span>
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
            New town…
          </button>
        )}
      </div>
    </Modal>
  );
}

/** Details of the tapped column: what's there, whether people can live in it, and what it does. */
export function InfoCard() {
  const store = useGame();
  const i = store.selected;
  if (i === null) return null;
  const t = store.town;
  const c = t.cols[i];
  const s = store.sim.stats;
  const now = store.now();
  const { x, y } = xy(i);
  const ids = [...c.s];
  const topId = ids[ids.length - 1];
  const tp = topId ? piece(topId) : null;
  const rem = removeInfo(t, i, now);
  const blocks = ids.filter((id) => piece(id).kind === "block");
  const status = s.homes.includes(i)
    ? `Home for ${homeCapacity(t, i)} people`
    : s.noRoof.includes(i)
      ? "Needs a roof before anyone can live here"
      : s.noAccess.includes(i)
        ? "Needs a road or path within 2 tiles"
        : null;
  const ground = c.g !== "grass" && c.g !== "sand" && c.g !== "water" ? piece(c.g) : null;
  const main = tp ?? ground;
  return (
    <motion.aside className="gh-info" initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 20, opacity: 0, transition: { duration: 0.15 } }} aria-label="Selected">
      <header>
        <h2 className="gh-display">{tp && blocks.length ? `${blocks.length}-storey building` : (main?.name ?? (c.g === "water" ? "Water" : "Open ground"))}</h2>
        <button type="button" className="gh-x" aria-label="Close" onClick={() => store.select(null)}>
          ×
        </button>
      </header>
      <p className="gh-small gh-muted">
        Tile {x}, {y}
        {main && ECO_GRADE[main.id] ? ` · eco grade ${ECO_GRADE[main.id]}` : ""}
      </p>
      {status && <p className={`gh-status ${s.homes.includes(i) ? "is-good" : "is-warn"}`}>{status}</p>}
      {building(c, now) && <p className="gh-status is-info">Being built · {dur((c.until! - now) / 1000)} left</p>}
      {ids.length > 0 && (
        <ol className="gh-stack" reversed>
          {[...ids].reverse().map((id, k) => (
            <li key={`${id}-${k}`}>
              {store.previews[id] && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={store.previews[id]} alt="" />
              )}
              {piece(id).name}
            </li>
          ))}
        </ol>
      )}
      {main && (
        <>
          <p className="gh-small">{main.desc}</p>
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
      <div className="gh-row">
        {tp && tp.kind === "block" && (
          <button type="button" className="gh-btn" onClick={() => store.setCategory("roofs")}>
            Add a roof
          </button>
        )}
        {rem.ok && (
          <button
            type="button"
            className="gh-btn gh-btn--red-soft"
            onClick={() => {
              store.removeAt(i);
            }}
          >
            {rem.removed === "rock" ? "Clear (−20 coins, +25 materials)" : `Remove ${rem.removed ? piece(rem.removed).name.toLowerCase() : ""} (+${rem.coins ?? 0}${rem.mats ? `, +${rem.mats} mats` : ""})`}
          </button>
        )}
      </div>
    </motion.aside>
  );
}
