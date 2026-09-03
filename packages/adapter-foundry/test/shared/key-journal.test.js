// packages/adapter-foundry/test/shared/key-journal.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createKeyJournal, mapAreaPagesById } from '../../src/shared/key-journal.js';

function dungeon() {
  return {
    areas: [
      { id: 0, label: '1-01', floor: 0, roomId: 0, cx: 2, cy: 2, exits: [{ dir: 'e', toLabel: '1-02', via: 'door' }] },
      { id: 1, label: '1-02', floor: 0, roomId: 1, cx: 8, cy: 2, exits: [] },
    ],
    key: {
      entries: [
        { areaId: 0, label: '1-01', title: 'Entrada', description: 'Uma sala de entrada.', tags: ['entrance'] },
        { areaId: 1, label: '1-02', title: 'Câmara', description: 'Uma câmara vazia.', tags: ['filler'] },
      ],
      legend: [{ kind: 'entrance', caption: 'Entrada da masmorra' }],
    },
  };
}

describe('createKeyJournal', () => {
  beforeEach(() => {
    globalThis.JournalEntry = {
      create: vi.fn(async (data) => ({
        id: 'journal-fake-id',
        pages: { contents: data.pages.map((p, i) => ({ id: `page-${i}`, name: p.name })) },
      })),
    };
  });

  it('creates one page per Area plus a Legenda page, titled "{label} — {title}"', async () => {
    const journal = await createKeyJournal(dungeon(), { seed: 'x' });
    const call = globalThis.JournalEntry.create.mock.calls[0][0];
    expect(call.pages).toHaveLength(3); // 2 areas + Legenda
    expect(call.pages[0].name).toBe('Legenda');
    expect(call.pages[1].name).toBe('1-01 — Entrada');
    expect(call.pages[2].name).toBe('1-02 — Câmara');
    expect(journal.id).toBe('journal-fake-id');
  });

  it('every non-Legenda page text content includes the description and exit list', async () => {
    await createKeyJournal(dungeon(), { seed: 'x' });
    const call = globalThis.JournalEntry.create.mock.calls[0][0];
    expect(call.pages[1].text.content).toContain('Uma sala de entrada.');
    expect(call.pages[1].text.content).toContain('1-02'); // exit destination label
    expect(call.pages[2].text.content).toContain('Uma câmara vazia.');
  });
});

describe('mapAreaPagesById', () => {
  it('maps Area.id to the created page id by matching page name to area label prefix', () => {
    const journal = {
      pages: {
        contents: [
          { id: 'page-legend', name: 'Legenda' },
          { id: 'page-0', name: '1-01 — Entrada' },
          { id: 'page-1', name: '1-02 — Câmara' },
        ],
      },
    };
    const map = mapAreaPagesById(journal, dungeon());
    expect(map.get(0)).toBe('page-0');
    expect(map.get(1)).toBe('page-1');
  });
});
