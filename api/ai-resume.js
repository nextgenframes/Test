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
        max_output_tokens: 1600,
        text: {
          format: {
            type: "json_schema",
            name: "resume_profile",
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
    const { resume_text: resumeText } = req.body || {};
    if (!resumeText || String(resumeText).trim().length < 80) {
      return json(res, 400, { error: "Resume text is required." });
    }

    const schema = {
      type: "object",
      additionalProperties: false,
      properties: {
        profile: {
          type: "object",
          additionalProperties: false,
          properties: {
            name: { type: "string" },
            location: { type: "string" },
            headline: { type: "string" },
            core_experience: { type: "string" },
            keywords: {
              type: "array",
              items: { type: "string" },
              minItems: 8,
              maxItems: 28,
            },
            wins: {
              type: "array",
              items: { type: "string" },
              minItems: 3,
              maxItems: 8,
            },
            suggested_focus: {
              type: "string",
              enum: ["open", "operations", "technical", "customer", "sales", "admin", "healthcare", "finance", "creative"],
            },
          },
          required: ["name", "location", "headline", "core_experience", "keywords", "wins", "suggested_focus"],
        },
      },
      required: ["profile"],
    };

    const prompt = [
      "Extract a practical job-search profile from this resume.",
      "Do not invent degrees, titles, tools, metrics, employers, certifications, or locations.",
      "Use plain language that fits many job boards and matching systems.",
      "The headline should be one or two sentences.",
      "The core_experience should be a compact paragraph.",
      "The wins should be resume-style bullets grounded only in the provided text.",
      "",
      "Resume text:",
      String(resumeText).slice(0, 14000),
    ].join("\n");

    const parsed = await callProvider(prompt, schema, process.env);
    return json(res, 200, parsed);
  } catch (error) {
    return json(res, 500, { error: "AI resume parsing failed.", detail: String(error) });
  }
};
