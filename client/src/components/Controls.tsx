import {
  LIMITS,
  MATERIALS,
  PRESETS,
  TYPE_LABELS,
  formatRub,
  formatStamp,
  type CabinetConfig,
  type CabinetType,
  type Totals,
} from '@planner/shared';
import type { ProjectSummary } from '../api';

interface Props {
  config: CabinetConfig;
  customerName: string;
  customerEmail: string;
  warnings: string[];
  totals: Totals;
  projects: ProjectSummary[];
  activeId: string | null;
  onChange: (config: CabinetConfig) => void;
  onCustomerName: (value: string) => void;
  onCustomerEmail: (value: string) => void;
  onSelect: (id: string) => void;
}

const TYPES: CabinetType[] = ['base', 'wall', 'tall', 'drawer'];

export function Controls(props: Props) {
  const { config, onChange } = props;
  const patch = (partial: Partial<CabinetConfig>) => onChange({ ...config, ...partial });

  return (
    <aside className="panel">
      <section>
        <h2>Тип изделия</h2>
        <div className="types">
          {TYPES.map((type) => (
            <button
              key={type}
              type="button"
              className={config.type === type ? 'on' : ''}
              onClick={() => onChange({ ...PRESETS[type] })}
            >
              {TYPE_LABELS[type]}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2>Габариты, мм</h2>
        <Dimension label="Ширина" value={config.width} min={LIMITS.width[0]} max={LIMITS.width[1]} onChange={(width) => patch({ width })} />
        <Dimension label="Высота" value={config.height} min={LIMITS.height[0]} max={LIMITS.height[1]} onChange={(height) => patch({ height })} />
        <Dimension label="Глубина" value={config.depth} min={LIMITS.depth[0]} max={LIMITS.depth[1]} onChange={(depth) => patch({ depth })} />
      </section>

      <section>
        <h2>Наполнение</h2>
        <label className="field">
          <span>Толщина корпуса</span>
          <select value={config.thickness} onChange={(event) => patch({ thickness: Number(event.target.value) })}>
            <option value={16}>16 мм</option>
            <option value={18}>18 мм</option>
          </select>
        </label>
        <Stepper label="Полки" value={config.shelves} min={LIMITS.shelves[0]} max={LIMITS.shelves[1]} onChange={(shelves) => patch({ shelves })} />
        <Stepper label="Фасады" value={config.doors} min={LIMITS.doors[0]} max={LIMITS.doors[1]} onChange={(doors) => patch({ doors })} />
        <Stepper label="Ящики" value={config.drawers} min={LIMITS.drawers[0]} max={LIMITS.drawers[1]} onChange={(drawers) => patch({ drawers })} />
        <Dimension
          label="Цоколь"
          value={config.plinthHeight}
          min={LIMITS.plinthHeight[0]}
          max={LIMITS.plinthHeight[1]}
          onChange={(plinthHeight) => patch({ plinthHeight })}
        />
      </section>

      <section>
        <h2>Материал корпуса</h2>
        <div className="swatches">
          {MATERIALS.map((material) => (
            <button
              key={material.id}
              type="button"
              className={config.materialId === material.id ? 'on' : ''}
              onClick={() => patch({ materialId: material.id })}
            >
              <i style={{ background: material.color }} />
              <span>{material.name.replace('ЛДСП ', '')}</span>
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2>Заказ</h2>
        <label className="field">
          <span>Название</span>
          <input value={config.name} maxLength={80} onChange={(event) => patch({ name: event.target.value })} />
        </label>
        <label className="field">
          <span>Заказчик</span>
          <input value={props.customerName} maxLength={120} onChange={(event) => props.onCustomerName(event.target.value)} />
        </label>
        <label className="field">
          <span>Почта</span>
          <input
            type="email"
            value={props.customerEmail}
            maxLength={160}
            onChange={(event) => props.onCustomerEmail(event.target.value)}
          />
        </label>
      </section>

      <p className="estimate">
        <strong>{formatRub(props.totals.cost)}</strong>
        <span>
          {props.totals.partCount} дет. · плита и кромка, без фурнитуры
        </span>
      </p>
      {props.warnings.length > 0 && (
        <ul className="warnings">
          {props.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}

      <section>
        <h2>Сохранённые</h2>
        {props.projects.length === 0 ? (
          <p className="muted">Пока пусто. Сохраните текущую модель.</p>
        ) : (
          <ul className="projects">
            {props.projects.map((project) => (
              <li key={project.id}>
                <button type="button" className={project.id === props.activeId ? 'on' : ''} onClick={() => props.onSelect(project.id)}>
                  <b>{project.name}</b>
                  <small>
                    {project.size} · {formatStamp(project.updatedAt)}
                  </small>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </aside>
  );
}

function Dimension({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="field">
      <span>
        {label}
        <b>{value}</b>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={10}
        value={clamp(value, min, max)}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) onChange(next);
        }}
      />
    </label>
  );
}

function Stepper({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="stepper">
      <span>{label}</span>
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min}>
        −
      </button>
      <strong>{value}</strong>
      <button type="button" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max}>
        +
      </button>
    </div>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
