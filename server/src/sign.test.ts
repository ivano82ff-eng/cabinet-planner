import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import { webhookAuthorized } from './sign';

test('accepts a shared secret or a WooCommerce HMAC signature', () => {
  const raw = Buffer.from('{"id":1042}');
  const secret = 'dev-secret';
  const signature = createHmac('sha256', secret).update(raw).digest('base64');

  assert.equal(webhookAuthorized(raw, signature, undefined, secret), true);
  assert.equal(webhookAuthorized(raw, undefined, secret, secret), true);
  assert.equal(webhookAuthorized(raw, 'nope', 'wrong', secret), false);
  assert.equal(webhookAuthorized(undefined, undefined, undefined, secret), false);
});
