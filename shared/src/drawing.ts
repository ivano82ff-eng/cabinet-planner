import type { BuildResult, CutPiece, Drawing, DrawAnchor, DrawLayer, PartInstance, Primitive, Sheet, View } from './types';

const TEXT = 32;
const PAD_L = 156;
const PAD_R = 188;
const PAD_B = 108;
const PAD_T = 36;

const SECTION_KINDS = new Set([
  'bottom',
  'top',
  'shelf',
  'back',
  'plinth',
  'door',
  'drawer-front',
  'drawer-bottom',
  'drawer-wall',
]);

export function buildDrawing(result: BuildResult): Drawing {
  return {
    views: [frontView(result), topView(result), sideView(result)],
    cuts: result.bom.map<CutPiece>((line) => ({
      name: line.name,
      length: line.length,
      width: line.width,
      qty: line.qty,
    })),
  };
}

export function viewSheet(view: View): Sheet {
  return { width: view.width, height: view.height, ops: view.ops };
}

export function buildSheet(drawing: Drawing): Sheet {
  const ops: Primitive[] = [];
  let cursor = 0;
  let top = 0;
  for (const view of drawing.views) {
    ops.push(text(cursor + view.width / 2, view.height + 16, view.title, 'middle', 'label'));
    ops.push(...move(view.ops, cursor, 0));
    top = Math.max(top, view.height + 48);
    cursor += view.width + 56;
  }
  const sheetWidth = Math.max(cursor - 56, 400);
  if (drawing.cuts.length > 0) {
    const cutOps = cutLayout(drawing.cuts, Math.max(sheetWidth, 1600));
    const cutBounds = bounds(cutOps);
    ops.push(...move(cutOps, 0, -48 - cutBounds.maxY));
  }
  const box = bounds(ops);
  const pad = 20;
  const shifted = move(ops, pad - box.minX, pad - box.minY);
  const fitted = bounds(shifted);
  return {
    width: Math.ceil(fitted.maxX + pad),
    height: Math.ceil(fitted.maxY + pad),
    ops: shifted,
  };
}

function frontView(result: BuildResult): View {
  const { config, parts } = result;
  const frame = contentFrame(config.width, config.height);
  const ops: Primitive[] = [rect(frame.ox, frame.oy, config.width, config.height, 'outline')];
  const open = !parts.some((part) => part.kind === 'door' || part.kind === 'drawer-front');
  for (const part of parts) {
    if (part.kind === 'plinth' || part.kind === 'door' || part.kind === 'drawer-front') {
      ops.push(rect(frame.ox + left(part), frame.oy + bottom(part), part.size[0], part.size[1], 'panel'));
    }
    if (open && part.kind === 'shelf') {
      const x = frame.ox + left(part);
      const y = frame.oy + part.center[1];
      ops.push(line(x, y, x + part.size[0], y, 'hidden', true));
    }
  }
  ops.push(...dimH(frame.ox, frame.ox + config.width, frame.oy, -42, String(config.width)));
  ops.push(...dimV(frame.ox + config.width, frame.oy, frame.oy + config.height, 42, String(config.height)));
  const plinth = parts.find((part) => part.kind === 'plinth');
  if (plinth) {
    ops.push(...dimV(frame.ox, frame.oy, frame.oy + plinth.size[1], -46, String(Math.round(plinth.size[1]))));
  }
  return { id: 'front', title: 'Фасад', width: frame.width, height: frame.height, ops };
}

function topView(result: BuildResult): View {
  const { config, parts } = result;
  const stick = frontStick(parts);
  const frame = contentFrame(config.width, config.depth + stick);
  const ops: Primitive[] = [rect(frame.ox, frame.oy, config.width, config.depth, 'outline')];
  ops.push(rect(frame.ox, frame.oy, config.thickness, config.depth, 'panel'));
  ops.push(
    rect(frame.ox + config.width - config.thickness, frame.oy, config.thickness, config.depth, 'panel'),
  );
  const back = parts.find((part) => part.kind === 'back');
  if (back) ops.push(projectedTop(frame, back));
  const shelf = parts.find((part) => part.kind === 'shelf');
  if (shelf) {
    const z = frame.oy + shelf.center[2] + shelf.size[2] / 2;
    ops.push(
      line(
        frame.ox + config.thickness,
        z,
        frame.ox + config.width - config.thickness,
        z,
        'hidden',
        true,
      ),
    );
  }
  const plinth = parts.find((part) => part.kind === 'plinth');
  if (plinth) ops.push(projectedTop(frame, plinth));
  const front = parts.find((part) => part.kind === 'door' || part.kind === 'drawer-front');
  if (front) ops.push(projectedTop(frame, front));
  ops.push(...dimH(frame.ox, frame.ox + config.width, frame.oy, -42, String(config.width)));
  ops.push(...dimV(frame.ox + config.width, frame.oy, frame.oy + config.depth, 42, String(config.depth)));
  return { id: 'top', title: 'Вид сверху', width: frame.width, height: frame.height, ops };
}

