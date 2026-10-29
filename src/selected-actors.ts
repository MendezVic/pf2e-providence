import { MODULE_ID } from './constants';

export const SELECTED_ACTORS_SETTING = 'selected-actors';

export function getSelectedActorIds(): string[] {
  const value = game.settings.get(MODULE_ID, SELECTED_ACTORS_SETTING);
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
}
