import { useState } from 'react';
import './SettingsView.css';

interface SettingsViewProps {
  user?: {
    email: string;
    name?: string;
    internalRole?: string;
    externalRole?: string;
  };
  onLogout: () => void;
}

type SettingsTab = 'profile' | 'account' | 'app' | 'billing' | 'subscription';

interface UserProfile {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  company: string;
  role: string;
  timezone: string;
  avatar: string;
}

interface AppSettings {
  theme: 'dark' | 'light' | 'system';
  notifications: {
    email: boolean;
    push: boolean;
    jobComplete: boolean;
    reviewRequired: boolean;
    weeklyDigest: boolean;
  };
  defaultProject: string;
  autoSave: boolean;
  compactMode: boolean;
  showTips: boolean;
}

interface BillingInfo {
  plan: string;
  status: 'active' | 'past_due' | 'cancelled';
  nextBillingDate: string;
  amount: number;
  paymentMethod: {
    type: 'card' | 'bank';
    last4: string;
    brand?: string;
    expiry?: string;
  };
  invoices: {
    id: string;
    date: string;
    amount: number;
    status: 'paid' | 'pending' | 'failed';
  }[];
}

interface Subscription {
  plan: 'free' | 'pro' | 'team' | 'enterprise';
  status: 'active' | 'trialing' | 'cancelled';
  features: string[];
  usage: {
    assetsProcessed: number;
    assetsLimit: number;
    storageUsed: number;
    storageLimit: number;
    teamMembers: number;
    teamLimit: number;
  };
}

const TABS: { id: SettingsTab; label: string; icon: string }[] = [
  { id: 'profile', label: 'Profile', icon: '👤' },
  { id: 'account', label: 'Account', icon: '🔐' },
  { id: 'app', label: 'App Settings', icon: '⚙️' },
  { id: 'billing', label: 'Billing', icon: '💳' },
  { id: 'subscription', label: 'Subscription', icon: '📦' },
];

const TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Australia/Sydney',
];

const PLANS = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    features: ['5 assets/month', '1GB storage', 'Basic analysis', 'Email support'],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 29,
    features: ['100 assets/month', '50GB storage', 'Advanced analysis', 'Priority support', 'API access'],
    popular: true,
  },
  {
    id: 'team',
    name: 'Team',
    price: 99,
    features: ['500 assets/month', '200GB storage', 'Full analysis suite', '24/7 support', 'Team collaboration', 'Custom presets'],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: -1, // Contact sales
    features: ['Unlimited assets', 'Unlimited storage', 'Dedicated support', 'SLA guarantee', 'Custom integrations', 'On-premise option'],
  },
];

