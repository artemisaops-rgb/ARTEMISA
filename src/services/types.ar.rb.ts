export type Unit = 'g'|'ml'|'pc'|'pump'|'shot';
export type Category = 'base'|'syrup'|'topping'|'sweetener'|'ice'|'other';

export interface InventoryItem {
  id: string;
  orgId: string;
  name: string;
  category: Category;
  unit: Unit;
  pricePerUnit?: number; // por unidad base del item
  stock?: number;
  minStock?: number;
  active?: boolean;
  imageUrl?: string;
  allergens?: string[];
}

export interface SizeOption {
  id: string;        // 'S'|'M'|'L'
  label: string;
  basePrice: number; // precio base por tamaño
}

export interface BuilderGroupRule {
  id: string;                 // p.ej. 'base', 'syrup', 'topping'
  label: string;
  category: Category;
  min: number;
  max: number;
  required?: boolean;
  unit?: Unit;
  allowCustomQty?: boolean;
  defaultItemId?: string;
  defaultQty?: number;
}

export interface BuilderConfig {
  orgId: string;
  version: number;
  sizeOptions: SizeOption[];
  groups: BuilderGroupRule[];
  visibility?: { allowedCategories?: Category[] };
  updatedAt?: any;
}

export interface TemplateComponent {
  itemId: string;
  qty: number;
  unit: Unit;
}

export interface PresetTemplate {
  id: string;
  orgId: string;
  name: string;
  slug: string;
  public: boolean;
  sizeId: string;
  components: TemplateComponent[];
  tags?: string[];
  imageUrl?: string;
  priceOverride?: number;
  steps?: any[];
  updatedAt?: any;
}

export interface OrderItem {
  templateId?: string;
  custom: boolean;
  sizeId: string;
  components: TemplateComponent[];
  price: number;
  notes?: string;
}

export interface Order {
  id: string;
  orgId: string;
  userId: string;
  status: 'pending'|'preparing'|'ready'|'delivered'|'canceled';
  source: 'client-app'|'kiosk';
  items: OrderItem[];
  createdAt: any;
}