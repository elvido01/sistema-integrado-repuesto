import { describe, it, expect } from 'vitest';
import { formatCurrency, formatDate } from '../src/components/common/pdf/pdfUtils.js';

describe('pdfUtils', () => {
  describe('formatCurrency', () => {
    it('returns numbers with two decimals', () => {
      expect(formatCurrency(123)).toBe('123.00');
      expect(formatCurrency(45.678)).toBe('45.68');
      expect(formatCurrency(null)).toBe('0.00');
    });
  });

  describe('formatDate', () => {
    it('formats date as dd/MM/yyyy', () => {
      const date = '2024-01-15T12:00:00Z';
      expect(formatDate(date)).toBe('15/01/2024');
    });

    it('returns N/A for falsy values', () => {
      expect(formatDate(null)).toBe('N/A');
    });
  });
});
