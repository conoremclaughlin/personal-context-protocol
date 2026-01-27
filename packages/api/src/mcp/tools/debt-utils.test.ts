/**
 * Debt Utilities Tests
 */

import { describe, it, expect } from 'vitest';
import {
  simplifyDebts,
  calculatePersonSummary,
  getPeople,
  filterDebtsByPerson,
  type Debt,
} from './debt-utils';

describe('simplifyDebts', () => {
  it('should return empty array for no debts', () => {
    expect(simplifyDebts([])).toEqual([]);
  });

  it('should pass through single debt unchanged', () => {
    const debts: Debt[] = [{ from: 'Alice', to: 'Bob', amount: 25 }];

    const result = simplifyDebts(debts);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ from: 'Alice', to: 'Bob', amount: 25 });
  });

  it('should consolidate multiple debts in same direction', () => {
    const debts: Debt[] = [
      { from: 'Alice', to: 'Bob', amount: 10 },
      { from: 'Alice', to: 'Bob', amount: 15 },
      { from: 'Alice', to: 'Bob', amount: 5 },
    ];

    const result = simplifyDebts(debts);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ from: 'Alice', to: 'Bob', amount: 30 });
  });

  it('should cancel out opposite debts completely', () => {
    const debts: Debt[] = [
      { from: 'Alice', to: 'Bob', amount: 20 },
      { from: 'Bob', to: 'Alice', amount: 20 },
    ];

    const result = simplifyDebts(debts);

    expect(result).toHaveLength(0);
  });

  it('should calculate net when debts go both ways', () => {
    const debts: Debt[] = [
      { from: 'Alice', to: 'Bob', amount: 20 },
      { from: 'Bob', to: 'Alice', amount: 12 },
    ];

    const result = simplifyDebts(debts);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ from: 'Alice', to: 'Bob', amount: 8 });
  });

  it('should flip direction when reverse debt is larger', () => {
    const debts: Debt[] = [
      { from: 'Alice', to: 'Bob', amount: 10 },
      { from: 'Bob', to: 'Alice', amount: 25 },
    ];

    const result = simplifyDebts(debts);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ from: 'Bob', to: 'Alice', amount: 15 });
  });

  it('should handle multiple pairs independently', () => {
    const debts: Debt[] = [
      { from: 'Alice', to: 'Bob', amount: 20 },
      { from: 'Charlie', to: 'Bob', amount: 15 },
      { from: 'Alice', to: 'Charlie', amount: 10 },
    ];

    const result = simplifyDebts(debts);

    expect(result).toHaveLength(3);

    // Find each debt in result
    const aliceToBob = result.find((d) => d.from === 'Alice' && d.to === 'Bob');
    const charlieToBob = result.find((d) => d.from === 'Charlie' && d.to === 'Bob');
    const aliceToCharlie = result.find((d) => d.from === 'Alice' && d.to === 'Charlie');

    expect(aliceToBob?.amount).toBe(20);
    expect(charlieToBob?.amount).toBe(15);
    expect(aliceToCharlie?.amount).toBe(10);
  });

  it('should handle complex multi-party scenario', () => {
    // Scenario: Group dinner
    // - Alice paid $60 for everyone (3 people)
    // - Bob paid $30 for drinks (split 3 ways)
    // Each person's share: Food $20, Drinks $10 = $30 total
    // Alice paid $60, should receive $40 (from Bob $20, Charlie $20)
    // Bob paid $30, should receive $20 (but owes Alice $20), net: owes Alice $0
    // But Bob only paid for 1/3 of what he paid, so...

    // Let's do a simpler scenario:
    // Dinner was $90 split 3 ways = $30 each
    // Alice paid the whole bill
    // So Bob owes Alice $30, Charlie owes Alice $30
    const debts: Debt[] = [
      { from: 'Bob', to: 'Alice', amount: 30 },
      { from: 'Charlie', to: 'Alice', amount: 30 },
    ];

    const result = simplifyDebts(debts);

    expect(result).toHaveLength(2);
    expect(result.find((d) => d.from === 'Bob' && d.to === 'Alice')?.amount).toBe(30);
    expect(result.find((d) => d.from === 'Charlie' && d.to === 'Alice')?.amount).toBe(30);
  });

  it('should handle partial cancellation in multi-party', () => {
    // Alice owes Bob $20
    // Bob owes Charlie $15
    // Charlie owes Alice $10
    const debts: Debt[] = [
      { from: 'Alice', to: 'Bob', amount: 20 },
      { from: 'Bob', to: 'Charlie', amount: 15 },
      { from: 'Charlie', to: 'Alice', amount: 10 },
    ];

    const result = simplifyDebts(debts);

    // Each pair is independent, so all 3 should remain
    expect(result).toHaveLength(3);

    const aliceToBob = result.find((d) => d.from === 'Alice' && d.to === 'Bob');
    const bobToCharlie = result.find((d) => d.from === 'Bob' && d.to === 'Charlie');
    const charlieToAlice = result.find((d) => d.from === 'Charlie' && d.to === 'Alice');

    expect(aliceToBob?.amount).toBe(20);
    expect(bobToCharlie?.amount).toBe(15);
    expect(charlieToAlice?.amount).toBe(10);
  });

  it('should round to cents', () => {
    const debts: Debt[] = [
      { from: 'Alice', to: 'Bob', amount: 10.333 },
      { from: 'Alice', to: 'Bob', amount: 10.333 },
    ];

    const result = simplifyDebts(debts);

    expect(result[0].amount).toBe(20.67); // Rounded
  });

  it('should ignore zero and negative amounts', () => {
    const debts: Debt[] = [
      { from: 'Alice', to: 'Bob', amount: 0 },
      { from: 'Alice', to: 'Bob', amount: -5 },
      { from: 'Alice', to: 'Bob', amount: 10 },
    ];

    const result = simplifyDebts(debts);

    expect(result).toHaveLength(1);
    expect(result[0].amount).toBe(10);
  });

  it('should eliminate near-zero balances', () => {
    const debts: Debt[] = [
      { from: 'Alice', to: 'Bob', amount: 10.005 },
      { from: 'Bob', to: 'Alice', amount: 10.003 },
    ];

    const result = simplifyDebts(debts);

    // Net is $0.002, which is < $0.01, so should be eliminated
    expect(result).toHaveLength(0);
  });

  it('should sort results by amount descending', () => {
    const debts: Debt[] = [
      { from: 'Alice', to: 'Bob', amount: 10 },
      { from: 'Charlie', to: 'Dave', amount: 50 },
      { from: 'Eve', to: 'Frank', amount: 25 },
    ];

    const result = simplifyDebts(debts);

    expect(result[0].amount).toBe(50);
    expect(result[1].amount).toBe(25);
    expect(result[2].amount).toBe(10);
  });
});

