"use client";

import { getScenario } from "../model/scenarios";
import { useEco, useEcoEnv } from "./context";
import { CoinIcon, GearIcon, HelpIcon, InfoIcon, KitchenIcon, LeafIcon, LogoMark, MealIcon, PlotIcon, TargetIcon } from "./icons";

export function TopBar() {
  const { store } = useEcoEnv();
  const credits = useEco((s) => s.save.progress.credits);
  const scenarioId = useEco((s) => s.save.scenarioId);
  const def = getScenario(scenarioId).definition;
  return (
    <header className="eco-topbar">
      <div className="eco-brand">
        <LogoMark size={34} />
        <div>
          <p className="eco-brand__name">EcoRise</p>
          <p className="eco-brand__day">
            Day 1 · {def.dayLabel} · {def.dish}
          </p>
        </div>
      </div>
      <ul className="eco-stats" aria-label="Game indicators">
        <li className="eco-stat" title="Construction credits">
          <CoinIcon size={20} />
          <span className="eco-stat__label">Credits</span>
          <span className="eco-stat__value">{credits}</span>
        </li>
        <li className="eco-stat" title="Game indicator. Appears after your first lunch service.">
          <MealIcon size={20} />
          <span className="eco-stat__label">Hot meals served</span>
          <span className="eco-stat__value eco-stat__value--empty" aria-label="not yet measured">
            —
          </span>
        </li>
        <li className="eco-stat" title="Game indicator: share of cooked food that was eaten. Appears after your first lunch service.">
          <LeafIcon size={20} />
          <span className="eco-stat__label">Food use</span>
          <span className="eco-stat__value eco-stat__value--empty" aria-label="not yet measured">
            —
          </span>
        </li>
      </ul>
      <nav className="eco-tools" aria-label="Game menu">
        <button type="button" className="eco-icon-btn eco-icon-btn--bar" onClick={store.actions.showIntro} aria-label="How to play" title="How to play">
          <HelpIcon />
        </button>
        <button
          type="button"
          className="eco-icon-btn eco-icon-btn--bar"
          onClick={() => store.actions.openOverlay("about")}
          aria-label="About the simulation"
          title="About the simulation"
        >
          <InfoIcon />
        </button>
        <button
          type="button"
          className="eco-icon-btn eco-icon-btn--bar"
          onClick={() => store.actions.openOverlay("settings")}
          aria-label="Settings"
          title="Settings"
        >
          <GearIcon />
        </button>
      </nav>
    </header>
  );
}

export function PlacesNav() {
  const { store, bus } = useEcoEnv();
  const selection = useEco((s) => s.selection);
  return (
    <nav className="eco-places" aria-label="Places in town">
      <button
        type="button"
        className="eco-place"
        data-place="kitchen"
        aria-pressed={selection === "kitchen"}
        onClick={() => store.actions.select(selection === "kitchen" ? null : "kitchen")}
      >
        <KitchenIcon size={18} /> Lunch Council
      </button>
      <button
        type="button"
        className="eco-place"
        data-place="meadow"
        aria-pressed={selection === "meadow"}
        onClick={() => store.actions.select(selection === "meadow" ? null : "meadow")}
      >
        <PlotIcon size={18} /> East Meadow
      </button>
      <button type="button" className="eco-place eco-place--icon" onClick={() => bus.emit("recenter", undefined)} aria-label="Recenter the view" title="Recenter the view">
        <TargetIcon size={18} />
      </button>
      <span className="eco-places__hint">Drag to look around · scroll to zoom</span>
    </nav>
  );
}
