import { useEffect, useMemo, useState } from "react";
import { API_BASE } from "./config";

/* ---------- Types ---------- */

type CaseItem = {
  id: string;
  type: "transaction" | "content" | "account";
  summary: string;
  amount?: number;
};

type ScoreResponse = {
  case_id: string;
  risk_score: number;
  verdict: "Approve" | "Review" | "Reject";
  confidence: number;
  rationale: string;
  signals: string[];
  model: string;
  backend: string;
  timestamp: string;
};

type AnalyticsResponse = {
  total_feedback: number;
  override_rate: number;
  top_reasons: { reason: string; count: number }[];
};

/* ---------- Demo Queue ---------- */

const DEMO_QUEUE: CaseItem[] = [
  {
    id: "CASE-1001",
    type: "transaction",
    summary: "Urgent wire transfer requested by new vendor",
    amount: 1200,
  },
  {
    id: "CASE-1002",
    type: "transaction",
    summary: "Low-dollar card purchase at known merchant",
    amount: 12,
  },
  {
    id: "CASE-1003",
    type: "transaction",
    summary: "Gift card purchase requested via email",
    amount: 300,
  },
];

/* ---------- Visual helpers ---------- */

function verdictTone(verdict: ScoreResponse["verdict"]) {
  if (verdict === "Approve") return "good";
  if (verdict === "Review") return "warn";
  return "bad";
}