export function SettingsView({ user, onLogout }: SettingsViewProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Profile state
  const [profile, setProfile] = useState<UserProfile>({
    firstName: 'Demo',
    lastName: 'User',
    email: user?.email || 'demo@studioos.io',
    phone: '+1 (555) 123-4567',
    company: 'Audio Productions Inc.',
    role: user?.internalRole || 'STANDARD',
    timezone: 'America/New_York',
    avatar: '',
  });

  // Account state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);

  // App settings state
  const [appSettings, setAppSettings] = useState<AppSettings>({
    theme: 'dark',
    notifications: {
      email: true,
      push: true,
      jobComplete: true,
      reviewRequired: true,
      weeklyDigest: false,
    },
    defaultProject: '',
    autoSave: true,
    compactMode: false,
    showTips: true,
  });

  // Billing state
  const [billing] = useState<BillingInfo>({
    plan: 'Pro',
    status: 'active',
    nextBillingDate: '2026-02-01',
    amount: 29,
    paymentMethod: {
      type: 'card',
      last4: '4242',
      brand: 'Visa',
      expiry: '12/27',
    },
    invoices: [
      { id: 'INV-001', date: '2026-01-01', amount: 29, status: 'paid' },
      { id: 'INV-002', date: '2025-12-01', amount: 29, status: 'paid' },
      { id: 'INV-003', date: '2025-11-01', amount: 29, status: 'paid' },
    ],
  });

  // Subscription state
  const [subscription] = useState<Subscription>({
    plan: 'pro',
    status: 'active',
    features: ['100 assets/month', '50GB storage', 'Advanced analysis', 'Priority support', 'API access'],
    usage: {
      assetsProcessed: 47,
      assetsLimit: 100,
      storageUsed: 12.5,
      storageLimit: 50,
      teamMembers: 1,
      teamLimit: 1,
    },
  });

  const handleSave = async () => {
    setSaving(true);
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 800));
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleProfileChange = (field: keyof UserProfile, value: string) => {
    setProfile((prev) => ({ ...prev, [field]: value }));
  };

  const handleNotificationChange = (field: keyof AppSettings['notifications']) => {
    setAppSettings((prev) => ({
      ...prev,
      notifications: { ...prev.notifications, [field]: !prev.notifications[field] },
    }));
  };

  const renderProfileTab = () => (
    <div className="settings-section">
      <div className="settings-section__header">
        <h2 className="settings-section__title">Profile Information</h2>
        <p className="settings-section__description">Update your personal details and preferences</p>
      </div>

      <div className="settings-form">
        <div className="settings-form__avatar-section">
          <div className="settings-form__avatar">
            {profile.avatar ? (
              <img src={profile.avatar} alt="Avatar" />
            ) : (
              <span className="settings-form__avatar-placeholder">
                {profile.firstName[0]}{profile.lastName[0]}
              </span>
            )}
          </div>
          <div className="settings-form__avatar-actions">
            <button className="btn btn--secondary btn--sm">Upload Photo</button>
            <button className="btn btn--ghost btn--sm">Remove</button>
          </div>
        </div>

        <div className="settings-form__grid">
          <div className="settings-form__group">
            <label className="settings-form__label">First Name</label>
            <input
              type="text"
              className="settings-form__input"
              value={profile.firstName}
              onChange={(e) => handleProfileChange('firstName', e.target.value)}
            />
          </div>
          <div className="settings-form__group">
            <label className="settings-form__label">Last Name</label>
            <input
              type="text"
              className="settings-form__input"
              value={profile.lastName}
              onChange={(e) => handleProfileChange('lastName', e.target.value)}
            />
          </div>
          <div className="settings-form__group settings-form__group--full">
            <label className="settings-form__label">Email</label>
            <input
              type="email"
              className="settings-form__input"
              value={profile.email}
              onChange={(e) => handleProfileChange('email', e.target.value)}
            />
          </div>
          <div className="settings-form__group">
            <label className="settings-form__label">Phone</label>
            <input
              type="tel"
              className="settings-form__input"
              value={profile.phone}
              onChange={(e) => handleProfileChange('phone', e.target.value)}
            />
          </div>
          <div className="settings-form__group">
            <label className="settings-form__label">Company</label>
            <input
              type="text"
              className="settings-form__input"
              value={profile.company}
              onChange={(e) => handleProfileChange('company', e.target.value)}
            />
          </div>
          <div className="settings-form__group settings-form__group--full">
            <label className="settings-form__label">Timezone</label>
            <select
              className="settings-form__select"
              value={profile.timezone}
              onChange={(e) => handleProfileChange('timezone', e.target.value)}
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>{tz.replace('_', ' ')}</option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  );

  const renderAccountTab = () => (
    <div className="settings-section">
      <div className="settings-section__header">
        <h2 className="settings-section__title">Account Security</h2>
        <p className="settings-section__description">Manage your password and security settings</p>
      </div>

      <div className="settings-card">
        <h3 className="settings-card__title">Change Password</h3>
        <div className="settings-form">
          <div className="settings-form__group">
            <label className="settings-form__label">Current Password</label>
            <input
              type="password"
              className="settings-form__input"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Enter current password"
            />
          </div>
          <div className="settings-form__grid">
            <div className="settings-form__group">
              <label className="settings-form__label">New Password</label>
              <input
                type="password"
                className="settings-form__input"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 8 characters"
              />
            </div>
            <div className="settings-form__group">
              <label className="settings-form__label">Confirm New Password</label>
              <input
                type="password"
                className="settings-form__input"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
              />
            </div>
          </div>
          <button className="btn btn--primary" disabled={!currentPassword || !newPassword || newPassword !== confirmPassword}>
            Update Password
          </button>
        </div>
      </div>

      <div className="settings-card">
        <div className="settings-card__header">
          <div>
            <h3 className="settings-card__title">Two-Factor Authentication</h3>
            <p className="settings-card__description">Add an extra layer of security to your account</p>
          </div>
          <label className="settings-toggle">
            <input
              type="checkbox"
              checked={twoFactorEnabled}
              onChange={() => setTwoFactorEnabled(!twoFactorEnabled)}
            />
            <span className="settings-toggle__slider"></span>
          </label>
        </div>
        {twoFactorEnabled && (
          <div className="settings-card__content">
            <p className="settings-card__note">
              ✓ Two-factor authentication is enabled. You'll need your authenticator app to sign in.
            </p>
          </div>
        )}
      </div>

      <div className="settings-card settings-card--danger">
        <h3 className="settings-card__title">Danger Zone</h3>
        <p className="settings-card__description">Irreversible and destructive actions</p>
        <div className="settings-card__actions">
          <button className="btn btn--danger-outline">Delete Account</button>
          <button className="btn btn--secondary" onClick={onLogout}>Sign Out</button>
        </div>
      </div>
    </div>
  );

  const renderAppSettingsTab = () => (
    <div className="settings-section">
      <div className="settings-section__header">
        <h2 className="settings-section__title">App Settings</h2>
        <p className="settings-section__description">Customize your StudioOS experience</p>
      </div>

      <div className="settings-card">
        <h3 className="settings-card__title">Appearance</h3>
        <div className="settings-options">
          <div className="settings-option">
            <div className="settings-option__info">
              <span className="settings-option__label">Theme</span>
              <span className="settings-option__description">Choose your preferred color scheme</span>
            </div>
            <select
              className="settings-form__select settings-form__select--inline"
              value={appSettings.theme}
              onChange={(e) => setAppSettings({ ...appSettings, theme: e.target.value as AppSettings['theme'] })}
            >
              <option value="dark">Dark</option>
              <option value="light">Light</option>
              <option value="system">System</option>
            </select>
          </div>
          <div className="settings-option">
            <div className="settings-option__info">
              <span className="settings-option__label">Compact Mode</span>
              <span className="settings-option__description">Reduce spacing for more content</span>
            </div>
            <label className="settings-toggle">
              <input
                type="checkbox"
                checked={appSettings.compactMode}
                onChange={() => setAppSettings({ ...appSettings, compactMode: !appSettings.compactMode })}
              />
              <span className="settings-toggle__slider"></span>
            </label>
          </div>
          <div className="settings-option">
            <div className="settings-option__info">
              <span className="settings-option__label">Show Tips</span>
              <span className="settings-option__description">Display helpful hints and suggestions</span>
            </div>
            <label className="settings-toggle">
              <input
                type="checkbox"
                checked={appSettings.showTips}
                onChange={() => setAppSettings({ ...appSettings, showTips: !appSettings.showTips })}
              />
              <span className="settings-toggle__slider"></span>
            </label>
          </div>
        </div>
      </div>

      <div className="settings-card">
        <h3 className="settings-card__title">Notifications</h3>
        <div className="settings-options">
          <div className="settings-option">
            <div className="settings-option__info">
              <span className="settings-option__label">Email Notifications</span>
              <span className="settings-option__description">Receive updates via email</span>
            </div>
            <label className="settings-toggle">
              <input
                type="checkbox"
                checked={appSettings.notifications.email}
                onChange={() => handleNotificationChange('email')}
              />
              <span className="settings-toggle__slider"></span>
            </label>
          </div>
          <div className="settings-option">
            <div className="settings-option__info">
              <span className="settings-option__label">Push Notifications</span>
              <span className="settings-option__description">Get notified in your browser</span>
            </div>
            <label className="settings-toggle">
              <input
                type="checkbox"
                checked={appSettings.notifications.push}
                onChange={() => handleNotificationChange('push')}
              />
              <span className="settings-toggle__slider"></span>
            </label>
          </div>
          <div className="settings-option">
            <div className="settings-option__info">
              <span className="settings-option__label">Job Complete Alerts</span>
              <span className="settings-option__description">Notify when processing finishes</span>
            </div>
            <label className="settings-toggle">
              <input
                type="checkbox"
                checked={appSettings.notifications.jobComplete}
                onChange={() => handleNotificationChange('jobComplete')}
              />
              <span className="settings-toggle__slider"></span>
            </label>
          </div>
          <div className="settings-option">
            <div className="settings-option__info">
              <span className="settings-option__label">Review Required</span>
              <span className="settings-option__description">Alert when assets need review</span>
            </div>
            <label className="settings-toggle">
              <input
                type="checkbox"
                checked={appSettings.notifications.reviewRequired}
                onChange={() => handleNotificationChange('reviewRequired')}
              />
              <span className="settings-toggle__slider"></span>
            </label>
          </div>
          <div className="settings-option">
            <div className="settings-option__info">
              <span className="settings-option__label">Weekly Digest</span>
              <span className="settings-option__description">Summary of activity each week</span>
            </div>
            <label className="settings-toggle">
              <input
                type="checkbox"
                checked={appSettings.notifications.weeklyDigest}
                onChange={() => handleNotificationChange('weeklyDigest')}
              />
              <span className="settings-toggle__slider"></span>
            </label>
          </div>
        </div>
      </div>

      <div className="settings-card">
        <h3 className="settings-card__title">Workflow</h3>
        <div className="settings-options">
          <div className="settings-option">
            <div className="settings-option__info">
              <span className="settings-option__label">Auto-Save</span>
              <span className="settings-option__description">Automatically save changes</span>
            </div>
            <label className="settings-toggle">
              <input
                type="checkbox"
                checked={appSettings.autoSave}
                onChange={() => setAppSettings({ ...appSettings, autoSave: !appSettings.autoSave })}
              />
              <span className="settings-toggle__slider"></span>
            </label>
          </div>
        </div>
      </div>
    </div>
  );

  const renderBillingTab = () => (
    <div className="settings-section">
      <div className="settings-section__header">
        <h2 className="settings-section__title">Billing</h2>
        <p className="settings-section__description">Manage your payment methods and invoices</p>
      </div>

      <div className="settings-card">
        <div className="settings-card__header">
          <div>
            <h3 className="settings-card__title">Current Plan</h3>
            <p className="settings-card__description">
              <span className={`status-badge status-badge--${billing.status}`}>
                {billing.status === 'active' ? '● Active' : billing.status}
              </span>
            </p>
          </div>
          <div className="billing-plan-info">
            <span className="billing-plan-name">{billing.plan}</span>
            <span className="billing-plan-price">${billing.amount}/mo</span>
          </div>
        </div>
        <p className="settings-card__note">
          Next billing date: {new Date(billing.nextBillingDate).toLocaleDateString('en-US', { 
            year: 'numeric', month: 'long', day: 'numeric' 
          })}
        </p>
      </div>

      <div className="settings-card">
        <h3 className="settings-card__title">Payment Method</h3>
        <div className="payment-method">
          <div className="payment-method__icon">
            {billing.paymentMethod.brand === 'Visa' ? '💳' : '🏦'}
          </div>
          <div className="payment-method__details">
            <span className="payment-method__name">
              {billing.paymentMethod.brand} ending in {billing.paymentMethod.last4}
            </span>
            <span className="payment-method__expiry">
              Expires {billing.paymentMethod.expiry}
            </span>
          </div>
          <button className="btn btn--secondary btn--sm">Update</button>
        </div>
      </div>

      <div className="settings-card">
        <h3 className="settings-card__title">Billing History</h3>
        <div className="invoices-table">
          <div className="invoices-table__header">
            <span>Invoice</span>
            <span>Date</span>
            <span>Amount</span>
            <span>Status</span>
            <span></span>
          </div>
          {billing.invoices.map((invoice) => (
            <div key={invoice.id} className="invoices-table__row">
              <span className="invoice-id">{invoice.id}</span>
              <span>{new Date(invoice.date).toLocaleDateString()}</span>
              <span>${invoice.amount.toFixed(2)}</span>
              <span className={`status-badge status-badge--${invoice.status}`}>
                {invoice.status}
              </span>
              <button className="btn btn--ghost btn--sm">Download</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderSubscriptionTab = () => (
    <div className="settings-section">
      <div className="settings-section__header">
        <h2 className="settings-section__title">Subscription</h2>
        <p className="settings-section__description">Manage your plan and usage</p>
      </div>

      <div className="settings-card">
        <h3 className="settings-card__title">Usage This Month</h3>
        <div className="usage-stats">
          <div className="usage-stat">
            <div className="usage-stat__header">
              <span className="usage-stat__label">Assets Processed</span>
              <span className="usage-stat__value">
                {subscription.usage.assetsProcessed} / {subscription.usage.assetsLimit}
              </span>
            </div>
            <div className="usage-stat__bar">
              <div 
                className="usage-stat__fill"
                style={{ width: `${(subscription.usage.assetsProcessed / subscription.usage.assetsLimit) * 100}%` }}
              />
            </div>
          </div>
          <div className="usage-stat">
            <div className="usage-stat__header">
              <span className="usage-stat__label">Storage Used</span>
              <span className="usage-stat__value">
                {subscription.usage.storageUsed} GB / {subscription.usage.storageLimit} GB
              </span>
            </div>
            <div className="usage-stat__bar">
              <div 
                className="usage-stat__fill"
                style={{ width: `${(subscription.usage.storageUsed / subscription.usage.storageLimit) * 100}%` }}
              />
            </div>
          </div>
          <div className="usage-stat">
            <div className="usage-stat__header">
              <span className="usage-stat__label">Team Members</span>
              <span className="usage-stat__value">
                {subscription.usage.teamMembers} / {subscription.usage.teamLimit}
              </span>
            </div>
            <div className="usage-stat__bar">
              <div 
                className="usage-stat__fill"
                style={{ width: `${(subscription.usage.teamMembers / subscription.usage.teamLimit) * 100}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="settings-card">
        <h3 className="settings-card__title">Available Plans</h3>
        <div className="plans-grid">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={`plan-card ${plan.id === subscription.plan ? 'plan-card--current' : ''} ${plan.popular ? 'plan-card--popular' : ''}`}
            >
              {plan.popular && <span className="plan-card__badge">Popular</span>}
              {plan.id === subscription.plan && <span className="plan-card__badge plan-card__badge--current">Current</span>}
              <h4 className="plan-card__name">{plan.name}</h4>
              <div className="plan-card__price">
                {plan.price === -1 ? (
                  <span className="plan-card__price-custom">Contact Sales</span>
                ) : (
                  <>
                    <span className="plan-card__price-amount">${plan.price}</span>
                    <span className="plan-card__price-period">/month</span>
                  </>
                )}
              </div>
              <ul className="plan-card__features">
                {plan.features.map((feature, i) => (
                  <li key={i}>✓ {feature}</li>
                ))}
              </ul>
              <button
                className={`btn ${plan.id === subscription.plan ? 'btn--secondary' : 'btn--primary'} btn--full`}
                disabled={plan.id === subscription.plan}
              >
                {plan.id === subscription.plan ? 'Current Plan' : plan.price === -1 ? 'Contact Sales' : 'Upgrade'}
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="settings-card settings-card--warning">
        <h3 className="settings-card__title">Cancel Subscription</h3>
        <p className="settings-card__description">
          Your subscription will remain active until the end of the current billing period.
        </p>
        <button className="btn btn--danger-outline">Cancel Subscription</button>
      </div>
    </div>
  );

  const renderContent = () => {
    switch (activeTab) {
      case 'profile':
        return renderProfileTab();
      case 'account':
        return renderAccountTab();
      case 'app':
        return renderAppSettingsTab();
      case 'billing':
        return renderBillingTab();
      case 'subscription':
        return renderSubscriptionTab();
    }
  };

  return (
    <div className="settings-view">
      <div className="settings-view__header">
        <h1 className="settings-view__title">Settings</h1>
        <p className="settings-view__subtitle">Manage your account and preferences</p>
      </div>

      <div className="settings-layout">
        {/* Sidebar Navigation */}
        <nav className="settings-nav">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              className={`settings-nav__item ${activeTab === tab.id ? 'settings-nav__item--active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className="settings-nav__icon">{tab.icon}</span>
              <span className="settings-nav__label">{tab.label}</span>
            </button>
          ))}
        </nav>

        {/* Content Area */}
        <main className="settings-content">
          {renderContent()}

          {/* Save Bar */}
          <div className="settings-save-bar">
            {saved && (
              <span className="settings-save-bar__message">
                ✓ Changes saved successfully
              </span>
            )}
            <button
              className="btn btn--primary"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </main>
      </div>
    </div>
  );
}

export default SettingsView;
