export type CabinetType = 'base' | 'wall' | 'tall' | 'drawer';

export interface CabinetConfig {
  name: string;
  type: CabinetType;
  width: number;
  height: number;
  depth: number;
  thickness: number;
  materialId: string;
  shelves: number;
  doors: number;
  drawers: number;
  plinthHeight: number;
}

export type PartKind =
  | 'side'
  | 'bottom'
  | 'top'
  | 'back'
  | 'shelf'
  | 'plinth'
  | 'door'
  | 'drawer-front'
  | 'drawer-side'
  | 'drawer-wall'
  | 'drawer-bottom';

export interface PartInstance {
  id: string;
  bomCode: string;
  name: string;
  kind: PartKind;
  cutLength: number;
  cutWidth: number;
  thickness: number;
  materialId: string;
  edgeMm: number;
  size: [number, number, number];
  center: [number, number, number];
}

export interface BomLine {
  code: string;
  name: string;
  length: number;
  width: number;
  thickness: number;
  qty: number;
  materialId: string;
  materialName: string;
  edgeMm: number;
  areaM2: number;
  cost: number;
}

export interface Totals {
  areaM2: number;
  edgeM: number;
  cost: number;
  partCount: number;
}

export interface BuildResult {
  config: CabinetConfig;
  parts: PartInstance[];
  bom: BomLine[];
  warnings: string[];
  totals: Totals;
}

export type DrawLayer = 'outline' | 'panel' | 'hidden' | 'dim' | 'label' | 'cut';

export type DrawAnchor = 'start' | 'middle' | 'end';

export type Primitive =
  | {
      kind: 'line';
      layer: DrawLayer;
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      dash?: boolean;
    }
  | {
      kind: 'rect';
      layer: DrawLayer;
      x: number;
      y: number;
      w: number;
      h: number;
    }
  | {
      kind: 'text';
      layer: DrawLayer;
      x: number;
      y: number;
      text: string;
      size: number;
      anchor: DrawAnchor;
    };

export interface View {
  id: 'front' | 'top' | 'side';
  title: string;
  width: number;
  height: number;
  ops: Primitive[];
}

export interface CutPiece {
  name: string;
  length: number;
  width: number;
  qty: number;
}

export interface Drawing {
  views: View[];
  cuts: CutPiece[];
}

export interface Sheet {
  width: number;
  height: number;
  ops: Primitive[];
}
