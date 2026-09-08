import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Search, AlertTriangle, Loader2, X } from 'lucide-react';
import CveCard from '../components/raveneyes/CveCard';

const SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export default function RavenEyes() {
  const [mode, setMode] = useState('feed'); // 'feed' | 'search'
  const [severity, setSeverity] = useState(null);
  const [keyword, setKeyword] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const abortRef = useRef(null);

  // Race-safety: cancels a still-in-flight request before starting a new
  // one, same reasoning as OsinQuest's handleSearch - without this, a slow
  // "feed" request that started before a fast "search" request could land
  // after it and silently overwrite the search results.
  function cancelInFlight() {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    return controller;
  }

  async function loadFeed(sev) {
    const controller = cancelInFlight();
    setLoading(true);
    setError('');
    try {
      const params = sev ? { severity: sev } : {};
      const res = await axios.get(`${API_URL}/api/raven-eyes/feed`, {
        params,
        signal: controller.signal,
        timeout: 15000,
      });
      setData(res.data);
    } catch (err) {
      if (axios.isCancel(err) || err.code === 'ERR_CANCELED') return;
      setError(err.response?.data?.error || 'Failed to load the CVE feed.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSearch(e) {
    e.preventDefault();
    const trimmed = keyword.trim();
    if (!trimmed) return;

    const controller = cancelInFlight();
    setMode('search');
    setLoading(true);
    setError('');
    try {
      const res = await axios.post(
        `${API_URL}/api/raven-eyes/search`,
        { keyword: trimmed },
        { signal: controller.signal, timeout: 15000 }
      );
      setData(res.data);
    } catch (err) {
      if (axios.isCancel(err) || err.code === 'ERR_CANCELED') return;
      setError(err.response?.data?.error || 'Failed to search CVEs.');
    } finally {
      setLoading(false);
    }
  }

  function backToFeed() {
    setMode('feed');
    setKeyword('');
    setError('');
    loadFeed(severity);
  }

  function selectSeverity(sev) {
    const next = severity === sev ? null : sev; // clicking an active filter clears it
    setSeverity(next);
    if (mode === 'feed') loadFeed(next);
  }

  useEffect(() => {
    const timer = setTimeout(() => loadFeed(null), 0);
    return () => {
      clearTimeout(timer);
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-emerald-400">Raven Eyes</h1>
        <p className="text-slate-400">CVE tracker \u2014 recent vulnerabilities and keyword search</p>
      </header>

      <form onSubmit={handleSearch} className="flex gap-2 mb-4">
        <input
          type="text"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="Search CVEs (e.g. openssl, apache struts)"
          className="flex-1 bg-slate-900 border border-slate-700 rounded px-4 py-2 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-600"
        />
        <button
          type="submit"
          disabled={loading}
          className="bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 px-4 py-2 rounded flex items-center gap-2 transition-colors"
        >
          <Search size={16} /> Search
        </button>
      </form>

      {mode === 'search' ? (
        <button
          onClick={backToFeed}
          className="text-sm text-slate-400 hover:text-emerald-400 flex items-center gap-1 mb-6 transition-colors"
        >
          <X size={14} /> Clear search, back to feed
        </button>
      ) : (
        <div className="flex flex-wrap gap-2 mb-6">
          {SEVERITIES.map((sev) => (
            <button
              key={sev}
              onClick={() => selectSeverity(sev)}
              className={`text-xs font-bold px-3 py-1.5 rounded-full border transition-colors ${
                severity === sev
                  ? 'bg-emerald-700 border-emerald-600 text-white'
                  : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-500'
              }`}
            >
              {sev}
            </button>
          ))}
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-slate-400 py-8 justify-center">
          <Loader2 className="animate-spin" size={18} /> Loading...
        </div>
      )}

      {error && !loading && (
        <div className="flex items-start gap-3 text-red-400 bg-red-900/20 p-4 border border-red-900 rounded mb-6">
          <AlertTriangle size={18} className="shrink-0 mt-0.5" />
          <p>{error}</p>
        </div>
      )}

      {data && !loading && !error && (
        <>
          <div className="flex items-center justify-between mb-4 text-sm text-slate-500">
            <span>{data.totalResults?.toLocaleString() ?? 0} total result{data.totalResults === 1 ? '' : 's'}</span>
            {data.cached && <span className="text-xs border border-slate-700 rounded px-2 py-0.5">from cache</span>}
          </div>

          {data.results?.length === 0 ? (
            <p className="text-slate-500 text-center py-8">No CVEs found for this query.</p>
          ) : (
            <div className="space-y-4">
              {data.results.map((cve) => (
                <CveCard key={cve.id} cve={cve} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}