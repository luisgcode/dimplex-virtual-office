/* Curious news of the day for the office chats.
   Runs every morning (GitHub Action .github/workflows/world-news.yml): reads a few feeds of light, curious news,
   asks Claude to keep up to 5 harmless stories and write each one as a 3 line chat between two coworkers,
   and writes world-news.json. The office reads that file once and tells each story once, at its own hour.
   Run by hand: ANTHROPIC_API_KEY=... node tools/world-news.mjs  (add --dry to print without writing) */
import Anthropic from "@anthropic-ai/sdk";
import { writeFileSync } from "node:fs";

const FEEDS = [
  "https://www.goodnewsnetwork.org/feed/",
  "https://www.odditycentral.com/feed",
  "https://www.sciencedaily.com/rss/strange_offbeat.xml",
  "https://www.mentalfloss.com/rss.xml",
];
const MAX = 5;
/* nothing bad ever reaches the office: these words drop a story before and after Claude */
const BAD = /\b(war|wars|army|military|missile|bomb|attack|terror|shoot|shooting|gun|killed|kill|killing|dead|death|died|dies|dying|murder|crime|criminal|fugitive|police|arrest|prison|jail|court|trial|lawsuit|abuse|assault|rape|suicide|drug|overdose|cancer|disease|virus|pandemic|covid|hospital|illness|sick|disaster|earthquake|flood|wildfire|hurricane|tornado|crash|accident|injur\w*|victim|missing|rescue|tragic|tragedy|funeral|grief|politic\w*|election|president|trump|biden|government|minister|congress|senate|parliament|israel|gaza|ukraine|russia|iran|china|religio\w*|church|mosque|gender|sex|sexual|racis\w*|refugee|immigra\w*|protest|riot)\b/i;

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
      const title = pick("title"), desc = pick("description").slice(0, 300);
      if (title && !BAD.test(title + " " + desc)) out.push({ title, desc, source: new URL(url).hostname.replace(/^www\./, "") });
      if (out.length >= 15) break;
    }
    return out;
  } catch { return []; }
}

const torontoDate = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

const stories = (await Promise.all(FEEDS.map(readFeed))).flat();
console.log(`feeds: ${stories.length} stories after the word filter`);
if (stories.length < 2) { console.log("not enough stories today, leaving the old file (the office ignores it)"); process.exit(0); }

const SYSTEM = `You write tiny bits of small talk for a cozy virtual office of a Canadian heating and fireplace company (Cambridge, Ontario).
From the stories given, pick at most ${MAX} that are light, curious, funny, wholesome or amazing (animals, science oddities, records, inventions, food, space, nature, quirky people).
Never pick anything about war, politics, crime, death, illness, disasters, accidents, money trouble, religion, sex or anything sad or divisive, even if it ends well. If fewer stories qualify, return fewer. Picking none is fine.
For each story write exactly 3 short lines of casual chat between two coworkers: line 1 person A brings it up naturally ("Did you see...", "Apparently...", "I just read..."), line 2 person B reacts, line 3 person A closes with a light joke or a fun detail.
Rules for every line: plain everyday English, at most 85 characters, no names of the coworkers, no emojis, no hashtags, no dashes of any kind, no quotes inside the line. Facts must come from the story; keep numbers and places right. Vary the openers across stories.`;

const list = stories.map((s, i) => `${i + 1}. [${s.source}] ${s.title}${s.desc ? " :: " + s.desc : ""}`).join("\n");
const schema = {
  type: "object", additionalProperties: false, required: ["items"],
  properties: { items: { type: "array", items: { type: "object", additionalProperties: false, required: ["story", "lines"],
    properties: { story: { type: "integer" }, lines: { type: "array", items: { type: "string" } } } } } },
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
  const s = stories[p.story - 1], lines = (p.lines || []).slice(0, 3).map(clean);
  if (!s || lines.length !== 3 || lines.some((l) => !l || l.length > 110) || BAD.test(lines.join(" "))) continue;
  if (items.some((x) => x.title === s.title)) continue;
  items.push({ title: s.title, source: s.source, lines });
  if (items.length >= MAX) break;
}
const out = { date: torontoDate(), items };
console.log(JSON.stringify(out, null, 2));
if (!process.argv.includes("--dry")) writeFileSync(new URL("../world-news.json", import.meta.url), JSON.stringify(out, null, 2) + "\n");