describe('calculatePersonSummary', () => {
  const debts: Debt[] = [
    { from: 'Alice', to: 'Bob', amount: 20 },
    { from: 'Alice', to: 'Charlie', amount: 15 },
    { from: 'Bob', to: 'Alice', amount: 5 },
    { from: 'Charlie', to: 'Alice', amount: 10 },
  ];

  it('should calculate what person owes', () => {
    const summary = calculatePersonSummary(debts, 'Alice');

    expect(summary.totalOwes).toBe(35); // 20 + 15
  });

  it('should calculate what person is owed', () => {
    const summary = calculatePersonSummary(debts, 'Alice');

    expect(summary.totalOwed).toBe(15); // 5 + 10
  });

  it('should calculate net balance', () => {
    const summary = calculatePersonSummary(debts, 'Alice');

    // Alice owes $35, is owed $15, net = -$20 (owes more than owed)
    expect(summary.net).toBe(-20);
  });

  it('should return positive net when owed more', () => {
    const summary = calculatePersonSummary(debts, 'Bob');

    // Bob owes $5, is owed $20, net = +$15
    expect(summary.totalOwes).toBe(5);
    expect(summary.totalOwed).toBe(20);
    expect(summary.net).toBe(15);
  });

  it('should return zeros for person not in debts', () => {
    const summary = calculatePersonSummary(debts, 'Dave');

    expect(summary.totalOwes).toBe(0);
    expect(summary.totalOwed).toBe(0);
    expect(summary.net).toBe(0);
  });

  it('should round to cents', () => {
    const trickyDebts: Debt[] = [
      { from: 'Alice', to: 'Bob', amount: 10.333 },
      { from: 'Alice', to: 'Bob', amount: 10.333 },
    ];

    const summary = calculatePersonSummary(trickyDebts, 'Alice');

    expect(summary.totalOwes).toBe(20.67);
  });
});

