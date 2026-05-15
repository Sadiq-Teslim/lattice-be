"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Code2,
  Copy,
  CreditCard,
  Eye,
  EyeOff,
  KeyRound,
  Lightbulb,
  Mail,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UserRound,
  WalletCards,
  Zap,
} from "lucide-react";
import { Footer } from "@/components/Footer";
import { SiteNav } from "@/components/SiteNav";
import { links } from "@/lib/links";

type ApiKey = {
  id: string;
  name: string;
  email: string;
  institution: string;
  useCase: string;
  key: string;
  createdAt: string;
};

type BillingAccount = {
  id: string;
  name: string;
  email: string | null;
  api_key_last4: string;
  credit_balance: number;
  status: string;
  price_per_credit_naira: number;
};

type CreditPurchase = {
  id: string;
  credits: number;
  amount_naira: string;
  transaction_reference: string;
  checkout_url: string | null;
  status: string;
  created_at: string;
  paid_at: string | null;
};

const STORAGE_KEY = "lattice:demo-api-keys";
const LATTICE_API_BASE_URL =
  process.env.NEXT_PUBLIC_LATTICE_API_URL ?? "https://lattice-be.onrender.com/api/v1";
const CREDIT_PRICE_NAIRA = 150;

const useCaseOptions = [
  "Government payroll verification",
  "Annual staff re-verification",
  "Schools & tertiary institutions",
  "Payroll platform integration",
  "Internal evaluation / R&D",
  "Other",
];

const benefits = [
  {
    icon: Zap,
    title: "Instant sandbox key",
    body: "Generated in your browser the moment you submit the form. No waiting on approval.",
  },
  {
    icon: Code2,
    title: "SDK + REST endpoints",
    body: "Drop the key into the Python SDK or a curl request and start hitting the verification routes.",
  },
  {
    icon: ShieldCheck,
    title: "Signed VIQ output",
    body: "Get the same signed verdict format used by production: PASS, REVIEW, or FAIL with a trust score.",
  },
];

function generateApiKey() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let body = "";
  for (let i = 0; i < 40; i += 1) {
    body += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `latt_live_${body}`;
}

function maskKey(key: string) {
  if (key.length <= 16) return key;
  return `${key.slice(0, 14)}${"•".repeat(18)}${key.slice(-4)}`;
}

function formatMoney(amount: number) {
  return `₦${Math.round(amount).toLocaleString("en-NG")}`;
}

