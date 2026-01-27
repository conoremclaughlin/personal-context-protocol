/**
 * Bill Split Types
 */

export interface BillItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
}

export interface ParsedReceipt {
  items: BillItem[];
  subtotal?: number;
  tax?: number;
  tip?: number;
  total?: number;
}

export interface Assignments {
  /** Maps item ID to array of person names */
  [itemId: string]: string[];
}

export interface PersonBreakdown {
  items: Array<{
    name: string;
    price: number;
    shared: boolean;
    shareCount?: number;
  }>;
  itemsSubtotal: number;
  taxShare: number;
  tipShare: number;
  total: number;
}

export interface SplitResult {
  breakdown: {
    [personName: string]: PersonBreakdown;
  };
  totals: {
    [personName: string]: number;
  };
  unassignedItems: BillItem[];
  summary: {
    subtotal: number;
    tax: number;
    tip: number;
    grandTotal: number;
  };
}

export interface CalculateSplitInput {
  items: BillItem[];
  assignments: Assignments;
  tax?: number;
  tip?: number;
  tipPercent?: number;
  splitTaxTipEvenly?: boolean;
}

export interface FormatSummaryInput {
  result: SplitResult;
  includeBreakdown?: boolean;
  currency?: string;
}
