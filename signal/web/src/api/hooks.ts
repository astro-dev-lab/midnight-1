/**
 * StudioOS React Hooks
 * 
 * Custom hooks for data fetching and real-time updates.
 * Provides clean integration with React components.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { studioOS } from './client';
import { jobEvents } from './events';
import type {
  Project,
  Asset,
  Job,
  Preset,
  JobProgressEvent,
  PaginatedResponse,
} from './types';

// =============================================================================
// Generic Fetch Hook
// =============================================================================

interface UseQueryResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

function useQuery<T>(fetcher: () => Promise<T>, deps: unknown[] = []): UseQueryResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetcher();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, deps);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}

// =============================================================================
// Project Hooks
// =============================================================================

export function useProjects(): UseQueryResult<PaginatedResponse<Project>> {
  return useQuery(() => studioOS.getProjects(), []);
}

export function useProject(id: number): UseQueryResult<Project> {
  return useQuery(() => studioOS.getProject(id), [id]);
}

// =============================================================================
// Asset Hooks
// =============================================================================

export function useAssets(projectId: number | null): UseQueryResult<PaginatedResponse<Asset>> {
  return useQuery(
    async () => {
      if (!projectId || projectId <= 0) {
        return { data: [], count: 0, total: 0, limit: 50, offset: 0 };
      }
      return studioOS.getAssets(projectId);
    },
    [projectId]
  );
}

export function useAsset(id: number | null): UseQueryResult<Asset> {
  return useQuery(
    async () => {
      if (!id || id <= 0) {
        throw new Error('Invalid asset ID');
      }
      return studioOS.getAsset(id);
    },
    [id]
  );
}

export function useAssetLineage(id: number | null): UseQueryResult<Asset[]> {
  return useQuery(
    async () => {
      if (!id || id <= 0) {
        return [];
      }
      return studioOS.getAssetLineage(id);
    },
    [id]
  );
}

// =============================================================================
// Job Hooks
// =============================================================================

export function useJobs(projectId: number | null, state?: string): UseQueryResult<PaginatedResponse<Job>> {
  return useQuery(
    async () => {
      if (!projectId || projectId <= 0) {
        return { data: [], count: 0, total: 0, limit: 50, offset: 0 };
      }
      return studioOS.getJobs(projectId, state);
    },
    [projectId, state]
  );
}

export function useJob(id: number): UseQueryResult<Job> {
  return useQuery(() => studioOS.getJob(id), [id]);
}

export function usePresets(): UseQueryResult<Preset[]> {
  return useQuery(() => studioOS.getPresets(), []);
}

// =============================================================================
// Job Submission Hook
// =============================================================================

interface UseSubmitJobResult {
  submit: (projectId: number, preset: string, assetIds: number[], parameters?: Record<string, unknown>) => Promise<Job>;
  submitting: boolean;
  error: string | null;
}

export function useSubmitJob(): UseSubmitJobResult {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(async (
    projectId: number,
    preset: string,
    assetIds: number[],
    parameters?: Record<string, unknown>
  ): Promise<Job> => {
    setSubmitting(true);
    setError(null);
    try {
      const job = await studioOS.submitJob({ projectId, preset, assetIds, parameters });
      return job;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to submit job';
      setError(message);
      throw err;
    } finally {
      setSubmitting(false);
    }
  }, []);

  return { submit, submitting, error };
}

// =============================================================================
// Job Progress Hook (SSE)
// =============================================================================

interface UseJobProgressResult {
  events: JobProgressEvent[];
  latestEvent: JobProgressEvent | null;
  isConnected: boolean;
  connect: () => void;
  disconnect: () => void;
}

export function useJobProgress(projectId: number | null): UseJobProgressResult {
  const [events, setEvents] = useState<JobProgressEvent[]>([]);
  const [latestEvent, setLatestEvent] = useState<JobProgressEvent | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const cleanupRef = useRef<(() => void) | null>(null);

  const connect = useCallback(() => {
    if (!projectId || projectId <= 0) {
      return;
    }
    
    if (cleanupRef.current) {
      cleanupRef.current();
    }

    jobEvents.connect(projectId);
    setIsConnected(true);

    // Subscribe to all events
    cleanupRef.current = jobEvents.on('*', (event) => {
      setLatestEvent(event);
      setEvents((prev) => [...prev.slice(-99), event]); // Keep last 100 events
    });
  }, [projectId]);

  const disconnect = useCallback(() => {
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }
    jobEvents.disconnect();
    setIsConnected(false);
  }, []);

  // Auto-connect on mount, disconnect on unmount
  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  return { events, latestEvent, isConnected, connect, disconnect };
}

// =============================================================================
// Auth Hook
// =============================================================================

interface UseAuthResult {
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  register: (email: string, password: string) => Promise<void>;
  loading: boolean;
  error: string | null;
}

export function useAuth(): UseAuthResult {
  const [isAuthenticated, setIsAuthenticated] = useState(studioOS.isAuthenticated());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const login = useCallback(async (email: string, password: string) => {
    setLoading(true);
    setError(null);
    try {
      await studioOS.login(email, password);
      setIsAuthenticated(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const register = useCallback(async (email: string, password: string) => {
    setLoading(true);
    setError(null);
    try {
      await studioOS.register(email, password);
      setIsAuthenticated(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Registration failed';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    studioOS.logout();
    setIsAuthenticated(false);
  }, []);

  return { isAuthenticated, login, logout, register, loading, error };
}
