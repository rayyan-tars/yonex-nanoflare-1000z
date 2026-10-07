"use client";

import { useState } from "react";
import {
  MAX_ANSWER_LENGTH,
  NO_PLAYTEST_DATA,
  activeSession,
  formatDuration,
  summarize,
  summaryText,
  type PlayAgain,
  type PlaytestAnswers,
  type PlaytestKind,
  type PlaytestSummary,
} from "../state/playtest";
import { Dialog } from "./Dialog";
import { useEco, useEcoEnv } from "./context";

/** Top-bar marker while a playtest runs, with the way to finish it. */
export function PlaytestChip() {
  const { store } = useEcoEnv();
  const active = useEco((s) => activeSession(s.playtest));
  if (!active) return null;
  return (
    <span className="eco-playchip">
      <span className="eco-playchip__dot" aria-hidden="true" />
      <span>Playtest</span>
      <button type="button" className="eco-playchip__btn" onClick={() => store.actions.openOverlay("playtest-finish")}>
        Finish
      </button>
    </span>
  );
}

export function PlaytestStartDialog() {
  const { store, bus } = useEcoEnv();
  return (
    <Dialog title="Start a playtest?" onClose={() => store.actions.openOverlay("settings")} width={460}>
      <p>The game restarts from a clean Monday for the new player. Then let them play as normal.</p>
      <ul className="eco-list">
        <li>Recorded anonymously in this browser only: choices, simulated results and timings.</li>
        <li>No names, no accounts, no mouse tracking.</li>
        <li>
          When they&rsquo;re done, press <strong>Finish</strong> at the top for three short questions.
        </li>
      </ul>
      <div className="eco-row eco-row--end">
        <button type="button" className="eco-btn" onClick={() => store.actions.openOverlay("settings")}>
          Cancel
        </button>
        <button
          type="button"
          className="eco-btn eco-btn--primary"
          data-autofocus
          onClick={() => {
            store.actions.startPlaytest();
            bus.emit("recenter", undefined);
          }}
        >
          Start playtest
        </button>
      </div>
    </Dialog>
  );
}

const CLARITY = [1, 2, 3, 4, 5] as const;
const AGAIN: [PlayAgain, string][] = [
  ["yes", "Yes"],
  ["maybe", "Maybe"],
  ["no", "No"],
];

/** The three questions (plus one optional) at the end of a playtest. */
export function PlaytestFinishDialog() {
  const { store } = useEcoEnv();
  const active = useEco((s) => activeSession(s.playtest));
  const [goal, setGoal] = useState("");
  const [change, setChange] = useState("");
  const [clarity, setClarity] = useState<PlaytestAnswers["clarity"] | null>(null);
  const [again, setAgain] = useState<PlayAgain | null>(null);
  const close = store.actions.closeOverlay;

  if (!active) {
    return (
      <Dialog title="No playtest running" onClose={close} width={420}>
        <p>Start one from Settings.</p>
      </Dialog>
    );
  }
  if (active.rounds.length === 0) {
    return (
      <Dialog title="Finish playtest?" onClose={close} width={440}>
        <p>No lunch has been served yet, so this session can&rsquo;t be counted.</p>
        <div className="eco-row eco-row--end">
          <button type="button" className="eco-btn eco-btn--danger-outline" onClick={store.actions.abandonPlaytest}>
            End without saving
          </button>
          <button type="button" className="eco-btn eco-btn--primary" onClick={close} data-autofocus>
            Keep playing
          </button>
        </div>
      </Dialog>
    );
  }
  return (
    <Dialog title="Three quick questions" onClose={close} width={520}>
      <p className="eco-muted eco-small">Anonymous. Please don&rsquo;t write any names.</p>
      <label className="eco-q">
        <span className="eco-q__label">1. What was the goal of the game?</span>
        <textarea rows={2} maxLength={MAX_ANSWER_LENGTH} value={goal} onChange={(e) => setGoal(e.target.value)} data-autofocus />
      </label>
      <label className="eco-q">
        <span className="eco-q__label">2. What would you change to reduce food waste without leaving students hungry?</span>
        <textarea rows={2} maxLength={MAX_ANSWER_LENGTH} value={change} onChange={(e) => setChange(e.target.value)} />
      </label>
      <fieldset className="eco-q">
        <legend className="eco-q__label">3. How easy was Second Life: 2050 to understand?</legend>
        <div className="eco-scale" role="radiogroup" aria-label="1 is very hard, 5 is very easy">
          {CLARITY.map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={clarity === n}
              className={`eco-scale__btn${clarity === n ? " is-on" : ""}`}
              onClick={() => setClarity(n)}
            >
              {n}
            </button>
          ))}
        </div>
        <span className="eco-scale__ends" aria-hidden="true">
          <span>Very hard</span>
          <span>Very easy</span>
        </span>
      </fieldset>
      <fieldset className="eco-q">
        <legend className="eco-q__label">
          Would you play another Second Life: 2050 challenge? <span className="eco-muted">(optional)</span>
        </legend>
        <div className="eco-scale" role="radiogroup" aria-label="Would you play another Second Life: 2050 challenge?">
          {AGAIN.map(([v, label]) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={again === v}
              className={`eco-scale__btn eco-scale__btn--wide${again === v ? " is-on" : ""}`}
              onClick={() => setAgain(again === v ? null : v)}
            >
              {label}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="eco-row eco-row--between">
        <button type="button" className="eco-link" onClick={close}>
          Back to the game
        </button>
        <button
          type="button"
          className="eco-btn eco-btn--primary"
          disabled={clarity === null}
          onClick={() => clarity !== null && store.actions.submitPlaytest({ goal, change, clarity, playAgain: again })}
        >
          Save answers
        </button>
      </div>
    </Dialog>
  );
}

