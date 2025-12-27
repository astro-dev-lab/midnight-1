import axios, { AxiosInstance } from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export interface RegisterPayload {
  email: string;
  password: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  user: {
    id: string;
    email: string;
    role: string;
  };
}

export interface Ping {
  id: string;
  message: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePingPayload {
  message: string;
}

export interface UpdatePingPayload {
  message: string;
}

class ApiClient {
  private client: AxiosInstance;
  private token: string | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: API_URL,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Load token from localStorage if available
    this.token = localStorage.getItem('token');
    if (this.token) {
      this.setAuthHeader();
    }

    // Add response interceptor for token refresh or error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          // Clear token on 401
          this.logout();
        }
        return Promise.reject(error);
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

  async register(payload: RegisterPayload): Promise<AuthResponse> {
    const response = await this.client.post<AuthResponse>('/auth/register', payload);
    this.setToken(response.data.token);
    return response.data;
  }

  async login(payload: LoginPayload): Promise<AuthResponse> {
    const response = await this.client.post<AuthResponse>('/auth/login', payload);
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

  // Ping endpoints
  async getPings(): Promise<Ping[]> {
    const response = await this.client.get<Ping[]>('/pings');
    return response.data;
  }

  async getPing(id: string): Promise<Ping> {
    const response = await this.client.get<Ping>(`/pings/${id}`);
    return response.data;
  }

  async createPing(payload: CreatePingPayload): Promise<Ping> {
    const response = await this.client.post<Ping>('/pings', payload);
    return response.data;
  }

  async updatePing(id: string, payload: UpdatePingPayload): Promise<Ping> {
    const response = await this.client.put<Ping>(`/pings/${id}`, payload);
    return response.data;
  }

  async deletePing(id: string): Promise<void> {
    await this.client.delete(`/pings/${id}`);
  }

  async health() {
    const response = await this.client.get('/health');
    return response.data;
  }
}

export const api = new ApiClient();
