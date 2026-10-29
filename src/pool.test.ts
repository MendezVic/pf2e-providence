import { describe, expect, it } from 'vitest';
import {
  filterSavedRollsByActorUuids,
  groupSavedRolls,
  markSavedRollUsed,
  sanitizePool,
  validateProvidenceValues,
  type SavedProvidenceRoll,
} from './pool';

const rolls: SavedProvidenceRoll[] = [
  { id: 'a', value: 10, actorUuid: 'Actor.1', actorName: 'One', createdAt: 1 },
  { id: 'b', value: 15, actorUuid: 'Actor.1', actorName: 'One', createdAt: 1 },
  { id: 'c', value: 5, actorUuid: 'Actor.2', actorName: 'Two', createdAt: 2 },
];

describe('Providence pool', () => {
  it('accepts exactly two d20 results', () => {
    expect(validateProvidenceValues([1, 20])).toEqual([1, 20]);
    expect(() => validateProvidenceValues([1])).toThrow();
    expect(() => validateProvidenceValues([1, 21])).toThrow();
    expect(() => validateProvidenceValues([1, 2.5])).toThrow();
  });

  it('marks only the spent roll as used', () => {
    const updated = markSavedRollUsed(rolls, 'b');
    expect(updated.map((roll) => roll.used ?? false)).toEqual([false, true, false]);
    expect(updated.map((roll) => roll.id)).toEqual(['a', 'b', 'c']);
    expect(() => markSavedRollUsed(updated, 'b')).toThrow();
    expect(() => markSavedRollUsed(rolls, 'missing')).toThrow();
  });

  it('groups rolls by actor UUID and rejects malformed stored data', () => {
    expect(groupSavedRolls(rolls).get('Actor.1')).toHaveLength(2);
    expect(sanitizePool([...rolls, { id: 'bad', value: 99 }, { ...rolls[0], used: 'yes' }])).toEqual(rolls);
  });

  it('only exposes rolls belonging to selected actors', () => {
    expect(filterSavedRollsByActorUuids(rolls, new Set(['Actor.2']))).toEqual([rolls[2]]);
    expect(filterSavedRollsByActorUuids(rolls, new Set())).toEqual([]);
  });
});
