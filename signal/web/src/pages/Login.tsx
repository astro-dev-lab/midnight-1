import { useState, useEffect } from 'react';
import { api } from '../api';
import './Auth.css';

interface LoginProps {
  onLoginSuccess: (email: string, password: string) => Promise<void>;
}

type AuthView = 'login' | 'register' | 'forgot';

interface InfoContent {
  title: string;
  subtitle: string;
  features: { icon: string; title: string; description: string }[];
  tip: { label: string; text: string };
}

const INFO_CONTENT: Record<AuthView, InfoContent> = {
  login: {
    title: 'Welcome Back',
    subtitle: 'Your professional audio workflow awaits',
    features: [
      { icon: '🎯', title: 'Precision Analysis', description: 'AI-powered quality assessment for every asset' },
      { icon: '📊', title: 'Compliance Reports', description: 'Automated loudness and format validation' },
      { icon: '🚀', title: 'Fast Delivery', description: 'Multi-platform export in minutes' },
    ],
    tip: { label: 'Did you know?', text: 'StudioOS processes over 10,000 assets daily with 99.9% accuracy.' },
  },
  register: {
    title: 'Join StudioOS',
    subtitle: 'The platform trusted by audio professionals',
    features: [
      { icon: '✨', title: 'Free to Start', description: 'No credit card required for basic features' },
      { icon: '🔒', title: 'Enterprise Security', description: 'SOC 2 compliant with end-to-end encryption' },
      { icon: '🌍', title: 'Global CDN', description: 'Lightning-fast uploads from anywhere' },
    ],
    tip: { label: 'Pro tip', text: 'Use your work email to automatically join your team workspace.' },
  },
  forgot: {
    title: 'Account Recovery',
    subtitle: 'We\'ll help you get back in',
    features: [
      { icon: '📧', title: 'Email Verification', description: 'Secure reset link sent to your inbox' },
      { icon: '⏱️', title: 'Quick Process', description: 'Reset your password in under 2 minutes' },
      { icon: '🛡️', title: 'Secure Reset', description: 'One-time use tokens for maximum security' },
    ],
    tip: { label: 'Need help?', text: 'Contact support@studioos.io if you no longer have access to your email.' },
  },
};

const ROTATING_TIPS = [
  'StudioOS supports LUFS, dBFS, and True Peak measurement standards.',
  'Batch process up to 500 assets simultaneously with Pro accounts.',
  'Automatic versioning keeps your entire revision history safe.',
  'Smart presets learn from your preferences over time.',
  'Export to Spotify, Apple Music, YouTube, and 20+ platforms instantly.',
];

