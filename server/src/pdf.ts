import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  buildDrawing,
  describeSize,
  formatArea,
  formatMeters,
  formatRub,
  formatStamp,
  getMaterial,
  type BuildResult,
  type Primitive,
  type View,
} from '@planner/shared';
import PDFDocument from 'pdfkit';

type PdfDoc = InstanceType<typeof PDFDocument>;

export interface SpecDocument {
  id: string;
  name: string;
  customerName: string;
  customerEmail: string;
  createdAt: string;
  result: BuildResult;
}

export function resolveFontPath(): string | null {
  const bundled = fileURLToPath(new URL('../assets/Roboto-Regular.ttf', import.meta.url));
  if (existsSync(bundled)) return bundled;
  const arial = 'C:/Windows/Fonts/arial.ttf';
  if (existsSync(arial)) return arial;
  return null;
}

export function renderSpecPdf(spec: SpecDocument): Promise<Buffer> {
  const fontPath = resolveFontPath();
  if (!fontPath) {
    return Promise.reject(new Error('Для PDF нужен шрифт с кириллицей: server/assets/Roboto-Regular.ttf'));
  }

  const doc = new PDFDocument({
    size: 'A4',
    layout: 'landscape',
    margin: 28,
    info: { Title: spec.name, Author: 'Корпус' },
  });
  doc.registerFont('body', fontPath);
  doc.font('body');

  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  drawCover(doc, spec);
  drawBill(doc, spec);
  doc.end();
  return done;
}

function drawCover(doc: PdfDoc, spec: SpecDocument): void {
  const material = getMaterial(spec.result.config.materialId);
  doc.fillColor('#241c16').fontSize(20).text(spec.name, 28, 26, { lineBreak: false });
  doc.fontSize(9).fillColor('#5e574c');
  const meta = [
    spec.customerName || 'Заказчик не указан',
    spec.customerEmail,
    formatStamp(spec.createdAt),
    describeSize(spec.result.config) + ' мм',
    material.name,
  ]
    .filter(Boolean)
    .join('   ·   ');
  doc.text(meta, 28, 52, { lineBreak: false });
  doc.fontSize(8).text(spec.id, 28, 68, { lineBreak: false });

  const views = buildDrawing(spec.result).views;
  const gap = 12;
  const slotY = 92;
  const slotH = 430;
  const usable = doc.page.width - 56 - gap * (views.length - 1);
  const slotW = usable / views.length;
  views.forEach((view, index) => {
    const x = 28 + index * (slotW + gap);
    doc.fontSize(9).fillColor('#8a3e22').text(view.title, x, slotY, { width: slotW, align: 'center', lineBreak: false });
    paintView(doc, view, x, slotY + 16, slotW, slotH - 16);
  });

  doc.fontSize(8).fillColor('#6d655b').text('Размеры в миллиметрах. Масштаб вида подобран под лист.', 28, 548, {
    lineBreak: false,
  });
}

function paintView(doc: PdfDoc, view: View, x: number, y: number, slotW: number, slotH: number): void {
  const scale = Math.min(slotW / view.width, slotH / view.height);
  const ox = x + (slotW - view.width * scale) / 2;
  const oy = y + (slotH - view.height * scale) / 2;

  doc.save();
  doc.translate(ox, oy + view.height * scale);
  doc.scale(scale, -scale);
  doc.lineWidth(1.15 / scale);
  doc.lineJoin('miter');
  for (const op of view.ops) paintShape(doc, op);
  doc.restore();

  for (const op of view.ops) {
    if (op.kind !== 'text') continue;
    const tx = ox + op.x * scale;
    const ty = oy + (view.height - op.y) * scale;
    const width = Math.max(28, op.text.length * 4.6 + 8);
    const left = op.anchor === 'middle' ? tx - width / 2 : op.anchor === 'end' ? tx - width : tx;
    doc
      .fontSize(8)
      .fillColor(op.layer === 'dim' ? '#8a3e22' : '#241c16')
      .text(op.text, left, ty - 4, {
        width,
        align: op.anchor === 'middle' ? 'center' : op.anchor === 'end' ? 'right' : 'left',
        lineBreak: false,
      });
  }
}

