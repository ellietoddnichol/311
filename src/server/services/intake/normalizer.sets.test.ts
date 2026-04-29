import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePdfChunks } from './normalizer.ts';

test('normalizePdfChunks expands clear grab bar set language into child items', async () => {
  const items = await normalizePdfChunks({
    fileName: 'fixture.pdf',
    mimeType: 'application/pdf',
    chunks: [
      {
        chunkId: 'c1',
        pageNumber: 1,
        text: '6 sets 6806 grab bars – 18, 36, 42\n',
      },
    ],
  });

  const lines = items.filter((item) => item.itemType === 'item');
  assert.equal(lines.length, 3);
  assert.deepEqual(lines.map((l) => l.quantity), [6, 6, 6]);
  assert.equal(lines.every((l) => String(l.description).toLowerCase().includes('grab bar')), true);
  assert.equal(lines.some((l) => String(l.description).includes('18')), true);
  assert.equal(lines.some((l) => String(l.description).includes('36')), true);
  assert.equal(lines.some((l) => String(l.description).includes('42')), true);
});

