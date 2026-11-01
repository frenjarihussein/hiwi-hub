import { describe, expect, it } from 'vitest';
import { diagnoseInverter } from './solar-providers.server';
const pts = (m: Record<number, number>) => (n: number) => m[n] ?? null;
describe('diagnoseInverter', () => {
  it('AC 0V with DC panels present is grid outage code 10', () => expect(diagnoseInverter(pts({ 18: 0, 19: 0, 20: 0, 5: 885 }))).toBe('10'));
  it('AC above 253V is overvoltage code 2', () => expect(diagnoseInverter(pts({ 18: 260, 19: 230, 20: 230, 5: 600 }))).toBe('2'));
  it('insulation below 50 kOhm is code 39', () => expect(diagnoseInverter(pts({ 18: 230, 89: 20 }))).toBe('39'));
  it('temperature above 85C is code 36', () => expect(diagnoseInverter(pts({ 18: 230, 4: 90 }))).toBe('36'));
  it('normal readings give no code', () => expect(diagnoseInverter(pts({ 18: 230, 19: 231, 20: 229, 5: 700, 4: 45, 89: 900 }))).toBeNull());
});
