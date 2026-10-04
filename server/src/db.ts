import { mkdirSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { CATALOG, parseConfig, type CabinetConfig } from '@planner/shared';
import { PGlite } from '@electric-sql/pglite';
import { Pool } from 'pg';

export interface Database {
  query<T>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
}

export interface ProjectRecord {
  id: string;
  name: string;
  customerName: string;
  customerEmail: string;
  config: CabinetConfig;
  wooOrderId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MaterialRecord {
  id: string;
  name: string;
  color: string;
  pricePerM2: number;
  edgePerM: number;
}

interface ProjectRow {
  id: string;
  name: string;
  customer_name: string;
  customer_email: string;
  config: unknown;
  woo_order_id: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

const SCHEMA = readFileSync(new URL('../sql/001_init.sql', import.meta.url), 'utf8');

export async function openDatabase(): Promise<{ db: Database; mode: 'postgres' | 'embedded' }> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const db = await connectPostgres(url);
    await migrate(db);
    return { db, mode: 'postgres' };
  }
  const dataDir = fileURLToPath(new URL('../../data/pglite', import.meta.url));
  return { db: await openEmbedded(dataDir), mode: 'embedded' };
}

export async function openEmbedded(dataDir: string): Promise<Database> {
  mkdirSync(dataDir, { recursive: true });
  const lite = new PGlite(dataDir);
  const db = new LiteDatabase(lite);
  await migrate(db);
  return db;
}

class PgDatabase implements Database {
  constructor(private readonly pool: Pool) {}

  async query<T>(text: string, params: unknown[] = []): Promise<{ rows: T[] }> {
    const result = await this.pool.query<T & Record<string, unknown>>(text, params as never[]);
    return { rows: result.rows };
  }

  async exec(sql: string): Promise<void> {
    await this.pool.query(sql);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

class LiteDatabase implements Database {
  constructor(private readonly lite: PGlite) {}

  async query<T>(text: string, params: unknown[] = []): Promise<{ rows: T[] }> {
    const result = await this.lite.query<T>(text, params);
    return { rows: result.rows };
  }

  async exec(sql: string): Promise<void> {
    await this.lite.exec(sql);
  }

  async close(): Promise<void> {
    await this.lite.close();
  }
}

async function connectPostgres(url: string): Promise<Database> {
  const pool = new Pool({ connectionString: url });
  let lastError: unknown;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      await pool.query('select 1');
      return new PgDatabase(pool);
    } catch (error) {
      lastError = error;
      await delay(1000);
    }
  }
  await pool.end();
  throw lastError instanceof Error ? lastError : new Error('Не удалось подключиться к Postgres.');
}

async function migrate(db: Database): Promise<void> {
  await db.exec(SCHEMA);
  await db.query(`INSERT INTO schema_migrations (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`, ['001']);
  for (const material of CATALOG) {
    await db.query(
      `INSERT INTO materials (id, name, color, price_per_m2, edge_per_m)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE
         SET name = EXCLUDED.name,
             color = EXCLUDED.color,
             price_per_m2 = EXCLUDED.price_per_m2,
             edge_per_m = EXCLUDED.edge_per_m`,
      [material.id, material.name, material.color, material.pricePerM2, material.edgePerM],
    );
  }
}

const PROJECT_COLUMNS = `id, name, customer_name, customer_email, config, woo_order_id, created_at, updated_at`;

export async function listProjects(db: Database): Promise<ProjectRecord[]> {
  const result = await db.query<ProjectRow>(
    `SELECT ${PROJECT_COLUMNS} FROM projects ORDER BY updated_at DESC LIMIT 50`,
  );
  return result.rows.map(mapProject);
}

export async function getProject(db: Database, id: string): Promise<ProjectRecord | null> {
  const result = await db.query<ProjectRow>(`SELECT ${PROJECT_COLUMNS} FROM projects WHERE id = $1`, [id]);
  const row = result.rows[0];
  return row ? mapProject(row) : null;
}

export async function findProjectByWoo(db: Database, wooOrderId: string): Promise<ProjectRecord | null> {
  const result = await db.query<ProjectRow>(`SELECT ${PROJECT_COLUMNS} FROM projects WHERE woo_order_id = $1`, [
    wooOrderId,
  ]);
  const row = result.rows[0];
  return row ? mapProject(row) : null;
}

export interface NewProject {
  name: string;
  customerName: string;
  customerEmail: string;
  config: CabinetConfig;
  wooOrderId?: string | null;
}

export async function insertProject(db: Database, project: NewProject): Promise<ProjectRecord> {
  const result = await db.query<ProjectRow>(
    `INSERT INTO projects (id, name, customer_name, customer_email, config, woo_order_id)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6)
     RETURNING ${PROJECT_COLUMNS}`,
    [
      randomUUID(),
      project.name,
      project.customerName,
      project.customerEmail,
      JSON.stringify(project.config),
      project.wooOrderId ?? null,
    ],
  );
  const row = result.rows[0];
  if (!row) throw new Error('Проект не сохранился.');
  return mapProject(row);
}

export async function updateProject(db: Database, id: string, project: NewProject): Promise<ProjectRecord | null> {
  const result = await db.query<ProjectRow>(
    `UPDATE projects
        SET name = $2,
            customer_name = $3,
            customer_email = $4,
            config = $5::jsonb,
            updated_at = now()
      WHERE id = $1
      RETURNING ${PROJECT_COLUMNS}`,
    [id, project.name, project.customerName, project.customerEmail, JSON.stringify(project.config)],
  );
  const row = result.rows[0];
  return row ? mapProject(row) : null;
}

export async function listMaterials(db: Database): Promise<MaterialRecord[]> {
  const result = await db.query<{
    id: string;
    name: string;
    color: string;
    price_per_m2: number;
    edge_per_m: number;
  }>('SELECT id, name, color, price_per_m2, edge_per_m FROM materials ORDER BY name');
  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    color: row.color,
    pricePerM2: Number(row.price_per_m2),
    edgePerM: Number(row.edge_per_m),
  }));
}

export function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = 'code' in error ? String((error as { code: unknown }).code) : '';
  const message = error instanceof Error ? error.message : '';
  return code === '23505' || message.toLowerCase().includes('duplicate key');
}

function mapProject(row: ProjectRow): ProjectRecord {
  const stored = typeof row.config === 'string' ? JSON.parse(row.config) : row.config;
  return {
    id: row.id,
    name: row.name,
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    config: parseConfig(stored),
    wooOrderId: row.woo_order_id,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function toIso(value: Date | string): string {
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
