import { Link } from 'react-router-dom';
import { Search, Bug, Newspaper, BookOpen } from 'lucide-react';

// path: null means the tool isn't built yet - the card renders but isn't
// clickable, so "planned" tools are shown honestly rather than hidden
// until finished.
const TOOLS = [
  { name: 'OsinQuest', description: 'IP & domain security intelligence lookup', icon: Search, path: '/osinquest', status: 'live' },
  { name: 'Raven Eyes', description: 'CVE tracker \u2014 recent vulnerabilities and keyword search', icon: Bug, path: '/raven-eyes', status: 'live' },
  { name: 'InfoS', description: 'Cybersecurity news aggregator', icon: Newspaper, path: null, status: 'planned' },
  { name: 'Cybersecurity Glossary', description: 'Plain-English reference for security terms', icon: BookOpen, path: null, status: 'planned' },
];

const STATUS_LABEL = { live: 'Live', building: 'Building', planned: 'Planned' };
const STATUS_STYLE = {
  live: 'bg-emerald-900/30 text-emerald-400 border-emerald-800',
  building: 'bg-amber-900/30 text-amber-400 border-amber-800',
  planned: 'bg-slate-800 text-slate-400 border-slate-700',
};

function ToolCard({ tool }) {
  const Icon = tool.icon;
  return (
    <div
      className={`p-6 rounded-lg border border-slate-800 bg-slate-900 h-full ${
        tool.path ? 'hover:border-emerald-700 transition-colors' : 'opacity-60'
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        <Icon className="text-emerald-400" size={26} />
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${STATUS_STYLE[tool.status]}`}>
          {STATUS_LABEL[tool.status]}
        </span>
      </div>
      <h2 className="text-lg font-bold mb-1">{tool.name}</h2>
      <p className="text-slate-400 text-sm">{tool.description}</p>
    </div>
  );
}

export default function Hub() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-16">
      <h1 className="text-4xl font-bold text-center mb-2">Sakhas HQ</h1>
      <p className="text-slate-400 text-center mb-12">A growing suite of practical, no-nonsense security tools.</p>
      <div className="grid sm:grid-cols-2 gap-6">
        {TOOLS.map((tool) =>
          tool.path ? (
            <Link key={tool.name} to={tool.path}>
              <ToolCard tool={tool} />
            </Link>
          ) : (
            <div key={tool.name}>
              <ToolCard tool={tool} />
            </div>
          )
        )}
      </div>
    </div>
  );
}