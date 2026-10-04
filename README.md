# Корпус

Параметрический планировщик корпусной мебели. Одна модель корпуса питает 3D-сцену, фасад и сечения в SVG, раскрой в DXF и спецификацию в PDF.

Пользователь задаёт тип, габариты, полки, фасады, ящики и материал. Производитель получает чертёж, список деталей и оценку плиты с кромкой. Заказ из WooCommerce с метаданными размера создаёт тот же проект.

## Запуск

```bash
npm install
npm test
npm run dev
```

Интерфейс: http://127.0.0.1:5173  
API: http://127.0.0.1:3001/api/health

Без `DATABASE_URL` проекты пишутся во встроенный Postgres (каталог `data/pglite`). Для отдельного сервера:

```bash
docker compose up -d
```

и переменная `DATABASE_URL=postgres://planner:planner@localhost:5432/planner`. Секрет вебхука по умолчанию `dev-secret`, порт API `3001`. Пример есть в `.env.example`.

## Что внутри

- `shared` — построение корпуса, спецификация, SVG и DXF. Клиент и сервер считают одну и ту же геометрию.
- `client` — React и Three.js.
- `server` — Fastify, Postgres, PDF.
- `integrations/woocommerce-order.php` — мост из WooCommerce. В метаданных позиции нужны `type`, `width`, `height` или `depth` (можно по-русски: тип, ширина, высота, глубина).

Проверка заказа:

```bash
curl -X POST http://127.0.0.1:3001/api/integrations/woocommerce ^
  -H "Content-Type: application/json" ^
  -H "X-WC-Webhook-Secret: dev-secret" ^
  --data-binary "@integrations/sample-order.json"
```

В ответе будут ссылки на проект, PDF, DXF и SVG.

Сборка для одного процесса: `npm run build`, затем `npm start`. Fastify отдаёт клиент из `client/dist`.

Шрифт PDF — Roboto (Google, Apache License 2.0), файл `server/assets/Roboto-Regular.ttf`. Если его нет, на Windows берётся Arial.
