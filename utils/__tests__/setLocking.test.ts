import { isSetLocked } from '../setLocking';

const set = (done: boolean) => ({ done });

describe('isSetLocked', () => {
  it('the first undone set is never locked', () => {
    const sets = [set(true), set(false), set(false)];
    expect(isSetLocked(sets, 1)).toBe(false);
  });

  it('a later undone set, while an earlier one is still undone, is locked', () => {
    const sets = [set(true), set(false), set(false)];
    expect(isSetLocked(sets, 2)).toBe(true);
  });

  it('locks every undone set except the first one', () => {
    const sets = [set(false), set(false), set(false)];
    expect(isSetLocked(sets, 0)).toBe(false); // current
    expect(isSetLocked(sets, 1)).toBe(true);  // waiting its turn
    expect(isSetLocked(sets, 2)).toBe(true);  // waiting its turn
  });

  it('a done set is never locked, regardless of position — always editable for correction', () => {
    const sets = [set(true), set(true), set(false)];
    expect(isSetLocked(sets, 0)).toBe(false);
    expect(isSetLocked(sets, 1)).toBe(false);
  });

  it('nothing is locked once every set is done', () => {
    const sets = [set(true), set(true), set(true)];
    expect(sets.map((_, i) => isSetLocked(sets, i))).toEqual([false, false, false]);
  });

  it('a single undone set is never locked', () => {
    expect(isSetLocked([set(false)], 0)).toBe(false);
  });

  it('an out-of-range index is not locked (nothing there to lock)', () => {
    expect(isSetLocked([set(false)], 5)).toBe(false);
  });
});
