import { ExternalLink } from 'lucide-react';
import { buildCveSummary } from '../utils/cveRiskSummary';

const SEVERITY_STYLE = {
  CRITICAL: 'bg-red-900/30 text-red-400 border-red-800',
  HIGH: 'bg-orange-900/30 text-orange-400 border-orange-800',
  MEDIUM: 'bg-amber-900/30 text-amber-400 border-amber-800',
  LOW: 'bg-emerald-900/30 text-emerald-400 border-emerald-800',
  UNKNOWN: 'bg-slate-800 text-slate-400 border-slate-700',
};

const SUMMARY_STYLE = {
  danger: 'bg-red-900/20 border-red-900 text-red-300',
  warn: 'bg-amber-900/20 border-amber-900 text-amber-300',
  good: 'bg-emerald-900/20 border-emerald-900 text-emerald-300',
  info: 'bg-slate-800/50 border-slate-700 text-slate-300',
};

// NVD's reference URLs are generally well-formed, but this project has
// already hit one case (WHOIS/RDAP) of trusting a third-party API's data
// shape too much - defensive here costs nothing and avoids a crash if a
// reference URL is ever malformed.
function safeHostname(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export default function CveCard({ cve }) {
  const summary = buildCveSummary(cve);
  const publishedDate = cve.published ? new Date(cve.published).toLocaleDateString() : 'Unknown';

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg p-5">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <h3 className="font-mono font-bold text-emerald-400">{cve.id}</h3>
          <p className="text-xs text-slate-500 mt-0.5">Published {publishedDate}</p>
        </div>
        <span className={`text-xs font-bold px-2 py-1 rounded border shrink-0 ${SEVERITY_STYLE[cve.severity] || SEVERITY_STYLE.UNKNOWN}`}>
          {cve.severity}{cve.baseScore != null ? ` \u00b7 ${cve.baseScore}` : ''}
        </span>
      </div>

      <div className={`text-sm p-3 rounded border mb-3 ${SUMMARY_STYLE[summary.severity]}`}>
        {summary.text}
      </div>

      <p className="text-sm text-slate-300 mb-3">{cve.description}</p>

      {cve.references?.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {cve.references.slice(0, 3).map((url) => (
            <a
              key={url}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-slate-500 hover:text-emerald-400 flex items-center gap-1 transition-colors"
            >
              <ExternalLink size={11} /> {safeHostname(url)}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}