export function Login({ onLoginSuccess }: LoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [view, setView] = useState<AuthView>('login');
  const [rotatingTipIndex, setRotatingTipIndex] = useState(0);

  // Rotate tips every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setRotatingTipIndex((prev) => (prev + 1) % ROTATING_TIPS.length);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const resetForm = () => {
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setError('');
    setSuccess('');
  };

  const switchView = (newView: AuthView) => {
    resetForm();
    setView(newView);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await onLoginSuccess(email, password);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Login failed';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setLoading(true);

    try {
      await api.register({ email, password });
      await onLoginSuccess(email, password);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Registration failed';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Simulated - would call api.forgotPassword(email)
      await new Promise((resolve) => setTimeout(resolve, 1000));
      setSuccess('Reset link sent! Check your email inbox.');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to send reset email';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const info = INFO_CONTENT[view];

  const renderForm = () => {
    switch (view) {
      case 'login':
        return (
          <form onSubmit={handleLogin} className="auth-form">
            <div className="auth-form__group">
              <label htmlFor="email" className="auth-form__label">Email</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="auth-form__input"
                required
                autoComplete="email"
              />
            </div>
            <div className="auth-form__group">
              <label htmlFor="password" className="auth-form__label">Password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="auth-form__input"
                required
                autoComplete="current-password"
              />
            </div>
            <button
              type="button"
              onClick={() => switchView('forgot')}
              className="auth-form__forgot-link"
            >
              Forgot password?
            </button>
            <button type="submit" disabled={loading} className="auth-form__submit">
              {loading ? (
                <span className="auth-form__loading">
                  <span className="auth-form__spinner"></span>
                  Signing in...
                </span>
              ) : (
                'Sign In'
              )}
            </button>
            <div className="auth-form__divider">
              <span>or</span>
            </div>
            <button
              type="button"
              onClick={() => switchView('register')}
              className="auth-form__secondary"
            >
              Create an account
            </button>
          </form>
        );

      case 'register':
        return (
          <form onSubmit={handleRegister} className="auth-form">
            <div className="auth-form__group">
              <label htmlFor="email" className="auth-form__label">Work Email</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="auth-form__input"
                required
                autoComplete="email"
              />
            </div>
            <div className="auth-form__group">
              <label htmlFor="password" className="auth-form__label">Password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                className="auth-form__input"
                required
                autoComplete="new-password"
                minLength={8}
              />
            </div>
            <div className="auth-form__group">
              <label htmlFor="confirmPassword" className="auth-form__label">Confirm Password</label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="auth-form__input"
                required
                autoComplete="new-password"
              />
            </div>
            <button type="submit" disabled={loading} className="auth-form__submit">
              {loading ? (
                <span className="auth-form__loading">
                  <span className="auth-form__spinner"></span>
                  Creating account...
                </span>
              ) : (
                'Create Account'
              )}
            </button>
            <p className="auth-form__terms">
              By registering, you agree to our{' '}
              <a href="#terms">Terms of Service</a> and{' '}
              <a href="#privacy">Privacy Policy</a>
            </p>
            <div className="auth-form__divider">
              <span>or</span>
            </div>
            <button
              type="button"
              onClick={() => switchView('login')}
              className="auth-form__secondary"
            >
              Back to sign in
            </button>
          </form>
        );

      case 'forgot':
        return (
          <form onSubmit={handleForgotPassword} className="auth-form">
            <p className="auth-form__description">
              Enter your email address and we'll send you a link to reset your password.
            </p>
            <div className="auth-form__group">
              <label htmlFor="email" className="auth-form__label">Email</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="auth-form__input"
                required
                autoComplete="email"
              />
            </div>
            {success && (
              <div className="auth-form__success">
                <span className="auth-form__success-icon">✓</span>
                {success}
              </div>
            )}
            <button type="submit" disabled={loading || !!success} className="auth-form__submit">
              {loading ? (
                <span className="auth-form__loading">
                  <span className="auth-form__spinner"></span>
                  Sending...
                </span>
              ) : success ? (
                'Email Sent'
              ) : (
                'Send Reset Link'
              )}
            </button>
            <div className="auth-form__divider">
              <span>or</span>
            </div>
            <button
              type="button"
              onClick={() => switchView('login')}
              className="auth-form__secondary"
            >
              Back to sign in
            </button>
          </form>
        );
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        {/* Left Side - Form */}
        <div className="auth-card__form-side">
          <div className="auth-card__logo">
            <div className="auth-card__logo-icon">◆</div>
            <span className="auth-card__logo-text">StudioOS</span>
          </div>

          <div className="auth-card__form-header">
            <h1 className="auth-card__title">
              {view === 'login' && 'Sign in'}
              {view === 'register' && 'Create account'}
              {view === 'forgot' && 'Reset password'}
            </h1>
            <p className="auth-card__subtitle">
              {view === 'login' && 'Access your audio workflow'}
              {view === 'register' && 'Start your professional journey'}
              {view === 'forgot' && 'We\'ll email you a reset link'}
            </p>
          </div>

          {error && (
            <div className="auth-form__error">
              <span className="auth-form__error-icon">!</span>
              {error}
            </div>
          )}

          {renderForm()}
        </div>

        {/* Right Side - Info */}
        <div className="auth-card__info-side">
          <div className="auth-card__info-content">
            <h2 className="auth-card__info-title">{info.title}</h2>
            <p className="auth-card__info-subtitle">{info.subtitle}</p>

            <div className="auth-card__features">
              {info.features.map((feature, index) => (
                <div key={index} className="auth-card__feature">
                  <span className="auth-card__feature-icon">{feature.icon}</span>
                  <div className="auth-card__feature-content">
                    <h3 className="auth-card__feature-title">{feature.title}</h3>
                    <p className="auth-card__feature-description">{feature.description}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="auth-card__tip">
              <span className="auth-card__tip-label">{info.tip.label}</span>
              <p className="auth-card__tip-text">{info.tip.text}</p>
            </div>

            <div className="auth-card__rotating-tip">
              <span className="auth-card__rotating-tip-icon">💡</span>
              <p className="auth-card__rotating-tip-text">{ROTATING_TIPS[rotatingTipIndex]}</p>
            </div>
          </div>

          <div className="auth-card__info-footer">
            <p>Trusted by 5,000+ audio professionals worldwide</p>
          </div>
        </div>
      </div>
    </div>
  );
}
