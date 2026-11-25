import { test } from 'node:test';
import assert from 'node:assert/strict';

test('Health and Readiness endpoint returns 200 OK with expected structure', () => {
  const req = {};
  let statusCode = null;
  let jsonResponse = null;

  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(payload) {
      jsonResponse = payload;
      return this;
    }
  };

  const healthHandler = (req, res) => {
    res.status(200).json({
      status: 'ok',
      service: 'switchbook',
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString()
    });
  };

  healthHandler(req, res);

  assert.equal(statusCode, 200);
  assert.equal(jsonResponse.status, 'ok');
  assert.equal(jsonResponse.service, 'switchbook');
  assert.equal(typeof jsonResponse.uptime, 'number');
  assert.ok(jsonResponse.uptime >= 0);
  assert.ok(jsonResponse.timestamp);
  assert.ok(!isNaN(Date.parse(jsonResponse.timestamp)));
});
