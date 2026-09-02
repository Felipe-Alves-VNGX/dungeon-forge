// packages/adapter-foundry/src/shared/key-journal.js
//
// Builds the "Chave" JournalEntry: one page per Area (so a GM can grant
// per-page ownership as the party discovers each area — SPEC.md §5.14),
// plus a Legenda page. Page names are "{label} — {title}", which
// mapAreaPagesById uses afterward to recover Area.id -> pageId (JournalEntry
// pages don't carry an arbitrary custom-data field in this Foundry version
// without a system-specific data model, so the name itself is the join key
// — every Area.label in a Dungeon is unique by construction).
const JOURNAL_FORMAT_HTML = 1; // CONST.JOURNAL_ENTRY_PAGE_FORMATS.HTML

function pageNameForArea(area, entry) {
  return `${area.label} — ${entry.title}`;
}

function pageContentForArea(area, entry) {
  const exitsHtml = area.exits.length === 0
    ? '<p><em>Sem saídas.</em></p>'
    : `<ul>${area.exits.map((e) => `<li>${e.dir} → ${e.toLabel} (${e.via})</li>`).join('')}</ul>`;
  return `<p>${entry.description}</p>${exitsHtml}`;
}

function legendPageContent(legend) {
  const rows = legend.map((s) => `<li><strong>${s.kind}</strong>: ${s.caption}</li>`).join('');
  return `<ul>${rows}</ul>`;
}

export async function createKeyJournal(dungeon, config) {
  const entriesByAreaId = new Map(dungeon.key.entries.map((e) => [e.areaId, e]));

  const areaPages = dungeon.areas.map((area) => {
    const entry = entriesByAreaId.get(area.id);
    return {
      name: pageNameForArea(area, entry),
      type: 'text',
      text: { content: pageContentForArea(area, entry), format: JOURNAL_FORMAT_HTML },
    };
  });

  const legendPage = {
    name: 'Legenda',
    type: 'text',
    text: { content: legendPageContent(dungeon.key.legend), format: JOURNAL_FORMAT_HTML },
  };

  return JournalEntry.create({
    name: `Chave — ${config.seed}`,
    pages: [legendPage, ...areaPages],
  });
}

export function mapAreaPagesById(journal, dungeon) {
  const entriesByAreaId = new Map(dungeon.key.entries.map((e) => [e.areaId, e]));
  const pageIdByName = new Map(journal.pages.contents.map((p) => [p.name, p.id]));

  const map = new Map();
  for (const area of dungeon.areas) {
    const entry = entriesByAreaId.get(area.id);
    const pageId = pageIdByName.get(pageNameForArea(area, entry));
    map.set(area.id, pageId);
  }
  return map;
}
