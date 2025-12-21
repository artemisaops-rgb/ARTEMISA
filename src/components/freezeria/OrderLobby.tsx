import React, { useState, useEffect } from "react";
import { Ticket } from "./Ticket";
import type { InventoryItem, SizeOption } from "@/services/types.ar.rb";

/* =================================================================================
   OrderLobby Component
   ---------------------------------------------------------------------------------
   Simulates the "Order Station" from Papa's Freezeria.
   1. Lobby View: Customer waiting, "Take Order" button.
   2. Ticket View: A clipboard/pad to select Size, Mix-in, Syrup.
   ================================================================================= */

interface OrderLobbyProps {
    sizes: SizeOption[];
    items: InventoryItem[];
    qtyById: Record<string, number>;
    sizeId: string | null;
    onSetSize: (id: string) => void;
    onSetQty: (id: string, qty: number) => void;
    onNext: () => void; // "Add to Line" -> Go to Build Station
    pricing: any; // Passed for total calculation display on ticket
}

export function OrderLobby({
    sizes,
    items,
    qtyById,
    sizeId,
    onSetSize,
    onSetQty,
    onNext,
    pricing,
}: OrderLobbyProps) {
    const [view, setView] = useState<"waiting" | "taking">("waiting");
    const [customerIndex, setCustomerIndex] = useState(0);

    // Simple customer visuals (placeholder colors/emojis for now, can be images later)
    const CUSTOMERS = [
        { color: "#fca5a5", emoji: "👩" }, // Red
        { color: "#86efac", emoji: "👨" }, // Green
        { color: "#93c5fd", emoji: "👵" }, // Blue
    ];

    const currentCustomer = CUSTOMERS[customerIndex % CUSTOMERS.length];

    // Auto-select first size if none selected when taking order
    useEffect(() => {
        if (view === "taking" && !sizeId && sizes.length > 0) {
            onSetSize(sizes[1]?.id || sizes[0].id); // Default to Medium usually
        }
    }, [view, sizeId, sizes, onSetSize]);

    // Helper to calculate total for the ticket preview
    const calculateTotal = () => {
        // Simplified calc for display - ideally reuse the one from BuilderClient
        // But for now, we just want a rough visual or we can pass the real total down.
        // Let's assume the parent passes the *real* calculated total string if possible,
        // but for now we'll just show "---" if not ready.
        return "$---";
    };

    // Filter items for the Ticket Pad
    const mixables = items.filter(i => i.category === "mixable" || (i as any).role === "mixable" || i.unit === "g");
    const syrups = items.filter(i => i.category === "jarabe" || i.category === "syrup" || (i.unit === "ml" && i.id !== "milk"));

    // Handle selection logic (radio button style for this phase)
    const selectItem = (id: string, type: "mix" | "syrup") => {
        // Clear other items of same type for the "Order" phase (usually 1 mix, 1 syrup for base)
        // Actually Freezeria allows multiple, but for the "Base Order" usually you pick main flavor.
        // Let's stick to the current app logic: just add/remove. 
        // BUT to feel like a ticket pad, maybe we clear previous selection of that category?
        // Let's try: Single Select for Mix-in, Single Select for Syrup (for the base).

        // Find currently selected of this type
        const group = type === "mix" ? mixables : syrups;
        group.forEach(i => {
            if (qtyById[i.id as string] > 0) onSetQty(i.id as string, 0);
        });

        onSetQty(id, 1); // Select new
    };

    if (view === "waiting") {
        return (
            <div className="lobby-scene">
                <div className="counter-top" />
                <div className="customer-area">
                    <div className="customer-bubble" onClick={() => setView("taking")}>
                        <span className="alert-icon">!</span>
                        <span className="text">Take Order</span>
                    </div>
                    <div className="customer-body" style={{ backgroundColor: currentCustomer.color }}>
                        <span className="face">{currentCustomer.emoji}</span>
                    </div>
                </div>

                <style>{`
          .lobby-scene {
            width: 100%; height: 100%;
            background: radial-gradient(circle at 50% 60%, #fef3c7 0%, #d97706 100%); /* Warm lobby light */
            position: relative;
            display: flex;
            justify-content: center;
            align-items: flex-end;
            overflow: hidden;
          }
          .counter-top {
            position: absolute; bottom: 0; width: 100%; height: 120px;
            background: #78350f; /* Wood */
            border-top: 8px solid #451a03;
            z-index: 10;
          }
          .customer-area {
            position: relative; z-index: 5; bottom: 80px;
            display: flex; flex-direction: column; align-items: center;
            animation: slideIn 0.5s ease-out;
          }
          @keyframes slideIn { from { transform: translateX(200px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
          
          .customer-body {
            width: 140px; height: 220px;
            border-radius: 70px 70px 0 0;
            border: 4px solid #000;
            display: flex; justify-content: center; align-items: center;
            box-shadow: 8px 0 10px rgba(0,0,0,0.2);
          }
          .face { font-size: 60px; }
          
          .customer-bubble {
            background: #fff; border: 3px solid #000;
            padding: 12px 24px; border-radius: 30px;
            margin-bottom: 20px; cursor: pointer;
            display: flex; gap: 8px; align-items: center;
            font-weight: 900; font-size: 18px; color: #000;
            box-shadow: 4px 4px 0 rgba(0,0,0,0.2);
            animation: bounce 1s infinite;
          }
          .customer-bubble:hover { transform: scale(1.1); background: #ecfeff; }
          .alert-icon { color: #ef4444; font-size: 24px; }
          @keyframes bounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
        `}</style>
            </div>
        );
    }

    // TAKING ORDER VIEW
    return (
        <div className="order-pad-layout">
            {/* Left: The Ticket Preview */}
            <div className="ticket-preview-area">
                <Ticket
                    size={sizes.find(s => s.id === sizeId)?.label || null}
                    items={Object.entries(qtyById).map(([id, q]) => {
                        const it = items.find(i => i.id === id);
                        return { name: it?.name || id, qty: q };
                    }).filter(x => x.qty > 0)}
                    total={pricing ? "$..." : ""} // We'll let the main ticket handle total logic or pass it down
                    blendPct={0}
                />
                <button className="finish-btn" onClick={onNext}>
                    ADD TO LINE &rarr;
                </button>
            </div>

            {/* Right: The Order Pad (Controls) */}
            <div className="order-controls">
                <div className="pad-header">Guest Check</div>

                {/* Section 1: Cup Size */}
                <div className="pad-section">
                    <div className="pad-label">Cup Size</div>
                    <div className="size-grid">
                        {sizes.map(s => (
                            <button
                                key={s.id}
                                className={`pad-btn size ${sizeId === s.id ? "selected" : ""}`}
                                onClick={() => onSetSize(s.id)}
                            >
                                <span className="btn-icon">🥤</span>
                                {s.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Section 2: Mix-in (Powder/Fruit) */}
                <div className="pad-section">
                    <div className="pad-label">Mix-in</div>
                    <div className="item-grid">
                        {mixables.map(item => {
                            const isSel = (qtyById[item.id as string] || 0) > 0;
                            return (
                                <button
                                    key={item.id as string}
                                    className={`pad-btn item ${isSel ? "selected" : ""}`}
                                    onClick={() => selectItem(item.id as string, "mix")}
                                >
                                    {item.name}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Section 3: Syrup */}
                <div className="pad-section">
                    <div className="pad-label">Syrup</div>
                    <div className="item-grid">
                        {syrups.map(item => {
                            const isSel = (qtyById[item.id as string] || 0) > 0;
                            return (
                                <button
                                    key={item.id as string}
                                    className={`pad-btn item ${isSel ? "selected" : ""}`}
                                    onClick={() => selectItem(item.id as string, "syrup")}
                                >
                                    {item.name}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            <style>{`
        .order-pad-layout {
          display: flex; width: 100%; height: 100%;
          background: #334155;
          padding: 20px; gap: 40px;
          justify-content: center; align-items: flex-start;
        }
        
        .ticket-preview-area {
          flex: 0 0 200px;
          display: flex; flex-direction: column; gap: 20px;
          align-items: center;
        }
        
        .finish-btn {
          width: 100%; padding: 16px;
          background: #22c55e; color: #052e16;
          font-weight: 900; font-size: 18px;
          border: 4px solid #14532d; border-radius: 12px;
          cursor: pointer; box-shadow: 0 4px 0 #14532d;
          transition: all 0.1s;
        }
        .finish-btn:active { transform: translateY(4px); box-shadow: none; }
        
        .order-controls {
          flex: 1; max-width: 500px;
          background: #f1f5f9;
          border: 8px solid #cbd5e1; border-radius: 24px;
          padding: 24px;
          box-shadow: 12px 12px 0 rgba(0,0,0,0.2);
          display: flex; flex-direction: column; gap: 24px;
          max-height: 100%; overflow-y: auto;
        }
        
        .pad-header {
          font-family: "Courier New", monospace;
          font-weight: 900; font-size: 24px;
          text-align: center; border-bottom: 2px dashed #94a3b8;
          padding-bottom: 12px; color: #475569;
        }
        
        .pad-section { display: flex; flex-direction: column; gap: 8px; }
        .pad-label { font-weight: 800; color: #64748b; text-transform: uppercase; font-size: 12px; letter-spacing: 1px; }
        
        .size-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
        .item-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
        
        .pad-btn {
          background: #fff; border: 2px solid #cbd5e1;
          border-radius: 8px; padding: 12px;
          font-weight: 700; color: #334155;
          cursor: pointer; text-align: left;
          display: flex; align-items: center; gap: 8px;
          transition: all 0.1s;
        }
        .pad-btn:hover { background: #f8fafc; border-color: #94a3b8; }
        
        .pad-btn.selected {
          background: #ccfbf1; border-color: #0d9488; color: #0f766e;
          box-shadow: 0 0 0 2px #0d9488;
        }
        
        .btn-icon { font-size: 20px; }
      `}</style>
        </div>
    );
}
