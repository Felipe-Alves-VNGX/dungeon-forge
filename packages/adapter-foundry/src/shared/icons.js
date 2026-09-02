// packages/adapter-foundry/src/shared/icons.js
//
// One Note icon per Room.role (SPEC.md §5.11's legend). Paths are Foundry's
// own bundled icons (icons/svg/*.svg ships with core Foundry — no asset of
// our own needed for this round).
const ROLE_ICON = {
  entrance: 'icons/svg/door-exit.svg',
  climax: 'icons/svg/skull.svg',
  treasure: 'icons/svg/chest.svg',
  junction: 'icons/svg/pawprint.svg',
  filler: 'icons/svg/village.svg',
};

export function iconForRole(role) {
  return ROLE_ICON[role] ?? ROLE_ICON.filler;
}
