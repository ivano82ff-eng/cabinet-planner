import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { OrderError, readOrder } from './woo';

const sample = JSON.parse(
  readFileSync(new URL('../../integrations/sample-order.json', import.meta.url), 'utf8'),
) as unknown;

test('a WooCommerce order becomes one cabinet and skips unrelated lines', () => {
  const order = readOrder(sample);
  assert.ok(order);
  assert.equal(order?.orderId, '1042');
  assert.equal(order?.customerName, 'Иван Петров');
  assert.equal(order?.customerEmail, 'ivan@example.com');
  assert.equal(order?.lines.length, 1);
  assert.equal(order?.lines[0]?.config.width, 800);
  assert.equal(order?.lines[0]?.config.doors, 2);
  assert.equal(order?.lines[0]?.config.materialId, 'oak');
});

test('russian meta keys and material names are accepted', () => {
  const order = readOrder({
    id: 7,
    billing: { first_name: 'Мария', email: 'maria@example.com' },
    line_items: [
      {
        name: 'Пенал',
        meta_data: [
          { key: 'Тип', value: 'Пенал' },
          { key: 'Ширина', value: '500' },
          { key: 'Высота', value: '2200' },
          { key: 'Глубина', value: '560' },
          { key: 'Материал', value: 'ЛДСП орех' },
        ],
      },
    ],
  });
  assert.equal(order?.lines[0]?.config.type, 'tall');
  assert.equal(order?.lines[0]?.config.width, 500);
  assert.equal(order?.lines[0]?.config.height, 2200);
  assert.equal(order?.lines[0]?.config.materialId, 'walnut');
});

test('webhook discovery ping is not an order', () => {
  assert.equal(readOrder({ webhook_id: 15 }), null);
});

test('an order without cabinet fields is rejected', () => {
  assert.throws(
    () => readOrder({ id: 1, line_items: [{ name: 'Доставка', meta_data: [] }] }),
    OrderError,
  );
});
