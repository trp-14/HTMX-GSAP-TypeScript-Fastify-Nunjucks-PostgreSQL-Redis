import { describe, expect, it } from 'vitest';
import { applyMovement, InventoryError, inventoryStatusFor } from '../../src/inventory/rules.js';

describe('inventoryStatusFor', () => {
  it('derives the status from quantity and reorder threshold', () => {
    expect(inventoryStatusFor(11, 10)).toBe('IN_STOCK');
    expect(inventoryStatusFor(10, 10)).toBe('LOW_STOCK');
    expect(inventoryStatusFor(1, 10)).toBe('LOW_STOCK');
    expect(inventoryStatusFor(0, 10)).toBe('OUT_OF_STOCK');
  });

  it('treats a zero threshold as "only low when empty"', () => {
    expect(inventoryStatusFor(1, 0)).toBe('IN_STOCK');
    expect(inventoryStatusFor(0, 0)).toBe('OUT_OF_STOCK');
  });

  it('rejects negative or fractional quantities', () => {
    expect(() => inventoryStatusFor(-1, 3)).toThrow(InventoryError);
    expect(() => inventoryStatusFor(1.5, 3)).toThrow(InventoryError);
  });
});

describe('applyMovement', () => {
  const stock = (quantity: number, reorderThreshold = 3) => ({ quantity, reorderThreshold });

  it('never lets stock become negative', () => {
    expect(() => applyMovement(stock(2), { type: 'ISSUE', quantity: 3 })).toThrow(/cannot issue 3/);
    expect(() => applyMovement(stock(0), { type: 'ISSUE', quantity: 1 })).toThrow(InventoryError);
  });

  it('moves IN_STOCK → LOW_STOCK and raises a low-stock alert when crossing the threshold', () => {
    const change = applyMovement(stock(10), { type: 'ISSUE', quantity: 7 });
    expect(change).toMatchObject({
      previousQuantity: 10,
      newQuantity: 3,
      delta: -7,
      previousStatus: 'IN_STOCK',
      newStatus: 'LOW_STOCK',
      alert: 'LOW_STOCK',
    });
  });

  it('moves to OUT_OF_STOCK at zero', () => {
    const change = applyMovement(stock(3), { type: 'ISSUE', quantity: 3 });
    expect(change).toMatchObject({
      newQuantity: 0,
      previousStatus: 'LOW_STOCK',
      newStatus: 'OUT_OF_STOCK',
      alert: 'OUT_OF_STOCK',
    });
  });

  it('walks the demo scenario 10 → 9 → 0', () => {
    const first = applyMovement(stock(10), { type: 'ISSUE', quantity: 1 });
    expect(first).toMatchObject({ newQuantity: 9, newStatus: 'IN_STOCK', alert: null });
    const second = applyMovement(stock(first.newQuantity), { type: 'ISSUE', quantity: 9 });
    expect(second).toMatchObject({ newQuantity: 0, newStatus: 'OUT_OF_STOCK', alert: 'OUT_OF_STOCK' });
  });

  it('does not alert again while staying low', () => {
    expect(applyMovement(stock(3), { type: 'ISSUE', quantity: 1 }).alert).toBeNull();
  });

  it('marks restocks', () => {
    const change = applyMovement(stock(0), { type: 'RECEIPT', quantity: 20 });
    expect(change).toMatchObject({ newQuantity: 20, newStatus: 'IN_STOCK', restocked: true, alert: null });
  });

  it('treats ADJUSTMENT as an absolute stock count', () => {
    expect(applyMovement(stock(10), { type: 'ADJUSTMENT', quantity: 4 })).toMatchObject({
      newQuantity: 4,
      delta: -6,
    });
    expect(applyMovement(stock(1), { type: 'ADJUSTMENT', quantity: 0 })).toMatchObject({
      newQuantity: 0,
      newStatus: 'OUT_OF_STOCK',
    });
  });

  it('rejects movements that change nothing or have invalid quantities', () => {
    expect(() => applyMovement(stock(5), { type: 'ADJUSTMENT', quantity: 5 })).toThrow(/would not change/);
    expect(() => applyMovement(stock(5), { type: 'RECEIPT', quantity: 0 })).toThrow(InventoryError);
    expect(() => applyMovement(stock(5), { type: 'RECEIPT', quantity: -2 })).toThrow(InventoryError);
    expect(() => applyMovement(stock(5), { type: 'ISSUE', quantity: 1.5 })).toThrow(InventoryError);
  });
});
