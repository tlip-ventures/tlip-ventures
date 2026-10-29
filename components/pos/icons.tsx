import type { SVGProps } from "react";

// Line icons from the Stock & POS design (design/pos/). Decorative: the
// control around them carries the label.

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ d, size = 18, strokeWidth = 1.6, ...props }: IconProps & { d: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d={d} />
    </svg>
  );
}

export const NAV_ICON_PATHS = {
  dash: "M4 13h6V4H4z M14 20h6v-9h-6z M14 4h6v4h-6z M4 20h6v-3H4z",
  pos: "M3 8h18v12H3z M7 8V4h10v4 M7 12h2 M11 12h2 M15 12h2 M7 16h10",
  sales: "M6 3h12v18l-3-2-3 2-3-2-3 2z M9 8h6 M9 12h6",
  returns: "M9 14 4 9l5-5 M4 9h11a5 5 0 0 1 0 10h-3",
  products: "M3 7l9-4 9 4v10l-9 4-9-4z M3 7l9 4 9-4 M12 11v10",
  count: "M9 3h6v3H9z M7 4.5H5V21h14V4.5h-2 M9 13l2 2 4-4",
  purchases:
    "M3 6h11v10H3z M14 10h4l3 3v3h-7 M7 19.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z M17 19.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z",
  suppliers: "M4 21V6l8-3v18 M12 9h8v12 M3 21h18 M8 9v.01 M8 13v.01 M8 17v.01 M16 13v.01 M16 17v.01",
  customers: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M3 21a6 6 0 0 1 12 0 M16 3.5a4 4 0 0 1 0 7 M21 21a6 6 0 0 0-4-5.6",
  reports: "M4 20V10 M10 20V4 M16 20v-7 M21 20H3",
  settings:
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
} as const;

export type NavIconName = keyof typeof NAV_ICON_PATHS;

export const NavIcon = ({ name, ...props }: IconProps & { name: NavIconName }) => (
  <Icon d={NAV_ICON_PATHS[name]} size={19} {...props} />
);

export const PlusIcon = (props: IconProps) => <Icon d="M12 5v14M5 12h14" strokeWidth={2} {...props} />;

export const SearchIcon = (props: IconProps) => (
  <Icon d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z M20 20l-3.5-3.5" strokeWidth={2} {...props} />
);

export const CountIcon = (props: IconProps) => <Icon d={NAV_ICON_PATHS.count} size={16} strokeWidth={1.8} {...props} />;

export const WarningIcon = (props: IconProps) => (
  <Icon d="M12 3 2 20h20z M12 10v4 M12 17v.01" size={22} strokeWidth={1.8} {...props} />
);

export const MenuIcon = (props: IconProps) => <Icon d="M4 7h16M4 12h16M4 17h16" strokeWidth={2} {...props} />;

export const CloseIcon = (props: IconProps) => <Icon d="M6 6l12 12M18 6 6 18" strokeWidth={2} {...props} />;

export const BackIcon = (props: IconProps) => <Icon d="M15 18l-6-6 6-6" strokeWidth={2} {...props} />;

export const ExternalIcon = (props: IconProps) => (
  <Icon d="M14 4h6v6 M20 4l-9 9 M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" size={16} strokeWidth={1.8} {...props} />
);

export const CheckIcon = (props: IconProps) => <Icon d="m5 12 5 5 9-10" size={26} strokeWidth={2.2} {...props} />;

export const ChatIcon = (props: IconProps) => (
  <Icon d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" strokeWidth={1.8} {...props} />
);

export const DownloadIcon = (props: IconProps) => <Icon d="M12 4v11 M7 10l5 5 5-5 M5 20h14" size={16} strokeWidth={1.8} {...props} />;

export const ReturnsIcon = (props: IconProps) => <Icon d={NAV_ICON_PATHS.returns} size={26} {...props} />;

/** The design's "More actions" dots. */
export const MoreIcon = ({ size = 18, ...props }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
    <circle cx="12" cy="5" r="1.7" />
    <circle cx="12" cy="12" r="1.7" />
    <circle cx="12" cy="19" r="1.7" />
  </svg>
);

export const BellIcon = (props: IconProps) => <Icon d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4z M10 20a2 2 0 0 0 4 0" size={20} {...props} />;