/** Team-only summary. Shows what was recorded; draws no conclusions. */
export function PlaytestSummaryDialog() {
  const { store, debug } = useEcoEnv();
  const data = useEco((s) => s.playtest);
  const hasDemo = data.sessions.some((s) => s.kind === "demo");
  const [kind, setKind] = useState<PlaytestKind>("recorded");
  const [confirmClear, setConfirmClear] = useState(false);
  const [copied, setCopied] = useState<"ok" | "manual" | null>(null);
  const view = kind === "demo" && !hasDemo ? "recorded" : kind;
  const sum = summarize(data, view);
  const text = view === "recorded" ? summaryText(sum) : "";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied("ok");
    } catch {
      setCopied("manual");
    }
  };

  return (
    <Dialog title="Playtest Summary" onClose={() => store.actions.openOverlay("settings")} width={620}>
      <div className="eco-pt-tabs" role="tablist" aria-label="Data shown">
        <button type="button" role="tab" aria-selected={view === "recorded"} className={view === "recorded" ? "is-on" : ""} onClick={() => setKind("recorded")}>
          Recorded playtests
        </button>
        {hasDemo && (
          <button type="button" role="tab" aria-selected={view === "demo"} className={view === "demo" ? "is-on" : ""} onClick={() => setKind("demo")}>
            Demo playtest data
          </button>
        )}
      </div>
      <span className={`eco-pt-badge${view === "demo" ? " eco-pt-badge--demo" : ""}`}>
        {view === "demo" ? "DEMO PLAYTEST DATA · not real, never copied" : "RECORDED PLAYTEST"}
      </span>

      {sum.sessions === 0 ? (
        <p className="eco-pt-empty">
          {NO_PLAYTEST_DATA}
          {sum.notCompleted > 0 && ` (${sum.notCompleted} started but not completed.)`}
        </p>
      ) : (
        <SummaryBody sum={sum} />
      )}

      {view === "recorded" && (
        <div className="eco-row eco-row--between eco-pt-actions">
          {confirmClear ? (
            <span className="eco-pt-confirm">
              Delete all playtest records? Game progress stays.
              <button type="button" className="eco-btn eco-btn--danger" onClick={() => { store.actions.clearPlaytests(); setConfirmClear(false); }}>
                Delete
              </button>
              <button type="button" className="eco-btn" onClick={() => setConfirmClear(false)}>
                Cancel
              </button>
            </span>
          ) : (
            <button type="button" className="eco-btn eco-btn--danger-outline" disabled={data.sessions.length === 0} onClick={() => setConfirmClear(true)}>
              Clear playtest data…
            </button>
          )}
          <button type="button" className="eco-btn eco-btn--primary" onClick={copy}>
            {copied === "ok" ? "Copied" : "Copy Playtest Summary"}
          </button>
        </div>
      )}
      {copied === "manual" && (
        <textarea className="eco-pt-copybox" readOnly rows={8} value={text} aria-label="Playtest summary text" onFocus={(e) => e.currentTarget.select()} autoFocus />
      )}
      {debug && (
        <div className="eco-row eco-pt-dev">
          <span className="eco-muted eco-small">Developer:</span>
          <button type="button" className="eco-link" onClick={store.actions.addDemoPlaytests}>
            Add demo playtest data
          </button>
          {hasDemo && (
            <button type="button" className="eco-link" onClick={store.actions.clearDemoPlaytests}>
              Remove demo data
            </button>
          )}
        </div>
      )}
    </Dialog>
  );
}

