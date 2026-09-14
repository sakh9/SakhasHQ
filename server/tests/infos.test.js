const express = require('express');
const request = require('supertest');

jest.mock('../src/db/pool', () => ({ query: jest.fn() }));
jest.mock('../src/services/rss', () => ({ getAggregatedNews: jest.fn() }));

const pool = require('../src/db/pool');
const { getAggregatedNews } = require('../src/services/rss');
const infosRouter = require('../src/routes/infos');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/infos', infosRouter);
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
});

const SAMPLE_ARTICLES = [
  { title: 'Ransomware hits hospital', categories: ['Ransomware'], source: 'X', publishedAt: '2024-01-01' },
  { title: 'New CVE disclosed', categories: ['Vulnerability'], source: 'Y', publishedAt: '2024-01-02' },
];

describe('GET /api/infos/feed', () => {
  test('rejects an invalid category', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/infos/feed?category=NotARealCategory');
    expect(res.status).toBe(400);
    expect(getAggregatedNews).not.toHaveBeenCalled();
  });

  test('cache miss: fetches fresh news and stores it', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] }); // cache check: miss
    pool.query.mockResolvedValueOnce({ rows: [] }); // insert
    getAggregatedNews.mockResolvedValue({ articles: SAMPLE_ARTICLES, failedSources: [] });

    const app = buildApp();
    const res = await request(app).get('/api/infos/feed');

    expect(res.status).toBe(200);
    expect(res.body.cached).toBe(false);
    expect(res.body.totalResults).toBe(2);
    expect(getAggregatedNews).toHaveBeenCalledTimes(1);
  });

  test('cache hit: returns cached articles without hitting RSS sources', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{ articles: SAMPLE_ARTICLES, failed_sources: [] }],
    });

    const app = buildApp();
    const res = await request(app).get('/api/infos/feed');

    expect(res.status).toBe(200);
    expect(res.body.cached).toBe(true);
    expect(getAggregatedNews).not.toHaveBeenCalled();
  });

  test('filters by category from the cached full set, without re-fetching', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ articles: SAMPLE_ARTICLES, failed_sources: [] }] });

    const app = buildApp();
    const res = await request(app).get('/api/infos/feed?category=Ransomware');

    expect(res.status).toBe(200);
    expect(res.body.totalResults).toBe(1);
    expect(res.body.results[0].title).toBe('Ransomware hits hospital');
  });

  test('a cache write failure does not turn a successful fetch into a failed response', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    pool.query.mockRejectedValueOnce(new Error('connection terminated'));
    getAggregatedNews.mockResolvedValue({ articles: SAMPLE_ARTICLES, failedSources: [] });

    const app = buildApp();
    const res = await request(app).get('/api/infos/feed');

    expect(res.status).toBe(200);
    expect(res.body.cached).toBe(false);
  });

  test('surfaces partial source failures to the client without failing the request', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    pool.query.mockResolvedValueOnce({ rows: [] });
    getAggregatedNews.mockResolvedValue({
      articles: SAMPLE_ARTICLES,
      failedSources: [{ source: 'Dark Reading', error: 'ETIMEDOUT' }],
    });

    const app = buildApp();
    const res = await request(app).get('/api/infos/feed');

    expect(res.status).toBe(200);
    expect(res.body.failedSources).toHaveLength(1);
  });
});