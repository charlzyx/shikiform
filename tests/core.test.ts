import { describe, expect, it } from 'vitest';
import { createShikiStore } from '../src/core/store';
import { assertNotMovingIntoDescendant, isDescendantPath, recordOf } from '../src/core/types';

describe('core: record scope and tree guard', () => {
  it('recordOf returns the nearest parent object', () => {
    const values = { provider: { type: 'openai', apiKey: 'x' } };
    expect(recordOf(values, 'provider.apiKey')).toEqual({ type: 'openai', apiKey: 'x' });
  });
  it('tree move into own descendant is refused', () => {
    expect(isDescendantPath('tree.0', 'tree.0.children.1')).toBe(true);
    expect(() => assertNotMovingIntoDescendant('tree.0', 'tree.0.children.1')).toThrow();
  });
});

describe('core: centralized effect, one commit, change-only', () => {
  it('a reaction writes visible state in the same transaction', () => {
    const store = createShikiStore({
      initialValues: { type: 'openai', apiKey: '' },
      reactions: [
        (ctx) => {
          const type = ctx.get('type');
          ctx.setState('apiKey', { visible: type === 'openai' });
        },
      ],
    });
    store.getState().setValue('type', 'other');
    expect(store.getState().fieldStates.apiKey?.visible).toBe(false);
    store.getState().setValue('type', 'openai');
    expect(store.getState().fieldStates.apiKey?.visible).toBe(true);
    expect(store.getState().cycleError).toBeNull();
  });
});
