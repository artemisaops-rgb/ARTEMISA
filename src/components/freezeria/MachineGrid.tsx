import React from "react";

export type MachineCategory = "HIELO" | "LÍQUIDOS" | "POLVOS" | "SALSAS";

export type MachineItem = {
  id: string;
  name: string;
  category: MachineCategory;
  icon?: string;
};

interface MachineGridProps {
  items: MachineItem[];
  onSelect: (item: MachineItem) => void;
}

export default function MachineGrid({ items, onSelect }: MachineGridProps) {
  // Group items by category
  const grouped = items.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {} as Record<MachineCategory, MachineItem[]>);

  return (
    <div className="grid grid-cols-2 gap-4">
      {Object.entries(grouped).map(([category, categoryItems]) => (
        <div key={category} className="space-y-2">
          <h3 className="text-sm font-bold text-violet-700">{category}</h3>
          <div className="space-y-2">
            {categoryItems.map((item) => (
              <button
                key={item.id}
                onClick={() => onSelect(item)}
                className="w-full min-h-[44px] px-3 py-2 text-left bg-violet-50 hover:bg-violet-100 rounded-lg border border-violet-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-violet-500"
                aria-label={`${category}: ${item.name}`}
              >
                {item.name}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
