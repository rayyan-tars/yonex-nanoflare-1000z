"use client";

import { BUILDING_COSTS } from "../model/config";
import { useEco, useEcoEnv } from "./context";
import { CoinIcon, CounterIcon, LockIcon, OfficeIcon } from "./icons";
import { SidePanel } from "./SidePanel";

const OPTIONS = [
  {
    id: "planningOffice" as const,
    name: "Planning Office",
    Icon: OfficeIcon,
    effect: "Narrower attendance forecasts every day, so the kitchen can cook closer to what's needed.",
  },
  {
    id: "secondCounter" as const,
    name: "Second Counter",
    Icon: CounterIcon,
    effect: "Serves diners faster, so offering small servings no longer risks a long queue.",
  },
];

export function MeadowPanel() {
  const { store } = useEcoEnv();
  const credits = useEco((s) => s.save.progress.credits);
  return (
    <SidePanel eyebrow="Expansion plot" title="East Meadow" onClose={store.actions.clearSelection} compact>
      <p className="eco-brief">
        Open land at the edge of town. Each building here changes how lunches can be planned, so choose the one that
        fits your strategy.
      </p>
      <p className="eco-credit-line">
        <CoinIcon size={18} /> You have <strong>{credits}</strong> credits.
      </p>
      <ul className="eco-build-list">
        {OPTIONS.map(({ id, name, Icon, effect }) => (
          <li key={id} className="eco-build">
            <span className="eco-build__icon">
              <Icon size={22} />
            </span>
            <div className="eco-build__text">
              <strong>{name}</strong>
              <span>{effect}</span>
            </div>
            <span className="eco-build__cost">
              <CoinIcon size={15} /> {BUILDING_COSTS[id]}
            </span>
          </li>
        ))}
      </ul>
      <div className="eco-pending" role="note">
        <LockIcon size={18} />
        <div>
          <strong>Building opens after a successful lunch service.</strong>
          <span>Lunch service and construction arrive in the next build.</span>
        </div>
      </div>
    </SidePanel>
  );
}
