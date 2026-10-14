// Foundry-native re-wiring of the shape-editor logic already built for the
// harness — see docs/superpowers/specs/2026-09-03-adapter-foundry-room-editor-design.md.
// Every actual computation (SHAPE_TYPES, applyShapeType/Param/SizeDelta,
// applyCustomToggle, buildShapeEditorSVG, wireShapeEditorToggle) comes from
// @dungeon-forge/room-shape-ui — this class is only Foundry glue.
import { applyShapeType, applyShapeParam, applySizeDelta, applyCustomToggle, buildShapeEditorSVG, wireShapeEditorToggle } from '@dungeon-forge/room-shape-ui';
import { groupRoomsByFloor, buildDetailContext } from './shared/room-editor-context.js';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const ROOM_EDITOR_GRID_SIZE = 24;

export class DungeonForgeRoomEditorApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: 'dungeon-forge-room-editor',
    window: { title: 'Editar Salas', resizable: true },
    position: { width: 640, height: 520 },
    actions: {
      selectRoom: DungeonForgeRoomEditorApp.#onSelectRoom,
      resizeW: DungeonForgeRoomEditorApp.#onResizeW,
      resizeH: DungeonForgeRoomEditorApp.#onResizeH,
    },
  };

  static PARTS = {
    roomList: { template: 'modules/dungeon-forge/templates/room-editor-list.hbs' },
    detail: { template: 'modules/dungeon-forge/templates/room-editor-detail.hbs' },
  };

  constructor({ dungeon, onClose, ...options }) {
    super(options);
    this.dungeon = dungeon;
    this.onClose = onClose;
    this.selectedRoomId = dungeon.rooms[0]?.id ?? null;
  }

  #selectedRoom() {
    return this.dungeon.rooms.find((r) => r.id === this.selectedRoomId) ?? null;
  }

  async _prepareContext() {
    return {
      roomsByFloor: groupRoomsByFloor(this.dungeon.rooms, this.dungeon.areas, this.selectedRoomId),
      detail: buildDetailContext(this.#selectedRoom()),
    };
  }

  async _onRender() {
    const room = this.#selectedRoom();
    if (!room) return;

    const typeSelect = this.element.querySelector('[data-shape-type-select]');
    if (typeSelect && !typeSelect.dataset.listenerBound) {
      typeSelect.dataset.listenerBound = 'true';
      typeSelect.addEventListener('change', async (event) => {
        await this.#applyShapeTypeChange(room, event.target.value);
      });
    }

    const paramSelect = this.element.querySelector('[data-shape-param-select]');
    if (paramSelect && !paramSelect.dataset.listenerBound) {
      paramSelect.dataset.listenerBound = 'true';
      paramSelect.addEventListener('change', async (event) => {
        applyShapeParam(room, event.target.value);
        await this.render();
      });
    }

    const interactive = (room.shape?.type ?? 'rect') === 'custom';
    const container = this.element.querySelector('[data-shape-editor]');
    if (container) {
      container.innerHTML = buildShapeEditorSVG(room, this.dungeon, ROOM_EDITOR_GRID_SIZE, interactive);
      if (interactive) {
        wireShapeEditorToggle(container, (x, y) => {
          applyCustomToggle(room, x, y);
          this.render().catch((error) => console.error('Dungeon Forge: room editor re-render failed', error));
        });
      }
    }
  }

  async #applyShapeTypeChange(room, nextType) {
    if (room.shape?.type === 'custom' && nextType !== 'custom') {
      if (!window.confirm('Isso descarta os ajustes manuais desta sala. Continuar?')) {
        await this.render();
        return;
      }
    }
    applyShapeType(room, nextType);
    await this.render();
  }

  async close(options) {
    const result = await super.close(options);
    this.onClose?.();
    return result;
  }

  static async #onSelectRoom(event, target) {
    this.selectedRoomId = Number(target.dataset.roomId);
    await this.render();
  }

  static async #onResizeW(event, target) {
    const room = this.#selectedRoom();
    if (!room) return;
    applySizeDelta(room, this.dungeon, 'w', Number(target.dataset.delta));
    await this.render();
  }

  static async #onResizeH(event, target) {
    const room = this.#selectedRoom();
    if (!room) return;
    applySizeDelta(room, this.dungeon, 'h', Number(target.dataset.delta));
    await this.render();
  }
}
