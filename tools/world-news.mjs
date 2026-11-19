/* Curious news of the day for the office chats.
   Runs every morning (GitHub Action .github/workflows/world-news.yml): reads a few feeds of light, curious news,
   asks Claude to keep up to 5 stories people talk about (shows, movies, celebrities, music) and write
   3 short chats for each one (first mention, a later take, an afternoon callback),
   and writes world-news.json. The office reads that file once and tells each story once, at its own hour.
   Run by hand: ANTHROPIC_API_KEY=... node tools/world-news.mjs  (add --dry to print without writing) */
import Anthropic from "@anthropic-ai/sdk";
import { writeFileSync } from "node:fs";

/* what people are talking about: movies, series, celebrities and music, plus a pinch of curious news */
const FEEDS = [
  "https://www.eonline.com/syndication/feeds/rssfeeds/topstories.xml",
  "https://variety.com/feed/",
  "https://deadline.com/feed/",
  "https://www.billboard.com/feed/",
  "https://www.cbc.ca/webfeed/rss/rss-arts",
  /* weird and unexpected news (the old odd news feeds went stale, Google News searches stay fresh) */
  "https://www.boredpanda.com/feed/",
  "https://news.google.com/rss/search?q=%22guinness%20world%20record%22%20when:2d&hl=en-CA&gl=CA&ceid=CA:en",
  "https://news.google.com/rss/search?q=%22odd%20news%22%20OR%20%22strange%20but%20true%22%20when:2d&hl=en-CA&gl=CA&ceid=CA:en",
  "https://news.google.com/rss/search?q=%22goes%20viral%22%20when:2d&hl=en-CA&gl=CA&ceid=CA:en",
];
const MAX = 10;
const SINCE = Date.now() - 48 * 3600 * 1000;   /* today and yesterday */
/* nothing bad ever reaches the office: these words drop a story before and after Claude */
const BAD = /\b(war|wars|army|military|missile|bomb|attack|terror|shoot|shooting|gun|killed|kill|killing|dead|death|died|dies|dying|murder|crime|criminal|fugitive|police|arrest|prison|jail|court|trial|lawsuit|abuse|assault|rape|suicide|drug|overdose|divorce|split|breakup|cheat\w*|scandal|feud|slam\w*|rehab|lawsuit|sued|cancer|disease|virus|pandemic|covid|hospital|illness|sick|disaster|earthquake|flood|wildfire|hurricane|tornado|crash|accident|injur\w*|victim|missing|rescue|tragic|tragedy|funeral|grief|politic\w*|election|president|trump|biden|government|minister|congress|senate|parliament|israel|gaza|ukraine|russia|iran|china|religio\w*|church|mosque|gender|sex|sexual|racis\w*|refugee|immigra\w*|protest|riot)\b/i;

