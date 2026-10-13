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
      const G = "https://api.groq.com/openai/v1";
      const auth = { "content-type": "application/json", authorization: "Bearer " + process.env.GROQ_KEY };
      let models;
      if (b.vision) {
        // Ask Groq which models exist right now, keep the ones that look vision-capable
        let live = [];
        try {
          const lr = await fetch(G + "/models", { headers: auth });
          live = ((await lr.json()).data || []).map((m) => m.id).filter((id) => /scout|maverick|vision|-vl|llama-4/i.test(id));
        } catch (x) {}
        models = [...new Set([process.env.GROQ_VISION, ...live].filter(Boolean))];
        if (!models.length) return out(500, { error: "No vision model found on this Groq account" });
      } else models = [process.env.GROQ_MODEL || "openai/gpt-oss-120b"];
      let errs = [], last = { status: 500 };
      for (const model of models) {
        const extra = model.includes("gpt-oss") ? { reasoning_effort: "low" } : model.includes("qwen") ? { reasoning_format: "hidden" } : {};
        const r = await fetch(G + "/chat/completions", {
          method: "POST",
          headers: auth,
          body: JSON.stringify({ model, messages: b.messages, temperature: 0.5, max_tokens: 3000, ...extra }),
        });
        const text = await r.text();
        if (r.ok) return out(200, text);
        let msg = text;
        try { msg = JSON.parse(text).error.message; } catch (x) {}
        errs.push(model + " -> " + String(msg).slice(0, 90));
        last = { status: r.status };
      }
      return out(last.status, { error: errs.join(" | ") });
    }
  } catch (x) { return out(500, { error: String(x && x.message || x) }); }
  return out(400, { error: "bad" });
};
