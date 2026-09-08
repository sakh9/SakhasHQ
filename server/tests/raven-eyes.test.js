const express = require('express');
const request = require('supertest');

jest.mock('../src/db/pool', () => ({ query: jest.fn() }));
jest.mock('../src/services/nvd', () => ({ searchCves: jest.fn(), getRecentCves: jest.fn() }));

const pool = require('../src/db/pool');
const { searchCves, getRecentCves } = require('../src/services/nvd');
const ravenEyesRouter = require('../src/routes/raven-eyes');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/raven-eyes', ravenEyesRouter);
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('POST /api/raven-eyes/search', () => {
  test('rejects a keyword under 2 characters', async () => {
    const app = buildApp();
    const res = await request(app).post('/api/raven-eyes/search').send({ keyword: 'a' });
    expect(res.status).toBe(400);
    expect(searchCves).not.toHaveBeenCalled();
  });

  test('cache miss: calls NVD and stores the result', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] }); // cache check: miss
    pool.query.mockResolvedValueOnce({ rows: [] }); // insert
    searchCves.mockResolvedValue({ totalResults: 1, results: [{ id: 'CVE-2024-0001' }] });

    const app = buildApp();
    const res = await request(app).post('/api/raven-eyes/search').send({ keyword: 'openssl' });

    expect(res.status).toBe(200);
    expect(res.body.cached).toBe(false);
    expect(searchCves).toHaveBeenCalledWith('openssl');
  });

  test('cache hit: returns cached data without calling NVD', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{ total_results: 1, results: [{ id: 'CVE-2024-0001' }] }],
    });

    const app = buildApp();
    const res = await request(app).post('/api/raven-eyes/search').send({ keyword: 'openssl' });

    expect(res.status).toBe(200);
    expect(res.body.cached).toBe(true);
    expect(searchCves).not.toHaveBeenCalled();
  });

  test('returns 502 when NVD fails, not a 500 crash', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    searchCves.mockRejectedValue(new Error('NVD search responded with status 503'));

    const app = buildApp();
    const res = await request(app).post('/api/raven-eyes/search').send({ keyword: 'openssl' });

    expect(res.status).toBe(502);
  });

  test('a cache write failure does not turn a successful fetch into a failed response', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] }); // cache check: miss
    pool.query.mockRejectedValueOnce(new Error('connection terminated')); // insert fails
    searchCves.mockResolvedValue({ totalResults: 1, results: [{ id: 'CVE-2024-0001' }] });

    const app = buildApp();
    const res = await request(app).post('/api/raven-eyes/search').send({ keyword: 'openssl' });

    expect(res.status).toBe(200);
    expect(res.body.cached).toBe(false);
  });
});

describe('GET /api/raven-eyes/feed', () => {
  test('rejects an invalid severity value', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/raven-eyes/feed?severity=SUPER_BAD');
    expect(res.status).toBe(400);
    expect(getRecentCves).not.toHaveBeenCalled();
  });

  test('cache miss: calls NVD with the requested severity', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    pool.query.mockResolvedValueOnce({ rows: [] });
    getRecentCves.mockResolvedValue({ totalResults: 3, results: [] });

    const app = buildApp();
    const res = await request(app).get('/api/raven-eyes/feed?severity=CRITICAL');

    expect(res.status).toBe(200);
    expect(getRecentCves).toHaveBeenCalledWith({ severity: 'CRITICAL' });
  });

  test('cache hit: returns cached feed without calling NVD', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ total_results: 3, results: [] }] });

    const app = buildApp();
    const res = await request(app).get('/api/raven-eyes/feed?severity=CRITICAL');

    expect(res.status).toBe(200);
    expect(res.body.cached).toBe(true);
    expect(getRecentCves).not.toHaveBeenCalled();
  });

  test('works with no severity filter at all', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    pool.query.mockResolvedValueOnce({ rows: [] });
    getRecentCves.mockResolvedValue({ totalResults: 10, results: [] });

    const app = buildApp();
    const res = await request(app).get('/api/raven-eyes/feed');

    expect(res.status).toBe(200);
    expect(getRecentCves).toHaveBeenCalledWith({ severity: undefined });
  });
});