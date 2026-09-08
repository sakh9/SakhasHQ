import { Outlet, Link, useLocation } from 'react-router-dom';
import { Home } from 'lucide-react';

export default function Layout() {
  const location = useLocation();
  const isHub = location.pathname === '/';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {!isHub && (
        <nav className="border-b border-slate-800 px-6 py-3">
          <Link to="/" className="text-emerald-400 font-bold hover:text-emerald-300 flex items-center gap-2 w-fit transition-colors">
            <Home size={16} /> Sakhas HQ
          </Link>
        </nav>
      )}
      <Outlet />
    </div>
  );
}