// Server-side AI for the public site. The API key stays in Netlify's
// environment variables (ANTHROPIC_API_KEY) and never reaches the browser.

const MODEL = process.env.AI_MODEL || "claude-haiku-5-5";
const MAX_PROMPT = 6000;
const LIMIT_PER_MIN = 12;
const hits = new Map(); // best-effort per-instance rate limit

const SYSTEM =
  "You are the nutrition engine of Manhana, an educational blood-sugar app for Saudi users. " +
  "Answer only meal-parsing or meal-swap requests, and reply with JSON only. " +
  "Never give medicine or insulin doses. For any unrelated request reply with {}.";

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

export default async (req, context) => {
  const key = process.env.ANTHROPIC_API_KEY;
  if (req.method === "GET") return json({ ok: Boolean(key) });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  if (!key) return json({ error: "not_configured" }, 503);

  const ip = context?.ip || req.headers.get("x-nf-client-connection-ip") || "anon";
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < 60_000);
  if (recent.length >= LIMIT_PER_MIN) return json({ error: "rate_limited" }, 429);
  recent.push(now);
  hits.set(ip, recent);

  let prompt;
  try {
    ({ prompt } = await req.json());
  } catch {
    return json({ error: "bad_json" }, 400);
  }
  if (typeof prompt !== "string" || !prompt.trim() || prompt.length > MAX_PROMPT) {
    return json({ error: "bad_prompt" }, 400);
  }

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1500,
      system: SYSTEM,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!r.ok) return json({ error: "upstream", status: r.status }, r.status === 429 ? 429 : 502);
  const data = await r.json();
  const text = (data.content || []).filter((c) => c.type === "text").map((c) => c.text).join("");
  return json({ text });
};

export const config = { path: "/api/ai" };
