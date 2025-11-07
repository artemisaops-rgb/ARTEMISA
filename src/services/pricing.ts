import { InventoryItem, TemplateComponent, SizeOption } from './types.ar.rb';

export function computePrice(
  components: TemplateComponent[],
  itemsById: Record<string, InventoryItem>,
  size: SizeOption
): number {
  let total = size.basePrice || 0;
  for (const c of components) {
    const it = itemsById[c.itemId];
    const ppu = it?.pricePerUnit ?? 0;
    total += ppu * c.qty;
  }
  return Math.round(total);
}