/**
 * StudioOS API Client
 * 
 * Typed fetch wrappers for all StudioOS endpoints.
 * Follows StudioOS approved terminology and error handling patterns.
 */

import axios from 'axios';
import type { AxiosInstance, AxiosError } from 'axios';
import type {
  AuthResponse,
  Project,
  CreateProjectPayload,
  UpdateProjectPayload,
  Asset,
  CreateAssetPayload,
  Job,
  CreateJobPayload,
  RerunJobPayload,
  Report,
  FormattedReport,
  Delivery,
  CreateDeliveryPayload,
  Approval,
  CreateApprovalPayload,
  Preset,
  PaginatedResponse,
  ApiError,
  AudioAnalysisResult,
  SearchRequest,
  SearchResponse,
  ExportValidationRequest,
  ExportValidationResult,
  ExportConfig,
} from './types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

class StudioOSClient {
  private client: AxiosInstance;
  private token: string | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: API_URL,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Load token from localStorage
    this.token = localStorage.getItem('token');
    if (this.token) {
      this.setAuthHeader();
    }

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError<ApiError>) => {
        if (error.response?.status === 401) {
          this.logout();
        }
        return Promise.reject(this.formatError(error));
      }
    );
  }

  private setAuthHeader() {
    if (this.token) {
      this.client.defaults.headers.common['Authorization'] = `Bearer ${this.token}`;
    } else {
      delete this.client.defaults.headers.common['Authorization'];
    }
  }

  private formatError(error: AxiosError<ApiError>): ApiError {
    if (error.response?.data?.error) {
      return error.response.data;
    }
    return {
      error: error.message || 'An unexpected error occurred',
      category: 'SYSTEM',
    };
  }

  // ===========================================================================
  // Auth
  // ===========================================================================

  async register(email: string, password: string): Promise<AuthResponse> {
    const response = await this.client.post<AuthResponse>('/auth/register', { email, password });
    this.setToken(response.data.token);
    return response.data;
  }

  async login(email: string, password: string): Promise<AuthResponse> {
    const response = await this.client.post<AuthResponse>('/auth/login', { email, password });
    this.setToken(response.data.token);
    return response.data;
  }

  setToken(token: string) {
    this.token = token;
    localStorage.setItem('token', token);
    this.setAuthHeader();
  }

  getToken(): string | null {
    return this.token;
  }

  logout() {
    this.token = null;
    localStorage.removeItem('token');
    this.setAuthHeader();
  }

  isAuthenticated(): boolean {
    return this.token !== null;
  }

  // ===========================================================================
  // Projects
  // ===========================================================================

  async getProjects(): Promise<PaginatedResponse<Project>> {
    const response = await this.client.get<PaginatedResponse<Project>>('/api/projects');
    return response.data;
  }

  async getProject(id: number): Promise<Project> {
    const response = await this.client.get<Project>(`/api/projects/${id}`);
    return response.data;
  }

  async createProject(payload: CreateProjectPayload): Promise<Project> {
    const response = await this.client.post<Project>('/api/projects', payload);
    return response.data;
  }

  async updateProject(id: number, payload: UpdateProjectPayload): Promise<Project> {
    const response = await this.client.patch<Project>(`/api/projects/${id}`, payload);
    return response.data;
  }

  async deleteProject(id: number): Promise<void> {
    await this.client.delete(`/api/projects/${id}`);
  }

  /** Transition project to next state (DRAFT → PROCESSING → READY → DELIVERED) */
  async transitionProject(id: number, state: string): Promise<Project> {
    const response = await this.client.post<Project>(`/api/projects/${id}/transition`, { state });
    return response.data;
  }

  // ===========================================================================
  // Assets
  // ===========================================================================

  async getAssets(projectId: number): Promise<PaginatedResponse<Asset>> {
    const response = await this.client.get<PaginatedResponse<Asset>>(`/api/assets?projectId=${projectId}`);
    return response.data;
  }

  async getAsset(id: number): Promise<Asset> {
    const response = await this.client.get<Asset>(`/api/assets/${id}`);
    return response.data;
  }

  async getAssetLineage(id: number): Promise<Asset[]> {
    const response = await this.client.get<Asset[]>(`/api/assets/${id}/lineage`);
    return response.data;
  }

  async createAsset(projectId: number, payload: CreateAssetPayload): Promise<Asset> {
    const response = await this.client.post<Asset>(`/api/assets?projectId=${projectId}`, payload);
    return response.data;
  }

  async uploadAsset(projectId: number, file: File, metadata?: Record<string, unknown>): Promise<Asset> {
    const formData = new FormData();
    formData.append('file', file);
    if (metadata) {
      formData.append('metadata', JSON.stringify(metadata));
    }
    
    const response = await this.client.post<Asset>(`/api/assets/upload?projectId=${projectId}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  }

  // ===========================================================================
  // Jobs
  // ===========================================================================

  async getJobs(projectId: number, state?: string): Promise<PaginatedResponse<Job>> {
    let url = `/api/jobs?projectId=${projectId}`;
    if (state) {
      url += `&state=${state}`;
    }
    const response = await this.client.get<PaginatedResponse<Job>>(url);
    return response.data;
  }

  async getJob(id: number): Promise<Job> {
    const response = await this.client.get<Job>(`/api/jobs/${id}`);
    return response.data;
  }

  async getPresets(): Promise<Preset[]> {
    const response = await this.client.get<{ data: Preset[]; count: number }>('/api/jobs/presets');
    return response.data.data;
  }

  async submitJob(payload: CreateJobPayload): Promise<Job> {
    const response = await this.client.post<Job>('/api/jobs', payload);
    return response.data;
  }

  async rerunJob(payload: RerunJobPayload): Promise<Job> {
    const response = await this.client.post<Job>('/api/jobs/rerun', payload);
    return response.data;
  }

  async cancelJob(id: number): Promise<Job> {
    const response = await this.client.post<Job>(`/api/jobs/${id}/cancel`);
    return response.data;
  }

  // ===========================================================================
  // Reports
  // ===========================================================================

  async getJobReport(jobId: number): Promise<Report> {
    const response = await this.client.get<Report>(`/api/jobs/${jobId}/report`);
    return response.data;
  }

  async getFormattedReport(jobId: number): Promise<FormattedReport> {
    const response = await this.client.get<FormattedReport>(`/api/jobs/${jobId}/report/formatted`);
    return response.data;
  }

  // ===========================================================================
  // Deliveries
  // ===========================================================================

  async getDeliveries(projectId: number): Promise<PaginatedResponse<Delivery>> {
    const response = await this.client.get<PaginatedResponse<Delivery>>(`/api/deliveries?projectId=${projectId}`);
    return response.data;
  }

  async getDelivery(id: number): Promise<Delivery> {
    const response = await this.client.get<Delivery>(`/api/deliveries/${id}`);
    return response.data;
  }

  async createDelivery(payload: CreateDeliveryPayload): Promise<Delivery> {
    const response = await this.client.post<Delivery>('/api/deliveries', payload);
    return response.data;
  }

  async executeDelivery(id: number): Promise<Delivery> {
    const response = await this.client.post<Delivery>(`/api/deliveries/${id}/execute`);
    return response.data;
  }

  // ===========================================================================
  // Approvals (Dashboard Two)
  // ===========================================================================

  async getAssetApprovals(assetId: number): Promise<Approval[]> {
    const response = await this.client.get<Approval[]>(`/api/assets/${assetId}/approvals`);
    return response.data;
  }

  async approveAsset(assetId: number, payload: CreateApprovalPayload): Promise<Approval> {
    const response = await this.client.post<Approval>(`/api/assets/${assetId}/approve`, payload);
    return response.data;
  }

  // ===========================================================================
  // Metadata
  // ===========================================================================

  async updateAssetMetadata(assetId: number, metadata: Record<string, unknown>): Promise<Asset> {
    const response = await this.client.patch<Asset>(`/api/assets/${assetId}/metadata`, { metadata });
    return response.data;
  }

  // ===========================================================================
  // Audio Analysis
  // ===========================================================================

  async uploadAndAnalyze(file: File): Promise<AudioAnalysisResult> {
    const formData = new FormData();
    formData.append('audio', file);
    
    const response = await this.client.post<AudioAnalysisResult>('/api/audio/upload-and-analyze', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  }

  // ===========================================================================
  // Search
  // ===========================================================================

  async search(params: SearchRequest): Promise<SearchResponse> {
    const response = await this.client.post<SearchResponse>('/api/search', params);
    return response.data;
  }

  async getSearchSuggestions(query: string, limit = 10): Promise<{ suggestions: string[] }> {
    const response = await this.client.get<{ suggestions: string[] }>(`/api/search/suggestions?q=${encodeURIComponent(query)}&limit=${limit}`);
    return response.data;
  }

  // ===========================================================================
  // Platform Exports
  // ===========================================================================

  async validateExport(configs: ExportValidationRequest[]): Promise<ExportValidationResult[]> {
    const response = await this.client.post<{ results: ExportValidationResult[] }>('/api/exports/validate', { configs });
    return response.data.results;
  }

  async startExport(configs: ExportConfig[]): Promise<{ exportId: string; status: string }> {
    const response = await this.client.post<{ exportId: string; status: string }>('/api/exports/start', { configs });
    return response.data;
  }

  // ===========================================================================
  // Health
  // ===========================================================================

  async health(): Promise<{ status: string; db: string }> {
    const response = await this.client.get('/health');
    return response.data;
  }
}

export const studioOS = new StudioOSClient();
export default studioOS;
