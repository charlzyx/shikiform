import { describe, expect, it } from 'vitest';
import {
  availableAll,
  availableOptions,
  finalCombination,
  numericRange,
  type Combination,
} from '../src/core/linkage';

// Generic combination table on purpose: NOT the SKU demo table.
// If this test ever needs SKU data, the layout is broken again.
const TABLE: Combination[] = [
  { color: 'red', size: 'S', price: 10 },
  { color: 'red', size: 'M', price: 20 },
  { color: 'blue', size: 'M', price: 30 },
];

describe('generic linkage (core, no business data)', () => {
  it('availableOptions filters by the other dimensions', () => {
    expect(availableOptions(TABLE, { color: 'red' }, 'size')).toEqual(['S', 'M']);
    expect(availableOptions(TABLE, { size: 'M' }, 'color').sort()).toEqual(['blue', 'red']);
    expect(availableAll(TABLE, {}, ['color', 'size']).color.sort()).toEqual(['blue', 'red']);
  });
  it('finalCombination needs every dimension, otherwise null', () => {
    expect(finalCombination(TABLE, { color: 'red' }, ['color', 'size'])).toBeNull();
    expect(finalCombination(TABLE, { color: 'red', size: 'M' }, ['color', 'size'])).toEqual({
      color: 'red',
      size: 'M',
      price: 20,
    });
  });
  it('numericRange follows the partial selection', () => {
    expect(numericRange(TABLE, { color: 'red' }, 'price')).toEqual({ min: 10, max: 20 });
    expect(numericRange(TABLE, { color: 'green' }, 'price')).toBeNull();
  });
});
