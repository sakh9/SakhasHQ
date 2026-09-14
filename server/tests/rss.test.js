// A single shared mock function, returned by every `new Parser()` call -
// rss.js constructs its parser instance once at module load time, so the
// mock needs to be the SAME reference throughout the file; changing its
// implementation per-test (via mockResolvedValue/mockRejectedValue) then
// correctly affects whatever rss.js already holds a reference to.
const mockParseURL = jest.fn();
jest.mock('rss-parser', () => jest.fn().mockImplementation(() => ({ parseURL: mockParseURL })));

const { getAggregatedNews, categorize, isNotable, FEEDS } = require('../src/services/rss');

beforeEach(() => {
  mockParseURL.mockReset();
});

describe('categorize', () => {
  test('matches Ransomware', () => {
    expect(categorize('LockBit ransomware gang hits hospital')).toEqual(['Ransomware']);
  });

  test('matches Data Breach', () => {
    expect(categorize('Company confirms data breach affecting 2M users')).toEqual(['Data Breach']);
  });

  test('matches multiple categories when both apply', () => {
    const result = categorize('Ransomware gang exploits critical CVE-2024-1234 vulnerability');
    expect(result).toContain('Ransomware');
    expect(result).toContain('Vulnerability');
  });

  test('falls back to General when nothing matches', () => {
    expect(categorize('Company announces new product launch event')).toEqual(['General']);
  });

  test('handles empty/undefined text without crashing', () => {
    expect(categorize('')).toEqual(['General']);
    expect(categorize(undefined)).toEqual(['General']);
  });
});

describe('isNotable', () => {
  test('flags a CVE ID pattern', () => {
    expect(isNotable('Patch released for CVE-2024-9999')).toBe(true);
  });

  test('flags "actively exploited"', () => {
    expect(isNotable('Flaw is being actively exploited in the wild')).toBe(true);
  });

  test('flags "critical"', () => {
    expect(isNotable('Critical flaw found in popular library')).toBe(true);
  });

  test('does not flag an ordinary headline', () => {
    expect(isNotable('Security team publishes annual report')).toBe(false);
  });

  test('handles undefined without crashing', () => {
    expect(isNotable(undefined)).toBe(false);
  });
});

describe('getAggregatedNews', () => {
  test('aggregates and sorts articles from all sources by published date, newest first', async () => {
    mockParseURL.mockImplementation((url) =>
      url.includes('feedburner')
        ? Promise.resolve({ items: [{ title: 'Old news', link: 'a', isoDate: '2024-01-01T00:00:00.000Z' }] })
        : Promise.resolve({ items: [{ title: 'New news', link: 'b', isoDate: '2024-06-01T00:00:00.000Z' }] })
    );

    const result = await getAggregatedNews();
    expect(result.articles[0].title).toBe('New news');
    expect(result.failedSources).toHaveLength(0);
  });

  test('one feed failing does not break the whole aggregation - graceful degradation', async () => {
    mockParseURL.mockImplementation((url) =>
      url.includes('darkreading')
        ? Promise.reject(new Error('ETIMEDOUT'))
        : Promise.resolve({ items: [{ title: 'Article', link: 'x', isoDate: '2024-01-01T00:00:00.000Z' }] })
    );

    const result = await getAggregatedNews();
    expect(result.failedSources).toEqual([{ source: 'Dark Reading', error: 'ETIMEDOUT' }]);
    expect(result.articles.length).toBeGreaterThan(0);
  });

  test('every source failing resolves gracefully, not a rejection', async () => {
    mockParseURL.mockRejectedValue(new Error('network down'));

    const result = await getAggregatedNews();
    expect(result.articles).toEqual([]);
    expect(result.failedSources).toHaveLength(FEEDS.length);
  });

  test('caps each source at 10 articles', async () => {
    mockParseURL.mockResolvedValue({
      items: Array.from({ length: 25 }, (_, i) => ({ title: `Article ${i}`, link: `x${i}`, isoDate: '2024-01-01T00:00:00.000Z' })),
    });

    const result = await getAggregatedNews();
    expect(result.articles.length).toBeLessThanOrEqual(FEEDS.length * 10);
  });

  test('tags each article with categories and a notable flag', async () => {
    mockParseURL.mockResolvedValue({
      items: [{ title: 'Critical ransomware CVE-2024-0001 actively exploited', link: 'x', isoDate: '2024-01-01T00:00:00.000Z' }],
    });

    const result = await getAggregatedNews();
    expect(result.articles[0].categories).toContain('Ransomware');
    expect(result.articles[0].notable).toBe(true);
  });
});