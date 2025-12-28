/**
 * StudioOS Job Events (SSE Client)
 * 
 * Server-Sent Events client for real-time job progress notifications.
 * Provides typed event handling for all job lifecycle phases.
 */

import type { JobProgressEvent } from './types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

type JobEventCallback = (event: JobProgressEvent) => void;
type ErrorCallback = (error: Event) => void;

interface SubscriptionOptions {
  onProgress?: JobEventCallback;
  onCompleted?: JobEventCallback;
  onFailed?: JobEventCallback;
  onError?: ErrorCallback;
}

/**
 * Subscribe to job progress events via SSE
 */
export function subscribeToJobEvents(
  projectId: number,
  options: SubscriptionOptions
): () => void {
  const token = localStorage.getItem('token');
  if (!token) {
    console.error('[JobEvents] No auth token available');
    return () => {};
  }

  // SSE endpoint with auth
  const url = `${API_URL}/jobs/events?projectId=${projectId}&token=${encodeURIComponent(token)}`;
  
  const eventSource = new EventSource(url);

  eventSource.onopen = () => {
    console.log('[JobEvents] Connected to job events stream');
  };

  eventSource.onmessage = (event) => {
    try {
      const data: JobProgressEvent = JSON.parse(event.data);
      
      // Route to appropriate callback based on event type
      if (data.type === 'job:completed' && options.onCompleted) {
        options.onCompleted(data);
      } else if (data.type === 'job:failed' && options.onFailed) {
        options.onFailed(data);
      } else if (options.onProgress) {
        options.onProgress(data);
      }
    } catch (err) {
      console.error('[JobEvents] Failed to parse event:', err);
    }
  };

  eventSource.onerror = (error) => {
    console.error('[JobEvents] SSE error:', error);
    if (options.onError) {
      options.onError(error);
    }
  };

  // Return cleanup function
  return () => {
    eventSource.close();
    console.log('[JobEvents] Disconnected from job events stream');
  };
}

/**
 * Hook-style job subscription for React components
 */
export class JobEventsClient {
  private eventSource: EventSource | null = null;
  private listeners: Map<string, Set<JobEventCallback>> = new Map();

  connect(projectId: number): void {
    if (this.eventSource) {
      this.disconnect();
    }

    const token = localStorage.getItem('token');
    if (!token) {
      console.error('[JobEventsClient] No auth token');
      return;
    }

    const url = `${API_URL}/jobs/events?projectId=${projectId}&token=${encodeURIComponent(token)}`;
    this.eventSource = new EventSource(url);

    this.eventSource.onmessage = (event) => {
      try {
        const data: JobProgressEvent = JSON.parse(event.data);
        this.emit(data.type, data);
        this.emit('*', data); // Wildcard for all events
      } catch (err) {
        console.error('[JobEventsClient] Parse error:', err);
      }
    };

    this.eventSource.onerror = () => {
      // Auto-reconnect after 5 seconds
      setTimeout(() => {
        if (this.eventSource?.readyState === EventSource.CLOSED) {
          this.connect(projectId);
        }
      }, 5000);
    };
  }

  disconnect(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }

  on(eventType: string, callback: JobEventCallback): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType)!.add(callback);

    // Return unsubscribe function
    return () => {
      this.listeners.get(eventType)?.delete(callback);
    };
  }

  private emit(eventType: string, data: JobProgressEvent): void {
    this.listeners.get(eventType)?.forEach((callback) => callback(data));
  }

  get isConnected(): boolean {
    return this.eventSource?.readyState === EventSource.OPEN;
  }
}

// Singleton instance
export const jobEvents = new JobEventsClient();
