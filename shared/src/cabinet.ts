import { getMaterial, HDF, MATERIALS } from './materials';
import type { BomLine, BuildResult, CabinetConfig, CabinetType, PartInstance, PartKind, Totals } from './types';

/**
 * Parametric casework, millimetres.
 * X goes right, Y goes up, Z goes from the back toward the front.
 * The origin is the outer rear-left-bottom corner.
 * Sides are full height. Top, bottom and back sit between them.
 * Fronts overlay the box with a fixed reveal.
 */

const GAP = 3;
const BACK_T = 4;
const DOOR_T = 18;
const DRAWER_T = 16;
const SHELF_SETBACK = 20;
const PLINTH_SETBACK = 30;
const SLIDE_GAP = 13;

export const LIMITS = {
  width: [300, 2400],
  height: [280, 2600],
  depth: [180, 800],
  shelves: [0, 8],
  doors: [0, 2],
  drawers: [0, 6],
  plinthHeight: [0, 220],
} as const;

export const TYPE_LABELS: Record<CabinetType, string> = {
  base: 'Тумба',
  wall: 'Навесной',
  tall: 'Пенал',
  drawer: 'Комод',
};

export const PRESETS: Record<CabinetType, CabinetConfig> = {
  base: {
    name: 'Тумба',
    type: 'base',
    width: 600,
    height: 720,
    depth: 560,
    thickness: 16,
    materialId: 'oak',
    shelves: 1,
    doors: 1,
    drawers: 0,
    plinthHeight: 100,
  },
  wall: {
    name: 'Шкаф навесной',
    type: 'wall',
    width: 600,
    height: 720,
    depth: 320,
    thickness: 16,
    materialId: 'white',
    shelves: 2,
    doors: 1,
    drawers: 0,
    plinthHeight: 0,
  },
  tall: {
    name: 'Пенал',
    type: 'tall',
    width: 600,
    height: 2100,
    depth: 560,
    thickness: 16,
    materialId: 'walnut',
    shelves: 4,
    doors: 2,
    drawers: 0,
    plinthHeight: 80,
  },
  drawer: {
    name: 'Комод',
    type: 'drawer',
    width: 800,
    height: 800,
    depth: 480,
    thickness: 16,
    materialId: 'sage',
    shelves: 0,
    doors: 0,
    drawers: 4,
    plinthHeight: 80,
  },
};

const BOM_ORDER = [
  'SIDE',
  'BOTTOM',
  'TOP',
  'SHELF',
  'PLINTH',
  'BACK',
  'DOOR',
  'DRAWER-FRONT',
  'DRW-SIDE',
  'DRW-WALL',
  'DRW-BOTTOM',
];

const BOM_NAMES: Record<string, string> = {
  SIDE: 'Боковина',
  BOTTOM: 'Дно',
  TOP: 'Крышка',
  SHELF: 'Полка',
  PLINTH: 'Цоколь',
  BACK: 'Задняя стенка',
  DOOR: 'Фасад',
  'DRAWER-FRONT': 'Фасад ящика',
  'DRW-SIDE': 'Боковина ящика',
  'DRW-WALL': 'Стенка ящика',
  'DRW-BOTTOM': 'Дно ящика',
};