const decode = (s) => s.replace(/<!\[CDATA\[|\]\]>/g, "").replace(/<[^>]+>/g, " ")
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&amp;/g, "&").replace(/&quot;/g, '"')
  .replace(/&#?\w+;/g, " ").replace(/\s+/g, " ").trim();

async function readFeed(url) {
  try {
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (office news reader)" }, signal: AbortSignal.timeout(20000) });
    if (!r.ok) return [];
    const xml = await r.text(), out = [];
    for (const m of xml.matchAll(/<item[\s>][\s\S]*?<\/item>/g)) {
      const it = m[0], pick = (tag) => { const x = it.match(new RegExp("<" + tag + "[^>]*>([\\s\\S]*?)</" + tag + ">")); return x ? decode(x[1]) : ""; };
      const title = pick("title"), desc = pick("description").slice(0, 300), when = Date.parse(pick("pubDate") || pick("dc:date"));
      if (when && when < SINCE) continue;
      if (title && !BAD.test(title + " " + desc)) out.push({ title, desc, source: new URL(url).hostname.replace(/^(www|news)\./, "") });
      if (out.length >= 20) break;
    }
    return out;
  } catch { return []; }
}

const torontoDate = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

const stories = (await Promise.all(FEEDS.map(readFeed))).flat();
for (let i = stories.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [stories[i], stories[j]] = [stories[j], stories[i]]; }
console.log(`feeds: ${stories.length} stories after the word filter`);
if (stories.length < 2) { console.log("not enough stories today, leaving the old file (the office ignores it)"); process.exit(0); }

const SYSTEM = `You write tiny bits of small talk for a cozy virtual office of a Canadian heating and fireplace company (Cambridge, Ontario).
From the stories given, pick at most ${MAX} that people at work would actually talk about today: what is hot right now in movies, series and streaming, celebrities, music and award shows, plus weird, unexpected and funny news (bizarre records, strange inventions, odd things people did). Aim for about two thirds pop culture and one third weird news. Never pick two stories about the same event, show or person: one story each, so the day has 10 different topics. No sports at all. Skip plain animal or science stories unless they are truly jaw dropping. Prefer famous names and things most people have heard of; skip industry business news (deals, box office reports, executives, casting minutiae) unless it is a big fun headline.
Never pick anything about war, politics, crime, death, illness, disasters, accidents, money trouble, religion, sex, breakups, scandals, feuds, or anything sad or divisive, even if it ends well. If fewer stories qualify, return fewer.
For each story write 3 separate short chats, each exactly 3 lines, as coworkers talking about it at different moments of the day:
chat 1 (first time it comes up): person A brings it up ("Did you see...", "Apparently...", "Okay, did you hear..."), B reacts, A adds a fun detail or joke.
chat 2 (later, two other coworkers): it comes up again with a new angle, an opinion, a "have you watched it?", a prediction, or a playful disagreement.
chat 3 (afternoon): a quick callback, still talking about it, a light joke or what they will do (watch it tonight, listen on the drive home).
Keep it kind: never tease, judge or compare coworkers (no "better than some of us", "unlike you", "lazy"), only friendly talk.
Rules for every line: plain everyday English like real friends at work, at most 85 characters, no names of the coworkers, no emojis, no hashtags, no dashes of any kind, no quotes inside the line. Facts must come from the story, never invent details. Vary the openers across stories and chats.`;

const list = stories.map((s, i) => `${i + 1}. [${s.source}] ${s.title}${s.desc ? " :: " + s.desc : ""}`).join("\n");
const schema = {
  type: "object", additionalProperties: false, required: ["items"],
  properties: { items: { type: "array", items: { type: "object", additionalProperties: false, required: ["story", "chats"],
    properties: { story: { type: "integer" }, chats: { type: "array", items: { type: "array", items: { type: "string" } } } } } } },
};

const client = new Anthropic();
const res = await client.beta.messages.create({
  model: "claude-opus-5-5",
  max_tokens: 16000,
  betas: ["server-side-fallback-2026-07-01"],
  fallbacks: "default",
  output_config: { effort: "low", format: { type: "json_schema", schema } },
  system: SYSTEM,
  messages: [{ role: "user", content: `Today's stories:\n${list}` }],
});
if (res.stop_reason === "refusal") { console.log("declined today, leaving the old file"); process.exit(0); }
const text = res.content.filter((b) => b.type === "text").map((b) => b.text).join("");
const picked = JSON.parse(text).items || [];

const clean = (l) => String(l).replace(/[‒-―−]|\s-\s/g, ", ").replace(/\s+/g, " ").trim();
const items = [];
for (const p of picked) {
  const s = stories[p.story - 1];
  if (!s || items.some((x) => x.title === s.title)) continue;
  const chats = (p.chats || []).map((c) => (c || []).slice(0, 3).map(clean))
    .filter((L) => L.length === 3 && !L.some((l) => !l || l.length > 110) && !BAD.test(L.join(" "))).slice(0, 3);
  if (!chats.length) continue;
  items.push({ title: s.title, source: s.source, chats });
  if (items.length >= MAX) break;
}
const out = { date: torontoDate(), items };
console.log(JSON.stringify(out, null, 2));
if (!process.argv.includes("--dry")) writeFileSync(new URL("../world-news.json", import.meta.url), JSON.stringify(out, null, 2) + "\n");
