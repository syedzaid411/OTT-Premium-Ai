// Keys live in Netlify environment variables: TMDB_KEY, GROQ_KEY, ACCESS_CODE
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
      const model = b.vision
        ? process.env.GROQ_VISION || "meta-llama/llama-4-scout-17b-16e-instruct"
        : process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
      const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer " + process.env.GROQ_KEY },
        body: JSON.stringify({ model, messages: b.messages, temperature: 0.5, max_tokens: 700 }),
      });
      return out(r.status, await r.text());
    }
  } catch (x) {}
  return out(400, { error: "bad" });
};
