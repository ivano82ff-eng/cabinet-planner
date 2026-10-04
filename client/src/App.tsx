import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  buildCabinet,
  buildDrawing,
  buildSheet,
  PRESETS,
  renderDxf,
  renderSvg,
  type CabinetConfig,
} from '@planner/shared';
import {
  ApiError,
  createProject,
  downloadText,
  fetchHealth,
  fetchProject,
  fetchProjects,
  updateProject,
  type ProjectInput,
  type ProjectSummary,
} from './api';
import { Controls } from './components/Controls';
import { Dossier } from './components/Dossier';
import { Viewport } from './components/Viewport';

export function App() {
  const [config, setConfig] = useState<CabinetConfig>(PRESETS.base);
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [projectId, setProjectId] = useState<string | null>(null);
  const [wooOrderId, setWooOrderId] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [serverOk, setServerOk] = useState(false);
  const [showFronts, setShowFronts] = useState(true);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const built = useMemo(() => buildCabinet(config), [config]);

  const refresh = useCallback(async () => {
    const list = await fetchProjects();
    setProjects(list);
  }, []);

  const openProject = useCallback(async (id: string) => {
    const project = await fetchProject(id);
    setConfig(project.config);
    setCustomerName(project.customerName);
    setCustomerEmail(project.customerEmail);
    setProjectId(project.id);
    setWooOrderId(project.wooOrderId);
    const url = new URL(window.location.href);
    url.searchParams.set('project', project.id);
    window.history.replaceState(null, '', url);
    setStatus(`Открыт проект «${project.name}»`);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchHealth()
      .then(async () => {
        if (cancelled) return;
        setServerOk(true);
        await refresh();
        const id = new URLSearchParams(window.location.search).get('project');
        if (id) await openProject(id);
      })
      .catch(() => {
        if (!cancelled) setServerOk(false);
      });
    return () => {
      cancelled = true;
    };
  }, [openProject, refresh]);

  const payload = useCallback((): ProjectInput => {
    return {
      name: config.name,
      customerName,
      customerEmail,
      config,
    };
  }, [config, customerEmail, customerName]);

  async function save(): Promise<string> {
    const saved = projectId ? await updateProject(projectId, payload()) : await createProject(payload());
    setProjectId(saved.id);
    setWooOrderId(saved.wooOrderId);
    setConfig(saved.config);
    const url = new URL(window.location.href);
    url.searchParams.set('project', saved.id);
    window.history.replaceState(null, '', url);
    await refresh();
    return saved.id;
  }

  async function onSave(): Promise<void> {
    setBusy(true);
    try {
      await save();
      setStatus('Проект сохранён');
    } catch (error) {
      setStatus(messageOf(error));
    } finally {
      setBusy(false);
    }
  }

  async function onPdf(): Promise<void> {
    setBusy(true);
    try {
      const id = await save();
      window.open(`/api/projects/${id}/spec.pdf`, '_blank');
      setStatus('PDF собран из сохранённого проекта');
    } catch (error) {
      setStatus(messageOf(error));
    } finally {
      setBusy(false);
    }
  }

  function onDxf(): void {
    const sheet = buildSheet(buildDrawing(built));
    downloadText(`${fileName(config.name)}.dxf`, renderDxf(sheet), 'application/dxf');
  }

  function onSvg(): void {
    const sheet = buildSheet(buildDrawing(built));
    downloadText(`${fileName(config.name)}.svg`, renderSvg(sheet), 'image/svg+xml');
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <svg viewBox="0 0 32 32" aria-hidden="true">
            <rect x="3" y="4" width="26" height="24" />
            <path d="M8 4v24M24 4v24M8 16h16M8 22h16" />
          </svg>
          <div>
            <strong>Корпус</strong>
            <small>Планировщик</small>
          </div>
        </div>
        <p className={serverOk ? 'link ok' : 'link'}>{serverOk ? 'API на связи' : 'API недоступен'}</p>
        {wooOrderId && <p className="link">Заказ {wooOrderId}</p>}
        <div className="actions">
          <button type="button" onClick={() => void onSave()} disabled={!serverOk || busy}>
            Сохранить
          </button>
          <button type="button" onClick={() => void onPdf()} disabled={!serverOk || busy}>
            PDF
          </button>
          <button type="button" onClick={onDxf}>
            DXF
          </button>
          <button type="button" onClick={onSvg}>
            SVG
          </button>
        </div>
      </header>
      {status && <p className="status">{status}</p>}
      {!serverOk && (
        <p className="status warn">
          Модель, чертежи, DXF и SVG считаются в браузере. Сохранение и PDF заработают, когда поднимется сервер.
        </p>
      )}
      <main className="workspace">
        <Controls
          config={config}
          customerName={customerName}
          customerEmail={customerEmail}
          warnings={built.warnings}
          totals={built.totals}
          projects={projects}
          activeId={projectId}
          onChange={setConfig}
          onCustomerName={setCustomerName}
          onCustomerEmail={setCustomerEmail}
          onSelect={(id) => void openProject(id).catch((error: unknown) => setStatus(messageOf(error)))}
        />
        <Viewport result={built} showFronts={showFronts} onShowFronts={setShowFronts} />
        <Dossier result={built} />
      </main>
    </div>
  );
}

function messageOf(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Не удалось выполнить запрос.';
}

function fileName(name: string): string {
  const clean = name.trim().replace(/[\\/:*?"<>|]+/g, '-');
  return clean || 'cabinet';
}
