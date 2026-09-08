const express = require('express');
const { z } = require('zod');
const pool = require('../db/pool');
const { searchCves, getRecentCves } = require('../services/nvd');

const router = express.Router();

// Search results change less often than "what's new" does - an
// individual CVE's data is fairly stable once published, so it gets the
// same 24h TTL as OsinQuest. The feed is explicitly about recency, so it
// gets a shorter 6h window instead of serving stale "recent" data for a
// full day.
const SEARCH_CACHE_HOURS = 24;
const FEED_CACHE_HOURS = 6;

const searchSchema = z.object({
  keyword: z.string().trim().min(2, 'Keyword must be at least 2 characters').max(100, 'Keyword is too long'),
});

const feedSchema = z.object({
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
});

async function getCached(queryKey, maxAgeHours) {
  const { rows } = await pool.query(
    `SELECT * FROM cve_cache WHERE query_key = $1 AND created_at > NOW() - INTERVAL '${maxAgeHours} hours'`,
    [queryKey]
  );
  return rows[0] || null;
}

async function setCached(queryKey, queryType, totalResults, results) {
  await pool.query(
    `INSERT INTO cve_cache (query_key, query_type, total_results, results, created_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (query_key) DO UPDATE SET total_results = $3, results = $4, created_at = NOW()`,
    [queryKey, queryType, totalResults, JSON.stringify(results)]
  );
}

router.post('/search', async (req, res) => {
  try {
    const { keyword } = searchSchema.parse(req.body);
    const queryKey = `search:${keyword.toLowerCase()}`;

    const cached = await getCached(queryKey, SEARCH_CACHE_HOURS);
    if (cached) {
      return res.json({ cached: true, totalResults: cached.total_results, results: cached.results });
    }

    const { totalResults, results } = await searchCves(keyword);

    try {
      await setCached(queryKey, 'search', totalResults, results);
    } catch (dbErr) {
      // Same fallback philosophy as OsinQuest: a cache write failure
      // shouldn't turn a successful NVD fetch into a failed request.
      console.error('Failed to write CVE search cache:', dbErr.message);
    }

    res.json({ cached: false, totalResults, results });
  } catch (err) {
    if (err.name === 'ZodError') {
      return res.status(400).json({ error: err.issues[0]?.message || 'Invalid request' });
    }
    console.error('CVE search failed:', err.message);
    res.status(502).json({ error: 'Failed to fetch CVE data from NVD. Please try again shortly.' });
  }
});

router.get('/feed', async (req, res) => {
  try {
    const { severity } = feedSchema.parse(req.query);
    const queryKey = `feed:${severity || 'all'}`;

    const cached = await getCached(queryKey, FEED_CACHE_HOURS);
    if (cached) {
      return res.json({ cached: true, totalResults: cached.total_results, results: cached.results });
    }

    const { totalResults, results } = await getRecentCves({ severity });

    try {
      await setCached(queryKey, 'feed', totalResults, results);
    } catch (dbErr) {
      console.error('Failed to write CVE feed cache:', dbErr.message);
    }

    res.json({ cached: false, totalResults, results });
  } catch (err) {
    if (err.name === 'ZodError') {
      return res.status(400).json({ error: err.issues[0]?.message || 'Invalid request' });
    }
    console.error('CVE feed fetch failed:', err.message);
    res.status(502).json({ error: 'Failed to fetch CVE feed from NVD. Please try again shortly.' });
  }
});

module.exports = router;