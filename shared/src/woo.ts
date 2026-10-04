import { parseConfig, type ConfigError } from './cabinet';
import { MATERIALS } from './materials';
import type { CabinetConfig, CabinetType } from './types';

export interface OrderLine {
  name: string;
  config: CabinetConfig;
}

export interface IncomingOrder {
  orderId: string;
  customerName: string;
  customerEmail: string;
  lines: OrderLine[];
}

const FIELD_KEYS: Record<string, keyof CabinetConfig> = {
  type: 'type',
  width: 'width',
  height: 'height',
  depth: 'depth',
  material: 'materialId',
  materialid: 'materialId',
  shelves: 'shelves',
  doors: 'doors',
  drawers: 'drawers',
  plinth: 'plinthHeight',
  plinthheight: 'plinthHeight',
  thickness: 'thickness',
  тип: 'type',
  ширина: 'width',
  высота: 'height',
  глубина: 'depth',
  материал: 'materialId',
  полки: 'shelves',
  фасады: 'doors',
  двери: 'doors',
  ящики: 'drawers',
  цоколь: 'plinthHeight',
  толщина: 'thickness',
};

const TYPE_ALIASES: Record<string, CabinetType> = {
  base: 'base',
  wall: 'wall',
  tall: 'tall',
  drawer: 'drawer',
  тумба: 'base',
  навесной: 'wall',
  пенал: 'tall',
  комод: 'drawer',
};

export class OrderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OrderError';
  }
}

export function readOrder(body: unknown): IncomingOrder | null {
  if (!body || typeof body !== 'object') throw new OrderError('Пустое тело вебхука.');
  const record = body as Record<string, unknown>;
  if ('webhook_id' in record && !Array.isArray(record.line_items)) return null;

  const orderId = text(record.id ?? record.order_id);
  if (!orderId) throw new OrderError('В заказе нет идентификатора.');
  const billing = asRecord(record.billing);
  const first = text(billing?.first_name);
  const last = text(billing?.last_name);
  const customerName = [first, last].filter(Boolean).join(' ');
  const customerEmail = text(billing?.email);
  const items = Array.isArray(record.line_items) ? record.line_items : [];
  const lines: OrderLine[] = [];

  items.forEach((item, index) => {
    const source = asRecord(item);
    if (!source) return;
    const meta = readMeta(source.meta_data);
    if (!hasCabinetMeta(meta)) return;
    const name = text(source.name) || `Позиция ${index + 1}`;
    lines.push({ name, config: configFromMeta(name, meta) });
  });

  if (lines.length === 0) {
    throw new OrderError('В заказе нет позиций с параметрами корпуса (type, width, height или depth).');
  }
  return { orderId, customerName, customerEmail, lines };
}

function configFromMeta(name: string, meta: Map<string, string>): CabinetConfig {
  const draft: Record<string, string> = { name };
  for (const [key, value] of meta) {
    const field = FIELD_KEYS[key];
    if (!field) continue;
    draft[field] = field === 'type' ? (TYPE_ALIASES[value] ?? value) : field === 'materialId' ? materialId(value) : value;
  }
  try {
    return parseConfig(draft);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Не удалось прочитать конфигурацию.';
    throw new OrderError(message);
  }
}

function readMeta(value: unknown): Map<string, string> {
  const meta = new Map<string, string>();
  if (!Array.isArray(value)) return meta;
  for (const entry of value) {
    const row = asRecord(entry);
    if (!row) continue;
    const key = text(row.key).trim().toLowerCase();
    const raw = row.value ?? row.display_value;
    const cell = raw == null ? '' : String(raw).trim().toLowerCase();
    if (key && cell) meta.set(key, cell);
  }
  return meta;
}

function hasCabinetMeta(meta: Map<string, string>): boolean {
  return [...meta.keys()].some((key) => ['type', 'width', 'height', 'depth', 'тип', 'ширина', 'высота', 'глубина'].includes(key));
}

function materialId(value: string): string {
  const direct = MATERIALS.find((item) => item.id === value || item.name.toLowerCase() === value);
  return direct?.id ?? value;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function text(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return typeof value === 'string' ? value.trim() : '';
}

export function isConfigError(error: unknown): error is ConfigError {
  return error instanceof Error && error.name === 'ConfigError';
}
