const OPENAI_URL = "https://api.openai.com/v1/responses";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function extractText(response) {
  if (typeof response.output_text === "string" && response.output_text.trim()) {
    return response.output_text;
  }

  const parts = [];
  for (const item of response.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && content.text) parts.push(content.text);
    }
  }
  return parts.join("\n");
}

async function callProvider(prompt, schema, env) {
  if (env.OPENROUTER_API_KEY) {
    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        "HTTP-Referer": env.OPENROUTER_SITE_URL || "https://example.com",
        "X-Title": env.OPENROUTER_APP_NAME || "Career Match",
      },
      body: JSON.stringify({
        model: env.OPENROUTER_MODEL || "openrouter/free",
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "Return only valid JSON matching the user's requested schema. Do not wrap it in markdown.",
          },
          {
            role: "user",
            content: `${prompt}\n\nJSON schema:\n${JSON.stringify(schema)}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    const data = await response.json();
    return JSON.parse(data.choices?.[0]?.message?.content || "{}");
  }

  if (env.OPENAI_API_KEY) {
    const response = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-5.2",
        input: prompt,
        max_output_tokens: 1800,
        text: {
          format: {
            type: "json_schema",
            name: "job_rerank",
            strict: true,
            schema,
          },
        },
      }),
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    const data = await response.json();
    return JSON.parse(extractText(data));
  }

  throw new Error("No AI provider configured.");
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return json(res, 405, { error: "Method not allowed." });
  }

  if (!process.env.OPENROUTER_API_KEY && !process.env.OPENAI_API_KEY) {
    return json(res, 503, { error: "No AI provider key is configured." });
  }

  try {
    const { profile, jobs } = req.body || {};

    if (!profile || !Array.isArray(jobs) || jobs.length === 0) {
      return json(res, 400, { error: "Profile and jobs are required." });
    }

    const trimmedJobs = jobs.slice(0, 12).map((job) => ({
      id: job.id,
      title: job.title,
      company: job.company,
      location: job.location,
      remoteCategory: job.remoteCategory,
      compensationText: job.compensationText,
      description: job.description,
      ruleScore: job.match?.score ?? null,
      ruleReasons: job.match?.reasons ?? [],
    }));

    const schema = {
      type: "object",
      additionalProperties: false,
      properties: {
        ranked_jobs: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              id: { type: "string" },
              score: { type: "integer", minimum: 0, maximum: 100 },
              reasons: {
                type: "array",
                items: { type: "string" },
                minItems: 2,
                maxItems: 4,
              },
              caution: { type: "string" },
            },
            required: ["id", "score", "reasons", "caution"],
          },
        },
      },
      required: ["ranked_jobs"],
    };

    const prompt = [
      "You are ranking jobs for a candidate.",
      "Prioritize realistic fit over optimism.",
      "Favor operations, fleet, technician, service, dispatch, logistics, support, and triage alignment.",
      "Penalize seniority mismatches and highly specialized software roles.",
      "Return concise reasons grounded in the candidate profile and each job.",
      "",
      "Candidate profile:",
      JSON.stringify(profile),
      "",
      "Jobs to rank:",
      JSON.stringify(trimmedJobs),
    ].join("\n");

    const parsed = await callProvider(prompt, schema, process.env);
    return json(res, 200, parsed);
  } catch (error) {
    return json(res, 500, { error: "AI rerank failed.", detail: String(error) });
  }
};
