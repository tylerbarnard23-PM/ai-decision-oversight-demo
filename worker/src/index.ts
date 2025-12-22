export interface Env {
  MODEL_NAME?: string;
  BACKEND?: string;
}

/* ---------- Helpers ---------- */

function cors(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function json(data: unknown, origin: string | null, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...cors(origin),
    },
  });
}

/* ---------- Types ---------- */

type ScoreRequest = {
  case: {
    id?: string;
    type: "transaction" | "content" | "account";
    summary: string;
    amount?: number;
    merchant?: string;
    user_context?: string;
  };
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

type FeedbackRequest = {
  case_id: string;
  reviewer: string;
  action: "Approve" | "Override";
  final_verdict: "Approve" | "Review" | "Reject";
  reason_codes: string[];
  notes?: string;
  original: {
    verdict: "Approve" | "Review" | "Reject";
    risk_score: number;
    confidence: number;
    model: string;
    backend: string;
  };
};

/* ---------- In-memory store (demo only) ---------- */

const STORE_KEY = "__AI_DECISION_STORE__";

type StoredFeedback = FeedbackRequest & {
  received_at: string;
};

type Store = {
  feedback: StoredFeedback[];
};

function getStore(): Store {
  const g = globalThis as any;
  if (!g[STORE_KEY]) {
    g[STORE_KEY] = { feedback: [] } as Store;
  }
  return g[STORE_KEY];
}

/* ---------- Heuristic scoring ---------- */

function scoreCase(input: ScoreRequest["case"]) {
  const text = `${input.summary} ${input.merchant ?? ""} ${input.user_context ?? ""}`.toLowerCase();
  let score = 20;
  const signals: string[] = [];

  if (input.amount && input.amount > 500) {
    score += 25;
    signals.push("high_amount");
  }

  if (text.includes("urgent") || text.includes("immediately")) {
    score += 15;
    signals.push("urgency_language");
  }

  if (text.includes("gift card") || text.includes("wire") || text.includes("crypto")) {
    score += 25;
    signals.push("high_risk_payment");
  }

  if (text.includes("not a scam") || text.includes("trust me")) {
    score += 15;
    signals.push("social_engineering_phrase");
  }

  score = Math.min(100, Math.max(0, score));

  let verdict: ScoreResponse["verdict"] = "Approve";
  if (score >= 70) verdict = "Reject";
  else if (score >= 40) verdict = "Review";

  const confidence = score >= 80 || score <= 20 ? 0.85 : 0.65;

  return { score, verdict, confidence, signals };
}

/* ---------- Worker ---------- */

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get("Origin");
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors(origin) });
    }

    /* ---- Health ---- */
    if (request.method === "GET" && url.pathname === "/") {
      return json(
        {
          ok: true,
          service: "AI Decision Oversight Demo",
          endpoints: ["/score", "/feedback", "/analytics"],
        },
        origin
      );
    }

    /* ---- Score ---- */
    if (request.method === "POST" && url.pathname === "/score") {
      const body = (await request.json()) as ScoreRequest;

      if (!body?.case?.summary || !body.case.type) {
        return json({ error: "Missing required fields" }, origin, 400);
      }

      const case_id = body.case.id ?? crypto.randomUUID();
      const { score, verdict, confidence, signals } = scoreCase(body.case);

      const response: ScoreResponse = {
        case_id,
        risk_score: score,
        verdict,
        confidence,
        rationale: "Heuristic risk evaluation for demo purposes.",
        signals,
        model: env.MODEL_NAME ?? "heuristic-mvp",
        backend: env.BACKEND ?? "local",
        timestamp: new Date().toISOString(),
      };

      return json(response, origin);
    }

    /* ---- Feedback ---- */
    if (request.method === "POST" && url.pathname === "/feedback") {
      const body = (await request.json()) as FeedbackRequest;

      if (!body.case_id || !body.reviewer || !body.final_verdict) {
        return json({ error: "Invalid feedback payload" }, origin, 400);
      }

      const store = getStore();
      store.feedback.push({
        ...body,
        received_at: new Date().toISOString(),
      });

      return json({ ok: true }, origin);
    }

    /* ---- Analytics ---- */
    if (request.method === "GET" && url.pathname === "/analytics") {
      const store = getStore();
      const total = store.feedback.length;
      const overrides = store.feedback.filter((f) => f.action === "Override").length;

      const reasons: Record<string, number> = {};
      for (const f of store.feedback) {
        for (const r of f.reason_codes ?? []) {
          reasons[r] = (reasons[r] ?? 0) + 1;
        }
      }

      return json(
        {
          total_feedback: total,
          override_rate: total ? Number((overrides / total).toFixed(2)) : 0,
          top_reasons: Object.entries(reasons)
            .sort((a, b) => b[1] - a[1])
            .map(([reason, count]) => ({ reason, count })),
        },
        origin
      );
    }

    return json({ error: "Not found" }, origin, 404);
  },
};
