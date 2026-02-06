import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from './ui/button';
import { 
  TrendingUp, 
  LayoutDashboard, 
  FlaskConical, 
  FileText, 
  Settings, 
  LogOut,
  Menu,
  X
} from 'lucide-react';
import { cn } from '../lib/utils';

const Layout = ({ children }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItems = [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/backtest', icon: FlaskConical, label: 'Backtester' },
    { to: '/trades', icon: FileText, label: 'Paper Trades' },
    { to: '/settings', icon: Settings, label: 'Settings' },
  ];

  return (
    <div className="min-h-screen bg-[#09090B]">
      {/* Top Navigation */}
      <header className="fixed top-0 left-0 right-0 z-50 h-14 bg-zinc-900/95 backdrop-blur-sm border-b border-zinc-800">
        <div className="h-full px-4 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-green-500/10 border border-green-500/30">
              <TrendingUp className="h-5 w-5 text-green-500" />
            </div>
            <span className="font-heading font-bold text-lg text-white hidden sm:block">
              TradeView
            </span>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-blue-500/10 text-blue-400 border border-blue-500/30'
                      : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                  )
                }
                data-testid={`nav-${item.label.toLowerCase()}`}
              >
                <item.icon className="h-4 w-4" />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>

          {/* User section */}
          <div className="flex items-center gap-3">
            <span className="text-sm text-zinc-400 hidden sm:block">
              {user?.name}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="text-zinc-400 hover:text-white"
              data-testid="logout-button"
            >
              <LogOut className="h-4 w-4" />
              <span className="ml-2 hidden sm:inline">Logout</span>
            </Button>

            {/* Mobile menu button */}
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden text-zinc-400"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              data-testid="mobile-menu-button"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <nav className="md:hidden absolute top-14 left-0 right-0 bg-zinc-900 border-b border-zinc-800 p-4 space-y-1">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setMobileMenuOpen(false)}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 px-4 py-3 rounded-md text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-blue-500/10 text-blue-400'
                      : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                  )
                }
              >
                <item.icon className="h-5 w-5" />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>
        )}
      </header>

      {/* Main Content */}
      <main className="pt-14 min-h-screen">
        {children}
      </main>
    </div>
  );
};

export default Layout;
