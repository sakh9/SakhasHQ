const { searchCves, getRecentCves, normalizeCve, toNvdDate, sortByPublishedDesc } = require('../src/services/nvd');

beforeEach(() => {
  global.fetch = jest.fn();
});

describe('toNvdDate', () => {
  test('produces NVD\'s exact expected format - no trailing Z, no timezone offset', () => {
    const date = new Date('2024-01-15T10:30:00.123Z');
    expect(toNvdDate(date)).toBe('2024-01-15T10:30:00.123');
  });
});

describe('normalizeCve', () => {
  test('prefers CVSS v3.1 when present', () => {
    const vuln = {
      cve: {
        id: 'CVE-2024-0001',
        descriptions: [{ lang: 'en', value: 'A critical flaw.' }],
        vulnStatus: 'Analyzed',
        metrics: {
          cvssMetricV31: [{ cvssData: { baseScore: 9.8, baseSeverity: 'CRITICAL', vectorString: 'AV:N' }, exploitabilityScore: 3.9 }],
          cvssMetricV2: [{ cvssData: { baseScore: 5.0, baseSeverity: 'MEDIUM' } }],
        },
        references: [{ url: 'https://example.com/advisory' }],
      },
    };
    const result = normalizeCve(vuln);
    expect(result.severity).toBe('CRITICAL');
    expect(result.baseScore).toBe(9.8);
  });

  test('falls back to CVSS v2 when v3 is absent (older CVEs)', () => {
    const vuln = {
      cve: {
        id: 'CVE-2010-0001',
        descriptions: [{ lang: 'en', value: 'An old flaw.' }],
        metrics: { cvssMetricV2: [{ cvssData: { baseScore: 7.5, baseSeverity: 'HIGH' } }] },
        references: [],
      },
    };
    const result = normalizeCve(vuln);
    expect(result.severity).toBe('HIGH');
    expect(result.baseScore).toBe(7.5);
  });

  test('handles a CVE with no CVSS data at all, without crashing', () => {
    const vuln = { cve: { id: 'CVE-2024-9999', descriptions: [], metrics: {}, references: [] } };
    const result = normalizeCve(vuln);
    expect(result.severity).toBe('UNKNOWN');
    expect(result.baseScore).toBeNull();
    expect(result.description).toBe('No description available.');
  });

  test('caps references at 5', () => {
    const vuln = {
      cve: {
        id: 'CVE-2024-0002',
        descriptions: [{ lang: 'en', value: 'x' }],
        metrics: {},
        references: Array.from({ length: 10 }, (_, i) => ({ url: `https://example.com/${i}` })),
      },
    };
    expect(normalizeCve(vuln).references).toHaveLength(5);
  });
});

describe('searchCves', () => {
  test('returns normalized results on success', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        totalResults: 1,
        vulnerabilities: [{ cve: { id: 'CVE-2024-0001', descriptions: [{ lang: 'en', value: 'desc' }], metrics: {}, references: [] } }],
      }),
    });
    const result = await searchCves('openssl');
    expect(result.totalResults).toBe(1);
    expect(result.results[0].id).toBe('CVE-2024-0001');
  });

  test('throws on a non-ok response', async () => {
    global.fetch.mockResolvedValueOnce({ ok: false, status: 503 });
    await expect(searchCves('openssl')).rejects.toThrow(/status 503/);
  });

  test('URL-encodes the keyword and includes it as keywordSearch', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ totalResults: 0, vulnerabilities: [] }) });
    await searchCves('apache struts');
    const calledUrl = global.fetch.mock.calls[0][0];
    expect(calledUrl).toContain('keywordSearch=apache+struts');
  });

  // Regression test: NVD's real-world behavior for broad, long-lived
  // keywords (like "openssl", with CVEs since 1999) returned the OLDEST
  // matches first, since NVD API v2.0 has no sort parameter at all. This
  // confirms searchCves corrects that itself rather than passing through
  // whatever order NVD happens to return.
  test('sorts results by published date descending, regardless of NVD\u2019s raw order', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        totalResults: 3,
        vulnerabilities: [
          { cve: { id: 'CVE-1999-0001', published: '1999-03-01T00:00:00.000', descriptions: [], metrics: {}, references: [] } },
          { cve: { id: 'CVE-2024-5000', published: '2024-06-15T00:00:00.000', descriptions: [], metrics: {}, references: [] } },
          { cve: { id: 'CVE-2010-2000', published: '2010-01-01T00:00:00.000', descriptions: [], metrics: {}, references: [] } },
        ],
      }),
    });
    const result = await searchCves('openssl');
    expect(result.results.map((r) => r.id)).toEqual(['CVE-2024-5000', 'CVE-2010-2000', 'CVE-1999-0001']);
  });

  test('fetches a larger pool than it returns, so sorting has something to work with', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ totalResults: 0, vulnerabilities: [] }) });
    await searchCves('openssl');
    expect(global.fetch.mock.calls[0][0]).toContain('resultsPerPage=100');
  });

  test('totalResults still reflects NVD\u2019s true match count, not the truncated display count', async () => {
    const manyVulns = Array.from({ length: 50 }, (_, i) => ({
      cve: { id: `CVE-2024-${i}`, published: `2024-01-${(i % 28) + 1}T00:00:00.000`, descriptions: [], metrics: {}, references: [] },
    }));
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ totalResults: 4213, vulnerabilities: manyVulns }) });
    const result = await searchCves('openssl');
    expect(result.totalResults).toBe(4213);
    expect(result.results).toHaveLength(20); // still capped at the display count
  });
});

describe('getRecentCves', () => {
  test('includes cvssV3Severity only when severity is provided', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ totalResults: 0, vulnerabilities: [] }) });
    await getRecentCves({ severity: 'CRITICAL' });
    expect(global.fetch.mock.calls[0][0]).toContain('cvssV3Severity=CRITICAL');
  });

  test('omits cvssV3Severity when no severity given', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ totalResults: 0, vulnerabilities: [] }) });
    await getRecentCves({});
    expect(global.fetch.mock.calls[0][0]).not.toContain('cvssV3Severity');
  });

  test('throws on a non-ok response', async () => {
    global.fetch.mockResolvedValueOnce({ ok: false, status: 429 });
    await expect(getRecentCves({})).rejects.toThrow(/status 429/);
  });

  test('sorts feed results by published date descending too, not just search', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        totalResults: 2,
        vulnerabilities: [
          { cve: { id: 'CVE-2024-0001', published: '2024-06-01T00:00:00.000', descriptions: [], metrics: {}, references: [] } },
          { cve: { id: 'CVE-2024-0002', published: '2024-06-20T00:00:00.000', descriptions: [], metrics: {}, references: [] } },
        ],
      }),
    });
    const result = await getRecentCves({});
    expect(result.results.map((r) => r.id)).toEqual(['CVE-2024-0002', 'CVE-2024-0001']);
  });
});

describe('sortByPublishedDesc', () => {
  test('does not mutate the original array', () => {
    const original = [
      { id: 'a', published: '2020-01-01T00:00:00.000' },
      { id: 'b', published: '2024-01-01T00:00:00.000' },
    ];
    const copy = [...original];
    sortByPublishedDesc(original);
    expect(original).toEqual(copy); // original order untouched
  });
});