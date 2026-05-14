"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, Github } from "lucide-react";
import { links } from "@/lib/links";

const navItems = [
  { href: "/get-started", label: "Get Started" },
  { href: "/api-reference", label: "API DOCS" },
  { href: "/pricing", label: "Pricing" },
];

export function SiteNav() {
  const pathname = usePathname();

  return (
    <nav className="navbar" aria-label="Lattice navigation">
      <Link className="logo" href="/" aria-label="Lattice home">
        <img src="/lattice-logo-transparent.png" alt="" width={42} height={42} />
        <span>Lattice</span>
      </Link>
      <div className="nav-links">
        {navItems.map((item) => {
          const active = pathname === item.href;
          return (
            <Link className={active ? "active" : ""} href={item.href} key={item.label}>
              {item.label}
            </Link>
          );
        })}
      </div>
      <div className="nav-actions">
        <Link href={links.github} target="_blank" aria-label="GitHub">
          <Github size={22} strokeWidth={2} />
        </Link>
        <Link className="btn-primary nav-button" href="/get-started">
          Get Started
          <ArrowRight size={16} strokeWidth={1.8} aria-hidden="true" />
        </Link>
      </div>
    </nav>
  );
}
