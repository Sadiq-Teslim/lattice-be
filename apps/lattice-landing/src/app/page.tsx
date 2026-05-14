import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Database,
  FileText,
  Github,
  Landmark,
  MessageSquareText,
  Puzzle,
  Settings,
  Shield,
  TrendingUp,
  Users,
  Webhook,
  Zap,
} from "lucide-react";
import { CodeTabs } from "@/components/CodeTabs";
import { Footer } from "@/components/Footer";
import { SiteNav } from "@/components/SiteNav";
import { links } from "@/lib/links";

const whyCards = [
  {
    icon: Zap,
    title: "Easy to Integrate",
    body: "Plug Lattice into payroll in minutes and start verifying staff before release.",
  },
  {
    icon: Puzzle,
    title: "Modular & Flexible",
    body: "Use proof-of-life, document checks, anomaly scans, or the full payment gate.",
  },
  {
    icon: Shield,
    title: "Secure by Design",
    body: "Signed VIQs, audit trails, and review outcomes your institution can rely on.",
  },
  {
    icon: TrendingUp,
    title: "Built to Scale",
    body: "From a single ministry pilot to recurring verification across payroll batches.",
  },
];

const capabilityCards = [
  {
    icon: Database,
    title: "Data",
    body: "Sync worker, pay-cycle, and VIQ data across your payroll systems.",
    href: "/api-reference",
    label: "Explore Data APIs",
  },
  {
    icon: Users,
    title: "Users",
    body: "Handle staff verification sessions, evidence, profiles, and permissions.",
    href: "/api-reference",
    label: "Explore Users APIs",
  },
  {
    icon: Webhook,
    title: "Webhooks",
    body: "Track Squad payment confirmations and close the audit trail in real time.",
    href: "/api-reference",
    label: "Explore Webhook APIs",
  },
  {
    icon: Settings,
    title: "More",
    body: "Explore AI checks, anomaly detection, VIQs, SDK jobs, and demo endpoints.",
    href: "/api-reference",
    label: "Explore All APIs",
  },
];

const squadPowers = [
  {
    icon: BadgeCheck,
    title: "BVN resolution",
    body: "Confirm worker identity signals before payroll release.",
  },
  {
    icon: MessageSquareText,
    title: "OTP and SMS",
    body: "Send verification prompts and staff confirmation messages.",
  },
  {
    icon: Database,
    title: "Virtual accounts",
    body: "Create traceable account flows for worker-linked payment operations.",
  },
  {
    icon: TrendingUp,
    title: "Transfers",
    body: "Release eligible salaries after a PASS VIQ decision.",
  },
  {
    icon: Webhook,
    title: "Payment webhooks",
    body: "Close the audit trail with real-time payment confirmation.",
  },
  {
    icon: Shield,
    title: "Account lookup",
    body: "Match payment destination details before movement of funds.",
  },
];

export default function Home() {
  return (
    <main>
      <SiteNav />

      <section className="hero">
        <div className="hero-copy animate-rise">
          <h1>
            Verify staff. Gate payroll. <span>Release trust.</span>
          </h1>
          <p>
            Lattice is a proof-of-life and document-verification SDK for government institutions.
            Plug it into payroll, verify staff with AI and identity checks, generate a signed VIQ,
            and release only eligible salaries.
          </p>
          <div className="hero-actions">
            <Link className="btn-primary" href="/get-started">
              Get Started <ArrowRight size={16} aria-hidden="true" />
            </Link>
            <Link className="btn-secondary" href={links.github} target="_blank">
              View on GitHub <Github size={18} aria-hidden="true" />
            </Link>
          </div>
        </div>

        <div className="hero-visual image-visual animate-float" aria-label="Lattice verification layer visual">
          <img
            src="/hero_material.png"
            alt="Red layered Lattice verification material with a check mark"
          />
        </div>
      </section>

      <section className="section" id="why">
        <h2 className="section-title">Why Lattice?</h2>
        <div className="cards">
          {whyCards.map(({ icon: Icon, title, body }) => (
            <article className="card animate-card" key={title}>
              <Icon className="card-icon" size={36} strokeWidth={1.7} aria-hidden="true" />
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section get-started" id="guides">
        <div className="animate-rise">
          <span className="section-kicker">GET STARTED</span>
          <h2>Up and running in minutes</h2>
          <p>
            Install the SDK, initialize with your API key, and use one orchestration call to return
            a signed VIQ.
          </p>
          <div className="steps">
            <div className="step">
              <span className="step-number">1</span>
              <div>
                <h4>Install the SDK</h4>
                <p>Add Lattice to your project</p>
              </div>
            </div>
            <div className="step">
              <span className="step-number">2</span>
              <div>
                <h4>Initialize</h4>
                <p>Configure with your API key</p>
              </div>
            </div>
            <div className="step">
              <span className="step-number">3</span>
              <div>
                <h4>Start Building</h4>
                <p>Use verification APIs to gate payroll</p>
              </div>
            </div>
          </div>
        </div>

        <CodeTabs />
      </section>

      <section className="section capabilities">
        <span className="section-kicker centered">POWERFUL CAPABILITIES</span>
        <h2 className="section-title">Everything you need to build better</h2>
        <div className="cards capability-row">
          {capabilityCards.map(({ icon: Icon, title, body, href, label }) => (
            <article className="capability-card" key={title}>
              <Icon className="card-icon" size={36} strokeWidth={1.7} aria-hidden="true" />
              <h3>{title}</h3>
              <p>{body}</p>
              <Link href={href}>
                {label} <ArrowRight size={14} aria-hidden="true" />
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className="section squad-section" id="squad">
        <div className="squad-copy">
          <span className="section-kicker">PAYMENT INFRASTRUCTURE PARTNER</span>
          <img src="/squad-logo.svg" alt="Squad" width={150} height={42} />
          <h2>Squad powers the payment bridge after Lattice verifies eligibility.</h2>
          <p>
            Lattice uses Squad APIs as the payment and identity infrastructure layer for payroll
            gating. Verification stays Lattice; payment movement and confirmations run through
            Squad-powered rails.
          </p>
        </div>
        <div className="squad-grid">
          {squadPowers.map(({ icon: Icon, title, body }) => (
            <article className="squad-card" key={title}>
              <Icon size={24} strokeWidth={1.7} aria-hidden="true" />
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="docs-cta">
        <div className="docs-icon">
          <FileText size={38} strokeWidth={1.7} aria-hidden="true" />
        </div>
        <div>
          <h2>Explore the API Docs</h2>
          <p>
            Comprehensive guides, references, endpoint groups, SDK examples, and VIQ details to help
            you build with confidence.
          </p>
        </div>
        <Link className="docs-button" href="/api-reference">
          View API DOCS <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </section>

      <Footer />
    </main>
  );
}
