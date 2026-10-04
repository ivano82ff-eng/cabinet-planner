import type { BomLine, CabinetConfig, Totals } from '@planner/shared';

export interface ProjectSummary {
  id: string;
  name: string;
  customerName: string;
  wooOrderId: string | null;
  updatedAt: string;
  size: string;
  cost: number;
}

export interface ProjectDetail extends ProjectSummary {
  customerEmail: string;
  config: CabinetConfig;
  createdAt: string;
  bom: BomLine[];
  warnings: string[];
  totals: Totals;
}

export interface ProjectInput {
  name: string;
  customerName: string;
  customerEmail: string;
  config: CabinetConfig;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function fetchHealth(): Promise<{ ok: boolean; db: string }> {
  return request('/api/health');
}

export function fetchProjects(): Promise<ProjectSummary[]> {
  return request('/api/projects');
}

export function fetchProject(id: string): Promise<ProjectDetail> {
  return request(`/api/projects/${id}`);
}

export function createProject(input: ProjectInput): Promise<ProjectDetail> {
  return request('/api/projects', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function updateProject(id: string, input: ProjectInput): Promise<ProjectDetail> {
  return request(`/api/projects/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  const text = await response.text();
  const payload = text ? (JSON.parse(text) as { error?: string }) : {};
  if (!response.ok) {
    throw new ApiError(payload.error || response.statusText, response.status);
  }
  return payload as T;
}

export function downloadText(filename: string, content: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
