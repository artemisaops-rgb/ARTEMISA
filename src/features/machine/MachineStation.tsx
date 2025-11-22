import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { IceFall } from '@/components/freezeria/IceFall';
import { LiquidStream, usePourSound } from '@/components/freezeria/PourEngine';
import { t } from '@/lib/telemetry';
import { useUI } from '@/app/ui-context';
import StickyCTA from '@/components/StickyCTA';

interface Ingredient {
  id: string;
  name: string;
  category: 'HIELO' | 'LÍQUIDOS' | 'POLVOS' | 'SALSAS';
}

const MACHINE_INGREDIENTS: Ingredient[] = [
  { id: 'cubitos', name: 'Cubitos', category: 'HIELO' },
  { id: 'leche', name: 'Leche', category: 'LÍQUIDOS' },
  { id: 'agua', name: 'Agua', category: 'LÍQUIDOS' },
  { id: 'almendras', name: 'Almendras', category: 'LÍQUIDOS' },
  { id: 'deslactosada', name: 'Deslactosada', category: 'LÍQUIDOS' },
  { id: 'leche-polvo', name: 'Leche en polvo', category: 'POLVOS' },
  { id: 'esplenda', name: 'Esplenda', category: 'POLVOS' },
  { id: 'azucar', name: 'Azúcar', category: 'POLVOS' },
  { id: 'panela', name: 'Panela', category: 'POLVOS' },
  { id: 'leche-condensada', name: 'Leche condensada', category: 'SALSAS' },
];

export function MachineStation() {
  const navigate = useNavigate();
  const { mute, hideRightPanel, toggleMute, toggleRightPanel } = useUI();
  
  const [hasIce, setHasIce] = useState(false);
  const [hasLiquid, setHasLiquid] = useState(false);
  const [hasPowder, setHasPowder] = useState(false);
  const [hasSauce, setHasSauce] = useState(false);
  const [pouring, setPouring] = useState<string | null>(null);
  const [showIce, setShowIce] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  
  const nozzleRef = useRef<HTMLDivElement>(null);
  const cupRef = useRef<HTMLDivElement>(null);
  const [nozzlePos, setNozzlePos] = useState({ x: 0, y: 0 });
  const [cupPos, setCupPos] = useState({ x: 0, y: 0 });

  usePourSound(!mute && pouring !== null);

  useEffect(() => {
    t('station:enter', { name: 'machine' });
    return () => {
      t('station:exit', { name: 'machine' });
    };
  }, []);

  useEffect(() => {
    if (nozzleRef.current) {
      const rect = nozzleRef.current.getBoundingClientRect();
      setNozzlePos({ x: rect.left + rect.width / 2, y: rect.bottom });
    }
    if (cupRef.current) {
      const rect = cupRef.current.getBoundingClientRect();
      setCupPos({ x: rect.left + rect.width / 2, y: rect.top + 20 });
    }
  }, [hideRightPanel]);

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  };

  const onSelect = (item: Ingredient) => {
    t('dispense:start', { itemId: item.id });

    if (item.category === 'HIELO') {
      setHasIce(true);
      setShowIce(true);
      setTimeout(() => {
        setShowIce(false);
        t('dispense:stop', { itemId: item.id });
      }, 2000);
    } else if (item.category === 'LÍQUIDOS') {
      setHasLiquid(true);
      setPouring(item.id);
      setTimeout(() => {
        setPouring(null);
        t('dispense:stop', { itemId: item.id });
      }, 1600); // Slow pour speed=1.6
    } else if (item.category === 'POLVOS') {
      setHasPowder(true);
      t('dispense:stop', { itemId: item.id });
    } else if (item.category === 'SALSAS') {
      if (item.id === 'leche-condensada') {
        setHasSauce(true);
        t('dispense:stop', { itemId: item.id });
      } else {
        showToast('Solo leche condensada permitida en la Máquina');
      }
    }
  };

  const handleNext = () => {
    if (canProceed) {
      t('station:next', { from: 'machine', ready: true });
      navigate('/blend');
    }
  };

  const canProceed = hasIce || hasLiquid;
  const ctaLabel = !hasIce && !hasLiquid
    ? 'Selecciona hielo o líquido'
    : 'Continuar a licuadora';

  const groupedByCategory = MACHINE_INGREDIENTS.reduce(
    (acc, item) => {
      if (!acc[item.category]) acc[item.category] = [];
      acc[item.category].push(item);
      return acc;
    },
    {} as Record<string, Ingredient[]>
  );

  return (
    <div className="flex flex-col h-screen pb-28">
      {/* Toast notification */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-violet-600 text-white px-4 py-2 rounded-lg shadow-lg"
        >
          {toast}
        </div>
      )}

      {/* Machine Area */}
      <div className="relative flex-shrink-0 h-64 bg-gradient-to-b from-violet-100 to-violet-50 flex items-center justify-center">
        {/* Nozzle */}
        <div
          ref={nozzleRef}
          className="absolute top-8 left-1/2 -translate-x-1/2 w-8 h-16 bg-gray-700 rounded-b-lg"
        />

        {/* Cup (positioned lower) */}
        <div
          ref={cupRef}
          className="relative w-24 h-32 mt-16 bg-gradient-to-b from-transparent via-blue-100 to-blue-200 border-2 border-blue-300 rounded-lg"
        >
          {showIce && <IceFall intensity={2} origin={{ x: 48, y: -60 }} dropHeight={120} />}
        </div>

        {/* Pour Animation */}
        {pouring && <LiquidStream from={nozzlePos} to={cupPos} speed={1.6} />}

        {/* Controls */}
        <div className="absolute top-4 right-4 flex gap-2">
          <button
            onClick={toggleMute}
            className="w-11 h-11 flex items-center justify-center bg-white rounded-full shadow-md hover:bg-gray-50"
            aria-label={mute ? 'Unmute' : 'Mute'}
          >
            {mute ? '🔇' : '🔊'}
          </button>
          <button
            onClick={toggleRightPanel}
            className="w-11 h-11 flex items-center justify-center bg-white rounded-full shadow-md hover:bg-gray-50"
            aria-label={hideRightPanel ? 'Show panel' : 'Hide panel'}
          >
            {hideRightPanel ? '👁️' : '🙈'}
          </button>
        </div>
      </div>

      {/* Grid Area */}
      <div className="flex-1 overflow-y-auto p-4 bg-white">
        <div className="grid grid-cols-2 gap-4 max-w-md mx-auto">
          {Object.entries(groupedByCategory).map(([category, items]) => (
            <div key={category} className="space-y-2">
              <h3 className="text-sm font-bold text-violet-700">{category}</h3>
              {items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => onSelect(item)}
                  className="w-full min-h-[44px] px-3 py-2 text-left bg-violet-50 hover:bg-violet-100 rounded-lg border border-violet-200 text-sm font-medium"
                >
                  {item.name}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>

      <StickyCTA
        label={ctaLabel}
        onClick={handleNext}
        disabled={!canProceed}
      />
    </div>
  );
}
