import { useEffect, useRef, useState } from 'react';
import type { BuildResult } from '@planner/shared';
import { CabinetScene } from '../scene';

interface Props {
  result: BuildResult;
  showFronts: boolean;
  onShowFronts: (value: boolean) => void;
}

export function Viewport({ result, showFronts, onShowFronts }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<CabinetScene | null>(null);
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    const node = host.current;
    if (!node) return undefined;
    const next = new CabinetScene(node, setLabel);
    scene.current = next;
    return () => {
      next.dispose();
      scene.current = null;
    };
  }, []);

  useEffect(() => {
    scene.current?.setModel(result, showFronts);
  }, [result, showFronts]);

  return (
    <div className="viewport">
      <div ref={host} className="viewport-stage" />
      <div className="viewport-hud">
        <span>
          {result.config.width} × {result.config.height} × {result.config.depth}
        </span>
        <label>
          <input
            type="checkbox"
            checked={showFronts}
            onChange={(event) => onShowFronts(event.target.checked)}
          />
          Фасады
        </label>
        <button type="button" onClick={() => scene.current?.frame()}>
          Вписать
        </button>
      </div>
      <p className="viewport-label">{label ?? 'Наведите на деталь'}</p>
    </div>
  );
}
