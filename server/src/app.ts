import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  buildCabinet,
  buildDrawing,
  buildSheet,
  ConfigError,
  describeSize,
  parseConfig,
  OrderError,
  readOrder,
  renderDxf,
  renderSvg,
} from '@planner/shared';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import {
  findProjectByWoo,
  getProject,
  insertProject,
  isUniqueViolation,
  listMaterials,
  listProjects,
  updateProject,
  type Database,
  type NewProject,
  type ProjectRecord,
} from './db';
import { renderSpecPdf } from './pdf';
import { webhookAuthorized } from './sign';

declare module 'fastify' {
  interface FastifyRequest {
    rawBody?: Buffer;
  }
}

export async function buildApp(db: Database, mode: 'postgres' | 'embedded'): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (request, body, done) => {
    const raw = Buffer.isBuffer(body) ? body : Buffer.from(body);
    request.rawBody = raw;
    try {
      const text = raw.toString('utf8').trim();
      done(null, text ? JSON.parse(text) : {});
    } catch (error) {
      done(error as Error, undefined);
    }
  });
  await app.register(cors, { origin: true });

  app.get('/api/health', async () => ({ ok: true, db: mode }));

  app.get('/api/materials', async () => listMaterials(db));

  app.get('/api/projects', async () => {
    const projects = await listProjects(db);
    return projects.map((project) => summarize(project));
  });

  app.get<{ Params: { id: string } }>('/api/projects/:id', async (request, reply) => {
    const project = await getProject(db, request.params.id);
    if (!project) return reply.code(404).send({ error: 'Проект не найден.' });
    return present(project);
  });

  app.post('/api/projects', async (request, reply) => {
    try {
      const project = await insertProject(db, readBody(request.body));
      return reply.code(201).send(present(project));
    } catch (error) {
      return sendConfigError(error, reply);
    }
  });

  app.patch<{ Params: { id: string } }>('/api/projects/:id', async (request, reply) => {
    try {
      const project = await updateProject(db, request.params.id, readBody(request.body));
      if (!project) return reply.code(404).send({ error: 'Проект не найден.' });
      return present(project);
    } catch (error) {
      return sendConfigError(error, reply);
    }
  });

  app.post('/api/preview', async (request, reply) => {
    try {
      const body = readBody(request.body);
      return buildCabinet(body.config);
    } catch (error) {
      return sendConfigError(error, reply);
    }
  });

  app.get<{ Params: { id: string } }>('/api/projects/:id/drawing.svg', async (request, reply) => {
    const project = await getProject(db, request.params.id);
    if (!project) return reply.code(404).send({ error: 'Проект не найден.' });
    const sheet = buildSheet(buildDrawing(buildCabinet(project.config)));
    return reply
      .header('content-disposition', attachment(project.name, 'svg'))
      .type('image/svg+xml')
      .send(renderSvg(sheet));
  });

  app.get<{ Params: { id: string } }>('/api/projects/:id/panels.dxf', async (request, reply) => {
    const project = await getProject(db, request.params.id);
    if (!project) return reply.code(404).send({ error: 'Проект не найден.' });
    const sheet = buildSheet(buildDrawing(buildCabinet(project.config)));
    return reply
      .header('content-disposition', attachment(project.name, 'dxf'))
      .type('application/dxf')
      .send(renderDxf(sheet));
  });

  app.get<{ Params: { id: string } }>('/api/projects/:id/spec.pdf', async (request, reply) => {
    const project = await getProject(db, request.params.id);
    if (!project) return reply.code(404).send({ error: 'Проект не найден.' });
    const pdf = await renderSpecPdf({
      id: project.id,
      name: project.name,
      customerName: project.customerName,
      customerEmail: project.customerEmail,
      createdAt: project.createdAt,
      result: buildCabinet(project.config),
    });
    return reply.header('content-disposition', attachment(project.name, 'pdf')).type('application/pdf').send(pdf);
  });

  app.post('/api/integrations/woocommerce', async (request, reply) => {
    const secret = process.env.WC_WEBHOOK_SECRET ?? 'dev-secret';
    const allowed = webhookAuthorized(
      request.rawBody,
      header(request, 'x-wc-webhook-signature'),
      header(request, 'x-wc-webhook-secret'),
      secret,
    );
    if (!allowed) return reply.code(401).send({ error: 'Неверная подпись вебхука.' });

    let order: ReturnType<typeof readOrder>;
    try {
      order = readOrder(request.body);
    } catch (error) {
      if (error instanceof OrderError) return reply.code(422).send({ error: error.message });
      throw error;
    }
    if (!order) return { ok: true };

    const projects = [];
    for (const [index, line] of order.lines.entries()) {
      const wooOrderId = `${order.orderId}:${index}`;
      projects.push(await saveOrderLine(db, wooOrderId, order.customerName, order.customerEmail, line.name, line.config));
    }
    return reply.code(201).send({
      orderId: order.orderId,
      projects: projects.map((project) => ({
        id: project.id,
        name: project.name,
        planner: `/?project=${project.id}`,
        spec: `/api/projects/${project.id}/spec.pdf`,
        dxf: `/api/projects/${project.id}/panels.dxf`,
        svg: `/api/projects/${project.id}/drawing.svg`,
      })),
    });
  });

  const clientDist = fileURLToPath(new URL('../../client/dist', import.meta.url));
  if (existsSync(clientDist)) {
    await app.register(fastifyStatic, { root: clientDist });
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api')) return reply.code(404).send({ error: 'Маршрут не найден.' });
      return reply.sendFile('index.html');
    });
  }

  return app;
}

async function saveOrderLine(
  db: Database,
  wooOrderId: string,
  customerName: string,
  customerEmail: string,
  fallbackName: string,
  config: NewProject['config'],
): Promise<ProjectRecord> {
  const existing = await findProjectByWoo(db, wooOrderId);
  if (existing) return existing;
  const name = config.name || fallbackName;
  try {
    return await insertProject(db, {
      name,
      customerName,
      customerEmail,
      config: { ...config, name },
      wooOrderId,
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const again = await findProjectByWoo(db, wooOrderId);
    if (again) return again;
    throw error;
  }
}

function present(project: ProjectRecord) {
  const result = buildCabinet(project.config);
  return {
    ...summarize(project),
    customerEmail: project.customerEmail,
    config: project.config,
    createdAt: project.createdAt,
    bom: result.bom,
    warnings: result.warnings,
    totals: result.totals,
  };
}

function summarize(project: ProjectRecord) {
  const result = buildCabinet(project.config);
  return {
    id: project.id,
    name: project.name,
    customerName: project.customerName,
    wooOrderId: project.wooOrderId,
    updatedAt: project.updatedAt,
    size: describeSize(project.config),
    cost: result.totals.cost,
  };
}

function readBody(body: unknown): NewProject {
  const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const config = parseConfig(record.config ?? record);
  const name = clip(record.name, 80) || config.name;
  return {
    name,
    customerName: clip(record.customerName, 120),
    customerEmail: clip(record.customerEmail, 160),
    config: { ...config, name },
  };
}

function sendConfigError(error: unknown, reply: FastifyReply) {
  if (error instanceof ConfigError) return reply.code(400).send({ error: error.message });
  throw error;
}

function clip(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function header(request: FastifyRequest, name: string): string | undefined {
  const value = request.headers[name];
  return typeof value === 'string' ? value : undefined;
}

function attachment(name: string, ext: string): string {
  const encoded = encodeURIComponent(`${name}.${ext}`);
  return `attachment; filename="cabinet.${ext}"; filename*=UTF-8''${encoded}`;
}
