const Parser = require('rss-parser');

const parser = new Parser({ timeout: 8000 });

const FEEDS = [
  { name: 'The Hacker News', url: 'https://feeds.feedburner.com/TheHackersNews' },
  { name: 'BleepingComputer', url: 'https://www.bleepingcomputer.com/feed/' },
  { name: 'Dark Reading', url: 'https://www.darkreading.com/rss.xml' },
  { name: 'SecurityWeek', url: 'https://www.securityweek.com/feed/' },
  { name: 'Krebs on Security', url: 'https://krebsonsecurity.com/feed/' },
];

// Deterministic, keyword-based categorization - not an LLM call. This
// keeps InfoS consistent with the rest of the suite's "structured
// interpretation of data" philosophy (same spirit as OsinQuest's Risk
// Summary and Raven Eyes' severity synthesis) without introducing a
// per-request cost the other free-tier integrations don't have.
const CATEGORY_KEYWORDS = {
  Ransomware: ['ransomware', 'ransom'],
  'Data Breach': ['data breach', 'breach', 'leaked data', 'exposed database'],
  Vulnerability: ['vulnerability', 'cve-', 'zero-day', 'patch', 'exploit'],
  Phishing: ['phishing', 'smishing', 'social engineering'],
  Malware: ['malware', 'trojan', 'backdoor', 'botnet', 'worm'],
  'Nation-State': ['nation-state', 'apt', 'state-sponsored', 'espionage'],
};

function categorize(text) {
  const lower = (text || '').toLowerCase();
  const matched = Object.entries(CATEGORY_KEYWORDS)
    .filter(([, keywords]) => keywords.some((kw) => lower.includes(kw)))
    .map(([category]) => category);
  return matched.length > 0 ? matched : ['General'];
}

// Flags articles worth surfacing even to someone skimming quickly -
// active exploitation and a named CVE are the two clearest "this matters
// right now" signals a headline can carry.
function isNotable(text) {
  const value = text || '';
  const lower = value.toLowerCase();
  return /cve-\d{4}-\d+/i.test(value) || ['critical', 'actively exploited', 'zero-day', 'urgent'].some((kw) => lower.includes(kw));
}

async function fetchFeed(source) {
  const feed = await parser.parseURL(source.url);
  return (feed.items || []).slice(0, 10).map((item) => {
    const text = `${item.title || ''} ${item.contentSnippet || item.summary || ''}`;
    return {
      title: item.title || 'Untitled',
      link: item.link || null,
      summary: (item.contentSnippet || item.summary || '').slice(0, 300),
      publishedAt: item.isoDate || item.pubDate || null,
      source: source.name,
      categories: categorize(text),
      notable: isNotable(text),
    };
  });
}

// Never rejects - a single feed failing (timeout, malformed XML, site
// down) is handled per-source via Promise.allSettled, same graceful-
// degradation approach as OsinQuest's 5 lookup sources. Worst case, every
// source fails and this resolves to an empty article list with all 5
// failures listed, rather than the whole request erroring out.
async function getAggregatedNews() {
  const results = await Promise.allSettled(FEEDS.map(fetchFeed));

  const articles = [];
  const failedSources = [];

  results.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      articles.push(...result.value);
    } else {
      failedSources.push({ source: FEEDS[i].name, error: result.reason.message });
      console.warn(`[RSS] Failed to fetch ${FEEDS[i].name}: ${result.reason.message}`);
    }
  });

  articles.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));

  return { articles, failedSources };
}

module.exports = { getAggregatedNews, categorize, isNotable, FEEDS };