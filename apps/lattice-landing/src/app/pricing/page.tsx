import Link from "next/link";
import { ArrowRight, Check, Sparkles } from "lucide-react";
import { Footer } from "@/components/Footer";
import { SiteNav } from "@/components/SiteNav";
import { links } from "@/lib/links";

type Tier = {
  name: string;
  tagline: string;
  price: string;
  priceSuffix?: string;
  cta: { label: string; href: string };
  featured?: boolean;
  features: string[];
};

const tiers: Tier[] = [
  {
    name: "Pilot",
    tagline: "For evaluations, hackathons, and single-cycle proofs of value.",
    price: "Free",
    cta: { label: "Get a sandbox key", href: "/get-started" },
    features: [
      "1 pay-cycle batch",
      "Up to 500 workers",
      "Liveness, BVN, document & anomaly checks",
      "Signed VIQ output",
      "Sandbox API key",
      "Community support",
    ],
  },
  {
    name: "Institution",
    tagline: "For ministries, agencies, and tertiary institutions running real payroll cycles.",
    price: "Talk to us",
    priceSuffix: "tailored to staff count",
    featured: true,
    cta: { label: "Request a pilot", href: links.github },
    features: [
      "Unlimited pay cycles",
      "Up to 25,000 workers per cycle",
      "Squad payment bridge — transfers & virtual accounts",
      "Audit-grade signed VIQs + webhook trail",
      "Dedicated onboarding & integration help",
      "Priority email support",
    ],
  },
  {
    name: "Enterprise",
    tagline: "For multi-institution programs, federal scale, and regulated deployments.",
    price: "Custom",
    cta: { label: "Contact sales", href: links.github },
    features: [
      "Volume across all institutions",
      "Multi-tenant data isolation",
      "On-prem or VPC deployment",
      "Custom SLA + 24/7 support",
      "Bias-audit reports & compliance pack",
      "Named integration engineer",
    ],
  },
];

const faqs = [
  {
    q: "Do I need to pay before testing Lattice?",
    a: "No. The Pilot tier gives you a sandbox API key, a synthetic pay cycle, and access to every verification endpoint at no cost. Most evaluators ship their first signed VIQ within an afternoon.",
  },
  {
    q: "How is the Institution tier priced?",
    a: "It scales with the number of workers you verify per pay cycle and which Squad-powered payment rails you turn on. We share an exact figure after a 20-minute scoping call.",
  },
  {
    q: "Are payment fees included?",
    a: "Squad transfer fees are billed directly by Squad to the institution's payment account. Lattice never marks up payment movement; you only pay Lattice for verification.",
  },
  {
    q: "Can we deploy Lattice inside our own VPC or on-prem?",
    a: "Yes — that lives in the Enterprise tier. We ship the same FastAPI service plus a hardened container image and configure ingestion against your existing HR or payroll system of record.",
  },
];

export default function PricingPage() {
  return (
    <main className="page">
      <SiteNav />

      <section className="doc-hero">
        <span>Pricing</span>
        <h1>Start free. Scale when your payroll cycle is ready.</h1>
        <p>
          Lattice is free to evaluate. When you&rsquo;re ready to gate real disbursements, pick a
          tier that matches your staff count and deployment posture &mdash; no surprise per-call
          fees.
        </p>
      </section>

      <section className="section white-section">
        <div className="pricing-grid">
          {tiers.map((tier) => (
            <article
              className={tier.featured ? "pricing-card featured" : "pricing-card"}
              key={tier.name}
            >
              {tier.featured ? (
                <span className="pricing-badge">
                  <Sparkles size={12} strokeWidth={2.2} aria-hidden="true" />
                  Most popular
                </span>
              ) : null}
              <header>
                <h3>{tier.name}</h3>
                <p>{tier.tagline}</p>
              </header>
              <div className="pricing-price">
                <strong>{tier.price}</strong>
                {tier.priceSuffix ? <span>{tier.priceSuffix}</span> : null}
              </div>
              <ul className="pricing-features">
                {tier.features.map((feature) => (
                  <li key={feature}>
                    <Check size={16} strokeWidth={2.2} aria-hidden="true" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              <Link
                className={tier.featured ? "pricing-cta featured" : "pricing-cta"}
                href={tier.cta.href}
                target={tier.cta.href.startsWith("http") ? "_blank" : undefined}
              >
                {tier.cta.label}
                <ArrowRight size={16} strokeWidth={1.9} aria-hidden="true" />
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className="section pricing-faq" id="faq">
        <div className="section-intro">
          <span>FAQ</span>
          <h2>Answers before you hit &ldquo;Request a pilot.&rdquo;</h2>
        </div>
        <div className="faq-grid">
          {faqs.map((item) => (
            <article className="faq-card" key={item.q}>
              <h3>{item.q}</h3>
              <p>{item.a}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="demo-band">
        <div>
          <span>Ready to gate payroll</span>
          <h2>Mint a sandbox API key and run a verification on synthetic data today.</h2>
        </div>
        <div className="demo-actions">
          <Link href="/get-started">
            Get Started <ArrowRight size={17} strokeWidth={1.8} aria-hidden="true" />
          </Link>
          <Link href={links.github} target="_blank">
            Talk to us <ArrowRight size={17} strokeWidth={1.8} aria-hidden="true" />
          </Link>
        </div>
      </section>

      <Footer />
    </main>
  );
}
