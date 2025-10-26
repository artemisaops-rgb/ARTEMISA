// src/components/CollapsibleRecipe.tsx
import React from "react";
import { motion, AnimatePresence } from "framer-motion";

function useLocalStorageBoolean(key: string, initial: boolean) {
  const [val, setVal] = React.useState<boolean>(() => {
    if (typeof window === "undefined") return initial;
    const raw = window.localStorage.getItem(key);
    return raw === null ? initial : raw === "true";
  });
  React.useEffect(() => {
    try { window.localStorage.setItem(key, val ? "true" : "false"); } catch {}
  }, [key, val]);
  return [val, setVal] as const;
}

export default function CollapsibleRecipe({
  title = "Receta",
  storageKey = "artemisa.recipe.collapsed",
  defaultCollapsed = false,
  children,
  rightSlot,
}: {
  title?: string;
  storageKey?: string;
  defaultCollapsed?: boolean;
  children: React.ReactNode;
  rightSlot?: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useLocalStorageBoolean(storageKey, defaultCollapsed);

  return (
    <section className="rounded-xl border border-zinc-200/70 bg-white/80 backdrop-blur p-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium bg-amber-100 hover:bg-amber-200 text-amber-900 transition"
            aria-expanded={!collapsed}
          >
            {collapsed ? "Mostrar receta" : "Ocultar receta"}
          </button>
          <span className="text-sm text-zinc-500">{title}</span>
        </div>
        <div className="flex items-center gap-2">{rightSlot}</div>
      </div>

      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden"
          >
            <div className="pt-3">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
