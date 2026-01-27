/**
 * Format Summary
 *
 * Converts split results into human-readable messages.
 */

import type { SplitResult, FormatSummaryInput } from './types';

/**
 * Format a currency value
 */
function formatCurrency(value: number, currency = '$'): string {
  return `${currency}${value.toFixed(2)}`;
}

/**
 * Format the split results as a human-readable message
 */
export function formatSummary(input: FormatSummaryInput): string {
  const { result, includeBreakdown = true, currency = '$' } = input;
  const { breakdown, totals, unassignedItems, summary } = result;

  const lines: string[] = [];

  // Header
  lines.push("Here's the split:");
  lines.push('');

  // Sort people by total (highest first)
  const sortedPeople = Object.keys(totals).sort((a, b) => totals[b] - totals[a]);

  for (const person of sortedPeople) {
    const total = totals[person];
    const personBreakdown = breakdown[person];

    lines.push(`**${person}**: ${formatCurrency(total, currency)}`);

    if (includeBreakdown && personBreakdown.items.length > 0) {
      for (const item of personBreakdown.items) {
        const sharedNote = item.shared ? ` (split ${item.shareCount} ways)` : '';
        lines.push(`  - ${item.name}: ${formatCurrency(item.price, currency)}${sharedNote}`);
      }

      // Show tax/tip if significant
      if (personBreakdown.taxShare > 0 || personBreakdown.tipShare > 0) {
        const taxTip = personBreakdown.taxShare + personBreakdown.tipShare;
        lines.push(`  - Tax & tip: ${formatCurrency(taxTip, currency)}`);
      }
    }

    lines.push('');
  }

  // Unassigned items warning
  if (unassignedItems.length > 0) {
    lines.push('**Unassigned items:**');
    for (const item of unassignedItems) {
      const qty = item.quantity > 1 ? ` x${item.quantity}` : '';
      lines.push(`  - ${item.name}${qty}: ${formatCurrency(item.price * item.quantity, currency)}`);
    }
    lines.push('');
  }

  // Summary footer
  lines.push('---');
  lines.push(`Subtotal: ${formatCurrency(summary.subtotal, currency)}`);
  if (summary.tax > 0) {
    lines.push(`Tax: ${formatCurrency(summary.tax, currency)}`);
  }
  if (summary.tip > 0) {
    lines.push(`Tip: ${formatCurrency(summary.tip, currency)}`);
  }
  lines.push(`**Total: ${formatCurrency(summary.grandTotal, currency)}**`);

  return lines.join('\n');
}

/**
 * Format a quick summary (just totals, no breakdown)
 */
export function formatQuickSummary(totals: { [name: string]: number }, currency = '$'): string {
  const lines: string[] = ['Quick split:'];

  const sortedPeople = Object.keys(totals).sort((a, b) => totals[b] - totals[a]);

  for (const person of sortedPeople) {
    lines.push(`- ${person}: ${formatCurrency(totals[person], currency)}`);
  }

  const total = Object.values(totals).reduce((sum, v) => sum + v, 0);
  lines.push(`\nTotal: ${formatCurrency(total, currency)}`);

  return lines.join('\n');
}

/**
 * Format payment requests (for Venmo, etc.)
 */
export function formatPaymentRequests(
  totals: { [name: string]: number },
  payer: string,
  currency = '$'
): string {
  const lines: string[] = ['Payment requests:'];

  for (const [person, amount] of Object.entries(totals)) {
    if (person !== payer && amount > 0) {
      lines.push(`- Request ${formatCurrency(amount, currency)} from ${person}`);
    }
  }

  if (lines.length === 1) {
    return "Everyone's already settled up!";
  }

  return lines.join('\n');
}

/**
 * Format as a shareable text message
 */
export function formatShareable(result: SplitResult, currency = '$'): string {
  const { totals, summary } = result;
  const lines: string[] = [];

  lines.push(`Bill Split - ${formatCurrency(summary.grandTotal, currency)}`);
  lines.push('');

  const sortedPeople = Object.keys(totals).sort((a, b) => totals[b] - totals[a]);
  for (const person of sortedPeople) {
    lines.push(`${person}: ${formatCurrency(totals[person], currency)}`);
  }

  return lines.join('\n');
}
