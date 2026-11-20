import React from 'react';

interface EcomiLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  showSubtitle?: boolean;
}

export const EcomiLogo: React.FC<EcomiLogoProps> = ({ 
  className = '', 
  size = 'md',
  showSubtitle = true 
}) => {
  const dimensions =
    size === 'sm'
      ? 'w-[84px] h-[34px] rounded-lg'
      : size === 'lg'
      ? 'w-[144px] h-[58px] rounded-2xl'
      : 'w-[108px] h-[44px] rounded-xl';

  return (
    <div className={`inline-flex items-center gap-2.5 select-none ${className}`}>
      <div
        className={`${dimensions} bg-white border border-slate-200/90 dark:border-slate-700/80 shadow-xs overflow-hidden shrink-0 flex items-center justify-center`}
      >
        <img
          src="/assets/aistudio/odoo-data-report_0b974500.png"
          alt="Logo Odoo Data Report - Ecomi Drive"
          className="w-full h-full object-cover object-center"
        />
      </div>

      {showSubtitle && (
        <div className="flex flex-col leading-none">
          <span className="inline-flex w-fit px-1.5 py-0.5 rounded text-[10px] font-bold bg-sky-500/15 text-sky-600 dark:text-sky-400 uppercase tracking-wider font-mono">
            Ecomi Drive
          </span>
          <span
            className="font-semibold text-slate-500 dark:text-slate-400 uppercase mt-1 tracking-[0.18em] font-sans"
            style={{ fontSize: size === 'sm' ? '7.5px' : size === 'lg' ? '10px' : '8.5px' }}
          >
            Injection Moulds
          </span>
        </div>
      )}
    </div>
  );
};

export default EcomiLogo;
