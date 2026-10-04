import {
  buildCabinet,
  buildDrawing,
  describeSize,
  formatArea,
  formatMeters,
  formatRub,
  formatStamp,
  getMaterial,
  renderSvg,
  viewSheet,
  type CabinetConfig,
} from '@planner/shared';

export interface SpecSource {
  id: string;
  name: string;
  customerName: string;
  customerEmail: string;
  createdAt: string;
  config: CabinetConfig;
}

export function specMarkup(source: SpecSource): string {
  const result = buildCabinet(source.config);
  const material = getMaterial(result.config.materialId);
  const views = buildDrawing(result)
    .views.map(
      (view) =>
        `<figure><figcaption>${escapeHtml(view.title)}</figcaption>${renderSvg(viewSheet(view), true)}</figure>`,
    )
    .join('');
  const rows = result.bom
    .map(
      (line, index) => `<tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(line.name)}</td>
        <td>${line.length}</td>
        <td>${line.width}</td>
        <td>${line.thickness}</td>
        <td>${line.qty}</td>
        <td>${formatMeters((line.edgeMm / 1000) * line.qty)}</td>
        <td>${escapeHtml(line.materialName)}</td>
      </tr>`,
    )
    .join('');
  const meta = [source.customerName || 'Заказчик не указан', source.customerEmail, formatStamp(source.createdAt), `${describeSize(result.config)} мм`, material.name]
    .filter(Boolean)
    .join(' · ');

  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(source.name)}</title>
  <style>
    @page sheet { size: A4 landscape; margin: 12mm; }
    @page bill { size: A4 portrait; margin: 12mm; }
    body { margin: 0; color: #241c16; font: 12px "Segoe UI", "Helvetica Neue", sans-serif; }
    .cover { page: sheet; }
    .bill { page: bill; break-before: page; }
    h1 { margin: 0 0 6px; font-size: 22px; }
    h2 { margin: 0 0 10px; font-size: 16px; }
    p { margin: 0 0 8px; color: #5e574c; }
    .views { display: flex; gap: 12px; }
    figure { flex: 1; margin: 0; }
    figcaption { color: #8a3e22; text-align: center; margin-bottom: 4px; }
    svg { width: 100%; height: auto; background: #f6f1e7; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 4px 6px; border-bottom: 1px solid #ddd4c6; text-align: right; }
    th:nth-child(2), td:nth-child(2), th:nth-child(8), td:nth-child(8) { text-align: left; }
    thead th { background: #efe7da; }
    .totals { margin-top: 14px; }
    .cost { color: #8a3e22; font-size: 14px; }
    .note { color: #6d655b; font-size: 11px; }
  </style>
</head>
<body>
  <section class="cover">
    <h1>${escapeHtml(source.name)}</h1>
    <p>${escapeHtml(meta)}</p>
    <p>${escapeHtml(source.id)}</p>
    <div class="views">${views}</div>
    <p class="note">Размеры в миллиметрах. Масштаб вида подобран под лист.</p>
  </section>
  <section class="bill">
    <h2>Спецификация · ${escapeHtml(source.name)}</h2>
    <table>
      <thead>
        <tr><th>№</th><th>Деталь</th><th>Длина</th><th>Ширина</th><th>Толщ.</th><th>Кол.</th><th>Кромка, м</th><th>Материал</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="totals">Деталей: ${result.totals.partCount} · Площадь: ${formatArea(result.totals.areaM2)} м² · Кромка: ${formatMeters(result.totals.edgeM)} м</p>
    <p class="cost">Материалы: ${formatRub(result.totals.cost)}</p>
    <p class="note">Оценка включает плиту и кромку видимых торцов. Петли, направляющие, крепёж и работа не входят. Припуск на раскрой не заложен.</p>
    ${result.warnings.length ? `<p class="cost">${escapeHtml(result.warnings.join(' '))}</p>` : ''}
  </section>
</body>
</html>`;
}

export function printSpec(source: SpecSource): void {
  const popup = window.open('', '_blank');
  if (!popup) throw new Error('Браузер заблокировал окно печати. Разрешите всплывающие окна и повторите.');
  popup.document.open();
  popup.document.write(specMarkup(source));
  popup.document.close();
  popup.focus();
  popup.setTimeout(() => popup.print(), 300);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
