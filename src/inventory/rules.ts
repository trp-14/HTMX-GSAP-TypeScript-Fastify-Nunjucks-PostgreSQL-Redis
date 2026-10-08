/**
 * Inventory business rules. Pure functions so they can be unit tested and reused by the
 * service, the seed script and the database CHECK constraint mirrors the same logic.
 */
export const INVENTORY_STATUSES = ['IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK'] as const;
export type InventoryStatus = (typeof INVENTORY_STATUSES)[number];

export const PRODUCT_STATUSES = ['ACTIVE', 'INACTIVE', 'DISCONTINUED'] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export const MOVEMENT_TYPES = ['RECEIPT', 'ISSUE', 'ADJUSTMENT', 'RETURN'] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number] | 'INITIAL';

export function inventoryStatusFor(quantity: number, reorderThreshold: number): InventoryStatus {
  if (!Number.isInteger(quantity) || quantity < 0)
    throw new InventoryError('Quantity must be a non-negative integer.');
  if (quantity === 0) return 'OUT_OF_STOCK';
  if (quantity <= reorderThreshold) return 'LOW_STOCK';
  return 'IN_STOCK';
}

export class InventoryError extends Error {
  override name = 'InventoryError';
}

export type StockChange = {
  previousQuantity: number;
  newQuantity: number;
  delta: number;
  previousStatus: InventoryStatus;
  newStatus: InventoryStatus;
  /** Set when the status moved to a worse band (e.g. IN_STOCK → LOW_STOCK). */
  alert: 'LOW_STOCK' | 'OUT_OF_STOCK' | null;
  restocked: boolean;
};

const SEVERITY: Record<InventoryStatus, number> = { IN_STOCK: 0, LOW_STOCK: 1, OUT_OF_STOCK: 2 };

/**
 * Computes the effect of a movement. RECEIPT/RETURN add stock, ISSUE removes stock, ADJUSTMENT
 * sets an absolute counted quantity. Never allows the result to go negative.
 */
export function applyMovement(
  current: { quantity: number; reorderThreshold: number },
  movement: { type: (typeof MOVEMENT_TYPES)[number]; quantity: number },
): StockChange {
  const q = movement.quantity;
  if (!Number.isInteger(q) || q < 0)
    throw new InventoryError('Movement quantity must be a non-negative whole number.');
  if (movement.type !== 'ADJUSTMENT' && q === 0)
    throw new InventoryError('Movement quantity must be at least 1.');
  if (q > 1_000_000) throw new InventoryError('Movement quantity is unrealistically large.');

  let newQuantity: number;
  switch (movement.type) {
    case 'RECEIPT':
    case 'RETURN':
      newQuantity = current.quantity + q;
      break;
    case 'ISSUE':
      newQuantity = current.quantity - q;
      break;
    case 'ADJUSTMENT':
      newQuantity = q;
      break;
  }
  if (newQuantity < 0) {
    throw new InventoryError(`Only ${current.quantity} unit(s) in stock — cannot issue ${q}.`);
  }
  if (newQuantity === current.quantity)
    throw new InventoryError('This movement would not change the stock level.');

  const previousStatus = inventoryStatusFor(current.quantity, current.reorderThreshold);
  const newStatus = inventoryStatusFor(newQuantity, current.reorderThreshold);
  const worse = SEVERITY[newStatus] > SEVERITY[previousStatus];
  return {
    previousQuantity: current.quantity,
    newQuantity,
    delta: newQuantity - current.quantity,
    previousStatus,
    newStatus,
    alert: worse && newStatus !== 'IN_STOCK' ? newStatus : null,
    restocked: SEVERITY[newStatus] < SEVERITY[previousStatus],
  };
}
