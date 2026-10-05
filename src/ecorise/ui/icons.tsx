import type { SVGProps } from "react";

/**
 * One small custom icon set: 24px grid, 2px rounded strokes, currentColor.
 * Decorative by default; give the surrounding control a text label.
 */
type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 20, children, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const LogoMark = (p: IconProps) => (
  <Icon {...p} viewBox="0 0 32 32" strokeWidth={2.2}>
    <ellipse cx="16" cy="21" rx="12" ry="5.5" fill="#fff3dc" />
    <ellipse cx="16" cy="20.2" rx="7" ry="2.8" />
    <path d="M16 18.5c-.4-5.5 2.4-10 8.5-12-.3 6.4-3.4 10.4-8.5 12Z" fill="#7cc35a" />
    <path d="M16 18.5c1.6-3 3.4-5.2 6-7" />
  </Icon>
);

export const CoinIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.5" fill="#f5bf42" />
    <path d="M12 7.5v9M9.5 9.5h3.8a1.7 1.7 0 0 1 0 3.4h-2.6a1.7 1.7 0 0 0 0 3.4H14.5" />
  </Icon>
);
export const MealIcon = (p: IconProps) => (
  <Icon {...p}>
    <ellipse cx="12" cy="14" rx="8.5" ry="4.5" />
    <path d="M3.5 14c0 3 3.8 5.5 8.5 5.5s8.5-2.5 8.5-5.5" />
    <path d="M9 9.5c0-1.5 1-2 1-3.5M13 9.5c0-1.5 1-2 1-3.5" />
  </Icon>
);
export const LeafIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 19c0-8 5-13.5 14-14-0.3 9-5.8 14-14 14Z" />
    <path d="M5 19c3-4 6-6.5 9.5-8.5" />
  </Icon>
);
export const ClipboardIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="5" y="4.5" width="14" height="16.5" rx="2.5" />
    <path d="M9 4.5h6v2.5H9z" />
    <path d="m8.5 12 1.5 1.5 2.8-3M14.5 12.5h1.5M8.5 17h7.5" />
  </Icon>
);
export const SmallBowlIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2.5 13h8a4 4 0 0 1-8 0Z" />
    <path d="M12 11.5h9.5a4.75 4.75 0 0 1-9.5 0Z" />
    <path d="M6.5 9.5V8M16.75 8V6" />
  </Icon>
);
export const FeedbackIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4.5 5.5h15a1.5 1.5 0 0 1 1.5 1.5v8.5a1.5 1.5 0 0 1-1.5 1.5H11l-4.5 3.5V17h-2A1.5 1.5 0 0 1 3 15.5V7a1.5 1.5 0 0 1 1.5-1.5Z" />
    <path d="M8 10h8M8 13h5" />
  </Icon>
);
export const UsersIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="9" cy="8.5" r="3.2" />
    <path d="M3.5 19.5c.4-3.3 2.6-5.3 5.5-5.3s5.1 2 5.5 5.3" />
    <circle cx="16.8" cy="9.5" r="2.6" />
    <path d="M16 14.4c2.6-.2 4.3 1.6 4.6 4.6" />
  </Icon>
);
export const ClockIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Icon>
);
export const PotIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4.5 10h15v5.5a4 4 0 0 1-4 4h-7a4 4 0 0 1-4-4Z" />
    <path d="M2.5 11h2M19.5 11h2M8 7.5c0-1.2 1-1.5 1-2.7M12 7.5c0-1.2 1-1.5 1-2.7M16 7.5c0-1.2 1-1.5 1-2.7" />
  </Icon>
);
export const CheckIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Icon>
);
export const AlertIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 4 2.8 19.5h18.4Z" />
    <path d="M12 10v4.2M12 17h.01" />
  </Icon>
);
export const CrossCircleIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="m9 9 6 6M15 9l-6 6" />
  </Icon>
);
export const InfoIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 11v5M12 8h.01" />
  </Icon>
);
export const GearIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7" />
  </Icon>
);
export const HelpIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M9.6 9.5a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.4M12 16.8h.01" />
  </Icon>
);
export const CloseIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m6 6 12 12M18 6 6 18" />
  </Icon>
);
export const TargetIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="7.5" />
    <circle cx="12" cy="12" r="2.5" />
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
  </Icon>
);
export const KitchenIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.5 11 12 4.5l8.5 6.5" />
    <path d="M5.5 9.5v10h13v-10" />
    <path d="M9 19.5v-5h6v5" />
  </Icon>
);
export const PlotIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m12 4 8.5 5L12 14 3.5 9Z" strokeDasharray="2.6 2.2" />
    <path d="M12 16.5v4M10 18.5h4" />
  </Icon>
);
export const MinusIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 12h12" />
  </Icon>
);
export const PlusIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 6v12M6 12h12" />
  </Icon>
);
export const LockIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="5.5" y="10.5" width="13" height="9.5" rx="2" />
    <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
  </Icon>
);
export const OfficeIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="5" y="6" width="14" height="14" rx="1.5" />
    <path d="M9 10h1.5M13.5 10H15M9 14h1.5M13.5 14H15M10.5 20v-3h3v3M8 6V3.5h8V6" />
  </Icon>
);
export const CounterIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 11.5h18v3H3zM5 14.5V20M19 14.5V20" />
    <path d="M7 11.5c0-2.2 1.8-4 4-4h2c2.2 0 4 1.8 4 4" />
  </Icon>
);
export const StarIcon = (p: IconProps) => (
  <Icon {...p} strokeWidth={1.6}>
    <path d="m12 3.6 2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.2-4.1 5.8-.8Z" fill="currentColor" />
  </Icon>
);
export const BulbIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9 17.5h6M10 20.5h4M12 3.5a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.4 1.1 2.2v1h5v-1c0-.8.4-1.6 1.1-2.2A6 6 0 0 0 12 3.5Z" />
  </Icon>
);
export const PlayIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 5.5v13l10.5-6.5Z" fill="currentColor" />
  </Icon>
);
export const ForkIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M7 3.5v17M5 3.5v5a2 2 0 0 0 4 0v-5M16.5 20.5V3.5c-2 1-3 3.5-3 7 0 1.6 1.3 2.5 3 2.5" />
  </Icon>
);
export const ScaleIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 9.5h14l-1.2 9a1.5 1.5 0 0 1-1.5 1.3H7.7a1.5 1.5 0 0 1-1.5-1.3Z" />
    <path d="M8 9.5a4 4 0 0 1 8 0M12 9.5l1.8-2.4" />
  </Icon>
);
export const SearchIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="10.5" cy="10.5" r="6" />
    <path d="m15 15 5 5" />
  </Icon>
);
export const FlaskIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9.5 3.5h5M10.5 3.5v5.2L5 18.2A1.5 1.5 0 0 0 6.3 20.5h11.4a1.5 1.5 0 0 0 1.3-2.3l-5.5-9.5V3.5" />
    <path d="M7.5 14.5h9" />
  </Icon>
);
export const RepeatIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4.5 11.5a7 7 0 0 1 12.3-4.6L19 9.5M19 4.5v5h-5" />
    <path d="M19.5 12.5a7 7 0 0 1-12.3 4.6L5 14.5M5 19.5v-5h5" />
  </Icon>
);
export const FlagIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5.5 21V3.5" />
    <path d="M5.5 4.5h11.5l-2.5 4 2.5 4H5.5" />
  </Icon>
);
export const ShieldIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3.5 5 6v5.5c0 4.3 3 7.6 7 9 4-1.4 7-4.7 7-9V6Z" />
    <path d="m9 12 2.2 2.2L15.5 10" />
  </Icon>
);
