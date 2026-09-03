// Minimal stand-in for foundry.applications.api so an ApplicationV2
// subclass can be imported and constructed in plain Node, and its pure
// data-shaping methods (_prepareContext) unit tested — NOT a behavioral
// mock of ApplicationV2's real rendering/lifecycle (_onRender, actual DOM
// dispatch). Those stay verified manually against a live local Foundry,
// same as this package's existing Foundry-global tests in
// test/v13.test.js (which stub globalThis.Scene/JournalEntry directly).
class StubApplicationV2 {
  constructor(options = {}) {
    this.options = options;
  }

  async close() {
    return this;
  }
}

function stubHandlebarsApplicationMixin(Base) {
  return Base;
}

export function installFoundryStub() {
  globalThis.foundry = {
    applications: {
      api: {
        ApplicationV2: StubApplicationV2,
        HandlebarsApplicationMixin: stubHandlebarsApplicationMixin,
      },
    },
  };
}

export function uninstallFoundryStub() {
  delete globalThis.foundry;
}
