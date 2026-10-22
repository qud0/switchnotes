import React from 'react';

export function VlanBadge({ vlan, showName = true, size = 'sm', className = '' }) {
  if (!vlan) return null;

  const color = vlan.color || '#64748b';
  
  const sizeClasses = {
    xs: 'text-[10px] px-1.5 py-0.5',
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-2.5 py-1'
  }[size] || 'text-xs px-2 py-0.5';

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md font-mono font-medium shadow-xs border border-white/10 ${sizeClasses} ${className}`}
      style={{
        backgroundColor: `${color}25`,
        borderColor: `${color}55`,
        color: color
      }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full shrink-0"
        style={{ backgroundColor: color }}
      />
      <span className="font-bold">VLAN {vlan.id}</span>
      {showName && vlan.name && (
        <span className="text-slate-300 font-sans truncate max-w-[120px]">
          ({vlan.name})
        </span>
      )}
    </span>
  );
}
