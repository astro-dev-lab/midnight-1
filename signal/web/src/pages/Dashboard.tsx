import { useEffect, useState } from 'react';
import { api } from '../api';
import type { Ping, CreatePingPayload } from '../api';
import './Dashboard.css';

interface DashboardProps {
  onLogout: () => void;
}

export function Dashboard({ onLogout }: DashboardProps) {
  const [pings, setPings] = useState<Ping[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editMessage, setEditMessage] = useState('');

  useEffect(() => {
    fetchPings();
  }, []);

  const fetchPings = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.getPings();
      setPings(data);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load pings');
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePing = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;

    setSubmitting(true);
    setError('');

    try {
      const payload: CreatePingPayload = { message };
      const newPing = await api.createPing(payload);
      setPings([newPing, ...pings]);
      setMessage('');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create ping');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdatePing = async (id: string) => {
    if (!editMessage.trim()) return;

    setSubmitting(true);
    setError('');

    try {
      const updated = await api.updatePing(id, { message: editMessage });
      setPings(pings.map((p) => (p.id === id ? updated : p)));
      setEditingId(null);
      setEditMessage('');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to update ping');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeletePing = async (id: string) => {
    if (!window.confirm('Delete this ping?')) return;

    setError('');
    try {
      await api.deletePing(id);
      setPings(pings.filter((p) => p.id !== id));
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to delete ping');
    }
  };

  const startEdit = (ping: Ping) => {
    setEditingId(ping.id);
    setEditMessage(ping.message);
  };

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h1>Pings Dashboard</h1>
        <button onClick={onLogout} className="logout-btn">
          Logout
        </button>
      </div>

      <div className="create-ping-section">
        <h2>Create New Ping</h2>
        <form onSubmit={handleCreatePing}>
          <div className="form-group">
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Enter your message..."
              rows={3}
              disabled={submitting}
            />
          </div>
          <button type="submit" disabled={submitting || !message.trim()} className="submit-btn">
            {submitting ? 'Creating...' : 'Create Ping'}
          </button>
        </form>
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="pings-section">
        <h2>All Pings</h2>
        {loading ? (
          <p className="loading">Loading pings...</p>
        ) : pings.length === 0 ? (
          <p className="empty">No pings yet. Create one!</p>
        ) : (
          <div className="pings-list">
            {pings.map((ping) => (
              <div key={ping.id} className="ping-card">
                {editingId === ping.id ? (
                  <div className="edit-form">
                    <textarea
                      value={editMessage}
                      onChange={(e) => setEditMessage(e.target.value)}
                      rows={2}
                    />
                    <div className="edit-actions">
                      <button
                        onClick={() => handleUpdatePing(ping.id)}
                        disabled={submitting}
                        className="save-btn"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        disabled={submitting}
                        className="cancel-btn"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="ping-message">{ping.message}</p>
                    <div className="ping-meta">
                      <small>{new Date(ping.createdAt).toLocaleString()}</small>
                    </div>
                    <div className="ping-actions">
                      <button
                        onClick={() => startEdit(ping)}
                        disabled={submitting}
                        className="edit-btn"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeletePing(ping.id)}
                        disabled={submitting}
                        className="delete-btn"
                      >
                        Delete
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