function paintShape(doc: PdfDoc, op: Primitive): void {
  if (op.kind === 'rect') {
    doc.save();
    if (op.layer === 'outline') {
      doc.strokeColor('#241c16').rect(op.x, op.y, op.w, op.h).stroke();
    } else {
      doc.fillColor('#f7f1e6').strokeColor('#241c16').rect(op.x, op.y, op.w, op.h).fillAndStroke();
    }
    doc.restore();
    return;
  }
  if (op.kind !== 'line') return;
  doc.save();
  doc.strokeColor(op.layer === 'dim' ? '#b85a32' : op.layer === 'hidden' ? '#8d8478' : '#241c16');
  if (op.dash || op.layer === 'hidden') doc.dash(8, { space: 5 });
  else doc.undash();
  doc.moveTo(op.x1, op.y1).lineTo(op.x2, op.y2).stroke();
  doc.restore();
}

function drawBill(doc: PdfDoc, spec: SpecDocument): void {
  doc.addPage({ size: 'A4', layout: 'portrait', margin: 32 });
  const widths = [24, 118, 50, 54, 42, 36, 68, 112];
  const tableWidth = widths.reduce((sum, width) => sum + width, 0);
  let y = drawBillHeader(doc, spec, 32);

  const header = ['№', 'Деталь', 'Длина', 'Ширина', 'Толщ.', 'Кол.', 'Кромка, м', 'Материал'];
  y = drawRow(doc, 32, y, header, widths, true);
  spec.result.bom.forEach((line, index) => {
    if (y > 760) {
      doc.addPage({ size: 'A4', layout: 'portrait', margin: 32 });
      y = drawBillHeader(doc, spec, 32);
      y = drawRow(doc, 32, y, header, widths, true);
    }
    y = drawRow(
      doc,
      32,
      y,
      [
        String(index + 1),
        line.name,
        String(line.length),
        String(line.width),
        String(line.thickness),
        String(line.qty),
        formatMeters((line.edgeMm / 1000) * line.qty),
        line.materialName,
      ],
      widths,
      false,
    );
  });

  y += 16;
  doc.fontSize(11).fillColor('#241c16');
  doc.text(`Деталей: ${spec.result.totals.partCount}`, 32, y, { lineBreak: false });
  doc.text(`Площадь: ${formatArea(spec.result.totals.areaM2)} м²`, 180, y, { lineBreak: false });
  doc.text(`Кромка: ${formatMeters(spec.result.totals.edgeM)} м`, 340, y, { lineBreak: false });
  y += 20;
  doc.fontSize(13).fillColor('#8a3e22').text(`Материалы: ${formatRub(spec.result.totals.cost)}`, 32, y, {
    lineBreak: false,
  });
  y += 28;
  doc.fontSize(8).fillColor('#6d655b').text(
    'Оценка включает плиту и кромку видимых торцов. Петли, направляющие, крепёж и работа не входят. Припуск на раскрой не заложен.',
    32,
    y,
    { width: tableWidth },
  );
  if (spec.result.warnings.length > 0) {
    doc.moveDown(0.6);
    doc.fillColor('#8a3e22').text(spec.result.warnings.join(' '), { width: tableWidth });
  }
}

function drawBillHeader(doc: PdfDoc, spec: SpecDocument, y: number): number {
  doc.fontSize(16).fillColor('#241c16').text(`Спецификация · ${spec.name}`, 32, y, { lineBreak: false });
  return y + 28;
}

function drawRow(
  doc: PdfDoc,
  x: number,
  y: number,
  cells: string[],
  widths: number[],
  header: boolean,
): number {
  const height = 18;
  const tableWidth = widths.reduce((sum, width) => sum + width, 0);
  if (header) {
    doc.save();
    doc.rect(x, y, tableWidth, height).fill('#efe7da');
    doc.restore();
  }
  let cursor = x;
  cells.forEach((cell, index) => {
    const align = index === 1 || index === 7 ? 'left' : 'right';
    doc
      .fontSize(8)
      .fillColor('#241c16')
      .text(cell, cursor + 3, y + 5, { width: widths[index] - 6, align, lineBreak: false });
    cursor += widths[index];
  });
  doc
    .save()
    .strokeColor('#ddd4c6')
    .moveTo(x, y + height)
    .lineTo(x + tableWidth, y + height)
    .stroke()
    .restore();
  return y + height;
}
