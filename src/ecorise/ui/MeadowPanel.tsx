"use client";

import { BUILDING_COSTS } from "../model/config";
import { useEco, useEcoEnv } from "./context";
import { CoinIcon, CounterIcon, LockIcon, OfficeIcon } from "./icons";
import { SidePanel } from "./SidePanel";

const OPTIONS = [
  { id: "planningOffice" as const, name: "Planning Office", effect: "Sharper forecasts", Icon: OfficeIcon },
  { id: "secondCounter" as const, name: "Second Counter", effect: "Faster service", Icon: CounterIcon },
];

export function MeadowPanel() {
  const { store } = useEcoEnv();
  const credits = useEco((s) => s.save.progress.credits);
  return (
    <SidePanel eyebrow="Future building" title="East plot" onClose={store.actions.clearSelection} compact>
      <ul className="eco-build-list">
        {OPTIONS.map(({ id, name, effect, Icon }) => (
          <li key={id} className="eco-build">
            <Icon size={20} />
            <span className="eco-build__text">
              <strong>{name}</strong>
              <span>{effect}</span>
            </span>
            <span className="eco-build__cost">
              <CoinIcon size={15} /> {BUILDING_COSTS[id]}
            </span>
          </li>
        ))}
      </ul>
      <p className="eco-build-lock">
        <LockIcon size={15} /> Building opens in the next update. You have {credits} Eco Credits.
      </p>
    </SidePanel>
  );
}