function sideView(result: BuildResult): View {
  const { config, parts } = result;
  const stick = frontStick(parts);
  const frame = contentFrame(config.depth + stick, config.height);
  const ops: Primitive[] = [rect(frame.ox, frame.oy, config.depth, config.height, 'outline')];
  for (const part of parts) {
    if (!SECTION_KINDS.has(part.kind)) continue;
    ops.push(
      rect(
        frame.ox + part.center[2] - part.size[2] / 2,
        frame.oy + bottom(part),
        part.size[2],
        part.size[1],
        'panel',
      ),
    );
  }
  ops.push(...dimH(frame.ox, frame.ox + config.depth, frame.oy, -42, String(config.depth)));
  ops.push(
    ...dimV(frame.ox + config.depth + stick, frame.oy, frame.oy + config.height, 42, String(config.height)),
  );
  return { id: 'side', title: 'Бок, сечение', width: frame.width, height: frame.height, ops };
}

function cutLayout(cuts: CutPiece[], maxRow: number): Primitive[] {
  const ops: Primitive[] = [text(0, 24, 'Детали для раскроя', 'start', 'label')];
  let x = 0;
  let rowTop = -12;
  let rowH = 0;
  for (const cut of cuts) {
    const w = Math.max(cut.length, 80);
    const h = Math.max(cut.width, 80);
    if (x > 0 && x + w > maxRow) {
      rowTop -= rowH + 40;
      x = 0;
      rowH = 0;
    }
    const y = rowTop - h;
    ops.push(rect(x, y, w, h, 'cut'));
    ops.push(text(x + w / 2, y + h / 2 + 18, cut.name, 'middle', 'label'));
    ops.push(text(x + w / 2, y + h / 2 - 22, `${cut.length}×${cut.width}  ×${cut.qty}`, 'middle', 'label'));
    x += w + 28;
    rowH = Math.max(rowH, h);
  }
  return ops;
}

function projectedTop(frame: { ox: number; oy: number }, part: PartInstance): Primitive {
  return rect(
    frame.ox + left(part),
    frame.oy + part.center[2] - part.size[2] / 2,
    part.size[0],
    part.size[2],
    'panel',
  );
}

function contentFrame(contentW: number, contentH: number) {
  return {
    width: PAD_L + contentW + PAD_R,
    height: PAD_B + contentH + PAD_T,
    ox: PAD_L,
    oy: PAD_B,
  };
}

function frontStick(parts: PartInstance[]): number {
  return parts.some((part) => part.kind === 'door' || part.kind === 'drawer-front') ? 19 : 0;
}

function left(part: PartInstance): number {
  return part.center[0] - part.size[0] / 2;
}

function bottom(part: PartInstance): number {
  return part.center[1] - part.size[1] / 2;
}

function dimH(x1: number, x2: number, y: number, offset: number, value: string): Primitive[] {
  if (Math.abs(x2 - x1) < 36) return [];
  const yLine = y + offset;
  const dir = Math.sign(offset || -1);
  return [
    line(x1, y + dir * 4, x1, yLine, 'dim'),
    line(x2, y + dir * 4, x2, yLine, 'dim'),
    line(x1, yLine, x2, yLine, 'dim'),
    tick(x1, yLine),
    tick(x2, yLine),
    text((x1 + x2) / 2, yLine + dir * 20, value, 'middle', 'dim'),
  ].flat();
}

function dimV(x: number, y1: number, y2: number, offset: number, value: string): Primitive[] {
  if (Math.abs(y2 - y1) < 36) return [];
  const xLine = x + offset;
  const dir = Math.sign(offset || 1);
  return [
    line(x + dir * 4, y1, xLine, y1, 'dim'),
    line(x + dir * 4, y2, xLine, y2, 'dim'),
    line(xLine, y1, xLine, y2, 'dim'),
    tick(xLine, y1),
    tick(xLine, y2),
    text(xLine + dir * 18, (y1 + y2) / 2, value, dir > 0 ? 'start' : 'end', 'dim'),
  ].flat();
}

function tick(x: number, y: number): Primitive {
  return line(x - 7, y - 7, x + 7, y + 7, 'dim');
}

function line(x1: number, y1: number, x2: number, y2: number, layer: DrawLayer, dash = false): Primitive {
  return { kind: 'line', layer, x1, y1, x2, y2, dash };
}

function rect(x: number, y: number, w: number, h: number, layer: DrawLayer): Primitive {
  return { kind: 'rect', layer, x, y, w, h };
}

function text(x: number, y: number, value: string, anchor: DrawAnchor, layer: DrawLayer): Primitive {
  return { kind: 'text', layer, x, y, text: value, size: TEXT, anchor };
}

function move(ops: Primitive[], dx: number, dy: number): Primitive[] {
  return ops.map((op) => {
    if (op.kind === 'line') {
      return { ...op, x1: op.x1 + dx, y1: op.y1 + dy, x2: op.x2 + dx, y2: op.y2 + dy };
    }
    return { ...op, x: op.x + dx, y: op.y + dy };
  });
}

function bounds(ops: Primitive[]) {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  const add = (x: number, y: number) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };
  for (const op of ops) {
    if (op.kind === 'line') {
      add(op.x1, op.y1);
      add(op.x2, op.y2);
    } else if (op.kind === 'rect') {
      add(op.x, op.y);
      add(op.x + op.w, op.y + op.h);
    } else {
      const width = op.text.length * op.size * 0.62;
      const x0 = op.anchor === 'middle' ? op.x - width / 2 : op.anchor === 'end' ? op.x - width : op.x;
      add(x0, op.y - op.size);
      add(x0 + width, op.y + op.size * 0.4);
    }
  }
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 10, maxY: 10 };
  return { minX, minY, maxX, maxY };
}
