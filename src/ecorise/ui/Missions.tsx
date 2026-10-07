"use client";

import { motion } from "framer-motion";
import { useMemo, useRef, useState } from "react";
import {
  CATEGORIES,
  badges,
  categoryDef,
  dailyMissions,
  doneToday,
  impact,
  schoolChallenge,
  timelineYear,
  type Category,
  type MissionDef,
} from "../model/missions";
import { Dialog } from "./Dialog";
import { SidePanel } from "./SidePanel";
import { useEco, useEcoEnv } from "./context";
import { CheckIcon } from "./icons";

const CAT_COLOR: Record<Category, string> = {
  water: "#2f7fbf",
  energy: "#c99a2e",
  waste: "#4f8f5f",
  food: "#b4573a",
  transport: "#6a5fa8",
};

export function CategoryDot({ cat }: { cat: Category }) {
  return <i className="eco-cat-dot" style={{ background: CAT_COLOR[cat] }} aria-hidden="true" />;
}

/** Shrinks a photo to a small JPEG kept only on this device. */
function shrinkPhoto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 240 / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.width * k));
      c.height = Math.max(1, Math.round(img.height * k));
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", 0.72));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That file couldn't be read as a photo."));
    };
    img.src = url;
  });
}

/** Today's missions, open on the campus: count of small and big ones not yet done. */
export function useOpenMissions() {
  const { store } = useEcoEnv();
  const missions = useEco((s) => s.save.missions);
  const day = store.actions.today();
  return useMemo(() => {
    const d = dailyMissions(day);
    return [...d.small, d.big].filter((m) => !doneToday(missions, m.id, day)).length;
  }, [missions, day]);
}

/**
 * Second Life: 2050 missions. A message from 2050, three small actions
 * and one bigger one for today, the school challenges and your timeline.
 */
export function MissionsPanel() {
  const { store } = useEcoEnv();
  const missions = useEco((s) => s.save.missions);
  const day = store.actions.today();
  const today = useMemo(() => dailyMissions(day), [day]);
  const alert = categoryDef(today.alert);
  const total = missions.completions.length;
  const t = timelineYear(total);
  const streakDays = impact(missions, day).streak;
  return (
    <SidePanel eyebrow="Message from 2050" title={`2050 ${alert.name} Alert`} onClose={store.actions.closeOverlay} className="eco-missions">
      <p className="eco-missions__alert">
        <CategoryDot cat={alert.id} />
        {alert.alert} <span>Small actions today change what comes next.</span>
      </p>

      <div className="eco-missions__stats" aria-label="Your progress">
        <span>
          <b>{t.year}</b>
          <small>your timeline</small>
        </span>
        <span>
          <b>{streakDays}</b>
          <small>{streakDays === 1 ? "day streak" : "day streak"}</small>
        </span>
        <span>
          <b>{total}</b>
          <small>actions</small>
        </span>
      </div>
      {t.next && (
        <p className="eco-missions__next">
          {t.next.actions - total} more {t.next.actions - total === 1 ? "action" : "actions"} to reach {t.next.year}
        </p>
      )}

      <h3 className="eco-missions__h">Today&rsquo;s missions</h3>
      <ul className="eco-missions__list">
        {today.small.map((m) => (
          <SmallMission key={m.id} m={m} done={doneToday(missions, m.id, day)} />
        ))}
      </ul>
      <BigMission m={today.big} done={doneToday(missions, today.big.id, day)} />

      <h3 className="eco-missions__h">
        School challenges <span className="eco-tag eco-tag--demo">Demo data</span>
      </h3>
      <ul className="eco-challenges">
        {CATEGORIES.map((c) => {
          const ch = schoolChallenge(missions, c.id);
          return (
            <li key={c.id} className={ch.met ? "is-met" : undefined}>
              <span className="eco-challenges__name">
                <CategoryDot cat={c.id} />
                {c.name}
              </span>
              <span className="eco-challenges__bar" aria-hidden="true">
                <i style={{ width: `${(ch.total / ch.target) * 100}%`, background: CAT_COLOR[c.id] }} />
              </span>
              <span className="eco-challenges__num">
                {ch.total} / {ch.target}
              </span>
              <span className="eco-challenges__note">{ch.met ? `Timeline changed: ${c.cityChange}` : `${ch.yours} yours · ${ch.target - ch.total} to go`}</span>
            </li>
          );
        })}
      </ul>
      <p className="eco-small eco-muted">
        Other students&rsquo; actions are demo data in this prototype; yours are real. Each challenge you finish changes that
        part of your school&rsquo;s campus.
      </p>

      <div className="eco-row eco-row--between">
        <button type="button" className="eco-btn" onClick={() => store.actions.openOverlay("impact")}>
          Impact dashboard
        </button>
        <span className="eco-small eco-muted">Most missions take under a minute.</span>
      </div>
    </SidePanel>
  );
}

function SmallMission({ m, done }: { m: MissionDef; done: boolean }) {
  const { store } = useEcoEnv();
  return (
    <li className={`eco-mission${done ? " is-done" : ""}`}>
      <CategoryDot cat={m.category} />
      <span className="eco-mission__text">
        {m.text}
        <small>{categoryDef(m.category).name}</small>
      </span>
      {done ? (
        <span className="eco-mission__done">
          <CheckIcon size={14} /> Done
        </span>
      ) : (
        <button type="button" className="eco-btn eco-btn--primary eco-mission__btn" onClick={() => store.actions.completeMission(m.id)}>
          Done
        </button>
      )}
    </li>
  );
}

