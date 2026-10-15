"use client";

import Link from "next/link";
import { Home, Search, Menu, Phone, Mail, User, Heart, ShoppingCart } from "lucide-react";

export interface HeaderDockItem {
  icon: string;
  label: string;
  href: string;
}

const ICONS: Record<string, React.ComponentType<{ size?: number | string; className?: string }>> = {
  home: Home,
  search: Search,
  menu: Menu,
  phone: Phone,
  mail: Mail,
  user: User,
  heart: Heart,
  cart: ShoppingCart,
};

/**
 * The mobile header dock — a compact fixed top bar for small screens.
 *
 * Opt-in via the Customizer (Header → Mobile dock). When enabled it replaces
 * the normal header below 768px; CSS hides the regular header there and adds
 * top padding so the dock never covers content.
 */
export default function MobileHeaderDock({ items }: { items: HeaderDockItem[] }) {
  if (items.length === 0) return null;
  return (
    <div
      className="mobile-header-dock fixed top-0 left-0 right-0 z-50 md:hidden"
      style={{
        backgroundColor: "var(--header-bg, #fff)",
        color: "var(--header-text, inherit)",
        borderBottom: "1px solid rgba(100,116,139,.25)",
        paddingTop: "env(safe-area-inset-top)",
      }}
    >
      <div className="flex items-center justify-around">
        {items.map((item, i) => {
          const Icon = ICONS[item.icon] ?? Home;
          return (
            <Link
              key={i}
              href={item.href || "/"}
              className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium opacity-80 hover:opacity-100"
            >
              <Icon size={20} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function parseHeaderDockItems(raw: string): HeaderDockItem[] {
  try {
    const v = JSON.parse(raw || "null");
    if (!Array.isArray(v)) return [];
    return v
      .filter((x) => x && typeof x === "object")
      .map((x) => ({
        icon: String(x.icon || "home"),
        label: String(x.label || ""),
        href: String(x.href || "/"),
      }))
      .filter((x) => x.label);
  } catch {
    return [];
  }
}
