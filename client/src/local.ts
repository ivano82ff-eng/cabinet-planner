import { buildCabinet, describeSize, parseConfig, type CabinetConfig } from '@planner/shared';
import type { ProjectDetail, ProjectInput, ProjectSummary } from './api';

const KEY = 'korpus.projects';

interface StoredProject {
  id: string;
  name: string;
  customerName: string;
  customerEmail: string;
  createdAt: string;
  updatedAt: string;
  config: CabinetConfig;
}

export function listLocalProjects(): ProjectSummary[] {
  return read()
    .map(present)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function readLocalProject(id: string): ProjectDetail | null {
  const found = read().find((item) => item.id === id);
  return found ? present(found) : null;
}

export function saveLocalProject(input: ProjectInput, id: string | null): ProjectDetail {
  const items = read();
  const now = new Date().toISOString();
  const config = parseConfig({ ...input.config, name: input.name || input.config.name });
  const current = id ? items.find((item) => item.id === id) : undefined;
  const next: StoredProject = {
    id: current?.id ?? crypto.randomUUID(),
    name: config.name,
    customerName: input.customerName.trim(),
    customerEmail: input.customerEmail.trim(),
    createdAt: current?.createdAt ?? now,
    updatedAt: now,
    config,
  };
  const rest = items.filter((item) => item.id !== next.id);
  write([next, ...rest]);
  return present(next);
}

function present(project: StoredProject): ProjectDetail {
  const result = buildCabinet(project.config);
  return {
    id: project.id,
    name: project.name,
    customerName: project.customerName,
    customerEmail: project.customerEmail,
    wooOrderId: null,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    size: describeSize(project.config),
    cost: result.totals.cost,
    config: project.config,
    bom: result.bom,
    warnings: result.warnings,
    totals: result.totals,
  };
}

function read(): StoredProject[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      const project = revive(item);
      return project ? [project] : [];
    });
  } catch {
    return [];
  }
}

function revive(item: unknown): StoredProject | null {
  if (!item || typeof item !== 'object') return null;
  const record = item as Record<string, unknown>;
  try {
    const config = parseConfig(record.config);
    const id = typeof record.id === 'string' ? record.id : '';
    if (!id) return null;
    return {
      id,
      name: config.name,
      customerName: text(record.customerName),
      customerEmail: text(record.customerEmail),
      createdAt: text(record.createdAt) || new Date(0).toISOString(),
      updatedAt: text(record.updatedAt) || new Date(0).toISOString(),
      config,
    };
  } catch {
    return null;
  }
}

function write(items: StoredProject[]): void {
  localStorage.setItem(KEY, JSON.stringify(items));
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
