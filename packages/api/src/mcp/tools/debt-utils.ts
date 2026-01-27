/**
 * Debt Simplification Utilities
 *
 * Pure functions for calculating and simplifying debts between people.
 */

export interface Debt {
  from: string;
  to: string;
  amount: number;
  description?: string;
}

export interface SimplifiedDebt {
  from: string;
  to: string;
  amount: number;
}

export interface PersonSummary {
  person: string;
  totalOwes: number;
  totalOwed: number;
  net: number; // positive = others owe them, negative = they owe others
}

/**
 * Simplify a list of debts by consolidating debts between the same people.
 *
 * If Alice owes Bob $20 and Bob owes Alice $12, this simplifies to:
 * Alice owes Bob $8
 *
 * @param debts - Raw list of debts
 * @returns Simplified list with net amounts between each pair
 */
export function simplifyDebts(debts: Debt[]): SimplifiedDebt[] {
  if (debts.length === 0) return [];

  // Build net balances between each pair
  // Key format: "personA|personB" where personA < personB alphabetically
  // Positive value means personA owes personB
  // Negative value means personB owes personA
  const netDebts = new Map<string, number>();

  for (const debt of debts) {
    if (debt.amount <= 0) continue;

    // Normalize key so A→B and B→A use same key
    const [p1, p2] = [debt.from, debt.to].sort();
    const key = `${p1}|${p2}`;
    const current = netDebts.get(key) || 0;

    // If debt.from is the alphabetically first person, add to balance
    // Otherwise subtract (since the other direction)
    if (debt.from === p1) {
      netDebts.set(key, current + debt.amount);
    } else {
      netDebts.set(key, current - debt.amount);
    }
  }

  // Convert to simplified debts
  const simplified: SimplifiedDebt[] = [];

  for (const [key, amount] of netDebts.entries()) {
    // Skip if net is effectively zero
    if (Math.abs(amount) < 0.01) continue;

    const [p1, p2] = key.split('|');

    if (amount > 0) {
      // p1 owes p2
      simplified.push({
        from: p1,
        to: p2,
        amount: roundCents(amount),
      });
    } else {
      // p2 owes p1
      simplified.push({
        from: p2,
        to: p1,
        amount: roundCents(Math.abs(amount)),
      });
    }
  }

  // Sort by amount descending for consistent output
  simplified.sort((a, b) => b.amount - a.amount);

  return simplified;
}

/**
 * Calculate summary for a specific person.
 *
 * @param debts - List of debts
 * @param person - Person to summarize
 * @returns Summary of what they owe and are owed
 */
export function calculatePersonSummary(debts: Debt[], person: string): PersonSummary {
  let totalOwes = 0;
  let totalOwed = 0;

  for (const debt of debts) {
    if (debt.from === person) {
      totalOwes += debt.amount;
    }
    if (debt.to === person) {
      totalOwed += debt.amount;
    }
  }

  return {
    person,
    totalOwes: roundCents(totalOwes),
    totalOwed: roundCents(totalOwed),
    net: roundCents(totalOwed - totalOwes),
  };
}

/**
 * Get all unique people involved in debts.
 */
export function getPeople(debts: Debt[]): string[] {
  const people = new Set<string>();
  for (const debt of debts) {
    people.add(debt.from);
    people.add(debt.to);
  }
  return Array.from(people).sort();
}

/**
 * Filter debts to only those involving a specific person.
 */
export function filterDebtsByPerson(debts: Debt[], person: string): Debt[] {
  return debts.filter((d) => d.from === person || d.to === person);
}

/**
 * Round to cents (2 decimal places).
 */
function roundCents(amount: number): number {
  return Math.round(amount * 100) / 100;
}
