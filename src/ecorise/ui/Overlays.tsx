"use client";

import { motion } from "framer-motion";
import { useEffect } from "react";
import { BALANCE, REWARDS, SERVING_UNITS, UNITS_PER_PORTION } from "../model/config";
import { prefersReducedMotion } from "../state/store";
import { Dialog } from "./Dialog";
import { useEco, useEcoEnv } from "./context";
import { FeedbackIcon, KitchenIcon, LogoMark, PlotIcon, UsersIcon } from "./icons";

export function IntroOverlay() {
  const { store } = useEcoEnv();
  return (
    <motion.div
      className="eco-intro"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
    >
      <motion.section
        className="eco-intro__card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="eco-intro-title"
        initial={{ y: 16, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 10, opacity: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
      >
        <div className="eco-intro__brand">
          <LogoMark size={44} />
          <div>
            <h1 id="eco-intro-title">EcoRise</h1>
            <p className="eco-intro__tag">Run the Lunch Council</p>
          </div>
        </div>
        <p className="eco-intro__lead">
          Grow a thriving town by planning school lunches that feed everyone and waste less food. Students and the
          kitchen each hold part of the answer.
        </p>
        <ol className="eco-intro__steps">
          <li>
            <span className="eco-step-icon eco-step-icon--voice">
              <UsersIcon />
            </span>
            <div>
              <strong>Students speak up</strong>
              <span>Spend two Student Voice tokens on RSVPs, &ldquo;Small, please&rdquo; reminders or a Feedback Box.</span>
            </div>
          </li>
          <li>
            <span className="eco-step-icon eco-step-icon--kitchen">
              <KitchenIcon />
            </span>
            <div>
              <strong>The kitchen plans</strong>
              <span>Decide how much to cook and whether to offer small servings.</span>
            </div>
          </li>
          <li>
            <span className="eco-step-icon eco-step-icon--grow">
              <PlotIcon />
            </span>
            <div>
              <strong>The town grows</strong>
              <span>Good lunches earn credits to build on the East Meadow.</span>
            </div>
          </li>
        </ol>
        <button type="button" className="eco-btn eco-btn--primary eco-btn--lg" onClick={store.actions.enterCity} autoFocus>
          Enter the city
        </button>
        <p className="eco-intro__note">
          Prototype build: plan Monday&rsquo;s lunch in the Community Kitchen. Running the lunch service and building
          arrive in the next build. All scenarios are fictional.
        </p>
      </motion.section>
    </motion.div>
  );
}

export function Toast() {
  const { store } = useEcoEnv();
  const notice = useEco((s) => s.notice);
  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => store.actions.dismissNotice(), 4200);
    return () => window.clearTimeout(t);
  }, [notice, store]);
  return (
    <div className="eco-toast-region" role="status" aria-live="polite">
      {notice && (
        <motion.div
          key={notice.id}
          className="eco-toast"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18 }}
        >
          {notice.text}
        </motion.div>
      )}
    </div>
  );
}

const pct = (n: number) => `${Math.round(n * 100)}%`;
const perMinute = (tenths: number) => (tenths / 10).toFixed(1);

export function AboutDialog() {
  const { store } = useEcoEnv();
  const small = SERVING_UNITS.small / UNITS_PER_PORTION;
  return (
    <Dialog title="About the simulation" onClose={store.actions.closeOverlay} width={640}>
      <p className="eco-callout">
        EcoRise is a hackathon prototype. Its numbers are simplified <strong>game assumptions</strong> chosen so the
        trade-offs are visible and fair. They are not research findings or predictions about any real school.
      </p>
      <h3>How a lunch works in the model</h3>
      <ul className="eco-list">
        <li>Each day has a fixed, seeded set of diners: how many come, who has a smaller appetite and the queue order.</li>
        <li>
          Student Voice changes what the kitchen <em>knows</em> (RSVP, Feedback Box) or how students <em>communicate</em>{" "}
          (&ldquo;Small, please&rdquo;). It never changes who comes to lunch.
        </li>
        <li>
          A diner gets a small serving ({small} of a portion) only if the kitchen offers small servings, the diner
          prefers less and they ask. Everyone else gets a regular portion.
        </li>
        <li>Diners eat up to their appetite. Whatever is left on the plate counts as plate waste.</li>
        <li>
          No partial servings and no seconds. If the food left is less than a diner asks for, that diner misses the
          hot meal.
        </li>
        <li>The counter can only serve so many diners before the lunch window closes. Anyone still queuing then misses the hot meal.</li>
        <li>Preparation scraps, spoilage and reuse of leftovers are outside this model.</li>
      </ul>
      <h3>Food accounting</h3>
      <p>Food is counted in portions, and every portion is accounted for exactly once:</p>
      <ul className="eco-list eco-list--formula">
        <li>Cooked = served + never served</li>
        <li>Served = eaten + left on plates</li>
      </ul>
      <p>Diners are counted separately: everyone who comes either gets a hot meal or misses it, for one recorded reason.</p>
      <h3>Fairness simplification</h3>
      <p>
        The attendance range shown to the player always contains the true number, and better information only narrows
        it. Real forecasts carry no such guarantee.
      </p>
      <h3>Provisional balancing values</h3>
      <table className="eco-table">
        <tbody>
          <tr>
            <th scope="row">Lunch window</th>
            <td>{BALANCE.lunchWindowMinutes} minutes</td>
          </tr>
          <tr>
            <th scope="row">Counter speed</th>
            <td>
              {perMinute(BALANCE.servingRateTenthsPerMinute.standard)} diners/min, or{" "}
              {perMinute(BALANCE.servingRateTenthsPerMinute.withSmallOption)} when small servings are offered
            </td>
          </tr>
          <tr>
            <th scope="row">Diners who prefer less and ask</th>
            <td>
              {pct(BALANCE.askRate.baseline)}, or {pct(BALANCE.askRate.withSmallPleaseReminder)} with a &ldquo;Small,
              please&rdquo; reminder
            </td>
          </tr>
          <tr>
            <th scope="row">Forecast range</th>
            <td>
              ±{BALANCE.forecastHalfWidth.base} students, or ±{BALANCE.forecastHalfWidth.withRsvp} with RSVP replies
            </td>
          </tr>
          <tr>
            <th scope="row">Successful service</th>
            <td>
              At least {pct(REWARDS.successHotMealShare)} of diners get a hot meal. This is a game rule, not a measure
              of whether anyone&rsquo;s nutritional needs were met.
            </td>
          </tr>
        </tbody>
      </table>
      <h3>Game indicators and real measurements</h3>
      <p>
        Credits, hot meals served and food use are game indicators. Any real school measurement will appear separately,
        with its source and date, and will never be mixed into game numbers.
      </p>
      <p className="eco-muted">
        <FeedbackIcon size={16} /> Scenario text such as Feedback Box results is fictional.
      </p>
    </Dialog>
  );
}

