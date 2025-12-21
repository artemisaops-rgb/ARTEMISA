import React from "react";
import { useTheme } from "@/contexts/ThemeContext";

const SunIcon = () => (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="5" />
        <line x1="12" y1="1" x2="12" y2="3" />
        <line x1="12" y1="21" x2="12" y2="23" />
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
        <line x1="1" y1="12" x2="3" y2="12" />
        <line x1="21" y1="12" x2="23" y2="12" />
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
);

const MoonIcon = () => (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
);

export default function ThemeSwitch() {
    const { theme, toggleTheme } = useTheme();

    return (
        <button
            onClick={toggleTheme}
            className="
        fixed top-3 left-3 z-[60]
        w-10 h-10 rounded-full
        flex items-center justify-center
        backdrop-blur-xl
        transition-all duration-300
        border
      "
            style={{
                background: theme === 'dark' ? 'rgba(10, 15, 28, 0.85)' : 'rgba(255, 255, 255, 0.9)',
                borderColor: theme === 'dark' ? 'var(--border-glow)' : '#e5e7eb',
                color: theme === 'dark' ? 'var(--neon-gold)' : '#0f2a47',
                boxShadow: theme === 'dark' ? '0 0 15px rgba(255, 215, 0, 0.2)' : '0 2px 8px rgba(0,0,0,0.1)',
            }}
            title={theme === 'dark' ? "Cambiar a Modo Claro" : "Cambiar a Modo Oscuro"}
        >
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
        </button>
    );
}