describe('getPeople', () => {
  it('should return empty array for no debts', () => {
    expect(getPeople([])).toEqual([]);
  });

  it('should return unique sorted people', () => {
    const debts: Debt[] = [
      { from: 'Charlie', to: 'Alice', amount: 10 },
      { from: 'Alice', to: 'Bob', amount: 20 },
      { from: 'Bob', to: 'Charlie', amount: 15 },
    ];

    const people = getPeople(debts);

    expect(people).toEqual(['Alice', 'Bob', 'Charlie']);
  });

  it('should handle person appearing multiple times', () => {
    const debts: Debt[] = [
      { from: 'Alice', to: 'Bob', amount: 10 },
      { from: 'Alice', to: 'Charlie', amount: 20 },
      { from: 'Bob', to: 'Alice', amount: 5 },
    ];

    const people = getPeople(debts);

    expect(people).toEqual(['Alice', 'Bob', 'Charlie']);
  });
});

describe('filterDebtsByPerson', () => {
  const debts: Debt[] = [
    { from: 'Alice', to: 'Bob', amount: 20 },
    { from: 'Bob', to: 'Charlie', amount: 15 },
    { from: 'Charlie', to: 'Alice', amount: 10 },
  ];

  it('should return debts where person is debtor', () => {
    const filtered = filterDebtsByPerson(debts, 'Alice');

    expect(filtered).toContainEqual({ from: 'Alice', to: 'Bob', amount: 20 });
  });

  it('should return debts where person is creditor', () => {
    const filtered = filterDebtsByPerson(debts, 'Alice');

    expect(filtered).toContainEqual({ from: 'Charlie', to: 'Alice', amount: 10 });
  });

  it('should not return debts not involving person', () => {
    const filtered = filterDebtsByPerson(debts, 'Alice');

    expect(filtered).not.toContainEqual({ from: 'Bob', to: 'Charlie', amount: 15 });
  });

  it('should return empty for person not in any debt', () => {
    const filtered = filterDebtsByPerson(debts, 'Dave');

    expect(filtered).toEqual([]);
  });
});

