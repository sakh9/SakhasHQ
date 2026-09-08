const { searchCves, getRecentCves, normalizeCve, toNvdDate } = require('../src/services/nvd');

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
});