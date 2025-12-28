import { useState, useEffect, createContext, useContext } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { studioOS } from './api';
import { Login } from './pages/Login';
import type { InternalRole, ExternalRole } from './types';
import './App.css';

// Dashboard One Views
import {
  OverviewView,
  AssetsView,
  CreateView,
  TransformView,
  ReviewView,
  DeliverView,
  HistoryView
} from './views/dashboard-one';

// Dashboard Two Views
import {
  ProjectsView,
  DeliverablesView,
  ReviewApprovalsView,
  VersionsView,
  AccountView
} from './views/dashboard-two';

// ============================================================================
// Auth Context
// ============================================================================

interface User {
  id: number;
  email: string;
  internalRole?: InternalRole;
  externalRole?: ExternalRole;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}

function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check existing auth on mount
    const token = localStorage.getItem('token');
    const userData = localStorage.getItem('user');
    if (token && userData) {
      try {
        // Ensure the studioOS client has the token set
        studioOS.setToken(token);
        setUser(JSON.parse(userData));
      } catch {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        studioOS.logout();
      }
    }
    setLoading(false);
  }, []);

  const login = async (email: string, password: string) => {
    const response = await studioOS.login(email, password);
    const userData: User = {
      id: response.user.id,
      email: response.user.email,
      internalRole: response.user.internalRole,
      externalRole: response.user.externalRole
    };
    localStorage.setItem('user', JSON.stringify(userData));
    setUser(userData);
  };

  const logout = () => {
    studioOS.logout();
    localStorage.removeItem('user');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

// ============================================================================
// Protected Route Wrappers
// ============================================================================

function ProtectedRoute({ children }: { children?: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="loading-screen">Loading...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children ? <>{children}</> : <Outlet />;
}

function InternalRoute({ children }: { children?: React.ReactNode }) {
  const { user } = useAuth();

  if (!user?.internalRole) {
    return <Navigate to="/external" replace />;
  }

  return children ? <>{children}</> : <Outlet />;
}

function ExternalRoute({ children }: { children?: React.ReactNode }) {
  const { user } = useAuth();

  if (!user?.externalRole) {
    return <Navigate to="/dashboard" replace />;
  }

  return children ? <>{children}</> : <Outlet />;
}

// ============================================================================
// Dashboard One Layout (Internal Users)
// ============================================================================

function DashboardOneLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [selectedProject, setSelectedProject] = useState<number | undefined>(undefined);

  const navItems = [
    { path: '/dashboard', label: 'Overview', icon: '📊' },
    { path: '/dashboard/assets', label: 'Assets', icon: '📁' },
    { path: '/dashboard/create', label: 'Create', icon: '➕' },
    { path: '/dashboard/transform', label: 'Transform', icon: '⚙️' },
    { path: '/dashboard/review', label: 'Review', icon: '✅' },
    { path: '/dashboard/deliver', label: 'Deliver', icon: '📤' },
    { path: '/dashboard/history', label: 'History', icon: '📜' }
  ];

  const handleNavigate = (view: string, id?: number) => {
    if (id) setSelectedProject(id);
    navigate(`/dashboard/${view === 'overview' ? '' : view}`);
  };

  return (
    <div className="dashboard-layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1>StudioOS</h1>
          <span className="role-badge">{user?.internalRole}</span>
        </div>
        <nav className="sidebar-nav">
          {navItems.map(item => (
            <button
              key={item.path}
              className={`nav-item ${location.pathname === item.path ? 'active' : ''}`}
              onClick={() => navigate(item.path)}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <span className="user-email">{user?.email}</span>
          <button className="logout-btn" onClick={logout}>Sign Out</button>
        </div>
      </aside>
      <main className="main-content">
        <Routes>
          <Route index element={<OverviewView role={user?.internalRole || 'BASIC'} onNavigate={handleNavigate} />} />
          <Route path="assets" element={<AssetsView projectId={selectedProject} role={user?.internalRole || 'BASIC'} onNavigate={handleNavigate} />} />
          <Route path="create" element={<CreateView role={user?.internalRole || 'BASIC'} onNavigate={handleNavigate} />} />
          <Route path="transform" element={<TransformView projectId={selectedProject} role={user?.internalRole || 'BASIC'} onNavigate={handleNavigate} />} />
          <Route path="review" element={<ReviewView projectId={selectedProject} role={user?.internalRole || 'BASIC'} onNavigate={handleNavigate} />} />
          <Route path="deliver" element={<DeliverView projectId={selectedProject} role={user?.internalRole || 'BASIC'} onNavigate={handleNavigate} />} />
          <Route path="history" element={<HistoryView projectId={selectedProject} role={user?.internalRole || 'BASIC'} />} />
        </Routes>
      </main>
    </div>
  );
}

// ============================================================================
// Dashboard Two Layout (External Users)
// ============================================================================

function DashboardTwoLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [selectedProject, setSelectedProject] = useState<number | undefined>(undefined);

  const navItems = [
    { path: '/external', label: 'Projects', icon: '📂' },
    { path: '/external/deliverables', label: 'Deliverables', icon: '📦' },
    { path: '/external/approvals', label: 'Approvals', icon: '✅' },
    { path: '/external/versions', label: 'Versions', icon: '🔄' },
    { path: '/external/account', label: 'Account', icon: '👤' }
  ];

  const handleNavigate = (view: string, id?: number) => {
    if (id) setSelectedProject(id);
    const path = view === 'projects' ? '/external' : `/external/${view}`;
    navigate(path);
  };

  return (
    <div className="dashboard-layout external">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1>StudioOS</h1>
          <span className="role-badge external">{user?.externalRole}</span>
        </div>
        <nav className="sidebar-nav">
          {navItems.map(item => (
            <button
              key={item.path}
              className={`nav-item ${location.pathname === item.path ? 'active' : ''}`}
              onClick={() => navigate(item.path)}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <span className="user-email">{user?.email}</span>
          <button className="logout-btn" onClick={logout}>Sign Out</button>
        </div>
      </aside>
      <main className="main-content">
        <Routes>
          <Route index element={<ProjectsView onNavigate={handleNavigate} />} />
          <Route path="deliverables" element={<DeliverablesView projectId={selectedProject} role={user?.externalRole || 'VIEWER'} onNavigate={handleNavigate} />} />
          <Route path="approvals" element={<ReviewApprovalsView role={user?.externalRole || 'VIEWER'} />} />
          <Route path="versions" element={<VersionsView projectId={selectedProject} role={user?.externalRole || 'VIEWER'} onNavigate={handleNavigate} />} />
          <Route path="account" element={<AccountView onLogout={logout} />} />
        </Routes>
      </main>
    </div>
  );
}

// ============================================================================
// Login Page Wrapper
// ============================================================================

function LoginPage() {
  const { login, isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (isAuthenticated && user) {
      // Redirect based on role
      const from = (location.state as { from?: Location })?.from?.pathname;
      if (from) {
        navigate(from, { replace: true });
      } else if (user.internalRole) {
        navigate('/dashboard', { replace: true });
      } else if (user.externalRole) {
        navigate('/external', { replace: true });
      }
    }
  }, [isAuthenticated, user, navigate, location]);

  const handleLogin = async (email: string, password: string) => {
    await login(email, password);
  };

  return <Login onLoginSuccess={handleLogin} />;
}

// ============================================================================
// Root Redirect
// ============================================================================

function RootRedirect() {
  const { isAuthenticated, user, loading } = useAuth();

  if (loading) {
    return <div className="loading-screen">Loading...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (user?.internalRole) {
    return <Navigate to="/dashboard" replace />;
  }

  if (user?.externalRole) {
    return <Navigate to="/external" replace />;
  }

  return <Navigate to="/login" replace />;
}

// ============================================================================
// App Component
// ============================================================================

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<LoginPage />} />

          {/* Protected routes */}
          <Route element={<ProtectedRoute />}>
            {/* Dashboard One (Internal) */}
            <Route element={<InternalRoute />}>
              <Route path="/dashboard/*" element={<DashboardOneLayout />} />
            </Route>

            {/* Dashboard Two (External) */}
            <Route element={<ExternalRoute />}>
              <Route path="/external/*" element={<DashboardTwoLayout />} />
            </Route>
          </Route>

          {/* Root redirect */}
          <Route path="/" element={<RootRedirect />} />
          
          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
