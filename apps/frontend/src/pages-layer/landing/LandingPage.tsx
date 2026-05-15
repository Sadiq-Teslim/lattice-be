"use client";

import { useEffect, useState } from "react";
import { ArrowRight, BadgeCheck, CreditCard, FileCode2, ShieldCheck, Sparkles } from "lucide-react";
import { latticeApi } from "@/shared/api/client";
import { env } from "@/shared/config/env";
import type { BillingAccount, CreditPurchase } from "@/shared/api/types";
import styles from "./LandingPage.module.css";

export function LandingPage() {
  const [account, setAccount] = useState<BillingAccount | null>(null);
  const [purchases, setPurchases] = useState<CreditPurchase[]>([]);
  const [credits, setCredits] = useState(100);
  const [buyerName, setBuyerName] = useState("Ogun State Ministry of Education");
  const [buyerEmail, setBuyerEmail] = useState("teslim.sadiq@example.com");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([latticeApi.billingAccount(), latticeApi.listCreditPurchases()])
      .then(([accountResult, purchaseResult]) => {
        if (!alive) return;
        setAccount(accountResult);
        setPurchases(purchaseResult);
      })
      .catch((err) => {
        if (alive) setError(err instanceof Error ? err.message : "Could not load billing account.");
      });
    return () => {
      alive = false;
    };
  }, []);

  async function buyCredits() {
    setLoading(true);
    setError(null);
    try {
      const purchase = await latticeApi.createCreditPurchase({
        credits,
        customer_name: buyerName,
        email: buyerEmail,
      });
      setPurchases((current) => [purchase, ...current]);
      if (purchase.checkout_url) {
        window.open(purchase.checkout_url, "_blank", "noopener,noreferrer");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start Squad checkout.");
    } finally {
      setLoading(false);
    }
  }

  const price = account?.price_per_credit_naira ?? 50;

  return (
    <main className={styles.shell}>
      <nav className={styles.nav}>
        <a className={styles.brand} href="/">
          <img alt="Lattice" src="/lattice-logo-transparent.png" />
          <span>Lattice</span>
        </a>
        <div className={styles.navLinks}>
          <a href="#sdk">SDK</a>
          <a href="#billing">Credits</a>
          <a href="/admin/ogun-education">Open Demo</a>
        </div>
      </nav>

      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <span className={styles.eyebrow}>AI verification SDK for institutions</span>
          <h1>Proof before access, approval, benefits, or payment.</h1>
          <p>
            Lattice lets institutions verify identity, documents, biometrics, proof of life,
            and payroll risk through one API. Each verification returns a signed VIQ for audit,
            review, and release decisions.
          </p>
          <div className={styles.ctaRow}>
            <a className={styles.primaryCta} href="#billing">
              Buy verification credits <ArrowRight size={18} />
            </a>
            <a className={styles.secondaryCta} href="/admin/ogun-education">
              View Ogun payroll demo
            </a>
          </div>
        </div>

        <aside className={styles.sdkCard} id="sdk">
          <span>Developer quickstart</span>
          <strong>One call to create a verification decision.</strong>
          <pre className={styles.codeBlock}>{`curl ${env.apiUrl}/sdk/verify-and-disburse \\
  -H "X-Lattice-API-Key: ${env.latticeApiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{"worker_id":"OG00001","evidence":{}}'`}</pre>
        </aside>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2>Everything an institution needs to trust a verification.</h2>
          <p>
            Lattice combines AI checks, institutional records, and payment-grade audit trails.
          </p>
        </div>
        <div className={styles.grid}>
          <article className={styles.feature}>
            <ShieldCheck size={32} color="#e8001c" />
            <strong>Proof of life</strong>
            <p>Browser liveness checks face alignment, movement, and presence before accepting a worker submission.</p>
          </article>
          <article className={styles.feature}>
            <BadgeCheck size={32} color="#e8001c" />
            <strong>Document consistency</strong>
            <p>Submitted records are correlated against staff data to detect age, name, timeline, and missing-document issues.</p>
          </article>
          <article className={styles.feature}>
            <Sparkles size={32} color="#e8001c" />
            <strong>Payroll intelligence</strong>
            <p>Anomaly detection surfaces suspicious clusters such as shared devices, BVN collisions, and registration bursts.</p>
          </article>
        </div>
      </section>

      <section className={styles.section} id="billing">
        <div className={styles.sectionHead}>
          <h2>Buy Lattice credits with Squad.</h2>
          <p>
            This is the SDK billing layer. Each API key has a credit wallet, and every verification
            consumes credits from that account.
          </p>
        </div>

        <div className={styles.billingGrid}>
          <article className={styles.apiKeyPanel}>
            <FileCode2 size={34} color="#e8001c" />
            <h3>API key and account</h3>
            <p>Your institution's API key controls access to Lattice verification endpoints.</p>
            <div className={styles.apiKeyBox}>
              <span>Current API key</span>
              <code>{env.latticeApiKey}</code>
            </div>
            <div className={styles.balance}>
              <span>Available credits</span>
              <strong>{account?.credit_balance ?? "..."}</strong>
              <small>Billing account ending {account?.api_key_last4 ?? "...."}</small>
            </div>
          </article>

          <article className={styles.billingPanel}>
            <CreditCard size={34} color="#e8001c" />
            <h3>Purchase credits</h3>
            <p>Squad checkout opens after initiation. Webhook confirmation credits this API key automatically.</p>
            {error ? <p className={styles.inlineError}>{error}</p> : null}
            <div className={styles.purchaseGrid}>
              <label className={styles.field}>
                Institution
                <input value={buyerName} onChange={(event) => setBuyerName(event.currentTarget.value)} />
              </label>
              <label className={styles.field}>
                Billing email
                <input type="email" value={buyerEmail} onChange={(event) => setBuyerEmail(event.currentTarget.value)} />
              </label>
              <label className={styles.field}>
                Credits
                <input min={10} type="number" value={credits} onChange={(event) => setCredits(Number(event.currentTarget.value || 0))} />
              </label>
              <div className={styles.amountBox}>
                <span>Amount</span>
                <strong>{formatMoney(credits * price)}</strong>
              </div>
            </div>
            <button className={styles.squadButton} disabled={loading || credits < 10} type="button" onClick={buyCredits}>
              {loading ? "Opening Squad checkout..." : "Buy credits with Squad"}
            </button>
          </article>
        </div>

        <article className={styles.historyPanel}>
          <h3>Recent credit purchases</h3>
          {purchases.length ? (
            <div className={styles.purchaseList}>
              {purchases.slice(0, 4).map((purchase) => (
                <div className={styles.purchaseItem} key={purchase.id}>
                  <strong>{purchase.credits} credits · {formatMoney(Number(purchase.amount_naira))}</strong>
                  <span>{purchase.status} · {purchase.transaction_reference}</span>
                </div>
              ))}
            </div>
          ) : (
            <p>No credit purchase yet.</p>
          )}
        </article>
      </section>
    </main>
  );
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-NG", {
    currency: "NGN",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value).replace("NGN", "₦");
}