function BigMission({ m, done }: { m: MissionDef; done: boolean }) {
  const { store } = useEcoEnv();
  const [photo, setPhoto] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  return (
    <section className={`eco-big${done ? " is-done" : ""}`} aria-label="Bigger mission">
      <p className="eco-big__eyebrow">
        <CategoryDot cat={m.category} /> Bigger mission · one photo as proof
      </p>
      <p className="eco-big__text">{m.text}</p>
      {done ? (
        <p className="eco-mission__done">
          <CheckIcon size={14} /> Done with photo
        </p>
      ) : (
        <div className="eco-big__row">
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="eco-big__thumb" src={photo} alt="Your photo proof" />
          ) : (
            <button type="button" className="eco-btn" onClick={() => input.current?.click()}>
              Add photo
            </button>
          )}
          <input
            ref={input}
            className="sr-only"
            type="file"
            accept="image/*"
            capture="environment"
            aria-label="Photo proof for the bigger mission"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                setPhoto(await shrinkPhoto(f));
                setError(null);
              } catch (err) {
                setError((err as Error).message);
              }
            }}
          />
          <button
            type="button"
            className="eco-btn eco-btn--primary"
            disabled={!photo}
            onClick={() => photo && store.actions.completeMission(m.id, photo)}
          >
            Done
          </button>
        </div>
      )}
      {error && <p className="eco-field__err">{error}</p>}
      <p className="eco-small eco-muted">The photo stays on this device.</p>
    </section>
  );
}

/** Measurable impact: counts of real actions over time; never converted into CO₂. */
export function ImpactDashboard() {
  const { store } = useEcoEnv();
  const missions = useEco((s) => s.save.missions);
  const day = store.actions.today();
  const i = impact(missions, day);
  const b = badges(missions, day);
  const maxCat = Math.max(1, ...Object.values(i.byCategory));
  const maxWeek = Math.max(1, ...i.weeks.map((w) => w.count));
  return (
    <Dialog title="Impact dashboard" onClose={() => store.actions.openOverlay("missions")} width={620}>
      <div className="eco-impact__kpis">
        <span>
          <b>{i.thisWeek}</b>
          <small>actions this week</small>
        </span>
        <span>
          <b>
            {i.activeDaysThisWeek}/{i.daysIntoWeek}
          </b>
          <small>days active this week</small>
        </span>
        <span>
          <b>{i.streak}</b>
          <small>day streak</small>
        </span>
        <span>
          <b>{i.photos}</b>
          <small>photo-proved missions</small>
        </span>
      </div>

      <h3 className="eco-missions__h">This week by area</h3>
      <ul className="eco-impact__bars">
        {CATEGORIES.map((c) => (
          <li key={c.id}>
            <span>
              <CategoryDot cat={c.id} />
              {c.name}
            </span>
            <span className="eco-impact__bar" aria-hidden="true">
              <i style={{ width: `${(i.byCategory[c.id] / maxCat) * 100}%`, background: CAT_COLOR[c.id] }} />
            </span>
            <b>{i.byCategory[c.id]}</b>
          </li>
        ))}
      </ul>

      <h3 className="eco-missions__h">Your last four weeks</h3>
      <div className="eco-impact__weeks" role="img" aria-label={`Actions per week: ${i.weeks.map((w) => w.count).join(", ")}`}>
        {i.weeks.map((w, k) => (
          <span key={w.from}>
            <i style={{ height: `${Math.max(2, (w.count / maxWeek) * 80)}px` }} />
            <b>{w.count}</b>
            <small>{k === 3 ? "This week" : `Week ${k + 1}`}</small>
          </span>
        ))}
      </div>

      <h3 className="eco-missions__h">Badges</h3>
      <ul className="eco-badges">
        {b.map((x) => (
          <li key={x.id} className={x.earned ? "is-earned" : undefined}>
            {x.earned && <CheckIcon size={12} />} {x.name}
          </li>
        ))}
      </ul>

      <p className="eco-callout eco-small">
        These are counts of real actions you marked done (small ones on trust, bigger ones with a photo). Exact water or CO₂
        savings can&rsquo;t be known from a tap, so none are claimed. School challenge totals include demo data for other
        students.
      </p>
      <p className="eco-small eco-muted">Supports SDG 12 Responsible consumption (main), SDG 11 Sustainable communities and SDG 13 Climate action.</p>
    </Dialog>
  );
}

/** After a challenge changes the campus: a small invitation into 2050. */
export function CityInvite({ category, onDone }: { category: Category; onDone: () => void }) {
  const { store } = useEcoEnv();
  return (
    <motion.button
      type="button"
      className="eco-invite"
      onClick={() => {
        onDone();
        store.actions.openFutures(true);
      }}
      initial={{ y: -10, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.2 } }}
      transition={{ duration: 0.45, ease: "easeOut" }}
    >
      <small>Timeline changed · {categoryDef(category).cityChange}</small>
      <span>
        See the future your school changed <b aria-hidden="true">→</b>
      </span>
    </motion.button>
  );
}
