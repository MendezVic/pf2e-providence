import './styles.css';
import { MODULE_ID } from './constants';
import { getSavedRolls, registerProvidenceContextMenu, registerProvidenceSidebar, registerProvidenceSocket, rollProvidence, type SavedProvidenceRoll } from './providence';

export interface ProvidenceApi { version: string; roll: (actor?: Actor | null) => Promise<SavedProvidenceRoll[]>; getSavedRolls: () => SavedProvidenceRoll[]; }

Hooks.once('init', () => {
  game.settings.register(MODULE_ID, 'saved-rolls', { name: 'Providence saved rolls', hint: 'The campaign-wide pool of saved Providence d20 results.', scope: 'world', config: false, type: Array, default: [] });
});

Hooks.once('ready', () => {
  registerProvidenceSocket();
  registerProvidenceContextMenu();
  registerProvidenceSidebar();
  const module = game.modules.get(MODULE_ID);
  const version = module?.version ?? '0.0.0';
  const api: ProvidenceApi = { version, roll: rollProvidence, getSavedRolls };
  if (module) (module as { api?: ProvidenceApi }).api = api;
  console.log(`${MODULE_ID} | ready (v${version})`);
});

export { MODULE_ID };
