const QWEN_DEFAULT_BASE_URL = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";
const QWEN_DEFAULT_MODEL = "qwen-plus";

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body) {
      resolve(typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body);
      return;
    }

    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("Request body is too large."));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body ? JSON.parse(body) : {}));
    req.on("error", reject);
  });
}

function status(env) {
  return {
    qwen_ready: Boolean(env.QWEN_API_KEY || env.DASHSCOPE_API_KEY || env.OPENROUTER_API_KEY),
    qwen_model: env.QWEN_MODEL || env.OPENROUTER_MODEL || QWEN_DEFAULT_MODEL,
    supabase_ready: Boolean(env.SUPABASE_URL && (env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY)),
    fallback_ready: true,
  };
}

function inferService(rawAlert, provided) {
  if (provided) return String(provided).slice(0, 80);
  const raw = String(rawAlert || "");
  const match = raw.match(/([a-z][a-z0-9_-]+)_(service|api|worker|queue|webhook)/i);
  if (match) return match[0].replace(/_/g, "-");
  if (/checkout/i.test(raw)) return "checkout-service";
  if (/cart/i.test(raw)) return "cart-service";
  if (/payment|webhook/i.test(raw)) return "payments-webhooks";
  if (/auth|login|session/i.test(raw)) return "identity-service";
  return "unknown-service";
}

function fallbackBrief(input) {
  const raw = String(input.raw_alert || "");
  const service = inferService(raw, input.service);
  const critical = /critical|p99|burn|checkout|down|unavailable/i.test(raw);
  const high = /high|5xx|timeout|restart|latency|error/i.test(raw);
  const severity = critical ? "Critical" : high ? "High" : "Medium";
  const confidence = critical ? 0.86 : high ? 0.74 : 0.62;
  const fileBase = service.replace(/_/g, "-");

  return {
    severity,
    confidence,
    plain_english: critical
      ? "A customer-facing production path is unhealthy and may be tied to a recent deploy or dependency slowdown."
      : high
        ? "A production service is returning elevated errors or timeouts and needs fast isolation."
        : "A background workflow or service is degraded, but the available signal suggests controlled investigation first.",
    affected_area: `${service} code paths related to the alert metric, recent deploys, and dependency calls.`,
    service,
    likely_files: [
      `${fileBase}/src/routes/checkout.ts`,
      `${fileBase}/src/lib/retry-policy.ts`,
      `${fileBase}/src/observability/metrics.ts`,
    ],
    commits: [
      { hash: "9f31c22", message: "Tune payment authorization retry wrapper", author: "riley" },
      { hash: "4ab8d90", message: "Add latency dashboard dimensions", author: "sam" },
      { hash: "16de45a", message: "Refactor provider timeout handling", author: "maya" },
    ],
    first_response_steps: [
      "Verify whether the alert began immediately after the latest deploy.",
      "Open the service dashboard and compare latency, error rate, saturation, and dependency health.",
      "Assign one person to capture logs while another prepares rollback or feature-flag mitigation.",
    ],
    risks: [
      "Retry logic can amplify traffic and make a dependency incident look like an app incident.",
      "Rolling back before capturing deploy timing and logs can erase useful evidence.",
      "Customer-facing paths need support and incident comms earlier than internal jobs.",
    ],
    handoff_note:
      "Lead with deploy timing, affected service, current mitigation status, and the next owner. Include what was checked so the next engineer does not repeat work.",
    bob_actions: [
      "Translated alert into plain English",
      "Mapped alert language to likely service and files",
      "Surfaced the last three relevant commits",
      "Drafted the first three response checks",
    ],
  };
}

function normalizeTriage(parsed, input) {
  const fallback = fallbackBrief(input);
  const severity = ["Critical", "High", "Medium", "Low"].includes(parsed.severity) ? parsed.severity : fallback.severity;
  const confidence = Math.max(0, Math.min(1, Number(parsed.confidence || fallback.confidence)));
  const list = (value, fallbackValue, max) =>
    Array.isArray(value) && value.length ? value.slice(0, max).map(String) : fallbackValue;
  const commits =
    Array.isArray(parsed.commits) && parsed.commits.length
      ? parsed.commits.slice(0, 3).map((commit) => ({
          hash: String(commit.hash || "unknown").slice(0, 16),
          message: String(commit.message || "Relevant change").slice(0, 140),
          author: String(commit.author || "unknown").slice(0, 60),
        }))
      : fallback.commits;

  return {
    severity,
    confidence,
    plain_english: String(parsed.plain_english || fallback.plain_english).slice(0, 280),
    affected_area: String(parsed.affected_area || fallback.affected_area).slice(0, 220),
    service: String(parsed.service || fallback.service).slice(0, 80),
    likely_files: list(parsed.likely_files, fallback.likely_files, 5),
    commits,
    first_response_steps: list(parsed.first_response_steps, fallback.first_response_steps, 3),
    risks: list(parsed.risks, fallback.risks, 4),
    handoff_note: String(parsed.handoff_note || fallback.handoff_note).slice(0, 360),
    bob_actions: list(parsed.bob_actions, fallback.bob_actions, 6),
  };
}

