const express = require('express');
const { z } = require('zod');
const pool = require('../db/pool');
const { getAggregatedNews } = require('../services/rss');

const router = express.Router();

// News is far more time-sensitive than a CVE feed (6h) or an OsinQuest
// lookup (24h) - an hour-old cache is already stretching it for "news."
const CACHE_HOURS = 1;
const CACHE_KEY = 'news:aggregated';

const CATEGORIES = ['Ransomware', 'Data Breach', 'Vulnerability', 'Phishing', 'Malware', 'Nation-State', 'General'];
const feedSchema = z.object({ category: z.enum(CATEGORIES).optional() });

async function getCached() {
  const { rows } = await pool.query(
    `SELECT * FROM news_cache WHERE cache_key = $1 AND created_at > NOW() - INTERVAL '${CACHE_HOURS} hours'`,
    [CACHE_KEY]
  );
  return rows[0] || null;
}

async function setCached(articles, failedSources) {
  await pool.query(
    `INSERT INTO news_cache (cache_key, articles, failed_sources, created_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (cache_key) DO UPDATE SET articles = $2, failed_sources = $3, created_at = NOW()`,
    [CACHE_KEY, JSON.stringify(articles), JSON.stringify(failedSources)]
  );
}

router.get('/feed', async (req, res) => {
  try {
    const { category } = feedSchema.parse(req.query);

    let articles, failedSources, cached;

    const cachedRow = await getCached();
    if (cachedRow) {
      articles = cachedRow.articles;
      failedSources = cachedRow.failed_sources;
      cached = true;
    } else {
      const fresh = await getAggregatedNews(); // never rejects - see rss.js
      articles = fresh.articles;
      failedSources = fresh.failedSources;
      cached = false;

      try {
        await setCached(articles, failedSources);
      } catch (dbErr) {
        console.error('Failed to write news cache:', dbErr.message);
      }
    }

    const filtered = category ? articles.filter((a) => a.categories.includes(category)) : articles;

    res.json({ cached, totalResults: filtered.length, results: filtered, failedSources });
  } catch (err) {
    if (err.name === 'ZodError') {
      return res.status(400).json({ error: err.issues[0]?.message || 'Invalid request' });
    }
    console.error('News feed fetch failed:', err.message);
    res.status(502).json({ error: 'Failed to load the news feed. Please try again shortly.' });
  }
});

module.exports = router;