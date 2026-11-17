import test from 'node:test';
import assert from 'node:assert/strict';
import { createActivity } from '../../src/core/activity.mjs';

test('activity cuenta eventos por fuente sin guardar su contenido y limita las fuentes', () => {
  let now = 1000;
  const activity = createActivity({ now: () => now, maxSources: 2 });
  activity.record({ source: 'opencode', type: 'tool.start', tool: 'bash', text: 'secreto' });
  now = 3000;
  activity.record({ source: 'demo', type: 'session.idle' }, { ignored: true });
  now = 5000;
  activity.record({ source: 'curl', type: 'custom' });
  const snapshot = activity.snapshot();
  assert.equal(snapshot.total, 3);
  assert.deepEqual(Object.keys(snapshot.sources), ['curl', 'demo']);
  assert.equal(snapshot.sources.demo.last.ignored, true);
  assert.equal(snapshot.sources.demo.last.agoMs, 2000);
  assert.equal(JSON.stringify(snapshot).includes('secreto'), false);
});
