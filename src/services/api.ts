
import { Project, CatalogItem, UserProfile, EstimateResult } from '../types';

const API_BASE = '/api';

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let errorMessage = `Request failed with status ${res.status}`;
    try {
      const errorData = await res.json();
      errorMessage = errorData.error || errorData.message || errorMessage;
    } catch (e) {
      // If not JSON, try text
      try {
        const text = await res.text();
        if (text) errorMessage = text.substring(0, 100); // Limit length
      } catch (e2) {}
    }
    throw new Error(errorMessage);
  }
  
  const contentType = res.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    return res.json();
  }
  return {} as T;
}

export const api = {
  async getProjects(): Promise<Project[]> {
    const res = await fetch(`${API_BASE}/projects`);
    return handleResponse<Project[]>(res);
  },
  async getProject(id: string): Promise<Project> {
    const res = await fetch(`${API_BASE}/projects/${id}`);
    return handleResponse<Project>(res);
  },
  async createProject(project: Project): Promise<Project> {
    const res = await fetch(`${API_BASE}/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(project),
    });
    return handleResponse<Project>(res);
  },
  async updateProject(project: Project): Promise<Project> {
    const res = await fetch(`${API_BASE}/projects/${project.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(project),
    });
    return handleResponse<Project>(res);
  },
  async deleteProject(id: string): Promise<void> {
    const res = await fetch(`${API_BASE}/projects/${id}`, { method: 'DELETE' });
    await handleResponse<void>(res);
  },
  async getCatalog(): Promise<CatalogItem[]> {
    const res = await fetch(`${API_BASE}/catalog/items`);
    return handleResponse<CatalogItem[]>(res);
  },
  async createCatalogItem(item: CatalogItem): Promise<CatalogItem> {
    const res = await fetch(`${API_BASE}/catalog/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item),
    });
    return handleResponse<CatalogItem>(res);
  },
  async updateCatalogItem(item: CatalogItem): Promise<CatalogItem> {
    const res = await fetch(`${API_BASE}/catalog/items/${item.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item),
    });
    return handleResponse<CatalogItem>(res);
  },
  async deleteCatalogItem(id: string): Promise<void> {
    const res = await fetch(`${API_BASE}/catalog/items/${id}`, { method: 'DELETE' });
    await handleResponse<void>(res);
  },
  async calculateEstimate(project: Project): Promise<EstimateResult> {
    const res = await fetch(`${API_BASE}/estimate/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(project),
    });
    return handleResponse<EstimateResult>(res);
  },
  async getSettings(): Promise<UserProfile> {
    const res = await fetch(`${API_BASE}/settings`);
    return handleResponse<UserProfile>(res);
  },
  async updateSettings(settings: UserProfile): Promise<UserProfile> {
    const res = await fetch(`${API_BASE}/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    return handleResponse<UserProfile>(res);
  },
  async syncSheets(): Promise<{ message: string }> {
    const res = await fetch(`${API_BASE}/sync/sheets`, { method: 'POST' });
    return handleResponse<{ message: string }>(res);
  },
  async getGlobalBundles(): Promise<any[]> {
    const res = await fetch(`${API_BASE}/global/bundles`);
    return handleResponse<any[]>(res);
  },
  async getGlobalAddIns(): Promise<any[]> {
    const res = await fetch(`${API_BASE}/global/addins`);
    return handleResponse<any[]>(res);
  }
};
