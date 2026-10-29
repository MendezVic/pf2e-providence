import { MODULE_ID } from './constants';

export const SELECTED_ACTORS_SETTING = 'selected-actors';

export function getSelectedActorIds(): string[] {
  const value = game.settings.get(MODULE_ID, SELECTED_ACTORS_SETTING);
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
}

export function getSelectedActorUuids(): Set<string> {
  return new Set(getSelectedActorIds().flatMap((id) => {
    const actor = game.actors.get(id);
    return actor ? [actor.uuid] : [];
  }));
}
