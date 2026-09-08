// Maps NVD's severity string to the same four-value severity scale used
// throughout OsinQuest (good/warn/danger/info), so both tools' UI banners
// use one consistent visual language rather than each tool inventing its
// own color scheme.
const SEVERITY_TO_UI = {
  CRITICAL: 'danger',
  HIGH: 'danger',
  MEDIUM: 'warn',
  LOW: 'good',
};

const URGENCY_TEXT = {
  CRITICAL: 'Patch immediately \u2014 this is one of the most severe classes of vulnerability.',
  HIGH: 'Prioritize patching soon; this is a serious vulnerability.',
  MEDIUM: 'Worth addressing in your normal patch cycle.',
  LOW: 'Low urgency, but still worth reviewing when convenient.',
};

// Exported as a pure function (cve object in, { text, severity } out) so
// it's testable without rendering any component - same pattern used for
// buildDnsChartData and gaugeColor elsewhere in this project.
export function buildCveSummary(cve) {
  if (!cve || cve.severity === 'UNKNOWN' || cve.baseScore == null) {
    return {
      text: `No CVSS score is available yet for this CVE${cve?.status ? ` (status: ${cve.status})` : ''}. Severity can't be assessed until it's scored.`,
      severity: 'info',
    };
  }

  const uiSeverity = SEVERITY_TO_UI[cve.severity] || 'info';
  const urgency = URGENCY_TEXT[cve.severity] || '';

  // Exploitability score is part of the CVSS vector itself (how easy the
  // flaw is to actually exploit, separate from how bad the impact is) -
  // surfaced explicitly since a high-impact-but-hard-to-exploit CVE is a
  // meaningfully different risk than one that's both severe AND easy to
  // trigger.
  const exploitNote =
    cve.exploitabilityScore != null && cve.exploitabilityScore >= 3.5
      ? ' It\u2019s also relatively easy to exploit, which increases real-world risk.'
      : '';

  return {
    text: `${cve.severity} severity (CVSS ${cve.baseScore}).${exploitNote} ${urgency}`,
    severity: uiSeverity,
  };
}