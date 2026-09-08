"use client";

// §30 mobile-first: the primary nav is a fixed bottom tab bar (thumb-reach,
// always visible, no menu to open) — the default/primary design, not a
// shrunk desktop nav. At md: and up an additional left icon-rail appears
// alongside it as a progressive enhancement for larger screens; the bottom
// bar keeps working underneath so nothing is designed desktop-first and
// merely shrunk down (§30's explicit rule).
//
// Loop 50 (§30 visual layer): restyled to the MONARCH design language —
// frosted "glass chrome" (.chrome-blur, globals.css) and a glowing active
// state on both surfaces, matching the reference apps' nav treatment.
import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
  href: string;
  label: string;
  icon: (active: boolean) => React.ReactNode;
};

function Svg({ children, active }: { children: React.ReactNode; active: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className="h-5 w-5"
      stroke="currentColor"
      strokeWidth={active ? 2.1 : 1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

const NAV_ITEMS: NavItem[] = [
  {
    href: "/cases",
    label: "Cases",
    icon: (active) => (
      <Svg active={active}>
        <rect x="4" y="4" width="16" height="17" rx="2" />
        <path d="M8 9h8M8 13h8M8 17h5" />
      </Svg>
    ),
  },
  {
    href: "/dashboard",
    label: "Control",
    icon: (active) => (
      <Svg active={active}>
        <path d="M4 20V10l8-6 8 6v10" />
        <path d="M9 20v-6h6v6" />
      </Svg>
    ),
  },
  {
    href: "/pm",
    label: "PM",
    icon: (active) => (
      <Svg active={active}>
        <rect x="3.5" y="5" width="17" height="15" rx="2" />
        <path d="M3.5 9.5h17M8 3v4M16 3v4" />
      </Svg>
    ),
  },
  {
    href: "/spares",
    label: "Spares",
    icon: (active) => (
      <Svg active={active}>
        <rect x="7" y="7" width="10" height="10" rx="1.5" transform="rotate(45 12 12)" />
      </Svg>
    ),
  },
  {
    href: "/more",
    label: "More",
    icon: (active) => (
      <Svg active={active}>
        <circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none" />
        <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
        <circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none" />
      </Svg>
    ),
  },
];

function isActive(pathname: string, href: string) {
  return href === "/cases" ? pathname === "/cases" || pathname.startsWith("/cases/") : pathname.startsWith(href);
}

// Single default export rendering both surfaces — the Loop 16 boundary
// lesson is that a second (non-default) export in a "use client" file,
// called from a server component, breaks in a way tsc/lint/build cannot
// see. One default export sidesteps that entirely rather than relying on
// discipline to avoid it every time this file is touched.
export default function AppNav() {
  const pathname = usePathname();

  return (
    <>
      <nav
        className="chrome-blur fixed inset-x-0 bottom-0 z-20 flex border-t border-line md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        aria-label="Primary"
      >
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition-colors ${
                active ? "text-brand" : "text-muted"
              }`}
            >
              {item.icon(active)}
              {item.label}
            </Link>
          );
        })}
      </nav>

      <nav
        className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-56 shrink-0 flex-col gap-1 overflow-y-auto border-r border-line bg-bg1 px-3 py-4 md:flex"
        aria-label="Primary"
      >
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                active
                  ? "bg-gradient-to-br from-brand/[0.22] to-brand2/[0.14] text-fg shadow-[0_0_12px_rgba(59,130,246,0.15)] border border-brand/25"
                  : "border border-transparent text-muted hover:bg-white/[0.05] hover:text-fg"
              }`}
            >
              {item.icon(active)}
              {item.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
