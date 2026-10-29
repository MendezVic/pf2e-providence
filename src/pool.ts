export interface SavedProvidenceRoll {
  id: string;
  value: number;
  actorUuid: string;
  actorName: string;
  createdAt: number;
}

export function validateProvidenceValues(value: unknown): [number, number] {
  if (!Array.isArray(value) || value.length !== 2 || value.some((result) => !Number.isInteger(result) || result < 1 || result > 20)) {
    throw new Error('Invalid Providence roll results.');
  }
  return [value[0] as number, value[1] as number];
}

export function isSavedProvidenceRoll(value: unknown): value is SavedProvidenceRoll {
  if (!value || typeof value !== 'object') return false;
  const roll = value as Partial<SavedProvidenceRoll>;
  return typeof roll.id === 'string' && roll.id.length > 0
    && Number.isInteger(roll.value) && (roll.value ?? 0) >= 1 && (roll.value ?? 0) <= 20
    && typeof roll.actorUuid === 'string'
    && typeof roll.actorName === 'string'
    && Number.isFinite(roll.createdAt);
}

export function sanitizePool(value: unknown): SavedProvidenceRoll[] {
  return Array.isArray(value) ? value.filter(isSavedProvidenceRoll) : [];
}

export function takeSavedRoll(pool: readonly SavedProvidenceRoll[], id: string): { pool: SavedProvidenceRoll[]; roll: SavedProvidenceRoll } {
  const roll = pool.find((candidate) => candidate.id === id);
  if (!roll) throw new Error('Providence roll unavailable.');
  return { roll, pool: pool.filter((candidate) => candidate.id !== id) };
}

export function groupSavedRolls(pool: readonly SavedProvidenceRoll[]): Map<string, SavedProvidenceRoll[]> {
  const groups = new Map<string, SavedProvidenceRoll[]>();
  for (const roll of pool) groups.set(roll.actorUuid, [...(groups.get(roll.actorUuid) ?? []), roll]);
  return groups;
}