function SummaryBody({ sum }: { sum: PlaytestSummary }) {
  const n = sum.sessions;
  const stats: [string, string][] = [
    ["Completed sessions", String(n)],
    ["Average first round", sum.avgFirstRoundMs === null ? "—" : formatDuration(sum.avgFirstRoundMs)],
    ["Average clarity", sum.avgClarity === null ? "—" : `${sum.avgClarity.toFixed(1)}/5`],
    ["Planning Hub built", `${sum.hubBuilt}/${n}`],
    ["Opened the real-world mission", `${sum.missionOpened}/${n}`],
    ["Retried a lunch", `${sum.retried}/${n}`],
  ];
  const answeredAgain = sum.playAgain.yes + sum.playAgain.maybe + sum.playAgain.no;
  return (
    <>
      <dl className="eco-pt-stats">
        {stats.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <p className="eco-small">
        <strong>First-lunch Student Voice:</strong> RSVP {sum.voiceFirstRound.rsvp}/{n} · Small, please {sum.voiceFirstRound.smallPlease}/{n} ·
        Feedback {sum.voiceFirstRound.feedback}/{n}
        {answeredAgain > 0 && (
          <>
            <br />
            <strong>Would play again:</strong> Yes {sum.playAgain.yes} · Maybe {sum.playAgain.maybe} · No {sum.playAgain.no}
          </>
        )}
        {sum.notCompleted > 0 && (
          <>
            <br />
            <span className="eco-muted">{sum.notCompleted} started but not completed (not counted).</span>
          </>
        )}
      </p>
      <h3>Responses</h3>
      <ol className="eco-pt-responses">
        {sum.responses.map((r) => (
          <li key={r.id}>
            <span className="eco-pt-responses__meta">
              #{r.id} · Clarity {r.clarity}/5{r.playAgain ? ` · Play again: ${r.playAgain}` : ""}
            </span>
            <span>
              <b>Goal:</b> {r.goal || <i className="eco-muted">no answer</i>}
            </span>
            <span>
              <b>Change:</b> {r.change || <i className="eco-muted">no answer</i>}
            </span>
          </li>
        ))}
      </ol>
    </>
  );
}

/** Clean filming state, keeping settings and playtest records. */
export function DemoResetDialog() {
  const { store, bus } = useEcoEnv();
  return (
    <Dialog title="Reset demo?" onClose={() => store.actions.openOverlay("settings")} width={440}>
      <p>Back to a clean Monday for filming or the next player:</p>
      <ul className="eco-list">
        <li>Initial Eco Credits, no Planning Hub</li>
        <li>Waste Audit at 0/5, no school measurements or demo data</li>
        <li>Intro shown again</li>
      </ul>
      <p className="eco-muted eco-small">Settings and playtest records are kept. A running playtest is ended without saving.</p>
      <div className="eco-row eco-row--end">
        <button type="button" className="eco-btn" onClick={() => store.actions.openOverlay("settings")}>
          Cancel
        </button>
        <button
          type="button"
          className="eco-btn eco-btn--primary"
          data-autofocus
          onClick={() => {
            store.actions.resetDemo();
            bus.emit("recenter", undefined);
          }}
        >
          Reset demo
        </button>
      </div>
    </Dialog>
  );
}
