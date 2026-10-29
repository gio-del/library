'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createGoal } = require('../lib/goal');

test('obiettivo: resta dopo il riavvio e il file corrotto non passa', async () => {
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lib-goal-')), 'dati');
  assert.deepStrictEqual(await createGoal(dir).get(), { goal: null });
  await createGoal(dir).put(24);
  assert.deepStrictEqual(await createGoal(dir).get(), { goal: 24 });
  fs.writeFileSync(path.join(dir, 'goal.json'), '{"goal":5000}');
  assert.deepStrictEqual(await createGoal(dir).get(), { goal: null });
});
