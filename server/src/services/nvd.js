const NVD_BASE_URL = 'https://services.nvd.nist.gov/rest/json/cves/2.0';

// NVD is a government API and noticeably slower than the commercial APIs
// used elsewhere in this project - 10s rather than the 8s used for
// OsinQuest's sources, based on community reports of typical response times.
const DEFAULT_TIMEOUT_MS = 10000;

async function fetchWithTimeout(url, opts = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function nvdHeaders() {
  // No key required for basic use, but NVD's rate limit is far stricter
  // without one (5 req/30s vs 50 req/30s with a free key) - matches the
  // same "works without a key, better with one" pattern as AbuseIPDB.
  const headers = { Accept: 'application/json' };
  if (process.env.NVD_API_KEY) {
    headers.apiKey = process.env.NVD_API_KEY;
  }
  return headers;
}

// NVD's date params require this exact format with NO trailing 'Z' and no
// timezone offset - confirmed against NVD's own published examples.
// toISOString() produces "...sssZ"; slicing off the last char strips the
// 'Z' without touching anything else.
function toNvdDate(date) {
  return date.toISOString().slice(0, -1);
}

// Normalizes NVD's deeply-nested response shape into one flat, consistent
// object - mirrors how apis.js normalizes RDAP's different IP/domain
// shapes into a single output shape, so the frontend never has to know
// about NVD's raw structure or its CVSS-version fallback chain.
function normalizeCve(vuln) {
  const cve = vuln.cve || {};
  const description =
    (cve.descriptions || []).find((d) => d.lang === 'en')?.value || 'No description available.';

  // Newer CVEs are scored under CVSS v3.1; older ones only have v2 or v3.0.
  // Fall back through them so every CVE gets a severity, not just recent ones.
  const metrics = cve.metrics || {};
  const primaryMetric = metrics.cvssMetricV31?.[0] || metrics.cvssMetricV30?.[0] || metrics.cvssMetricV2?.[0] || null;
  const cvssData = primaryMetric?.cvssData || null;

  return {
    id: cve.id,
    description,
    published: cve.published,
    lastModified: cve.lastModified,
    status: cve.vulnStatus || 'Unknown',
    severity: cvssData?.baseSeverity || 'UNKNOWN',
    baseScore: cvssData?.baseScore ?? null,
    vectorString: cvssData?.vectorString || null,
    exploitabilityScore: primaryMetric?.exploitabilityScore ?? null,
    references: (cve.references || []).slice(0, 5).map((r) => r.url),
  };
}

async function searchCves(keyword, { resultsPerPage = 20 } = {}) {
  const params = new URLSearchParams({
    keywordSearch: keyword,
    resultsPerPage: String(resultsPerPage),
  });

  const res = await fetchWithTimeout(`${NVD_BASE_URL}?${params.toString()}`, { headers: nvdHeaders() });

  if (!res.ok) {
    throw new Error(`NVD search responded with status ${res.status}`);
  }

  const data = await res.json();
  return {
    totalResults: data.totalResults ?? 0,
    results: (data.vulnerabilities || []).map(normalizeCve),
  };
}

async function getRecentCves({ severity = null, days = 30, resultsPerPage = 20 } = {}) {
  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);

  const params = new URLSearchParams({
    pubStartDate: toNvdDate(start),
    pubEndDate: toNvdDate(end),
    resultsPerPage: String(resultsPerPage),
  });
  if (severity) {
    params.set('cvssV3Severity', severity.toUpperCase());
  }

  const res = await fetchWithTimeout(`${NVD_BASE_URL}?${params.toString()}`, { headers: nvdHeaders() });

  if (!res.ok) {
    throw new Error(`NVD feed responded with status ${res.status}`);
  }

  const data = await res.json();
  return {
    totalResults: data.totalResults ?? 0,
    results: (data.vulnerabilities || []).map(normalizeCve),
  };
}

module.exports = { searchCves, getRecentCves, normalizeCve, toNvdDate };