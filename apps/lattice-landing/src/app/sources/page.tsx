import Link from "next/link";
import { ArrowRight, Globe2 } from "lucide-react";
import { Footer } from "@/components/Footer";
import { SiteNav } from "@/components/SiteNav";
import { sources } from "@/lib/content";

export default function SourcesPage() {
  return (
    <main className="page">
      <SiteNav />
      <section className="doc-hero">
        <span>Research-backed problem</span>
        <h1>Built around real public-sector verification workflows.</h1>
        <p>
          These cards point to public references for payroll controls, biometric verification, BVN
          salary controls, and Squad infrastructure.
        </p>
      </section>
      <section className="section white-section">
        <div className="source-grid">
          {sources.map((source) => (
            <Link className="source-card" href={source.href} key={source.title} target="_blank">
              <Globe2 size={22} strokeWidth={1.6} aria-hidden="true" />
              <h3>{source.title}</h3>
              <p>{source.detail}</p>
              <span>
                Open source <ArrowRight size={15} strokeWidth={1.8} aria-hidden="true" />
              </span>
            </Link>
          ))}
        </div>
      </section>
      <Footer />
    </main>
  );
}
