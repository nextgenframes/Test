function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return json(res, 405, { error: "Method not allowed." });
  }

  if (process.env.OPENROUTER_API_KEY) {
    return json(res, 200, {
      ready: true,
      provider: "OpenRouter",
      model: process.env.OPENROUTER_MODEL || "openrouter/free",
    });
  }

  if (process.env.OPENAI_API_KEY) {
    return json(res, 200, {
      ready: true,
      provider: "OpenAI",
      model: "gpt-5.2",
    });
  }

  return json(res, 200, {
    ready: false,
    provider: null,
    model: null,
  });
};
