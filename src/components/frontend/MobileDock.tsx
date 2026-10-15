"use client";

import Link from "next/link";
import { Home, Search, Menu, Phone, Mail, User, Heart, ShoppingCart } from "lucide-react";

export interface DockItem {
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
 * The mobile dock — a fixed bottom navigation bar for small screens.
 *
 * Opt-in via the Customizer (Footer → Mobile dock). Only renders below 768px;
 * CSS hides it on larger screens. The page gets bottom padding so the dock
 * never covers content.
 */
export default function MobileDock({ items }: { items: DockItem[] }) {
  if (items.length === 0) return null;
  return (
    <nav
      aria-label="Mobile navigation"
      className="mobile-dock fixed bottom-0 left-0 right-0 z-50 md:hidden"
      style={{
        backgroundColor: "var(--footer-bg, #fff)",
        color: "var(--footer-text, inherit)",
        borderTop: "1px solid rgba(100,116,139,.25)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <div className="flex">
        {items.map((item, i) => {
          const Icon = ICONS[item.icon] ?? Home;
          return (
            <Link
              key={i}
              href={item.href || "/"}
              className="flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-medium opacity-80 hover:opacity-100"
            >
              <Icon size={20} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function parseDockItems(raw: string): DockItem[] {
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