describe('real-world scenarios', () => {
  it('should handle restaurant bill split correctly', () => {
    // Scenario: Alice, Bob, Charlie go to dinner
    // Total bill: $90, split evenly = $30 each
    // Alice paid the whole bill
    // So Bob and Charlie each owe Alice $30
    const debts: Debt[] = [
      { from: 'Bob', to: 'Alice', amount: 30, description: 'Dinner share' },
      { from: 'Charlie', to: 'Alice', amount: 30, description: 'Dinner share' },
    ];

    const simplified = simplifyDebts(debts);
    const aliceSummary = calculatePersonSummary(debts, 'Alice');

    expect(simplified).toHaveLength(2);
    expect(aliceSummary.totalOwed).toBe(60);
    expect(aliceSummary.net).toBe(60); // Alice is owed $60 net
  });

  it('should handle multiple bills over time', () => {
    // Scenario: Roommates tracking expenses
    // Week 1: Alice paid $50 groceries (Bob owes $25)
    // Week 2: Bob paid $30 utilities (Alice owes $15)
    // Week 3: Alice paid $20 supplies (Bob owes $10)
    const debts: Debt[] = [
      { from: 'Bob', to: 'Alice', amount: 25, description: 'Groceries week 1' },
      { from: 'Alice', to: 'Bob', amount: 15, description: 'Utilities week 2' },
      { from: 'Bob', to: 'Alice', amount: 10, description: 'Supplies week 3' },
    ];

    const simplified = simplifyDebts(debts);

    // Bob owes Alice $25 + $10 = $35
    // Alice owes Bob $15
    // Net: Bob owes Alice $20
    expect(simplified).toHaveLength(1);
    expect(simplified[0]).toEqual({ from: 'Bob', to: 'Alice', amount: 20 });
  });

  it('should handle group trip with multiple payers', () => {
    // Scenario: 4 friends on a trip
    // Alice paid hotel: $400 ($100 each, so 3 people owe her $100)
    // Bob paid dinners: $200 ($50 each, so 3 people owe him $50)
    // Charlie paid activities: $120 ($30 each, so 3 people owe him $30)
    // Dave paid nothing
    const debts: Debt[] = [
      // Hotel debts to Alice
      { from: 'Bob', to: 'Alice', amount: 100 },
      { from: 'Charlie', to: 'Alice', amount: 100 },
      { from: 'Dave', to: 'Alice', amount: 100 },
      // Dinner debts to Bob
      { from: 'Alice', to: 'Bob', amount: 50 },
      { from: 'Charlie', to: 'Bob', amount: 50 },
      { from: 'Dave', to: 'Bob', amount: 50 },
      // Activity debts to Charlie
      { from: 'Alice', to: 'Charlie', amount: 30 },
      { from: 'Bob', to: 'Charlie', amount: 30 },
      { from: 'Dave', to: 'Charlie', amount: 30 },
    ];

    const simplified = simplifyDebts(debts);

    // Net calculations:
    // Alice<->Bob: Bob owes Alice $100, Alice owes Bob $50 => Bob owes Alice $50
    // Alice<->Charlie: Charlie owes Alice $100, Alice owes Charlie $30 => Charlie owes Alice $70
    // Alice<->Dave: Dave owes Alice $100
    // Bob<->Charlie: Charlie owes Bob $50, Bob owes Charlie $30 => Charlie owes Bob $20
    // Bob<->Dave: Dave owes Bob $50
    // Charlie<->Dave: Dave owes Charlie $30

    const bobToAlice = simplified.find((d) => d.from === 'Bob' && d.to === 'Alice');
    const charlieToAlice = simplified.find((d) => d.from === 'Charlie' && d.to === 'Alice');
    const daveToAlice = simplified.find((d) => d.from === 'Dave' && d.to === 'Alice');
    const charlieToBob = simplified.find((d) => d.from === 'Charlie' && d.to === 'Bob');
    const daveToBob = simplified.find((d) => d.from === 'Dave' && d.to === 'Bob');
    const daveToCharlie = simplified.find((d) => d.from === 'Dave' && d.to === 'Charlie');

    expect(bobToAlice?.amount).toBe(50);
    expect(charlieToAlice?.amount).toBe(70);
    expect(daveToAlice?.amount).toBe(100);
    expect(charlieToBob?.amount).toBe(20);
    expect(daveToBob?.amount).toBe(50);
    expect(daveToCharlie?.amount).toBe(30);

    // Dave owes the most (didn't pay anything): $100 + $50 + $30 = $180
    const daveSummary = calculatePersonSummary(debts, 'Dave');
    expect(daveSummary.totalOwes).toBe(180);
    expect(daveSummary.net).toBe(-180);

    // Alice is owed the most (paid hotel): net = $300 - $80 = $220
    const aliceSummary = calculatePersonSummary(debts, 'Alice');
    expect(aliceSummary.totalOwed).toBe(300);
    expect(aliceSummary.totalOwes).toBe(80);
    expect(aliceSummary.net).toBe(220);
  });
});
