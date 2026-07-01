import { useState } from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from 'recharts';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';

interface PriceTrendChartProps {
  currentLivePrice?: number;
  pairLabel?: string;
  sourceLabel?: string;
  volumeLabel?: string | null;
}

export function PriceTrendChart({
  currentLivePrice = 9.7482,
  pairLabel = 'BOT / USDT',
  sourceLabel = 'Bohr DEX Oracle',
  volumeLabel = '1.45M BOT',
}: PriceTrendChartProps) {
  const [timeframe, setTimeframe] = useState<'24H' | '7D' | '1M'>('24H');

  // Ground price trend dynamically using the live price
  const basePrice = currentLivePrice;

  const data24H = [
    { time: '00:00', price: basePrice * 0.965 },
    { time: '02:00', price: basePrice * 0.968 },
    { time: '04:00', price: basePrice * 0.962 },
    { time: '06:00', price: basePrice * 0.975 },
    { time: '08:00', price: basePrice * 0.982 },
    { time: '10:00', price: basePrice * 0.978 },
    { time: '12:00', price: basePrice * 0.988 },
    { time: '14:00', price: basePrice * 0.995 },
    { time: '16:00', price: basePrice * 0.991 },
    { time: '18:00', price: basePrice * 0.997 },
    { time: '20:00', price: basePrice * 1.006 },
    { time: '22:00', price: basePrice * 1.002 },
    { time: '24:00', price: basePrice },
  ];

  const data7D = [
    { time: 'Mon', price: basePrice * 0.935 },
    { time: 'Tue', price: basePrice * 0.952 },
    { time: 'Wed', price: basePrice * 0.941 },
    { time: 'Thu', price: basePrice * 0.965 },
    { time: 'Fri', price: basePrice * 0.982 },
    { time: 'Sat', price: basePrice * 0.974 },
    { time: 'Sun', price: basePrice },
  ];

  const data1M = [
    { time: 'D-30', price: basePrice * 0.865 },
    { time: 'D-25', price: basePrice * 0.882 },
    { time: 'D-20', price: basePrice * 0.915 },
    { time: 'D-15', price: basePrice * 0.932 },
    { time: 'D-10', price: basePrice * 0.948 },
    { time: 'D-5', price: basePrice * 0.976 },
    { time: 'Now', price: basePrice },
  ];

  const getActiveData = () => {
    switch (timeframe) {
      case '7D': return data7D;
      case '1M': return data1M;
      default: return data24H;
    }
  };

  const getStats = () => {
    const data = getActiveData();
    const prices = data.map(d => d.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const firstPrice = prices[0];
    const lastPrice = prices[prices.length - 1];
    const percentChange = ((lastPrice - firstPrice) / firstPrice) * 100;
    const isUp = percentChange >= 0;

    return {
      min,
      max,
      percentChange: percentChange.toFixed(2),
      isUp,
    };
  };

  const activeData = getActiveData();
  const stats = getStats();

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-[#010C1B] border border-white/10 rounded-xl p-2.5 shadow-2xl font-mono text-left">
          <p className="text-[11px] text-white/50 uppercase tracking-wider font-bold">
            {payload[0].payload.time}
          </p>
          <p className="text-sm text-[#32FF8B] font-black">
            ${payload[0].value.toFixed(4)}
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-[#0D1C2A]/40 border border-white/15 rounded-2xl p-3 sm:p-4 space-y-3 font-mono text-left relative overflow-hidden shadow-2xl">
      {/* Background soft pulse effect */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-[#32FF8B]/5 rounded-full blur-3xl pointer-events-none" />

      {/* Header Info */}
      <div className="flex justify-between items-start gap-2">
        <div className="space-y-1 min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] text-[#32FF8B] uppercase font-black tracking-widest bg-[#32FF8B]/10 px-2 py-0.5 rounded border border-[#32FF8B]/20 whitespace-nowrap">
              {pairLabel}
            </span>
            <span className="text-[10px] text-[#C5C1B9]/60 font-medium truncate">{sourceLabel}</span>
          </div>
          <div className="flex items-baseline gap-2 flex-wrap">
            <h3 className="text-base sm:text-lg font-black text-white tracking-tight font-sans">
              ${basePrice.toFixed(4)}
            </h3>
            <span className={`inline-flex items-center text-[11px] font-black ${stats.isUp ? 'text-[#32FF8B]' : 'text-rose-400'}`}>
              {stats.isUp ? <ArrowUpRight className="w-3.5 h-3.5 shrink-0" /> : <ArrowDownRight className="w-3.5 h-3.5 shrink-0" />}
              {stats.isUp ? '+' : ''}{stats.percentChange}%
            </span>
          </div>
        </div>

        {/* Timeframe selector */}
        <div className="flex bg-[#010C1B] border border-white/10 p-0.5 rounded-lg shrink-0">
          {(['24H', '7D', '1M'] as const).map((tf) => (
            <button
              key={tf}
              type="button"
              onClick={() => setTimeframe(tf)}
              className={`px-1.5 sm:px-2 py-1 rounded text-[9px] sm:text-[10px] font-black uppercase tracking-wider transition-all duration-150 cursor-pointer ${
                timeframe === tf
                  ? 'bg-[#32FF8B] text-[#010C1B] shadow-inner'
                  : 'text-[#C5C1B9]/60 hover:text-white hover:bg-white/5'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>


      {/* Mini Recharts Area Chart */}
      <div className="h-28 w-full -mx-2.5">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={activeData} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
            <defs>
              <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#32FF8B" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#32FF8B" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis 
              dataKey="time" 
              hide 
            />
            <YAxis 
              domain={['dataMin - 0.05', 'dataMax + 0.05']} 
              hide 
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="price"
              stroke="#32FF8B"
              strokeWidth={1.75}
              fillOpacity={1}
              fill="url(#colorPrice)"
              animationDuration={600}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Mini Stats Grid */}
      <div className="grid grid-cols-3 gap-2 bg-[#010C1B]/50 border border-white/5 rounded-xl p-2 text-[11px] text-center font-bold">
        <div className="space-y-0.5 border-r border-white/5">
          <span className="text-white/30 uppercase block text-[7px] font-black">Min Price</span>
          <span className="text-[#C5C1B9] block">${stats.min.toFixed(3)}</span>
        </div>
        <div className="space-y-0.5 border-r border-white/5">
          <span className="text-white/30 uppercase block text-[7px] font-black">Max Price</span>
          <span className="text-[#C5C1B9] block">${stats.max.toFixed(3)}</span>
        </div>
        <div className="space-y-0.5">
          <span className="text-white/30 uppercase block text-[7px] font-black">24H Volume</span>
          <span className="text-[#32FF8B] block">1.45M BOT</span>
        </div>
      </div>
    </div>
  );
}
