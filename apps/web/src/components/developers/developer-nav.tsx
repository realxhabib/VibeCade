"use client";

import { motion } from "motion/react";
import { BookOpen, FlaskConical, LayoutDashboard, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { play } from "@/lib/sfx";
import { spring } from "@/lib/motion";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/developers", label: "Docs", icon: BookOpen },
  { href: "/developers/apps", label: "Console", icon: LayoutDashboard },
  { href: "/developers/sandbox", label: "Sandbox", icon: FlaskConical },
  { href: "/developers/new", label: "Register an app", icon: Plus },
];

/** The developer section's own tabs, above every /developers page. */
export function DeveloperNav() {
  const pathname = usePathname();
  // Docs only on /developers itself; the others own their subpaths (an app's console is "Console").
  const active = ITEMS.find((i) => i.href !== "/developers" && (pathname === i.href || pathname.startsWith(`${i.href}/`)))?.href ?? "/developers";
  return (
    <nav aria-label="Developer" className="mb-8">
      <div className="no-scrollbar inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-full glass p-1">
        {ITEMS.map((item) => {
          const on = item.href === active;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={on ? "page" : undefined}
              onClick={() => !on && play("tick")}
              className={cn(
                "relative flex h-9 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-semibold transition-colors",
                on ? "text-ink-950" : "text-ink-300 hover:text-ink-50",
              )}
            >
              {on && <motion.span layoutId="developer-nav" className="absolute inset-0 rounded-full bg-ink-50" transition={spring.layout} />}
              <span className="relative flex items-center gap-1.5">
                <Icon className="size-4" aria-hidden />
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