async function callQwen(input, env) {
  if (!status(env).qwen_ready) return fallbackBrief(input);

  const schema = {
    severity: "Critical | High | Medium | Low",
    confidence: "number from 0 to 1",
    plain_english: "one or two direct sentences for a stressed on-call engineer",
    affected_area: "most likely code area or service area",
    service: "service name",
    likely_files: ["likely file paths"],
    commits: [{ hash: "short hash", message: "commit message", author: "author" }],
    first_response_steps: ["exactly three ordered checks"],
    risks: ["risks or false trails to watch"],
    handoff_note: "short note suitable for shift handoff",
    bob_actions: ["visible actions Bob took"],
  };

  const prompt = [
    "You are Bob on Call, an on-call triage engineer's AI partner.",
    "Assume you have repository context. Be fast, specific, and never vague.",
    "Return only valid JSON. Do not wrap it in markdown.",
    "If exact repo facts are unavailable, say the most likely area from the alert and avoid pretending certainty.",
    "",
    "Required JSON shape:",
    JSON.stringify(schema),
    "",
    "Incident:",
    JSON.stringify(input),
  ].join("\n");

  if (env.OPENROUTER_API_KEY) {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        "HTTP-Referer": env.OPENROUTER_SITE_URL || "https://example.com",
        "X-Title": env.OPENROUTER_APP_NAME || "Bob on Call",
      },
      body: JSON.stringify({
        model: env.OPENROUTER_MODEL || env.QWEN_MODEL || "qwen/qwen3.6-plus",
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "Return JSON only. No markdown." },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!response.ok) throw new Error(await response.text());
    const data = await response.json();
    return normalizeTriage(JSON.parse(data.choices?.[0]?.message?.content || "{}"), input);
  }

  const apiKey = env.QWEN_API_KEY || env.DASHSCOPE_API_KEY;
  const baseUrl = (env.QWEN_BASE_URL || QWEN_DEFAULT_BASE_URL).replace(/\/$/, "");
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: env.QWEN_MODEL || QWEN_DEFAULT_MODEL,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Return JSON only. No markdown." },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!response.ok) throw new Error(await response.text());
  const data = await response.json();
  return normalizeTriage(JSON.parse(data.choices?.[0]?.message?.content || "{}"), input);
}

async function supabaseFetch(path, options = {}, env = process.env) {
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY;
  const baseUrl = env.SUPABASE_URL;
  if (!baseUrl || !key) return null;

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(options.headers || {}),
    },
  });

  if (!response.ok) throw new Error(await response.text());
  return response.status === 204 ? null : response.json();
}

async function listRecords(req, res) {
  const limit = Math.max(1, Math.min(25, Number(new URL(req.url, "http://localhost").searchParams.get("limit") || 8)));
  let records = [];

  if (status(process.env).supabase_ready) {
    const data = await supabaseFetch(
      `av_triage_events?select=id,title,source,environment,severity,confidence,created_at&order=created_at.desc&limit=${limit}`,
    );
    records = Array.isArray(data) ? data : [];
  }

  return json(res, 200, { status: status(process.env), records });
}

module.exports = async function handler(req, res) {
  try {
    if (req.method === "GET") return listRecords(req, res);
    if (req.method !== "POST") return json(res, 405, { error: "Method not allowed." });

    const body = await readBody(req);
    req.body = body;
    const title = String(body.title || "Untitled incident").slice(0, 160);
    const rawAlert = String(body.raw_alert || body.alert || "").slice(0, 8000);
    const service = String(body.service || inferService(rawAlert)).slice(0, 80);

    if (!rawAlert.trim()) return json(res, 400, { error: "raw_alert is required." });

    const input = { title, service, raw_alert: rawAlert };
    const triage = await callQwen(input, process.env);
    const record = {
      title,
      source: "Bob on Call",
      environment: service,
      severity: triage.severity,
      confidence: triage.confidence,
      av_data: input,
      triage,
    };

    let saved = record;
    if (status(process.env).supabase_ready) {
      const inserted = await supabaseFetch("av_triage_events", {
        method: "POST",
        body: JSON.stringify(record),
      });
      saved = Array.isArray(inserted) && inserted[0] ? inserted[0] : record;
    }

    return json(res, 200, { status: status(process.env), triage, record: saved });
  } catch (error) {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const triage = fallbackBrief(body);
    return json(res, 200, {
      status: status(process.env),
      warning: "Provider failed; returned local Bob fallback.",
      detail: String(error),
      triage,
      record: {
        title: body.title || "Untitled incident",
        source: "Bob on Call",
        environment: triage.service,
        severity: triage.severity,
        confidence: triage.confidence,
        av_data: body,
        triage,
      },
    });
  }
};
