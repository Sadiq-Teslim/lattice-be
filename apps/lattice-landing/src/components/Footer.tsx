import Link from "next/link";
import { Github, Linkedin, Twitter } from "lucide-react";
import { links } from "@/lib/links";

export function Footer() {
  return (
    <footer className="footer">
      <div className="footer-grid">
        <div>
          <Link className="logo" href="/" aria-label="Lattice home">
            <img src="/lattice-logo-transparent.png" alt="" width={38} height={38} />
            <span>Lattice</span>
          </Link>
          <p>Verification infrastructure for government payroll release.</p>
          <div className="socials">
            <Link href={links.github} target="_blank" aria-label="GitHub">
              <Github size={20} />
            </Link>
            <Link href="https://x.com" target="_blank" aria-label="X">
              <Twitter size={20} />
            </Link>
            <Link href="https://linkedin.com" target="_blank" aria-label="LinkedIn">
              <Linkedin size={20} />
            </Link>
          </div>
        </div>
        <div>
          <h4>Product</h4>
          <Link href="/">Lattice</Link>
          <Link href="/#why">Features</Link>
          <Link href="/get-started">Get Started</Link>
        </div>
        <div>
          <h4>Resources</h4>
          <Link href="/get-started">Get Started</Link>
          <Link href="/api-reference">API DOCS</Link>
          <Link href="/pricing">Pricing</Link>
          <Link href="/sources">Sources</Link>
        </div>
        <div>
          <h4>Company</h4>
          <Link href="/sources">About Us</Link>
          <Link href={links.ogunDemo}>Demo</Link>
          <Link href={links.github} target="_blank">Contact</Link>
        </div>
        <div>
          <h4>Legal</h4>
          <Link href="/get-started">Privacy Policy</Link>
          <Link href="/get-started">Terms of Service</Link>
          <Link href="/get-started">Security</Link>
        </div>
      </div>
      <div className="footer-bottom">© 2026 Lattice. Payment infrastructure partner: Squad.</div>
    </footer>
  );
}
