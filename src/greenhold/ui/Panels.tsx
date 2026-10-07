"use client";

import { CheckCircle, Circle, Star } from "@phosphor-icons/react";
import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { PIECES, piece } from "../model/pieces";
import { STAR_NAMES, airLabel, homeCapacity, nextUpgrade } from "../model/sim";
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
  const close = () => store.openPanel(null);
  return (
    <Modal title="Welcome, Mayor!" onClose={close}>
      <p className="gh-lead">
        Your village runs on a <b>smoky coal plant</b>, and the smoke drifts over people&rsquo;s homes. Grow your town and clear the air.
      </p>
      <ul className="gh-intro">
        <li>
          <span>🧱</span>
          <span>
            <b>Build anything.</b> Stack blocks and add a roof. With a path nearby, people move in.
          </span>
        </li>
        <li>
          <span>☀️</span>
          <span>
            <b>Switch to clean power,</b> then remove the coal plant and watch the smog lift.
          </span>
        </li>
        <li>
          <span>⭐</span>
          <span>
            <b>Earn 3 eco stars:</b> clean power, clean air and green travel.
          </span>
        </li>
      </ul>
      <p className="gh-small gh-muted">Fern, your advisor, shows one goal at a time. Drag to move, scroll or pinch to zoom. Numbers are simplified game values.</p>
      <div className="gh-row gh-row--end">
        <button type="button" className="gh-btn gh-btn--green gh-btn--big" onClick={close}>
          Let&rsquo;s go
        </button>
      </div>
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