function formatDate(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function CreditPurchasePanel({ apiKey }: { apiKey: ApiKey }) {
  const [account, setAccount] = useState<BillingAccount | null>(null);
  const [purchases, setPurchases] = useState<CreditPurchase[]>([]);
  const [credits, setCredits] = useState(100);
  const [customerName, setCustomerName] = useState(apiKey.institution || apiKey.name);
  const [email, setEmail] = useState(apiKey.email);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amount = credits * CREDIT_PRICE_NAIRA;

  async function billingRequest<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${LATTICE_API_BASE_URL}${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Lattice-API-Key": apiKey.key,
        ...(init?.headers ?? {}),
      },
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    if (!response.ok) {
      const message =
        data?.detail?.message ?? data?.detail ?? data?.message ?? "Credit request failed";
      throw new Error(typeof message === "string" ? message : "Credit request failed");
    }
    return data as T;
  }

  async function refreshCredits() {
    setLoading(true);
    setError(null);
    try {
      const [nextAccount, nextPurchases] = await Promise.all([
        billingRequest<BillingAccount>("/billing/account"),
        billingRequest<CreditPurchase[]>("/billing/credit-purchases"),
      ]);
      setAccount(nextAccount);
      setPurchases(nextPurchases);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load credit wallet");
    } finally {
      setLoading(false);
    }
  }

  async function buyCredits() {
    setPurchasing(true);
    setError(null);
    try {
      const purchase = await billingRequest<CreditPurchase>("/billing/credit-purchases", {
        method: "POST",
        body: JSON.stringify({
          credits,
          customer_name: customerName,
          email,
        }),
      });
      setPurchases((prev) => [purchase, ...prev.filter((item) => item.id !== purchase.id)]);
      if (purchase.checkout_url) {
        window.open(purchase.checkout_url, "_blank", "noopener,noreferrer");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start credit purchase");
    } finally {
      setPurchasing(false);
    }
  }

  useEffect(() => {
    void refreshCredits();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey.id]);

  return (
    <section className="gs-credit-panel" id="billing">
      <div className="gs-credit-head">
        <div>
          <span className="section-kicker">CREDITS</span>
          <h3>Fund this API key</h3>
          <p>Each verification credit costs {formatMoney(CREDIT_PRICE_NAIRA)}.</p>
        </div>
        <button type="button" className="gs-ghost-btn small" onClick={refreshCredits} disabled={loading}>
          <RefreshCw size={14} strokeWidth={1.8} aria-hidden="true" />
          Refresh
        </button>
      </div>

      <div className="gs-credit-grid">
        <div className="gs-credit-balance">
          <WalletCards size={22} strokeWidth={1.8} aria-hidden="true" />
          <span>Available credits</span>
          <strong>{loading ? "..." : account?.credit_balance ?? 0}</strong>
          <small>API key ending {account?.api_key_last4 ?? apiKey.key.slice(-4)}</small>
        </div>

        <div className="gs-credit-form">
          <label>
            <span>Credits</span>
            <input
              type="number"
              min={10}
              step={10}
              value={credits}
              onChange={(event) => setCredits(Math.max(10, Number(event.target.value) || 10))}
            />
          </label>
          <label>
            <span>Billing name</span>
            <input
              type="text"
              value={customerName}
              onChange={(event) => setCustomerName(event.target.value)}
            />
          </label>
          <label>
            <span>Billing email</span>
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <div className="gs-credit-total">
            <span>Total</span>
            <strong>{formatMoney(amount)}</strong>
          </div>
          {error ? <p className="gs-credit-error">{error}</p> : null}
          <button
            type="button"
            className="gs-submit"
            onClick={buyCredits}
            disabled={purchasing || !email.trim() || !customerName.trim()}
          >
            {purchasing ? (
              <>
                <span className="gs-spinner" aria-hidden="true" />
                Opening Squad checkout...
              </>
            ) : (
              <>
                <CreditCard size={16} aria-hidden="true" />
                Buy credits with Squad
              </>
            )}
          </button>
        </div>
      </div>

      {purchases.length ? (
        <div className="gs-purchase-list">
          <strong>Recent credit purchases</strong>
          {purchases.slice(0, 3).map((purchase) => (
            <div className="gs-purchase-row" key={purchase.id}>
              <span>{purchase.credits} credits</span>
              <span>{formatMoney(Number(purchase.amount_naira))}</span>
              <em>{purchase.status.replaceAll("_", " ")}</em>
            </div>
          ))}
        </div>
      ) : (
        <p className="gs-credit-note">
          Squad handles card, transfer, and other checkout methods. Your credits appear after payment confirmation.
        </p>
      )}
    </section>
  );
}

export default function GetStartedPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", institution: "", useCase: "" });
  const [submitting, setSubmitting] = useState(false);
  const [justCreated, setJustCreated] = useState<ApiKey | null>(null);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setKeys(JSON.parse(raw) as ApiKey[]);
    } catch {
      // ignore corrupt storage
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
    } catch {
      // ignore quota issues
    }
  }, [keys, hydrated]);

  const canSubmit = useMemo(() => {
    return (
      form.name.trim().length > 1 &&
      /.+@.+\..+/.test(form.email.trim()) &&
      form.institution.trim().length > 1 &&
      form.useCase.trim().length > 1 &&
      !submitting
    );
  }, [form, submitting]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);

    window.setTimeout(() => {
      const next: ApiKey = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: form.name.trim(),
        email: form.email.trim(),
        institution: form.institution.trim(),
        useCase: form.useCase.trim(),
        key: generateApiKey(),
        createdAt: new Date().toISOString(),
      };
      setKeys((prev) => [next, ...prev]);
      setJustCreated(next);
      setRevealed((prev) => ({ ...prev, [next.id]: true }));
      setForm({ name: "", email: "", institution: "", useCase: "" });
      setSubmitting(false);
    }, 900);
  }

  async function copyKey(id: string, key: string) {
    try {
      await navigator.clipboard.writeText(key);
    } catch {
      try {
        const textarea = document.createElement("textarea");
        textarea.value = key;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.top = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      } catch {
        // some embedded browsers block clipboard writes
      }
    }
    setCopiedId(id);
    window.setTimeout(() => setCopiedId((current) => (current === id ? null : current)), 1500);
  }

  function rotateKey(id: string) {
    setKeys((prev) =>
      prev.map((entry) =>
        entry.id === id
          ? { ...entry, key: generateApiKey(), createdAt: new Date().toISOString() }
          : entry,
      ),
    );
    setRevealed((prev) => ({ ...prev, [id]: true }));
  }

  function revokeKey(id: string) {
    setKeys((prev) => prev.filter((entry) => entry.id !== id));
    setRevealed((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    if (justCreated?.id === id) setJustCreated(null);
  }

  function toggleReveal(id: string) {
    setRevealed((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  return (
    <main className="page">
      <SiteNav />

      <section className="doc-hero">
        <span>Get Started</span>
        <h1>Spin up a Lattice API key and gate your payroll today.</h1>
        <p>
          Tell us about your institution and your use case. We&rsquo;ll mint a sandbox API key
          right here in your browser so you can hit the verification endpoints, generate a signed
          VIQ, and explore the SDK in minutes.
        </p>
      </section>

      <section className="section white-section">
        <div className="gs-split">
          <article className="gs-card">
            <header>
              <span className="section-kicker">SIGN UP</span>
              <h3>Generate your sandbox key</h3>
              <p>Four fields. No card. No commitment.</p>
            </header>

            {justCreated ? (
              <div className="gs-key-reveal" key={justCreated.id}>
                <div className="gs-reveal-head">
                  <CheckCircle2 size={28} strokeWidth={1.8} aria-hidden="true" />
                  <div>
                    <strong>Your API key is ready</strong>
                    <p>
                      Issued to <em>{justCreated.institution}</em>. Copy it now &mdash; for
                      security you&rsquo;ll only see it in full here.
                    </p>
                  </div>
                </div>
                <div className="gs-key-row">
                  <KeyRound size={16} strokeWidth={1.8} aria-hidden="true" />
                  <code>{revealed[justCreated.id] ? justCreated.key : maskKey(justCreated.key)}</code>
                  <button
                    type="button"
                    className="gs-icon-btn"
                    onClick={() => toggleReveal(justCreated.id)}
                    aria-label={revealed[justCreated.id] ? "Hide key" : "Show key"}
                  >
                    {revealed[justCreated.id] ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                  <button
                    type="button"
                    className={
                      copiedId === justCreated.id ? "gs-copy-pill copied" : "gs-copy-pill"
                    }
                    onClick={() => copyKey(justCreated.id, justCreated.key)}
                  >
                    {copiedId === justCreated.id ? <CheckCircle2 size={14} /> : <Copy size={14} />}
                    {copiedId === justCreated.id ? "Copied" : "Copy"}
                  </button>
                </div>
                <div className="gs-reveal-actions">
                  <button
                    type="button"
                    className="gs-ghost-btn"
                    onClick={() => setJustCreated(null)}
                  >
                    Create another key
                  </button>
                  <Link className="gs-primary-btn" href="/api-reference">
                    Open API DOCS <ArrowRight size={16} aria-hidden="true" />
                  </Link>
                </div>
                <CreditPurchasePanel apiKey={justCreated} />
              </div>
            ) : (
              <form className="gs-form" onSubmit={handleSubmit} noValidate>
                <label className="gs-field">
                  <span>Full name</span>
                  <div className="gs-input">
                    <UserRound size={16} strokeWidth={1.7} aria-hidden="true" />
                    <input
                      type="text"
                      placeholder="Adetola Sadiq"
                      value={form.name}
                      onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                      required
                    />
                  </div>
                </label>

                <label className="gs-field">
                  <span>Work email</span>
                  <div className="gs-input">
                    <Mail size={16} strokeWidth={1.7} aria-hidden="true" />
                    <input
                      type="email"
                      placeholder="you@ministry.gov.ng"
                      value={form.email}
                      onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                      required
                    />
                  </div>
                </label>

                <label className="gs-field">
                  <span>Institution</span>
                  <div className="gs-input">
                    <Building2 size={16} strokeWidth={1.7} aria-hidden="true" />
                    <input
                      type="text"
                      placeholder="Ogun State Ministry of Education"
                      value={form.institution}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, institution: e.target.value }))
                      }
                      required
                    />
                  </div>
                </label>

                <label className="gs-field">
                  <span>Primary use case</span>
                  <div className="gs-input">
                    <Lightbulb size={16} strokeWidth={1.7} aria-hidden="true" />
                    <select
                      value={form.useCase}
                      onChange={(e) => setForm((prev) => ({ ...prev, useCase: e.target.value }))}
                      required
                    >
                      <option value="">Choose one</option>
                      {useCaseOptions.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  </div>
                </label>

                <button
                  type="submit"
                  className={submitting ? "gs-submit loading" : "gs-submit"}
                  disabled={!canSubmit}
                >
                  {submitting ? (
                    <>
                      <span className="gs-spinner" aria-hidden="true" />
                      Minting your key…
                    </>
                  ) : (
                    <>
                      Generate my API key
                      <ArrowRight size={16} aria-hidden="true" />
                    </>
                  )}
                </button>

                <p className="gs-fine-print">
                  Demo keys live in this browser only. For production access, talk to us via{" "}
                  <Link href={links.github} target="_blank">
                    GitHub
                  </Link>
                  .
                </p>
              </form>
            )}
          </article>

          <aside className="gs-benefits">
            <span className="section-kicker">WHAT YOU GET</span>
            <h2>Everything you need to verify your first worker.</h2>
            <p>
              Lattice ships with synthetic ministry data so you can run the full payroll-gating
              flow without touching real records.
            </p>
            <ul>
              {benefits.map(({ icon: Icon, title, body }) => (
                <li key={title}>
                  <Icon size={20} strokeWidth={1.8} aria-hidden="true" />
                  <div>
                    <strong>{title}</strong>
                    <span>{body}</span>
                  </div>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      </section>

      <section className="section" id="keys">
        <div className="section-intro left gs-manage-intro">
          <div>
            <span>YOUR API KEYS</span>
            <h2>Manage every key you&rsquo;ve issued in this browser.</h2>
            <p>
              Reveal, copy, rotate, or revoke a key without leaving the page. Keys are scoped to
              this device &mdash; clearing site data wipes them.
            </p>
          </div>
          <div className="gs-key-count">
            <strong>{hydrated ? keys.length : 0}</strong>
            <span>active key{keys.length === 1 ? "" : "s"}</span>
          </div>
        </div>

        {hydrated && keys.length === 0 ? (
          <div className="gs-empty">
            <KeyRound size={28} strokeWidth={1.6} aria-hidden="true" />
            <strong>No keys yet</strong>
            <p>Fill the form above to mint your first sandbox key.</p>
          </div>
        ) : (
          <div className="gs-key-list">
            {keys.map((entry) => (
              <article className="gs-key-card" key={entry.id}>
                <header>
                  <div>
                    <span className="gs-card-eyebrow">{entry.institution}</span>
                    <strong>{entry.name}</strong>
                    <small>{entry.email}</small>
                  </div>
                  <span className="gs-tag">{entry.useCase}</span>
                </header>
                <div className="gs-key-row solid">
                  <KeyRound size={16} strokeWidth={1.8} aria-hidden="true" />
                  <code>{revealed[entry.id] ? entry.key : maskKey(entry.key)}</code>
                  <button
                    type="button"
                    className="gs-icon-btn"
                    onClick={() => toggleReveal(entry.id)}
                    aria-label={revealed[entry.id] ? "Hide key" : "Show key"}
                  >
                    {revealed[entry.id] ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                  <button
                    type="button"
                    className={copiedId === entry.id ? "gs-copy-pill copied" : "gs-copy-pill"}
                    onClick={() => copyKey(entry.id, entry.key)}
                  >
                    {copiedId === entry.id ? <CheckCircle2 size={14} /> : <Copy size={14} />}
                    {copiedId === entry.id ? "Copied" : "Copy"}
                  </button>
                </div>
                <footer>
                  <span>Created {formatDate(entry.createdAt)}</span>
                  <div>
                    <button type="button" className="gs-ghost-btn small" onClick={() => rotateKey(entry.id)}>
                      <RefreshCw size={14} strokeWidth={1.8} aria-hidden="true" />
                      Rotate
                    </button>
                    <button
                      type="button"
                      className="gs-ghost-btn small danger"
                      onClick={() => revokeKey(entry.id)}
                    >
                      <Trash2 size={14} strokeWidth={1.8} aria-hidden="true" />
                      Revoke
                    </button>
                  </div>
                </footer>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="demo-band">
        <div>
          <span>Next step</span>
          <h2>You have the key &mdash; now wire it up.</h2>
        </div>
        <div className="demo-actions">
          <Link href="/api-reference">
            Open API DOCS <ArrowRight size={17} strokeWidth={1.8} aria-hidden="true" />
          </Link>
          <Link href={links.ogunDemo}>
            Run the demo <ArrowRight size={17} strokeWidth={1.8} aria-hidden="true" />
          </Link>
        </div>
      </section>

      <Footer />
    </main>
  );
}
