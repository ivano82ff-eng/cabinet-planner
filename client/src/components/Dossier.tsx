import { useMemo } from 'react';
import {
  buildDrawing,
  formatArea,
  formatMeters,
  formatRub,
  renderSvg,
  viewSheet,
  type BuildResult,
} from '@planner/shared';

export function Dossier({ result }: { result: BuildResult }) {
  const drawing = useMemo(() => buildDrawing(result), [result]);

  return (
    <aside className="dossier">
      <section className="sheet">
        <header>
          <h2>Чертежи</h2>
          <span>мм</span>
        </header>
        {drawing.views.map((view) => (
          <figure key={view.id}>
            <figcaption>{view.title}</figcaption>
            <div dangerouslySetInnerHTML={{ __html: renderSvg(viewSheet(view), true) }} />
          </figure>
        ))}
      </section>

      <section className="sheet spec">
        <header>
          <h2>Спецификация</h2>
          <span>{result.totals.partCount} дет.</span>
        </header>
        <table>
          <thead>
            <tr>
              <th>Деталь</th>
              <th>Длина</th>
              <th>Ширина</th>
              <th>Т</th>
              <th>К-во</th>
              <th>Кромка</th>
            </tr>
          </thead>
          <tbody>
            {result.bom.map((line) => (
              <tr key={`${line.code}-${line.length}-${line.width}-${line.thickness}-${line.materialId}`}>
                <td>
                  {line.name}
                  <small>{line.materialName}</small>
                </td>
                <td>{line.length}</td>
                <td>{line.width}</td>
                <td>{line.thickness}</td>
                <td>{line.qty}</td>
                <td>{formatMeters((line.edgeMm / 1000) * line.qty)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="totals">
          <span>{formatArea(result.totals.areaM2)} м²</span>
          <span>{formatMeters(result.totals.edgeM)} м кромки</span>
          <strong>{formatRub(result.totals.cost)}</strong>
        </p>
      </section>
    </aside>
  );
}