export function SettingsDialog() {
  const { store } = useEcoEnv();
  const settings = useEco((s) => s.save.settings);
  const systemReduced = useEco((s) => s.systemReducedMotion);
  const storage = useEco((s) => s.storage);
  const reduced = useEco(prefersReducedMotion);
  return (
    <Dialog title="Settings" onClose={store.actions.closeOverlay} width={480}>
      <fieldset className="eco-fieldset">
        <legend>Motion</legend>
        {(
          [
            ["system", `Match my device (currently ${systemReduced ? "reduced" : "full"})`],
            ["reduce", "Reduce motion"],
            ["full", "Full motion"],
          ] as const
        ).map(([value, label]) => (
          <label key={value} className="eco-radio">
            <input
              type="radio"
              name="eco-motion"
              value={value}
              checked={settings.motion === value}
              onChange={() => store.actions.setMotion(value)}
            />
            <span>{label}</span>
          </label>
        ))}
        <p className="eco-muted eco-small">
          Reduced motion removes camera sweeps, swaying, bouncing and drifting effects. Everything stays playable.
          {reduced ? " Reduced motion is on." : ""}
        </p>
      </fieldset>
      <fieldset className="eco-fieldset">
        <legend>Graphics</legend>
        {(
          [
            ["sharp", "Sharp (recommended)"],
            ["performance", "Performance: lower resolution, fewer townsfolk and effects"],
          ] as const
        ).map(([value, label]) => (
          <label key={value} className="eco-radio">
            <input
              type="radio"
              name="eco-quality"
              value={value}
              checked={settings.quality === value}
              onChange={() => store.actions.setQuality(value)}
            />
            <span>{label}</span>
          </label>
        ))}
      </fieldset>
      <fieldset className="eco-fieldset">
        <legend>Saved data</legend>
        <p className="eco-small">
          {!storage.available
            ? "This browser is blocking local storage, so progress lasts only until you close the tab."
            : storage.lastWriteFailed
              ? "The last save failed (storage may be full). The game keeps working, but recent changes may not be kept."
              : "Progress and settings are saved in this browser only."}
        </p>
        <button type="button" className="eco-btn eco-btn--danger-outline" onClick={() => store.actions.openOverlay("reset-confirm")}>
          Reset EcoRise…
        </button>
      </fieldset>
    </Dialog>
  );
}

export function ResetConfirmDialog() {
  const { store, bus } = useEcoEnv();
  return (
    <Dialog title="Reset EcoRise?" onClose={() => store.actions.openOverlay("settings")} width={440} tone="danger">
      <p>
        This clears your EcoRise progress, plans and settings in this browser and shows the introduction again. Data
        from other sites and apps is not touched. This can&rsquo;t be undone.
      </p>
      <div className="eco-row eco-row--end">
        <button type="button" className="eco-btn" onClick={() => store.actions.openOverlay("settings")} data-autofocus>
          Cancel
        </button>
        <button
          type="button"
          className="eco-btn eco-btn--danger"
          onClick={() => {
            store.actions.resetAll();
            bus.emit("recenter", undefined);
          }}
        >
          Reset everything
        </button>
      </div>
    </Dialog>
  );
}
