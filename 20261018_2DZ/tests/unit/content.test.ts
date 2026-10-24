import { describe, expect, it } from 'vitest';
import { validateContent } from '../../src/data/content.ts';

describe('content', () => {
  it('has no cross-reference problems', () => {
    expect(validateContent()).toEqual([]);
  });
});