interface FrontSpan {
  kind: 'door' | 'drawer';
  index: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export function parseConfig(input: unknown): CabinetConfig {
  if (!input || typeof input !== 'object') {
    throw new ConfigError('Ожидался объект конфигурации.');
  }
  const raw = input as Record<string, unknown>;
  const type = isCabinetType(raw.type) ? raw.type : 'base';
  const preset = PRESETS[type];
  return normalize({
    name: text(raw.name, preset.name),
    type,
    width: numberValue(raw.width, preset.width),
    height: numberValue(raw.height, preset.height),
    depth: numberValue(raw.depth, preset.depth),
    thickness: numberValue(raw.thickness, preset.thickness),
    materialId: text(raw.materialId ?? raw.material, preset.materialId),
    shelves: numberValue(raw.shelves, preset.shelves),
    doors: numberValue(raw.doors, preset.doors),
    drawers: numberValue(raw.drawers, preset.drawers),
    plinthHeight: numberValue(raw.plinthHeight ?? raw.plinth, preset.plinthHeight),
  }).config;
}

export function buildCabinet(input: CabinetConfig): BuildResult {
  const normalized = normalize(input);
  const warnings = [...normalized.warnings];
  const config = normalized.config;
  const plinth = fitPlinth(config, warnings);
  const fronts = layoutFronts(config, plinth, warnings);
  const parts: PartInstance[] = [];
  addCarcass(parts, config, plinth);
  addShelves(parts, config, plinth, fronts, warnings);
  addFronts(parts, config, fronts);
  addDrawerBoxes(parts, config, plinth, fronts, warnings);
  const bom = toBom(parts);
  return { config, parts, bom, warnings, totals: totalsOf(bom) };
}

function normalize(input: CabinetConfig): { config: CabinetConfig; warnings: string[] } {
  const warnings: string[] = [];
  const type = isCabinetType(input.type) ? input.type : 'base';
  const width = clamp(input.width, LIMITS.width, 'Ширина', 'мм', warnings);
  const height = clamp(input.height, LIMITS.height, 'Высота', 'мм', warnings);
  const depth = clamp(input.depth, LIMITS.depth, 'Глубина', 'мм', warnings);
  const thickness = input.thickness === 18 ? 18 : 16;
  if (input.thickness !== 16 && input.thickness !== 18) {
    warnings.push('Толщина корпуса может быть 16 или 18 мм. Взято 16 мм.');
  }
  const known = MATERIALS.some((item) => item.id === input.materialId);
  const materialId = known ? input.materialId : MATERIALS[0].id;
  if (!known) warnings.push('Материал не найден, выбран ЛДСП белый.');
  const name = input.name.trim().slice(0, 80) || TYPE_LABELS[type];
  return {
    warnings,
    config: {
      name,
      type,
      width,
      height,
      depth,
      thickness,
      materialId,
      shelves: clamp(input.shelves, LIMITS.shelves, 'Число полок', '', warnings),
      doors: clamp(input.doors, LIMITS.doors, 'Число фасадов', '', warnings),
      drawers: clamp(input.drawers, LIMITS.drawers, 'Число ящиков', '', warnings),
      plinthHeight: clamp(input.plinthHeight, LIMITS.plinthHeight, 'Цоколь', 'мм', warnings),
    },
  };
}

function fitPlinth(config: CabinetConfig, warnings: string[]): number {
  const max = Math.max(0, config.height - 2 * config.thickness - 140);
  if (config.plinthHeight <= max) return config.plinthHeight;
  warnings.push(`Цоколь уменьшен с ${config.plinthHeight} до ${max} мм: иначе не остаётся проёма.`);
  return max;
}

function layoutFronts(config: CabinetConfig, plinth: number, warnings: string[]): FrontSpan[] {
  const frontH = config.height - plinth;
  let doors = config.doors;
  let drawers = config.drawers;
  if (frontH < 120 || (doors === 0 && drawers === 0)) return [];

  if (drawers > 0) {
    const reserve = doors > 0 ? 170 : 0;
    const fitted = maxFronts(frontH - reserve, drawers);
    if (fitted < drawers) {
      warnings.push(
        fitted === 0
          ? 'Ящики не помещаются в эту высоту.'
          : `Ящиков поставлено ${fitted} из ${drawers}.`,
      );
      drawers = fitted;
    }
  }

  if (drawers > 0 && doors === 0) {
    return stackDrawers(config.width, plinth, frontH, drawers);
  }
  if (doors > 0 && drawers === 0) {
    return placeDoors(config.width, doors, plinth + GAP, config.height - GAP - (plinth + GAP));
  }
  if (drawers === 0 || doors === 0) return [];

  let drawerH = 160;
  const minDoor = 140;
  const needed = drawers * drawerH + (drawers + 2) * GAP + minDoor;
  if (needed > frontH) {
    drawerH = Math.floor((frontH - minDoor - (drawers + 2) * GAP) / drawers);
  }
  if (drawerH < 90) {
    warnings.push('Рядом с фасадами ящики не поместились и убраны из модели.');
    return placeDoors(config.width, doors, plinth + GAP, frontH - 2 * GAP);
  }

  const spans = stackDrawers(config.width, plinth, drawerH * drawers + (drawers + 1) * GAP, drawers);
  const doorY = plinth + GAP + drawers * drawerH + drawers * GAP;
  const doorH = config.height - GAP - doorY;
  if (doorH < 100) {
    warnings.push('Над ящиками не осталось места для фасада.');
    return spans;
  }
  spans.push(...placeDoors(config.width, doors, doorY, doorH));
  return spans;
}

function stackDrawers(width: number, plinth: number, zoneH: number, drawers: number): FrontSpan[] {
  const gaps = drawers + 1;
  const base = Math.floor((zoneH - gaps * GAP) / drawers);
  const spans: FrontSpan[] = [];
  let y = plinth + GAP;
  for (let index = 0; index < drawers; index += 1) {
    const h = index === drawers - 1 ? plinth + zoneH - GAP - y : base;
    spans.push({ kind: 'drawer', index, x: GAP, y, w: width - 2 * GAP, h });
    y += h + GAP;
  }
  return spans;
}

function placeDoors(width: number, doors: number, y: number, h: number): FrontSpan[] {
  if (h < 40 || width < 80) return [];
  const count = doors >= 2 ? 2 : 1;
  const raw = width - (count + 1) * GAP;
  const base = Math.floor(raw / count);
  const spans: FrontSpan[] = [];
  let x = GAP;
  for (let index = 0; index < count; index += 1) {
    const w = index === count - 1 ? width - GAP - x : base;
    spans.push({ kind: 'door', index, x, y, w, h });
    x += w + GAP;
  }
  return spans;
}

function maxFronts(available: number, requested: number): number {
  if (available <= 0) return 0;
  const max = Math.floor((available - GAP) / (90 + GAP));
  return Math.max(0, Math.min(requested, max));
}

function addCarcass(parts: PartInstance[], config: CabinetConfig, plinth: number): void {
  const { width, height, depth, thickness, materialId } = config;
  const innerW = width - 2 * thickness;
  add(parts, {
    bomCode: 'SIDE',
    name: 'Боковина левая',
    kind: 'side',
    cutLength: height,
    cutWidth: depth,
    thickness,
    materialId,
    edgeMm: height,
    size: [thickness, height, depth],
    center: [thickness / 2, height / 2, depth / 2],
  });
  add(parts, {
    bomCode: 'SIDE',
    name: 'Боковина правая',
    kind: 'side',
    cutLength: height,
    cutWidth: depth,
    thickness,
    materialId,
    edgeMm: height,
    size: [thickness, height, depth],
    center: [width - thickness / 2, height / 2, depth / 2],
  });
  add(parts, {
    bomCode: 'BOTTOM',
    name: 'Дно',
    kind: 'bottom',
    cutLength: innerW,
    cutWidth: depth,
    thickness,
    materialId,
    edgeMm: innerW,
    size: [innerW, thickness, depth],
    center: [width / 2, plinth + thickness / 2, depth / 2],
  });
  add(parts, {
    bomCode: 'TOP',
    name: 'Крышка',
    kind: 'top',
    cutLength: innerW,
    cutWidth: depth,
    thickness,
    materialId,
    edgeMm: innerW,
    size: [innerW, thickness, depth],
    center: [width / 2, height - thickness / 2, depth / 2],
  });

  const backH = height - plinth - 2 * thickness;
  if (backH > 40 && innerW > 40) {
    add(parts, {
      bomCode: 'BACK',
      name: 'Задняя стенка',
      kind: 'back',
      cutLength: backH,
      cutWidth: innerW,
      thickness: BACK_T,
      materialId: HDF.id,
      edgeMm: 0,
      size: [innerW, backH, BACK_T],
      center: [width / 2, plinth + thickness + backH / 2, BACK_T / 2],
    });
  }

  if (plinth >= 12) {
    add(parts, {
      bomCode: 'PLINTH',
      name: 'Цоколь',
      kind: 'plinth',
      cutLength: innerW,
      cutWidth: plinth,
      thickness,
      materialId,
      edgeMm: innerW,
      size: [innerW, plinth, thickness],
      center: [width / 2, plinth / 2, depth - PLINTH_SETBACK - thickness / 2],
    });
  }
}

function addShelves(
  parts: PartInstance[],
  config: CabinetConfig,
  plinth: number,
  fronts: FrontSpan[],
  warnings: string[],
): void {
  if (config.shelves <= 0) return;
  const drawerTop = fronts
    .filter((front) => front.kind === 'drawer')
    .reduce((max, front) => Math.max(max, front.y + front.h), 0);
  const zone0 = Math.max(plinth + config.thickness, drawerTop);
  const zone1 = config.height - config.thickness;
  const margin = config.thickness / 2 + 50;
  const low = zone0 + margin;
  const high = zone1 - margin;
  if (high - low < 40) {
    warnings.push('В проёме нет места для полок.');
    return;
  }
  const maxFit = Math.max(1, Math.floor((high - low) / 80));
  const count = Math.min(config.shelves, maxFit);
  if (count < config.shelves) warnings.push(`Полок поставлено ${count} из ${config.shelves}.`);

  const innerW = config.width - 2 * config.thickness;
  const shelfD = Math.round(config.depth - SHELF_SETBACK - BACK_T);
  if (shelfD < 80) {
    warnings.push('Глубина мала для полки.');
    return;
  }
  for (let index = 1; index <= count; index += 1) {
    const y = low + ((high - low) * index) / (count + 1);
    add(parts, {
      bomCode: 'SHELF',
      name: `Полка ${index}`,
      kind: 'shelf',
      cutLength: innerW,
      cutWidth: shelfD,
      thickness: config.thickness,
      materialId: config.materialId,
      edgeMm: innerW,
      size: [innerW, config.thickness, shelfD],
      center: [config.width / 2, y, BACK_T + shelfD / 2],
    });
  }
}

function addFronts(parts: PartInstance[], config: CabinetConfig, fronts: FrontSpan[]): void {
  const doorCount = fronts.filter((front) => front.kind === 'door').length;
  for (const front of fronts) {
    const door = front.kind === 'door';
    const length = Math.round(front.h);
    const width = Math.round(front.w);
    add(parts, {
      bomCode: door ? 'DOOR' : 'DRAWER-FRONT',
      name: door
        ? doorCount > 1
          ? `Фасад ${front.index + 1}`
          : 'Фасад'
        : `Фасад ящика ${front.index + 1}`,
      kind: door ? 'door' : 'drawer-front',
      cutLength: length,
      cutWidth: width,
      thickness: DOOR_T,
      materialId: config.materialId,
      edgeMm: 2 * (length + width),
      size: [width, length, DOOR_T],
      center: [front.x + front.w / 2, front.y + front.h / 2, config.depth + 0.8 + DOOR_T / 2],
    });
  }
}

function addDrawerBoxes(
  parts: PartInstance[],
  config: CabinetConfig,
  plinth: number,
  fronts: FrontSpan[],
  warnings: string[],
): void {
  const drawers = fronts.filter((front) => front.kind === 'drawer');
  if (drawers.length === 0) return;
  const innerW = config.width - 2 * config.thickness;
  const between = innerW - 2 * SLIDE_GAP - 2 * DRAWER_T;
  const boxD = Math.round(Math.min(config.depth - BACK_T - 24, config.depth * 0.86));
  if (between < 80 || boxD < 140) {
    warnings.push('Короба ящиков не построены: корпус слишком узкий или мелкий.');
    return;
  }

  for (const front of drawers) {
    const cavityLow = plinth + config.thickness + 2;
    const cavityHigh = config.height - config.thickness - 2;
    const y0 = Math.max(front.y + 8, cavityLow);
    const y1 = Math.min(front.y + front.h - 8, cavityHigh);
    const boxH = Math.round(y1 - y0);
    if (boxH < 40) {
      warnings.push(`Ящик ${front.index + 1} оставлен без короба.`);
      continue;
    }
    const midY = (y0 + y1) / 2;
    const z0 = BACK_T + 8;
    const leftX = config.thickness + SLIDE_GAP + DRAWER_T / 2;
    const rightX = config.width - config.thickness - SLIDE_GAP - DRAWER_T / 2;
    add(parts, {
      bomCode: 'DRW-SIDE',
      name: `Боковина ящика ${front.index + 1}`,
      kind: 'drawer-side',
      cutLength: boxD,
      cutWidth: boxH,
      thickness: DRAWER_T,
      materialId: config.materialId,
      edgeMm: boxD,
      size: [DRAWER_T, boxH, boxD],
      center: [leftX, midY, z0 + boxD / 2],
    });
    add(parts, {
      bomCode: 'DRW-SIDE',
      name: `Боковина ящика ${front.index + 1}`,
      kind: 'drawer-side',
      cutLength: boxD,
      cutWidth: boxH,
      thickness: DRAWER_T,
      materialId: config.materialId,
      edgeMm: boxD,
      size: [DRAWER_T, boxH, boxD],
      center: [rightX, midY, z0 + boxD / 2],
    });
    const wall = {
      bomCode: 'DRW-WALL',
      name: `Стенка ящика ${front.index + 1}`,
      kind: 'drawer-wall' as const,
      cutLength: between,
      cutWidth: boxH,
      thickness: DRAWER_T,
      materialId: config.materialId,
      edgeMm: 0,
      size: [between, boxH, DRAWER_T] as [number, number, number],
    };
    add(parts, { ...wall, center: [config.width / 2, midY, z0 + DRAWER_T / 2] });
    add(parts, { ...wall, center: [config.width / 2, midY, z0 + boxD - DRAWER_T / 2] });
    const bottomD = boxD - 2 * DRAWER_T;
    add(parts, {
      bomCode: 'DRW-BOTTOM',
      name: `Дно ящика ${front.index + 1}`,
      kind: 'drawer-bottom',
      cutLength: between,
      cutWidth: bottomD,
      thickness: BACK_T,
      materialId: HDF.id,
      edgeMm: 0,
      size: [between, BACK_T, bottomD],
      center: [config.width / 2, y0 + 8, z0 + DRAWER_T + bottomD / 2],
    });
  }
}

function add(parts: PartInstance[], draft: Omit<PartInstance, 'id'>): void {
  parts.push({
    ...draft,
    id: `${draft.bomCode}-${parts.length + 1}`,
    cutLength: Math.round(draft.cutLength),
    cutWidth: Math.round(draft.cutWidth),
    edgeMm: Math.round(draft.edgeMm),
    size: draft.size.map((value) => round1(value)) as [number, number, number],
    center: draft.center.map((value) => round1(value)) as [number, number, number],
  });
}

function toBom(parts: PartInstance[]): BomLine[] {
  const grouped = new Map<string, BomLine>();
  for (const part of parts) {
    const key = [part.bomCode, part.cutLength, part.cutWidth, part.thickness, part.materialId].join('|');
    const found = grouped.get(key);
    if (found) {
      found.qty += 1;
      continue;
    }
    const material = getMaterial(part.materialId);
    grouped.set(key, {
      code: part.bomCode,
      name: BOM_NAMES[part.bomCode] ?? part.name,
      length: part.cutLength,
      width: part.cutWidth,
      thickness: part.thickness,
      qty: 1,
      materialId: material.id,
      materialName: material.name,
      edgeMm: part.edgeMm,
      areaM2: 0,
      cost: 0,
    });
  }
  const lines = [...grouped.values()].sort(
    (a, b) => BOM_ORDER.indexOf(a.code) - BOM_ORDER.indexOf(b.code) || b.length - a.length,
  );
  for (const line of lines) {
    const material = getMaterial(line.materialId);
    const area = (line.length / 1000) * (line.width / 1000) * line.qty;
    line.areaM2 = Math.round(area * 1000) / 1000;
    line.cost = Math.round(line.areaM2 * material.pricePerM2 + (line.edgeMm / 1000) * line.qty * material.edgePerM);
  }
  return lines;
}

function totalsOf(lines: BomLine[]): Totals {
  return lines.reduce<Totals>(
    (totals, line) => ({
      areaM2: Math.round((totals.areaM2 + line.areaM2) * 1000) / 1000,
      edgeM: Math.round((totals.edgeM + (line.edgeMm / 1000) * line.qty) * 100) / 100,
      cost: totals.cost + line.cost,
      partCount: totals.partCount + line.qty,
    }),
    { areaM2: 0, edgeM: 0, cost: 0, partCount: 0 },
  );
}

function clamp(
  value: number,
  range: readonly [number, number],
  label: string,
  unit: string,
  warnings: string[],
): number {
  const [min, max] = range;
  const suffix = unit ? ` ${unit}` : '';
  if (!Number.isFinite(value)) {
    warnings.push(`${label}: вместо пустого значения взято ${min}${suffix}.`);
    return min;
  }
  const rounded = Math.round(value);
  if (rounded < min || rounded > max) {
    const next = Math.min(max, Math.max(min, rounded));
    warnings.push(`${label}: допустимо ${min}–${max}${suffix}. В модели ${next}.`);
    return next;
  }
  return rounded;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function isCabinetType(value: unknown): value is CabinetType {
  return value === 'base' || value === 'wall' || value === 'tall' || value === 'drawer';
}

function numberValue(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

function text(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

export function isFront(kind: PartKind): boolean {
  return kind === 'door' || kind === 'drawer-front';
}
