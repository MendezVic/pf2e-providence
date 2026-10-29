import './styles.css';
import { registerActorSelectionSetting } from './actor-selection';
import { MODULE_ID } from './constants';
import { getSavedRolls, registerProvidenceContextMenu, registerProvidenceSocket, rollProvidence } from './providence';
import { refreshProvidenceSidebar, registerProvidenceActorRefresh, registerProvidenceSidebar } from './sidebar';
import type { SavedProvidenceRoll } from './pool';

// Foundry v14 constructs the chat context menu before `ready`, so this hook must exist as soon as the module loads.
registerProvidenceContextMenu();

export interface ProvidenceApi {
  version: string;
  roll: (actor?: Actor | null) => Promise<SavedProvidenceRoll[]>;
  getSavedRolls: () => SavedProvidenceRoll[];
}

Hooks.once('init', () => {
  registerProvidenceSidebar();
  registerActorSelectionSetting();
  game.settings.register(MODULE_ID, 'saved-rolls', {
    name: `${MODULE_ID}.setting.savedRolls.name`,
    hint: `${MODULE_ID}.setting.savedRolls.hint`,
    scope: 'world',
    config: false,
    type: Array,
    default: [],
    onChange: refreshProvidenceSidebar,
  });
});

Hooks.once('ready', () => {
  registerProvidenceSocket();
  registerProvidenceActorRefresh();
  const module = game.modules.get(MODULE_ID);
  const version = module?.version ?? '0.0.0';
  const api: ProvidenceApi = { version, roll: rollProvidence, getSavedRolls };
  if (module) (module as typeof module & { api?: ProvidenceApi }).api = api;
  console.log(`${MODULE_ID} | ready (v${version})`);
});

export { MODULE_ID };
