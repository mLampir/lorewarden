import { describe, expect, it } from 'vitest';
import { findSrdRule, srdRules } from '../src/index';

describe('SRD rules glossary', () => {
  it('has every entry once with text', () => {
    expect(srdRules.length).toBeGreaterThan(150);
    expect(new Set(srdRules.map((r) => r.id)).size).toBe(srdRules.length);
    for (const rule of srdRules) {
      expect(rule.id, rule.name).toMatch(/^srd-rule-[a-z0-9-]+$/);
      expect(rule.text.length, rule.name).toBeGreaterThan(10);
      expect(rule.text, rule.name).not.toMatch(/<\/?t[dr]>|\*\*/);
    }
  });

  it('has the conditions', () => {
    const conditions = srdRules.filter((r) => r.tag === 'Condition').map((r) => r.name);
    expect(conditions).toEqual(expect.arrayContaining(['Prone', 'Grappled', 'Poisoned']));
    expect(conditions).toHaveLength(15);
    expect(findSrdRule('srd-rule-prone')?.text).toContain('Disadvantage on attack rolls');
  });
});
