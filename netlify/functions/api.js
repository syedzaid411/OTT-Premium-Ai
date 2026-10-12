// Keys live in Netlify environment variables: TMDB_KEY, GROQ_KEY, ACCESS_CODE
// Optional: GROQ_MODEL, GROQ_VISION
exports.handler = async (e) => {
  const h = { "content-type": "application/json" };
  const out = (s, b) => ({ statusCode: s, headers: h, body: typeof b === "string" ? b : JSON.stringify(b) });
  if (!process.env.ACCESS_CODE || (e.headers["x-code"] || "") !== process.env.ACCESS_CODE) return out(401, { error: "code" });
  try {
    const b = JSON.parse(e.body || "{}");
    if (b.type === "check") return out(200, { ok: true });
    if (b.type === "tmdb") {
      if (!/^\/(movie|tv|trending|search|discover)\//.test(b.path) || b.path.includes("..")) return out(400, { error: "path" });
      const u = new URL("https://api.themoviedb.org/3" + b.path);
      for (const [k, v] of Object.entries(b.params || {})) u.searchParams.set(k, v);
      u.searchParams.set("api_key", process.env.TMDB_KEY);
      const r = await fetch(u);
      return out(r.status, await r.text());
    }
    if (b.type === "ai") {
      // Vision: try several models until one works
      const models = b.vision
        ? [process.env.GROQ_VISION, "meta-llama/llama-4-scout-17b-16e-instruct", "qwen/qwen3.6-27b"].filter(Boolean)
        : [process.env.GROQ_MODEL || "openai/gpt-oss-120b"];
      let last = { status: 500, text: JSON.stringify({ error: "no model" }) };
      for (const model of models) {
        const extra = model.includes("gpt-oss") ? { reasoning_effort: "low" } : model.includes("qwen") ? { reasoning_format: "hidden" } : {};
        const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: { "content-type": "application/json", authorization: "Bearer " + process.env.GROQ_KEY },
          body: JSON.stringify({ model, messages: b.messages, temperature: 0.5, max_tokens: 3000, ...extra }),
        });
        const text = await r.text();
        if (r.ok) return out(200, text);
        last = { status: r.status, text: "model " + model + ": " + text };
      }
      return out(last.status, { error: last.text });
    }
  } catch (x) { return out(500, { error: String(x && x.message || x) }); }
  return out(400, { error: "bad" });
};