function formatMoney(n?: number) {
  if (typeof n !== "number") return "—";
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

/* ---------- App ---------- */

export default function App() {
  const [queue] = useState<CaseItem[]>(DEMO_QUEUE);
  const [selected, setSelected] = useState<CaseItem | null>(queue[0]);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScoreResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Human review
  const [action, setAction] = useState<"Approve" | "Override">("Approve");
  const [reasons, setReasons] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [submitted, setSubmitted] = useState(false);

  // Analytics
  const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null);

  // Mobile drawer
  const [queueOpen, setQueueOpen] = useState(false);

  const selectedMeta = useMemo(() => {
    if (!selected) return null;
    return {
      id: selected.id,
      type: selected.type,
      summary: selected.summary,
      amount: selected.amount,
    };
  }, [selected]);

  useEffect(() => {
    loadAnalytics();
  }, []);

  /* ---------- API calls ---------- */

  async function scoreSelected() {
    if (!selected) return;

    setLoading(true);
    setResult(null);
    setError(null);

    // reset review UI
    setSubmitted(false);
    setAction("Approve");
    setReasons([]);
    setNotes("");

    try {
      const res = await fetch(`${API_BASE}/score`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          case: {
            id: selected.id,
            type: selected.type,
            summary: selected.summary,
            amount: selected.amount,
          },
        }),
      });

      if (!res.ok) throw new Error(`API error ${res.status}`);

      const data = (await res.json()) as ScoreResponse;
      setResult(data);
    } catch (err) {
      console.error(err);
      setError("Failed to score case. Is the backend running?");
    } finally {
      setLoading(false);
    }
  }

  async function submitFeedback() {
    if (!result) return;

    try {
      const res = await fetch(`${API_BASE}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          case_id: result.case_id,
          reviewer: "Analyst Demo",
          action,
          final_verdict: action === "Override" ? "Review" : result.verdict,
          reason_codes: reasons,
          notes,
          original: {
            verdict: result.verdict,
            risk_score: result.risk_score,
            confidence: result.confidence,
            model: result.model,
            backend: result.backend,
          },
        }),
      });

      if (!res.ok) throw new Error(`Feedback error ${res.status}`);

      setSubmitted(true);
      loadAnalytics();
    } catch (err) {
      console.error(err);
      alert("Failed to submit feedback");
    }
  }

  async function loadAnalytics() {
    try {
      const res = await fetch(`${API_BASE}/analytics`);
      if (!res.ok) return;

      const data = (await res.json()) as AnalyticsResponse;
      setAnalytics(data);
    } catch (err) {
      console.error("Failed to load analytics", err);
    }
  }

  /* ---------- UI ---------- */

  return (
    <div className="app">
      <style>{styles}</style>

      {/* Top header (fintech vibe) */}
      <header className="topbar">
        <div className="topbar__left">
          <div className="brand">
            <div className="brand__mark" />
            <div className="brand__text">
              <div className="brand__title">Decision Oversight</div>
              <div className="brand__subtitle">Human-in-the-loop AI governance</div>
            </div>
          </div>
        </div>

        <div className="topbar__right">
          <button className="btn btn--ghost btn--mobileOnly" onClick={() => setQueueOpen(true)}>
            Queue
          </button>

          <button className="btn btn--ghost" onClick={loadAnalytics} title="Refresh metrics">
            Refresh
          </button>

          <span className="pill">
            API <span className="pill__muted">{API_BASE}</span>
          </span>
        </div>
      </header>

      <div className="layout">
        {/* Desktop sidebar */}
        <aside className="sidebar sidebar--desktop" aria-label="Review Queue">
          <div className="sidebar__header">
            <div className="sidebar__title">Review Queue</div>
            <div className="sidebar__meta">{queue.length} cases</div>
          </div>

          <div className="sidebar__list">
            {queue.map((c) => {
              const isActive = selected?.id === c.id;
              return (
                <button
                  key={c.id}
                  className={`caseCard ${isActive ? "caseCard--active" : ""}`}
                  onClick={() => {
                    setSelected(c);
                    setResult(null);
                    setSubmitted(false);
                    setError(null);
                  }}
                >
                  <div className="caseCard__row">
                    <div className="caseCard__id">{c.id}</div>
                    <div className="caseCard__amount">{formatMoney(c.amount)}</div>
                  </div>
                  <div className="caseCard__summary">{c.summary}</div>
                  <div className="caseCard__tag">{c.type.toUpperCase()}</div>
                </button>
              );
            })}
          </div>
        </aside>

        {/* Mobile queue drawer */}
        <div className={`drawer ${queueOpen ? "drawer--open" : ""}`}>
          <div className="drawer__backdrop" onClick={() => setQueueOpen(false)} />
          <aside className="drawer__panel" aria-label="Mobile Review Queue">
            <div className="drawer__header">
              <div>
                <div className="sidebar__title">Review Queue</div>
                <div className="sidebar__meta">{queue.length} cases</div>
              </div>
              <button className="btn btn--ghost" onClick={() => setQueueOpen(false)}>
                Close
              </button>
            </div>

            <div className="sidebar__list">
              {queue.map((c) => {
                const isActive = selected?.id === c.id;
                return (
                  <button
                    key={c.id}
                    className={`caseCard ${isActive ? "caseCard--active" : ""}`}
                    onClick={() => {
                      setSelected(c);
                      setResult(null);
                      setSubmitted(false);
                      setError(null);
                      setQueueOpen(false);
                    }}
                  >
                    <div className="caseCard__row">
                      <div className="caseCard__id">{c.id}</div>
                      <div className="caseCard__amount">{formatMoney(c.amount)}</div>
                    </div>
                    <div className="caseCard__summary">{c.summary}</div>
                    <div className="caseCard__tag">{c.type.toUpperCase()}</div>
                  </button>
                );
              })}
            </div>
          </aside>
        </div>

        {/* Main content */}
        <main className="main">
          {/* Case detail */}
          <section className="card">
            <div className="card__header">
              <div>
                <div className="card__title">Case Detail</div>
                <div className="card__subtitle">Select a case and run AI scoring</div>
              </div>

              <button className="btn btn--primary" onClick={scoreSelected} disabled={loading || !selected}>
                {loading ? "Scoring…" : "Score with AI"}
              </button>
            </div>

            <div className="grid">
              <div className="field">
                <div className="field__label">Case ID</div>
                <div className="field__value">{selectedMeta?.id ?? "—"}</div>
              </div>
              <div className="field">
                <div className="field__label">Type</div>
                <div className="field__value">{selectedMeta?.type ?? "—"}</div>
              </div>
              <div className="field">
                <div className="field__label">Amount</div>
                <div className="field__value">{formatMoney(selectedMeta?.amount)}</div>
              </div>
              <div className="field field--wide">
                <div className="field__label">Summary</div>
                <div className="field__value">{selectedMeta?.summary ?? "—"}</div>
              </div>
            </div>

            {error && <div className="alert alert--error">⚠️ {error}</div>}
          </section>

          {/* Model decision */}
          {result && (
            <section className="card">
              <div className="card__header">
                <div>
                  <div className="card__title">Model Decision</div>
                  <div className="card__subtitle">Structured output designed for auditability</div>
                </div>

                <span className={`badge badge--${verdictTone(result.verdict)}`}>{result.verdict}</span>
              </div>

              <div className="decision">
                <div className="decision__score">
                  <div className="decision__scoreLabel">Risk score</div>
                  <div className={`decision__scoreValue decision__scoreValue--${verdictTone(result.verdict)}`}>
                    {result.risk_score}
                  </div>
                  <div className="decision__scoreMeta">Confidence {Math.round(result.confidence * 100)}%</div>
                </div>

                <div className="decision__body">
                  <div className="field">
                    <div className="field__label">Rationale</div>
                    <div className="field__value">{result.rationale}</div>
                  </div>

                  <div className="field" style={{ marginTop: 12 }}>
                    <div className="field__label">Signals</div>
                    <div className="chips">
                      {result.signals.map((s) => (
                        <span key={s} className="chip">
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="metaRow">
                    <span className="metaRow__item">
                      Model <span className="metaRow__muted">{result.model}</span>
                    </span>
                    <span className="metaRow__item">
                      Backend <span className="metaRow__muted">{result.backend}</span>
                    </span>
                    <span className="metaRow__item">
                      Time <span className="metaRow__muted">{new Date(result.timestamp).toLocaleString()}</span>
                    </span>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Human review */}
          {result && !submitted && (
            <section className="card">
              <div className="card__header">
                <div>
                  <div className="card__title">Human Review</div>
                  <div className="card__subtitle">Capture overrides with reason codes</div>
                </div>
                <button className="btn btn--secondary" onClick={submitFeedback}>
                  Submit Review
                </button>
              </div>

              <div className="review">
                <div className="review__left">
                  <div className="field__label">Analyst action</div>
                  <div className="toggle">
                    <button
                      className={`toggle__btn ${action === "Approve" ? "toggle__btn--active" : ""}`}
                      onClick={() => setAction("Approve")}
                      type="button"
                    >
                      Approve
                    </button>
                    <button
                      className={`toggle__btn ${action === "Override" ? "toggle__btn--active" : ""}`}
                      onClick={() => setAction("Override")}
                      type="button"
                    >
                      Override
                    </button>
                  </div>

                  {action === "Override" && (
                    <>
                      <div className="spacer" />

                      <div className="field__label">Reason codes</div>
                      <div className="checklist">
                        {["false_positive", "missing_context", "edge_case"].map((r) => (
                          <label key={r} className="check">
                            <input
                              type="checkbox"
                              checked={reasons.includes(r)}
                              onChange={(e) =>
                                setReasons((prev) =>
                                  e.target.checked ? [...prev, r] : prev.filter((x) => x !== r)
                                )
                              }
                            />
                            <span>{r}</span>
                          </label>
                        ))}
                      </div>

                      <div className="spacer" />

                      <div className="field__label">Notes</div>
                      <textarea
                        className="textarea"
                        rows={3}
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Optional context for audit trail…"
                      />
                    </>
                  )}
                </div>

                <div className="review__right">
                  <div className="miniCard">
                    <div className="miniCard__title">Payload preview</div>
                    <pre className="code">
{JSON.stringify(
  {
    case_id: result.case_id,
    reviewer: "Analyst Demo",
    action,
    final_verdict: action === "Override" ? "Review" : result.verdict,
    reason_codes: reasons,
    notes: notes || undefined,
  },
  null,
  2
)}
                    </pre>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Success */}
          {submitted && <div className="toast">✅ Feedback submitted successfully</div>}

          {/* Analytics */}
          {analytics && (
            <section className="card">
              <div className="card__header">
                <div>
                  <div className="card__title">Analytics</div>
                  <div className="card__subtitle">Operational metrics for model governance</div>
                </div>
              </div>

              <div className="metrics">
                <div className="metric">
                  <div className="metric__label">Total reviews</div>
                  <div className="metric__value">{analytics.total_feedback}</div>
                </div>
                <div className="metric">
                  <div className="metric__label">Override rate</div>
                  <div className="metric__value">{Math.round(analytics.override_rate * 100)}%</div>
                </div>
              </div>

              <div className="spacer" />

              <div className="field__label">Top override reasons</div>
              {analytics.top_reasons.length === 0 ? (
                <div className="muted">No overrides yet</div>
              ) : (
                <div className="reasons">
                  {analytics.top_reasons.map((r) => (
                    <div key={r.reason} className="reasonRow">
                      <span className="reasonRow__name">{r.reason}</span>
                      <span className="reasonRow__count">{r.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </main>
      </div>
    </div>
  );
}

/* ---------- Styles (fintech-ish + responsive) ---------- */

const styles = `
:root{
  --bg: #0b1220;
  --panel: #0f1b33;
  --card: rgba(255,255,255,0.92);
  --cardBorder: rgba(15, 23, 42, 0.10);
  --text: #0b1220;
  --muted: rgba(15,23,42,0.65);
  --line: rgba(15,23,42,0.12);
  --primary: #0f172a;
  --primary2: #111b36;
  --good: #16a34a;
  --warn: #d97706;
  --bad: #dc2626;
  --chip: rgba(2, 6, 23, 0.06);
}

*{ box-sizing: border-box; }

.app{
  min-height: 100vh;
  background:
    radial-gradient(1000px 600px at 20% 0%, rgba(56,189,248,0.10), transparent 60%),
    radial-gradient(900px 600px at 90% 20%, rgba(99,102,241,0.12), transparent 60%),
    #f5f7fb;
  color: var(--text);
}

.topbar{
  position: sticky;
  top: 0;
  z-index: 20;
  background: linear-gradient(90deg, #0b1220, #0f1b33);
  color: rgba(255,255,255,0.92);
  padding: 14px 16px;
  border-bottom: 1px solid rgba(255,255,255,0.08);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.brand{ display:flex; align-items:center; gap:12px; }
.brand__mark{
  width: 12px; height: 12px; border-radius: 4px;
  background: linear-gradient(135deg, #38bdf8, #6366f1);
  box-shadow: 0 0 0 4px rgba(56,189,248,0.15);
}
.brand__title{ font-weight: 700; letter-spacing: 0.2px; }
.brand__subtitle{ font-size: 12px; color: rgba(255,255,255,0.70); margin-top: 2px; }

.topbar__right{ display:flex; align-items:center; gap:10px; flex-wrap: wrap; justify-content:flex-end; }
.pill{
  padding: 6px 10px;
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 999px;
  font-size: 12px;
  color: rgba(255,255,255,0.85);
}
.pill__muted{ color: rgba(255,255,255,0.65); margin-left: 6px; }

.layout{
  display:flex;
  height: calc(100vh - 58px);
}

.sidebar{
  width: 340px;
  background: rgba(255,255,255,0.80);
  border-right: 1px solid var(--line);
  padding: 14px;
  overflow-y: auto;
  backdrop-filter: blur(10px);
}

.sidebar__header{ display:flex; justify-content:space-between; align-items:baseline; margin-bottom: 10px; }
.sidebar__title{ font-weight: 700; }
.sidebar__meta{ font-size: 12px; color: var(--muted); }

.sidebar__list{ display:flex; flex-direction:column; gap:10px; }

.caseCard{
  width: 100%;
  text-align: left;
  border: 1px solid var(--cardBorder);
  background: rgba(255,255,255,0.92);
  border-radius: 12px;
  padding: 12px;
  cursor: pointer;
  transition: transform 120ms ease, box-shadow 120ms ease, border 120ms ease;
}
.caseCard:hover{
  transform: translateY(-1px);
  box-shadow: 0 8px 18px rgba(2,6,23,0.06);
}
.caseCard--active{
  border-color: rgba(99,102,241,0.35);
  box-shadow: 0 10px 24px rgba(99,102,241,0.10);
  background: rgba(238,242,255,0.9);
}
.caseCard__row{ display:flex; justify-content:space-between; align-items:baseline; gap:10px; }
.caseCard__id{ font-weight: 800; letter-spacing: 0.2px; }
.caseCard__amount{ font-variant-numeric: tabular-nums; color: var(--muted); font-size: 12px; }
.caseCard__summary{ margin-top: 6px; color: rgba(15,23,42,0.85); font-size: 13px; line-height: 1.35; }
.caseCard__tag{
  margin-top: 10px;
  display:inline-block;
  font-size: 11px;
  padding: 4px 8px;
  border-radius: 999px;
  background: rgba(2,6,23,0.06);
  color: rgba(15,23,42,0.7);
}

.main{
  flex: 1;
  padding: 18px;
  overflow-y: auto;
  display:flex;
  flex-direction: column;
  gap: 14px;
}

.card{
  background: rgba(255,255,255,0.92);
  border: 1px solid var(--cardBorder);
  border-radius: 14px;
  padding: 16px;
  box-shadow: 0 10px 30px rgba(2,6,23,0.06);
  backdrop-filter: blur(10px);
}

.card__header{
  display:flex;
  align-items:flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.card__title{ font-weight: 800; letter-spacing: 0.2px; }
.card__subtitle{ font-size: 12px; color: var(--muted); margin-top: 3px; }

.grid{
  display:grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}
.field{ padding: 10px; border: 1px solid var(--line); border-radius: 12px; background: rgba(255,255,255,0.7); }
.field--wide{ grid-column: 1 / -1; }
.field__label{ font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); }
.field__value{ margin-top: 6px; font-size: 14px; color: rgba(2,6,23,0.88); }

.alert{
  margin-top: 12px;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid rgba(220,38,38,0.25);
  background: rgba(220,38,38,0.06);
  color: #991b1b;
  font-size: 13px;
}

.btn{
  border: 1px solid rgba(255,255,255,0.16);
  background: rgba(255,255,255,0.10);
  color: rgba(255,255,255,0.92);
  padding: 8px 12px;
  border-radius: 10px;
  cursor: pointer;
}
.btn:disabled{ opacity: 0.6; cursor: not-allowed; }
.btn--ghost{ background: rgba(255,255,255,0.08); }
.btn--primary{
  background: linear-gradient(180deg, #111b36, #0b1220);
  border: 1px solid rgba(2,6,23,0.25);
  color: rgba(255,255,255,0.92);
  box-shadow: 0 10px 25px rgba(2,6,23,0.22);
}
.btn--secondary{
  background: rgba(2,6,23,0.06);
  border: 1px solid var(--line);
  color: rgba(15,23,42,0.9);
}
.btn--secondary:hover{ background: rgba(2,6,23,0.08); }

.badge{
  padding: 6px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 800;
  color: white;
}
.badge--good{ background: var(--good); }
.badge--warn{ background: var(--warn); }
.badge--bad{ background: var(--bad); }

.decision{
  display:grid;
  grid-template-columns: 220px minmax(0, 1fr);
  gap: 14px;
}
.decision__score{
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 14px;
  background: rgba(255,255,255,0.75);
}
.decision__scoreLabel{ font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); }
.decision__scoreValue{
  margin-top: 8px;
  font-size: 44px;
  font-weight: 900;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
}
.decision__scoreValue--good{ color: var(--good); }
.decision__scoreValue--warn{ color: var(--warn); }
.decision__scoreValue--bad{ color: var(--bad); }
.decision__scoreMeta{ margin-top: 6px; color: var(--muted); font-size: 12px; }

.chips{ display:flex; flex-wrap:wrap; gap: 8px; margin-top: 8px; }
.chip{
  padding: 6px 10px;
  border-radius: 999px;
  background: var(--chip);
  border: 1px solid var(--line);
  font-size: 12px;
  color: rgba(15,23,42,0.8);
}

.metaRow{ margin-top: 14px; display:flex; flex-wrap:wrap; gap: 12px; }
.metaRow__item{ font-size: 12px; color: rgba(2,6,23,0.78); }
.metaRow__muted{ color: var(--muted); margin-left: 6px; }

.review{
  display:grid;
  grid-template-columns: 1.2fr 1fr;
  gap: 14px;
}
.toggle{
  display:flex;
  gap: 8px;
  margin-top: 8px;
}
.toggle__btn{
  flex: 1;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid var(--line);
  background: rgba(255,255,255,0.7);
  cursor: pointer;
  font-weight: 700;
  color: rgba(15,23,42,0.85);
}
.toggle__btn--active{
  border-color: rgba(99,102,241,0.40);
  background: rgba(238,242,255,0.9);
  box-shadow: 0 10px 20px rgba(99,102,241,0.10);
}
.checklist{ margin-top: 10px; display:flex; flex-direction:column; gap: 8px; }
.check{ display:flex; gap: 10px; align-items:center; font-size: 13px; color: rgba(15,23,42,0.85); }
.textarea{
  width: 100%;
  margin-top: 8px;
  border-radius: 12px;
  border: 1px solid var(--line);
  padding: 10px 12px;
  font-size: 13px;
  outline: none;
}
.textarea:focus{ border-color: rgba(99,102,241,0.45); box-shadow: 0 0 0 4px rgba(99,102,241,0.10); }

.miniCard{
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 12px;
  background: rgba(255,255,255,0.7);
}
.miniCard__title{ font-weight: 800; font-size: 12px; color: rgba(15,23,42,0.85); margin-bottom: 8px; }
.code{
  margin: 0;
  font-size: 12px;
  line-height: 1.35;
  padding: 10px;
  border-radius: 12px;
  background: rgba(2,6,23,0.06);
  border: 1px solid var(--line);
  overflow: auto;
  max-height: 260px;
}

.toast{
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px solid rgba(34,211,238,0.35);
  background: rgba(34,211,238,0.10);
  color: rgba(15,23,42,0.9);
  font-weight: 700;
}

.metrics{
  display:flex;
  gap: 14px;
  flex-wrap: wrap;
}
.metric{
  flex: 1;
  min-width: 180px;
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 12px;
  background: rgba(255,255,255,0.7);
}
.metric__label{ font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); }
.metric__value{ margin-top: 6px; font-size: 28px; font-weight: 900; font-variant-numeric: tabular-nums; }

.reasons{ margin-top: 10px; display:flex; flex-direction:column; gap: 10px; }
.reasonRow{
  display:flex;
  align-items:center;
  justify-content: space-between;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid var(--line);
  background: rgba(255,255,255,0.7);
}
.reasonRow__name{ color: rgba(15,23,42,0.85); font-weight: 700; font-size: 13px; }
.reasonRow__count{
  font-variant-numeric: tabular-nums;
  font-weight: 900;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(2,6,23,0.06);
  border: 1px solid var(--line);
}

.muted{ color: var(--muted); font-size: 13px; }
.spacer{ height: 12px; }

/* ---------- Drawer (mobile) ---------- */
.drawer{ display:none; }
.drawer__backdrop{ display:none; }
.drawer__panel{ display:none; }

/* Mobile-only button */
.btn--mobileOnly{ display: none; }

/* ---------- Responsive ---------- */
@media (max-width: 980px){
  .grid{ grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .decision{ grid-template-columns: 1fr; }
  .review{ grid-template-columns: 1fr; }
  .sidebar{ width: 320px; }
}

@media (max-width: 760px){
  .layout{ height: auto; }
  .sidebar--desktop{ display:none; }

  .btn--mobileOnly{ display: inline-flex; align-items:center; justify-content:center; }

  .drawer{ display:block; position: fixed; inset: 0; z-index: 50; pointer-events: none; }
  .drawer__backdrop{
    position:absolute; inset:0;
    background: rgba(2,6,23,0.55);
    opacity: 0;
    transition: opacity 160ms ease;
  }
  .drawer__panel{
    position:absolute; top:0; left:0; height:100%; width: 88%;
    max-width: 360px;
    background: rgba(255,255,255,0.92);
    border-right: 1px solid var(--line);
    padding: 14px;
    transform: translateX(-102%);
    transition: transform 180ms ease;
    overflow-y: auto;
  }
  .drawer__header{
  position: sticky;
  top: 0;
  z-index: 5;

  display: flex;
  justify-content: space-between;
  align-items: center;

  padding: calc(12px + env(safe-area-inset-top)) 0 12px;
  margin-bottom: 10px;

  background: rgba(255,255,255,0.95);
  backdrop-filter: blur(6px);
  border-bottom: 1px solid var(--line);
}

.drawer__header .btn{
  background: rgba(2,6,23,0.06);
  border: 1px solid var(--line);
  color: rgba(15,23,42,0.9);
}

  .drawer--open{ pointer-events: auto; }
  .drawer--open .drawer__backdrop{ opacity: 1; display:block; }
  .drawer--open .drawer__panel{ transform: translateX(0%); display:block; }

  .main{ padding: 14px; }
}
`;
