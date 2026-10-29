import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

// VitePress has an optional legacy DocSearch React peer tree. It must never
// become the React instance used by the React islands, editor, or form adapters.
const rootRequire = createRequire(new URL('../package.json', import.meta.url));
const react = rootRequire('react');
const reactDom = rootRequire.resolve('react-dom');

describe('site React runtime dependency identity', () => {
  for (const entry of ['react-dom', 'antd', '@live-demo/rspress/web/lazy', '@tanstack/react-virtual']) {
    it(`${entry} resolves the same React as the form and island host`, () => {
      const dependencyRequire = createRequire(rootRequire.resolve(entry));
      expect(dependencyRequire('react')).toBe(react);
      expect(dependencyRequire.resolve('react-dom')).toBe(reactDom);
    });
  }
});
