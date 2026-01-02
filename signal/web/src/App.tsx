import { useState, useEffect, createContext, useContext } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { studioOS } from './api';
import { Login } from './pages/Login';
import type { InternalRole, ExternalRole } from './types';
import { DashboardLayout, AuditSection } from './components/layout';
import { AuditTrail, VersionHistory, ConfidenceScore } from './components/ui';
import type { NavItem } from './components/layout';
import type { AuditEntry, Version } from './components/ui';
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

// Navigation icons as SVG components
const NavIcons = {
  Projects: () => (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M3 5C3 3.89543 3.89543 3 5 3H7.58579C8.11622 3 8.62493 3.21071 9 3.58579L10 4.58579C10.3751 4.96086 10.8838 5.17157 11.4142 5.17157H15C16.1046 5.17157 17 6.067 17 7.17157V15C17 16.1046 16.1046 17 15 17H5C3.89543 17 3 16.1046 3 15V5Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  Uploads: () => (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M10 14V4M10 4L6 8M10 4L14 8M3 14V15C3 16.1046 3.89543 17 5 17H15C16.1046 17 17 16.1046 17 15V14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  Analysis: () => (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M3 10H5L7 6L10 14L13 8L15 10H17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  AuditTrail: () => (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M9 5H15M9 10H15M9 15H15M5 5H5.01M5 10H5.01M5 15H5.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  Compliance: () => (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M9 12L11 14L15 10M17 10C17 13.866 13.866 17 10 17C6.13401 17 3 13.866 3 10C3 6.13401 6.13401 3 10 3C13.866 3 17 6.13401 17 10Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  Deliver: () => (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 10L10 16L16 10M4 4L10 10L16 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  History: () => (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M10 6V10L13 13M17 10C17 13.866 13.866 17 10 17C6.13401 17 3 13.866 3 10C3 6.13401 6.13401 3 10 3C13.866 3 17 6.13401 17 10Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  Account: () => (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M10 10C12.2091 10 14 8.20914 14 6C14 3.79086 12.2091 2 10 2C7.79086 2 6 3.79086 6 6C6 8.20914 7.79086 10 10 10ZM10 10C5.58172 10 2 12.6863 2 16V18H18V16C18 12.6863 14.4183 10 10 10Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
};

// Sample audit data
const sampleAuditEntries: AuditEntry[] = [
  { id: '1', action: 'Project created', actor: 'System', timestamp: new Date(Date.now() - 3600000), type: 'create' },
  { id: '2', action: 'Asset uploaded', actor: 'You', timestamp: new Date(Date.now() - 1800000), type: 'update' },
  { id: '3', action: 'Analysis completed', actor: 'System', timestamp: new Date(Date.now() - 900000), type: 'system' },
];

const sampleVersions: Version[] = [
  { id: '1', version: 'v1.2', label: 'Final delivery', createdAt: new Date(Date.now() - 86400000), createdBy: 'You', isCurrent: true, status: 'pass', size: '24.5 MB' },
  { id: '2', version: 'v1.1', label: 'Revision', createdAt: new Date(Date.now() - 172800000), createdBy: 'You', status: 'pass', size: '24.3 MB' },
  { id: '3', version: 'v1.0', label: 'Initial', createdAt: new Date(Date.now() - 259200000), createdBy: 'You', status: 'pending', size: '24.1 MB' },
];

function DashboardOneLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [selectedProject, setSelectedProject] = useState<number | undefined>(undefined);

  // Dashboard One navigation items (functional domains)
  const navItems: NavItem[] = [
    { id: 'projects', label: 'Projects', icon: <NavIcons.Projects />, path: '/dashboard' },
    { id: 'uploads', label: 'Uploads', icon: <NavIcons.Uploads />, path: '/dashboard/assets' },
    { id: 'analysis', label: 'Analysis', icon: <NavIcons.Analysis />, path: '/dashboard/transform' },
    { id: 'audit', label: 'Audit Trail', icon: <NavIcons.AuditTrail />, path: '/dashboard/history' },
    { id: 'compliance', label: 'Compliance', icon: <NavIcons.Compliance />, path: '/dashboard/review' },
    { id: 'deliver', label: 'Deliver', icon: <NavIcons.Deliver />, path: '/dashboard/deliver' },
  ];

  const getActiveNavItem = () => {
    const path = location.pathname;
    const item = navItems.find(i => i.path === path);
    return item?.id || 'projects';
  };

  const handleNavigate = (item: NavItem) => {
    navigate(item.path);
  };

  const handleViewNavigate = (view: string, id?: number) => {
    if (id) setSelectedProject(id);
    navigate(`/dashboard/${view === 'overview' ? '' : view}`);
  };

  // Audit column content
  const auditContent = (
    <>
      <AuditSection title="Activity" icon={<NavIcons.AuditTrail />}>
        <AuditTrail entries={sampleAuditEntries} maxItems={5} />
      </AuditSection>
      <AuditSection title="Versions" icon={<NavIcons.History />}>
        <VersionHistory versions={sampleVersions} />
      </AuditSection>
    </>
  );

  // Navigation header with logo and role
  const navHeader = (
    <div className="nav-header-content">
      <h1 className="nav-logo">StudioOS</h1>
      <span className="nav-role-badge">{user?.internalRole}</span>
    </div>
  );

  // Navigation footer with user info
  const navFooter = (
    <div className="nav-footer-content">
      <span className="nav-user-email">{user?.email}</span>
      <button className="nav-logout-btn" onClick={logout}>Sign Out</button>
    </div>
  );

  return (
    <DashboardLayout
      navItems={navItems}
      activeNavItem={getActiveNavItem()}
      onNavigate={handleNavigate}
      navHeader={navHeader}
      navFooter={navFooter}
      pageTitle="Dashboard"
      pageSubtitle="Project overview and analysis"
      auditContent={auditContent}
    >
      <Routes>
        <Route index element={<OverviewView role={user?.internalRole || 'BASIC'} onNavigate={handleViewNavigate} />} />
        <Route path="assets" element={<AssetsView projectId={selectedProject} role={user?.internalRole || 'BASIC'} onNavigate={handleViewNavigate} />} />
        <Route path="create" element={<CreateView role={user?.internalRole || 'BASIC'} onNavigate={handleViewNavigate} />} />
        <Route path="transform" element={<TransformView projectId={selectedProject} role={user?.internalRole || 'BASIC'} onNavigate={handleViewNavigate} />} />
        <Route path="review" element={<ReviewView projectId={selectedProject} role={user?.internalRole || 'BASIC'} onNavigate={handleViewNavigate} />} />
        <Route path="deliver" element={<DeliverView projectId={selectedProject} role={user?.internalRole || 'BASIC'} onNavigate={handleViewNavigate} />} />
        <Route path="history" element={<HistoryView projectId={selectedProject} role={user?.internalRole || 'BASIC'} />} />
      </Routes>
    </DashboardLayout>
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

  // Dashboard Two navigation items (5 canonical views)
  const navItems: NavItem[] = [
    { id: 'projects', label: 'Projects', icon: <NavIcons.Projects />, path: '/external' },
    { id: 'deliverables', label: 'Deliverables', icon: <NavIcons.Deliver />, path: '/external/deliverables' },
    { id: 'approvals', label: 'Approvals', icon: <NavIcons.Compliance />, path: '/external/approvals' },
    { id: 'versions', label: 'Versions', icon: <NavIcons.History />, path: '/external/versions' },
    { id: 'account', label: 'Account', icon: <NavIcons.Account />, path: '/external/account' },
  ];

  const getActiveNavItem = () => {
    const path = location.pathname;
    const item = navItems.find(i => i.path === path);
    return item?.id || 'projects';
  };

  const handleNavigate = (item: NavItem) => {
    navigate(item.path);
  };

  const handleViewNavigate = (view: string, id?: number) => {
    if (id) setSelectedProject(id);
    const path = view === 'projects' ? '/external' : `/external/${view}`;
    navigate(path);
  };

  // Audit column content for external users
  const auditContent = (
    <>
      <AuditSection title="Activity" icon={<NavIcons.AuditTrail />}>
        <AuditTrail entries={sampleAuditEntries.slice(0, 3)} maxItems={3} />
      </AuditSection>
      <AuditSection title="Versions" icon={<NavIcons.History />}>
        <VersionHistory versions={sampleVersions} />
      </AuditSection>
    </>
  );

  // Navigation header
  const navHeader = (
    <div className="nav-header-content">
      <h1 className="nav-logo">StudioOS</h1>
      <span className="nav-role-badge external">{user?.externalRole}</span>
    </div>
  );

  // Navigation footer
  const navFooter = (
    <div className="nav-footer-content">
      <span className="nav-user-email">{user?.email}</span>
      <button className="nav-logout-btn" onClick={logout}>Sign Out</button>
    </div>
  );

  return (
    <DashboardLayout
      navItems={navItems}
      activeNavItem={getActiveNavItem()}
      onNavigate={handleNavigate}
      navHeader={navHeader}
      navFooter={navFooter}
      pageTitle="Client Portal"
      pageSubtitle="Review and approve deliverables"
      auditContent={auditContent}
    >
      <Routes>
        <Route index element={<ProjectsView onNavigate={handleViewNavigate} />} />
        <Route path="deliverables" element={<DeliverablesView projectId={selectedProject} role={user?.externalRole || 'VIEWER'} onNavigate={handleViewNavigate} />} />
        <Route path="approvals" element={<ReviewApprovalsView role={user?.externalRole || 'VIEWER'} />} />
        <Route path="versions" element={<VersionsView projectId={selectedProject} role={user?.externalRole || 'VIEWER'} onNavigate={handleViewNavigate} />} />
        <Route path="account" element={<AccountView onLogout={logout} />} />
      </Routes>
    </DashboardLayout>
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
