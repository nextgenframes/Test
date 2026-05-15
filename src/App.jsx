import React, { useEffect, useMemo, useState } from 'react';

      const bobMode = [
        "Bob Mode: Triage Partner",
        "Full repository context available.",
        "Translate alerts, identify likely code area, surface recent commits, list first checks.",
        "Fast, specific, never vague."
      ].join("\n");

      const demoAlerts = [
        {
          id: "inc-checkout-001",
          title: "Checkout latency over 2s",
          service: "checkout-service",
          severity: "Critical",
          raw_alert:
            "CRITICAL p99_latency_checkout_service > 2000ms for 8m. Region us-east-1. Error budget burn 14x. Recent deploy checkout-api@9f31c22.",
          notes: [
            { by: "Maya", text: "Confirmed spike starts two minutes after deploy 9f31c22. Rollback is available." },
            { by: "Bob", text: "Likely path: checkout-service/src/payments/authorize.ts. New retry wrapper can multiply provider calls." }
          ]
        },
        {
          id: "inc-cart-002",
          title: "Cart service 5xx surge",
          service: "cart-service",
          severity: "High",
          raw_alert:
            "HIGH cart_service_http_5xx_rate > 4% for 12m. Pod restarts increased. Redis command timeout p95=900ms.",
          notes: [
            { by: "Jon", text: "Redis cluster CPU is 88%. App restart loop only affects checkout-cart-worker." },
            { by: "Bob", text: "Compare cache connection pool settings in cart-service/src/cache/client.ts." }
          ]
        },
        {
          id: "inc-webhook-003",
          title: "Payment webhook backlog",
          service: "payments-webhooks",
          severity: "Medium",
          raw_alert:
            "MEDIUM payments_webhook_queue_depth > 18000 for 20m. Worker success rate 92%. Dead letter count flat.",
          notes: [
            { by: "Ari", text: "Third-party provider delivered delayed batch. Queue is draining slowly." }
          ]
        }
      ];

      const blankBrief = {
        severity: "Medium",
        confidence: 0,
        plain_english: "Paste a production alert and Bob will turn it into a first-response brief.",
        affected_area: "Waiting for alert context.",
        service: "Unknown",
        likely_files: [],
        commits: [],
        first_response_steps: [],
        risks: [],
        handoff_note: "No active triage yet.",
        bob_actions: []
      };

      function seededBrief(alert) {
        const raw = alert.raw_alert || "";
        const service = alert.service || inferService(raw);
        const critical = /critical|burn|p99|checkout/i.test(raw);
        const high = /high|5xx|timeout|restart/i.test(raw);
        const severity = critical ? "Critical" : high ? "High" : "Medium";
        const fileBase = service.replace(/_/g, "-");
        return {
          severity,
          confidence: critical ? 0.86 : high ? 0.74 : 0.62,
          plain_english: critical
            ? "Customers are likely waiting too long or failing during checkout, and the issue started close to a recent deploy."
            : high
              ? "A production service is returning elevated errors and needs quick isolation before the blast radius grows."
              : "A queue or background workflow is unhealthy but still moving, so this is a controlled investigation unless it worsens.",
          affected_area: `${service} request path and the most recent deployment touching latency, retries, or queue handling.`,
          service,
          likely_files: [
            `${fileBase}/src/routes/checkout.ts`,
            `${fileBase}/src/payments/authorize.ts`,
            `${fileBase}/src/lib/retry-policy.ts`
          ],
          commits: [
            { hash: "9f31c22", message: "Tune payment authorization retry wrapper", author: "riley" },
            { hash: "4ab8d90", message: "Add checkout latency dashboard dimensions", author: "sam" },
            { hash: "16de45a", message: "Refactor provider timeout handling", author: "maya" }
          ],
          first_response_steps: [
            "Confirm whether the symptom began immediately after the latest deploy.",
            "Check the affected service dashboard for latency, error rate, and dependency saturation.",
            "Prepare rollback or feature-flag disablement while one teammate captures logs."
          ],
          risks: [
            "Retries may be amplifying traffic to a dependency.",
            "A rollback may hide evidence unless logs are captured first.",
            "Customer-facing checkout errors should page payments and support in parallel."
          ],
          handoff_note: "Current lead theory is a recent checkout change affecting dependency calls. Preserve deploy timing, owner, rollback status, and any customer impact numbers.",
          bob_actions: [
            "Translated alert into plain English",
            "Mapped alert terms to likely service and files",
            "Selected the last three relevant commits",
            "Drafted the first three response checks"
          ]
        };
      }

      function inferService(raw) {
        const match = raw.match(/([a-z][a-z0-9_-]+)_(service|api|worker|queue|webhook)/i);
        if (match) return match[0].replace(/_/g, "-");
        if (/checkout/i.test(raw)) return "checkout-service";
        if (/cart/i.test(raw)) return "cart-service";
        if (/payment|webhook/i.test(raw)) return "payments-webhooks";
        return "unknown-service";
      }

      function App() {
        const seeded = demoAlerts.map((item) => ({ ...item, brief: seededBrief(item), updated: "demo seed" }));
        const [incidents, setIncidents] = useState(seeded);
        const [activeId, setActiveId] = useState(seeded[0].id);
        const [activeTab, setActiveTab] = useState("translator");
        const [status, setStatus] = useState(null);
        const [form, setForm] = useState({
          title: "Checkout latency over 2s",
          service: "checkout-service",
          raw_alert: demoAlerts[0].raw_alert
        });
        const [result, setResult] = useState(seeded[0].brief);
        const [note, setNote] = useState("");
        const [selected, setSelected] = useState(() => new Set(seeded.map((item) => item.id)));
        const [diff, setDiff] = useState("diff --git a/checkout-service/src/payments/authorize.ts b/checkout-service/src/payments/authorize.ts\n+ const retryCount = flags.fastProviderRetry ? 3 : 1;\n+ await provider.authorize(order, { timeoutMs: 1800, retryCount });");
        const [loading, setLoading] = useState(false);
        const [error, setError] = useState("");
        const [copied, setCopied] = useState("");
        const [log, setLog] = useState([
          { title: "Bob re-briefed active incident", detail: "Loaded checkout latency context and prior notes.", time: "just now" },
          { title: "Repo context scanned", detail: "Matched alert language to checkout-service files and deploy history.", time: "demo seed" }
        ]);

        const activeIncident = incidents.find((item) => item.id === activeId) || incidents[0];

        useEffect(() => {
          refresh();
        }, []);

        useEffect(() => {
          if (!activeIncident) return;
          setResult(activeIncident.brief || blankBrief);
          setForm({
            title: activeIncident.title,
            service: activeIncident.service,
            raw_alert: activeIncident.raw_alert
          });
        }, [activeId]);

        async function refresh() {
          try {
            const response = await fetch("/api/av-triage?limit=6");
            const data = await response.json();
            setStatus(data.status || null);
          } catch (err) {
            setStatus({ qwen_ready: false, supabase_ready: false, fallback_ready: true });
          }
        }

        function pushLog(title, detail) {
          setLog((current) => [{ title, detail, time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }, ...current].slice(0, 12));
        }

        async function runTranslator(event) {
          event.preventDefault();
          setLoading(true);
          setError("");
          pushLog("Alert received", "Bob started translating raw monitor output into a response brief.");

          try {
            const response = await fetch("/api/av-triage", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(form)
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || "Bob could not triage that alert.");
            const brief = data.triage || seededBrief(form);
            const incident = {
              id: activeIncident && activeIncident.title === form.title ? activeIncident.id : `inc-${Date.now()}`,
              title: form.title || "Untitled incident",
              service: brief.service || form.service || inferService(form.raw_alert),
              severity: brief.severity,
              raw_alert: form.raw_alert,
              brief,
              notes: activeIncident && activeIncident.title === form.title ? activeIncident.notes : [],
              updated: "just now"
            };
            setResult(brief);
            setIncidents((current) => [incident, ...current.filter((item) => item.id !== incident.id)].slice(0, 8));
            setActiveId(incident.id);
            setSelected((current) => new Set([...Array.from(current), incident.id]));
            setStatus(data.status || status);
            (brief.bob_actions || []).forEach((action) => pushLog(action, incident.title));
          } catch (err) {
            const brief = seededBrief(form);
            setResult(brief);
            pushLog("Fallback brief generated", "No provider response was available, so Bob used the local triage playbook.");
            setError(err.message || String(err));
          } finally {
            setLoading(false);
          }
        }

        function addNote() {
          const clean = note.trim();
          if (!clean || !activeIncident) return;
          setIncidents((current) =>
            current.map((item) =>
              item.id === activeIncident.id
                ? { ...item, notes: [...(item.notes || []), { by: "You", text: clean }], updated: "just now" }
                : item
            )
          );
          setNote("");
          pushLog("Shift Brain updated", `Stored a new investigation note for ${activeIncident.title}.`);
        }

        function copyHandoff() {
          const text = handoffMarkdown;
          navigator.clipboard.writeText(text).then(() => setCopied("Copied handoff"));
          pushLog("Handoff copied", "Bob generated a structured end-of-shift summary.");
        }

        function downloadHandoff() {
          const blob = new Blob([handoffMarkdown], { type: "text/markdown" });
          const url = URL.createObjectURL(blob);
          const anchor = document.createElement("a");
          anchor.href = url;
          anchor.download = "bob-on-call-handoff.md";
          anchor.click();
          URL.revokeObjectURL(url);
          pushLog("Handoff downloaded", "Markdown incident handoff exported.");
        }

        function toggleSelected(id) {
          setSelected((current) => {
            const next = new Set(Array.from(current));
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
          });
        }

        const handoffIncidents = useMemo(
          () => incidents.filter((item) => selected.has(item.id)),
          [incidents, selected]
        );

        const handoffMarkdown = useMemo(() => buildHandoff(handoffIncidents), [handoffIncidents]);
        const radar = useMemo(() => runRadar(diff, incidents), [diff, incidents]);

        return React.createElement(
          "main",
          { className: "app" },
          React.createElement(Header, { status }),
          React.createElement(
            "section",
            { className: "workspace" },
            React.createElement(
              "div",
              { className: "main" },
              React.createElement(
                "div",
                { className: "sandbox-head" },
                React.createElement("div", null, React.createElement("span", { className: "eyebrow" }, "TRIAGE SANDBOX"), React.createElement("h2", null, "Incident Visualizer")),
                React.createElement(Tabs, { activeTab, setActiveTab })
              ),
              React.createElement(Brief, { result }),
              activeTab === "translator"
                ? React.createElement(Translator, { form, setForm, runTranslator, loading, error })
                : null,
              activeTab === "brain"
                ? React.createElement(ShiftBrain, { incident: activeIncident, note, setNote, addNote })
                : null,
              activeTab === "handoff"
                ? React.createElement(Handoff, { incidents, selected, toggleSelected, markdown: handoffMarkdown, copyHandoff, downloadHandoff, copied })
                : null,
              activeTab === "radar"
                ? React.createElement(RegressionRadar, { diff, setDiff, radar })
                : null,
              React.createElement(BriefDetails, { result })
            ),
            React.createElement(
              "div",
              { className: "side-stack" },
              React.createElement(IncidentRail, { incidents, activeId, setActiveId }),
              React.createElement(ActionRail, { log })
            )
          )
        );
      }

      function Header({ status }) {
        const modelReady = Boolean(status && status.qwen_ready);
        const dbReady = Boolean(status && status.supabase_ready);
        return React.createElement(
          "header",
          { className: "topbar" },
          React.createElement(
            "div",
            { className: "brand" },
            React.createElement(
              "div",
              null,
              React.createElement("h1", null, "Triage Bob"),
              React.createElement("p", { className: "subhead" }, "On-call response console")
            )
          ),
          React.createElement(
            "div",
            { className: "status-row" },
            React.createElement("span", { className: "pill mode-pill" }, "♪ Performance Mode"),
            React.createElement("span", { className: `pill ${modelReady ? "ready" : ""}` }, modelReady ? "Model ready" : "Local fallback ready"),
            React.createElement("span", { className: "pill ready" }, "Triage Partner mode"),
            React.createElement("span", { className: `pill ${dbReady ? "ready" : ""}` }, dbReady ? "Supabase ready" : "Local shift memory")
          )
        );
      }

      function Tabs({ activeTab, setActiveTab }) {
        const tabs = [
          ["translator", "Alert Translator"],
          ["brain", "Shift Brain"],
          ["handoff", "Handoff Generator"],
          ["radar", "Regression Radar"]
        ];
        return React.createElement(
          "nav",
          { className: "tabs" },
          tabs.map(([id, label]) =>
            React.createElement("button", { key: id, className: `tab ${activeTab === id ? "active" : ""}`, onClick: () => setActiveTab(id) }, label)
          )
        );
      }

      function IncidentRail({ incidents, activeId, setActiveId }) {
        return React.createElement(
          "aside",
          { className: "panel" },
          React.createElement(
            "div",
            { className: "panel-title" },
            React.createElement("h2", null, "Open incidents"),
            React.createElement("span", { className: "pill" }, `${incidents.length} active`)
          ),
          React.createElement(
            "div",
            { className: "incident-list" },
            incidents.map((item) =>
              React.createElement(
                "button",
                { className: `incident-card ${activeId === item.id ? "active" : ""}`, key: item.id, onClick: () => setActiveId(item.id) },
                React.createElement("div", { className: `dot ${item.severity}` }),
                React.createElement("div", null, React.createElement("strong", null, item.title), React.createElement("span", null, `${item.service} · ${item.updated}`)),
                React.createElement("span", { className: `severity ${item.severity}` }, item.severity)
              )
            )
          )
        );
      }

      function Translator({ form, setForm, runTranslator, loading, error }) {
        return React.createElement(
          "form",
          { className: "panel", onSubmit: runTranslator },
          React.createElement(
            "div",
            { className: "panel-title" },
            React.createElement("h2", null, "Alert Translator"),
            React.createElement("span", { className: "pill" }, "60-second brief")
          ),
          React.createElement(
            "div",
            { className: "form-grid" },
            React.createElement(
              "div",
              { className: "grid-two" },
              React.createElement(Field, { label: "Incident title", value: form.title, onChange: (value) => setForm({ ...form, title: value }) }),
              React.createElement(Field, { label: "Likely service", value: form.service, onChange: (value) => setForm({ ...form, service: value }) })
            ),
            React.createElement(
              "div",
              null,
              React.createElement("label", null, "Raw monitoring alert"),
              React.createElement("textarea", { value: form.raw_alert, onChange: (event) => setForm({ ...form, raw_alert: event.target.value }) })
            ),
            React.createElement(
              "div",
              { className: "button-row" },
              React.createElement("button", { className: "primary", type: "submit", disabled: loading }, loading ? "Bob is triaging..." : "Ask Bob for first response"),
              React.createElement(
                "button",
                {
                  className: "secondary",
                  type: "button",
                  onClick: () => setForm({ title: demoAlerts[0].title, service: demoAlerts[0].service, raw_alert: demoAlerts[0].raw_alert })
                },
                "Load demo"
              )
            ),
            error ? React.createElement("div", { className: "error" }, error) : null
          )
        );
      }

      function Field({ label, value, onChange }) {
        return React.createElement(
          "div",
          null,
          React.createElement("label", null, label),
          React.createElement("input", { value, onChange: (event) => onChange(event.target.value) })
        );
      }

      function Brief({ result }) {
        const confidence = Math.round((result.confidence || 0) * 100);
        return React.createElement(
          "article",
          { className: "brief" },
          React.createElement(
            "div",
            { className: "brief-status" },
            React.createElement("span", { className: `severity ${result.severity}` }, result.severity)
          ),
          React.createElement(
            "div",
            { className: "brief-head" },
            React.createElement(
              "div",
              { className: "signal" },
              React.createElement(
                "div",
                { className: "av-vehicle", "aria-label": "3D autonomous vehicle visual" },
                React.createElement("div", { className: "road-haze" }),
                React.createElement("div", { className: "road-grid" }),
                React.createElement("div", { className: "crosswalk crosswalk-near" }),
                React.createElement("div", { className: "crosswalk crosswalk-far" }),
                React.createElement("div", { className: "lane lane-left" }),
                React.createElement("div", { className: "lane lane-center" }),
                React.createElement("div", { className: "lane lane-right" }),
                React.createElement("div", { className: "sensor-ray ray-cyan-left" }),
                React.createElement("div", { className: "sensor-ray ray-cyan-right" }),
                React.createElement("div", { className: "sensor-ray ray-green-left" }),
                React.createElement("div", { className: "sensor-ray ray-green-right" }),
                React.createElement("div", { className: "sensor-ray ray-yellow-left" }),
                React.createElement("div", { className: "sensor-ray ray-pink-right" }),
                React.createElement("div", { className: "detected detected-car detected-car-left" }),
                React.createElement("div", { className: "detected detected-car detected-car-center" }),
                React.createElement("div", { className: "detected detected-car detected-car-right" }),
                React.createElement("div", { className: "detected detected-bus" }),
                React.createElement("div", { className: "detected-person person-left" }),
                React.createElement("div", { className: "detected-person person-right" }),
                React.createElement("div", { className: "traffic-post post-left" }),
                React.createElement("div", { className: "traffic-post post-right" }),
                React.createElement("div", { className: "ego-car" }),
                React.createElement("div", { className: "av-confidence" }, React.createElement("strong", null, confidence), React.createElement("span", null, "confidence"))
              )
            ),
            React.createElement(
              "div",
              { className: "brief-copy" },
              React.createElement(
                "div",
                { className: "brief-narrative" },
                React.createElement("h2", null, result.plain_english),
                React.createElement("p", null, result.handoff_note)
              ),
              React.createElement(
                "div",
                { className: "metric-strip" },
                React.createElement(Metric, { label: "Affected area", value: result.affected_area }),
                React.createElement(Metric, { label: "Service", value: result.service }),
                React.createElement(Metric, { label: "First move", value: result.first_response_steps[0] || "Awaiting alert" })
              )
            )
          )
        );
      }

      function Metric({ label, value }) {
        return React.createElement("div", { className: "metric" }, React.createElement("span", null, label), React.createElement("strong", null, value));
      }

      function BriefDetails({ result }) {
        return React.createElement(
          "section",
          { className: "content-grid" },
          React.createElement(ListPanel, { title: "First 3 checks", items: result.first_response_steps, ordered: true }),
          React.createElement(ListPanel, { title: "Risk watch", items: result.risks }),
          React.createElement(ListPanel, { title: "Likely files", items: result.likely_files }),
          React.createElement(
            "div",
            { className: "list-panel" },
            React.createElement("h3", null, "Last relevant commits"),
            React.createElement(
              "div",
              { className: "commits" },
              result.commits.length
                ? result.commits.map((commit) =>
                    React.createElement(
                      "div",
                      { className: "commit", key: commit.hash },
                      React.createElement("strong", null, `${commit.hash} · ${commit.message}`),
                      React.createElement("span", null, commit.author)
                    )
                  )
                : React.createElement("p", { className: "subhead" }, "No commits surfaced yet.")
            )
          )
        );
      }

      function ListPanel({ title, items, ordered }) {
        const Tag = ordered ? "ol" : "ul";
        return React.createElement(
          "div",
          { className: "list-panel" },
          React.createElement("h3", null, title),
          items && items.length
            ? React.createElement(Tag, null, items.map((item, index) => React.createElement("li", { key: `${title}-${index}` }, item)))
            : React.createElement("p", { className: "subhead" }, "Bob has not added anything here yet.")
        );
      }

      function ShiftBrain({ incident, note, setNote, addNote }) {
        const notes = incident.notes || [];
        return React.createElement(
          "section",
          { className: "brain" },
          React.createElement(
            "div",
            { className: "panel-title" },
            React.createElement("h2", null, "Shift Brain"),
            React.createElement("span", { className: "pill" }, "Instant re-brief")
          ),
          React.createElement("p", { className: "body-copy" }, incident.brief.handoff_note),
          React.createElement(
            "div",
            { className: "notes-grid", style: { marginTop: "15px" } },
            React.createElement(
              "div",
              null,
              notes.map((item, index) =>
                React.createElement("div", { className: "note-card", key: `${item.by}-${index}` }, React.createElement("strong", null, item.by), React.createElement("p", null, item.text))
              )
            ),
            React.createElement(
              "div",
              null,
              React.createElement("label", null, "Add investigation note"),
              React.createElement("textarea", { value: note, onChange: (event) => setNote(event.target.value), placeholder: "What did you check? What changed?" }),
              React.createElement("button", { className: "primary", type: "button", style: { width: "100%", marginTop: "9px" }, onClick: addNote }, "Save note")
            )
          )
        );
      }

      function Handoff({ incidents, selected, toggleSelected, markdown, copyHandoff, downloadHandoff, copied }) {
        return React.createElement(
          "section",
          { className: "handoff" },
          React.createElement(
            "div",
            { className: "panel-title" },
            React.createElement("h2", null, "Handoff Generator"),
            React.createElement("span", { className: "pill" }, "Markdown output")
          ),
          React.createElement(
            "div",
            { className: "handoff-layout" },
            React.createElement(
              "div",
              null,
              React.createElement(
                "div",
                { className: "check-list" },
                incidents.map((item) =>
                  React.createElement(
                    "label",
                    { className: "check-row", key: item.id },
                    React.createElement("input", { type: "checkbox", checked: selected.has(item.id), onChange: () => toggleSelected(item.id) }),
                    React.createElement("span", null, `${item.title} · ${item.severity}`)
                  )
                )
              ),
              React.createElement(
                "div",
                { className: "button-row", style: { marginTop: "14px" } },
                React.createElement("button", { className: "primary", type: "button", onClick: copyHandoff }, copied || "Copy"),
                React.createElement("button", { className: "secondary", type: "button", onClick: downloadHandoff }, "Download")
              )
            ),
            React.createElement("textarea", { className: "markdown", value: markdown, readOnly: true })
          )
        );
      }

      function RegressionRadar({ diff, setDiff, radar }) {
        return React.createElement(
          "section",
          { className: "radar" },
          React.createElement(
            "div",
            { className: "panel-title" },
            React.createElement("h2", null, "Regression Radar"),
            React.createElement("span", { className: `severity ${radar.severity}` }, radar.severity)
          ),
          React.createElement("label", null, "Paste PR diff"),
          React.createElement("textarea", { value: diff, onChange: (event) => setDiff(event.target.value), style: { minHeight: "170px" } }),
          React.createElement("div", { className: "metric-strip" },
            React.createElement(Metric, { label: "Matched incident area", value: radar.area }),
            React.createElement(Metric, { label: "Risk", value: radar.reason }),
            React.createElement(Metric, { label: "Suggested guardrail", value: radar.guardrail })
          )
        );
      }

      function ActionRail({ log }) {
        return React.createElement(
          "aside",
          { className: "rail" },
          React.createElement(
            "div",
            { className: "mode-card" },
            React.createElement(
              "div",
              { className: "panel-title" },
              React.createElement("h3", null, "Custom Bob Mode"),
              React.createElement("span", { className: "pill ready" }, "visible")
            ),
            React.createElement("code", null, bobMode)
          ),
          React.createElement(
            "div",
            null,
            React.createElement(
              "div",
              { className: "panel-title" },
              React.createElement("h3", null, "Bob actions"),
              React.createElement("span", { className: "pill" }, "live log")
            ),
            React.createElement(
              "div",
              { className: "log" },
              log.map((item, index) =>
                React.createElement("div", { className: "log-row", key: `${item.title}-${index}` }, React.createElement("strong", null, item.title), React.createElement("span", null, `${item.detail} · ${item.time}`))
              )
            )
          )
        );
      }

      function buildHandoff(incidents) {
        if (!incidents.length) return "# Bob on Call Handoff\n\nNo incidents selected.";
        const lines = [
          "# Bob on Call Handoff",
          "",
          `Generated: ${new Date().toLocaleString()}`,
          "",
          "## Shift Summary",
          `${incidents.length} open incident${incidents.length === 1 ? "" : "s"} selected for handoff. Critical customer paths should be reviewed first.`,
          ""
        ];
        incidents.forEach((incident) => {
          const brief = incident.brief || blankBrief;
          lines.push(`## ${incident.title}`);
          lines.push(`Severity: ${brief.severity}`);
          lines.push(`Service: ${brief.service}`);
          lines.push(`Plain English: ${brief.plain_english}`);
          lines.push(`Affected Area: ${brief.affected_area}`);
          lines.push("");
          lines.push("First checks:");
          (brief.first_response_steps || []).forEach((step, index) => lines.push(`${index + 1}. ${step}`));
          lines.push("");
          lines.push("Notes:");
          (incident.notes || []).forEach((note) => lines.push(`- ${note.by}: ${note.text}`));
          lines.push("");
        });
        return lines.join("\n");
      }

      function runRadar(diff, incidents) {
        const lower = diff.toLowerCase();
        const checkoutMatch = lower.includes("checkout") || lower.includes("authorize") || lower.includes("retry");
        const cartMatch = lower.includes("cart") || lower.includes("redis") || lower.includes("cache");
        if (checkoutMatch) {
          return {
            severity: "High",
            area: "checkout-service payments path",
            reason: "Diff touches retry or authorization code connected to the current checkout latency incident.",
            guardrail: "Require latency canary and provider-call count check before merge."
          };
        }
        if (cartMatch) {
          return {
            severity: "Medium",
            area: "cart-service cache layer",
            reason: "Diff overlaps an open incident involving Redis timeouts and 5xx errors.",
            guardrail: "Run cache timeout regression test and compare pool saturation."
          };
        }
        return {
          severity: incidents.some((item) => item.severity === "Critical") ? "Low" : "Medium",
          area: "No direct overlap found",
          reason: "Bob did not match the diff against active incident files.",
          guardrail: "Run normal deploy checks and monitor the active incident dashboard."
        };
      }

export default App;
