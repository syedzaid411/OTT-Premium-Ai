const fetch = require('node-fetch');

const API_BASE = "https://h5-api.aoneroom.com/wefeed-h5api-bff";

const DEFAULT_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
  "Referer": "https://moviebox.ph/",
  "Origin": "https://moviebox.ph",
  "X-Client-Info": '{"timezone":"Asia/Dhaka"}',
  "X-Request-Lang": "en",
  "Accept": "application/json",
  "Content-Type": "application/json"
};

let bearerToken = null;

async function getBearerToken() {
  if (bearerToken) return bearerToken;
  try {
    const res = await fetch(`${API_BASE}/home?host=moviebox.ph`, { headers: DEFAULT_HEADERS });
    const xUser = res.headers.get("x-user");
    if (xUser) {
      const parsed = JSON.parse(xUser);
      bearerToken = parsed.token;
    }
  } catch (err) {
    console.error("Token Error:", err);
  }
  return bearerToken || "";
}

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json"
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  try {
    const subjectId = event.queryStringParameters.subject_id;
    const detailPath = event.queryStringParameters.detail_path || "";
    const se = event.queryStringParameters.se || 1;
    const ep = event.queryStringParameters.ep || 1;

    if (!subjectId) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing subject_id" }) };
    }

    const token = await getBearerToken();
    const reqHeaders = { ...DEFAULT_HEADERS, "Authorization": token ? `Bearer ${token}` : "" };

    const domRes = await fetch(`${API_BASE}/media-player/get-domain`, { headers: reqHeaders });
    const domData = await domRes.json();
    const domain = (domData.data || "https://netfilm.world").replace(/\/$/, "");

    const playerReferer = `${domain}/spa/videoPlayPage/movies/${detailPath}?id=${subjectId}&type=/movie/detail&detailSe=${se}&detailEp=${ep}&lang=en`;
    const playUrl = `${domain}/wefeed-h5api-bff/subject/play?subjectId=${subjectId}&se=${se}&ep=${ep}&detailPath=${detailPath}`;

    const playRes = await fetch(playUrl, {
      headers: { ...DEFAULT_HEADERS, "Referer": playerReferer }
    });

    const playJson = await playRes.json();
    const streamData = playJson.data || {};

    const streams = (streamData.streams || streamData.list || []).map(s => ({
      resolution: `${s.resolutions || s.quality}p`,
      format: s.format,
      url: s.url,
      size: s.size
    }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        status: "success",
        hasResource: streamData.hasResource || false,
        streams: streams
      })
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }
};
      
