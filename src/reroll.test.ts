import { describe, expect, it } from 'vitest';
import { forceD20Result, hasRerollMarker, isProvidenceReroll, markReroll } from './reroll';

describe('Providence reroll adapter', () => {
  it('changes the active d20 and recomputes the roll total', () => {
    const roll = {
      dice: [{ faces: 20, results: [{ active: true, result: 7 }] }],
      _total: 12,
      _evaluateTotal() { return this.dice[0].results[0].result + 5; },
    };
    forceD20Result(roll, 18);
    expect(roll.dice[0].results[0].result).toBe(18);
    expect(roll._total).toBe(23);
  });

  it('refuses an incompatible evaluated roll', () => {
    expect(() => forceD20Result({ dice: [], _total: 1, _evaluateTotal: () => 1 }, 10)).toThrow();
    expect(() => forceD20Result({ dice: [{ faces: 20, results: [{ result: 1 }] }] }, 10)).toThrow();
  });

  it('restores the die when total recomputation fails', () => {
    const roll = {
      dice: [{ faces: 20, results: [{ active: true, result: 4 }] }],
      _total: 9,
      _evaluateTotal: () => Number.NaN,
    };
    expect(() => forceD20Result(roll, 20)).toThrow();
    expect(roll.dice[0].results[0].result).toBe(4);
    expect(roll._total).toBe(9);
  });

  it('targets only the matching reservation', () => {
    const roll: { options?: Record<string, unknown> } = {};
    markReroll(roll, 'reservation-a');
    expect(hasRerollMarker(roll, 'reservation-a')).toBe(true);
    expect(hasRerollMarker(roll, 'reservation-b')).toBe(false);
    expect(isProvidenceReroll(roll)).toBe(true);
    expect(isProvidenceReroll({ options: {} })).toBe(false);
  });
});
