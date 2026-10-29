import { MODULE_ID } from './constants';

export const REROLL_MARKER = `${MODULE_ID}.reservation`;

interface MutableResult { active?: boolean; result: number }
interface MutableDie { faces: number; results: MutableResult[] }
interface MutableRoll {
  dice: MutableDie[];
  options?: Record<string, unknown>;
  _total?: number;
  _evaluateTotal?: () => number;
}

/** PF2e does not expose a public method for replacing a die after evaluation, so this is isolated and tested here. */
export function forceD20Result(roll: MutableRoll, value: number): void {
  if (!Number.isInteger(value) || value < 1 || value > 20) throw new Error('Invalid d20 result.');
  const die = roll.dice.find((candidate) => candidate.faces === 20);
  const result = die?.results.find((candidate) => candidate.active !== false);
  if (!die || !result || !Number.isFinite(roll._total) || typeof roll._evaluateTotal !== 'function') {
    throw new Error('The reroll did not contain a mutable active d20.');
  }
  const previous = result.result;
  result.result = value;
  try {
    const total = roll._evaluateTotal();
    if (!Number.isFinite(total)) throw new Error('The Providence reroll produced an invalid total.');
    roll._total = total;
  } catch (error) {
    result.result = previous;
    throw error;
  }
}

export function markReroll(roll: { options?: Record<string, unknown> }, reservationId: string): void {
  roll.options ??= {};
  roll.options[REROLL_MARKER] = reservationId;
}

export function hasRerollMarker(roll: { options?: Record<string, unknown> }, reservationId: string): boolean {
  return roll.options?.[REROLL_MARKER] === reservationId;
}
