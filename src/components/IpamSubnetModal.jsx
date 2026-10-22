import React, { useState, useEffect } from 'react';
import { X, Check, Network, Server } from 'lucide-react';
import { parseSubnet } from '../utils/ipamUtils';

export function IpamSubnetModal({
  isOpen,
  onClose,
  vlan,
  onSave,
  theme = 'dark'
}) {
  if (!isOpen || !vlan) return null;

  const [subnet, setSubnet] = useState(vlan.subnet || '');
  const [gateway, setGateway] = useState(vlan.gateway || '');
  const [dhcpRange, setDhcpRange] = useState(vlan.dhcpRange || '');
  const [dns, setDns] = useState(vlan.dns || '');

  useEffect(() => {
    if (vlan) {
      setSubnet(vlan.subnet || `192.168.${vlan.id}.0/24`);
      setGateway(vlan.gateway || `192.168.${vlan.id}.1`);
      setDhcpRange(vlan.dhcpRange || `192.168.${vlan.id}.100 - 192.168.${vlan.id}.250`);
      setDns(vlan.dns || '192.168.10.1, 77.88.8.8');
    }
  }, [vlan]);

  const parsed = parseSubnet(subnet);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({
      subnet: subnet.trim(),
      gateway: gateway.trim(),
      dhcpRange: dhcpRange.trim(),
      dns: dns.trim()
    });
  };

  const isLight = theme === 'light';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className={`w-full max-w-lg rounded-2xl border shadow-2xl overflow-hidden transition-colors ${
        isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-slate-100'
      }`}>
        {/* Header */}
        <div className={`px-6 py-4 border-b flex items-center justify-between ${
          isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/70 border-slate-800'
        }`}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center">
              <Network className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Параметры подсети VLAN {vlan.id} ({vlan.name})
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Настройка IP-пула, маски, шлюза и DNS
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
              Подсеть (CIDR нотация) *
            </label>
            <input
              type="text"
              required
              value={subnet}
              onChange={(e) => setSubnet(e.target.value)}
              placeholder="напр. 192.168.20.0/24"
              className={`w-full text-xs px-3 py-2 font-mono rounded-xl border focus:border-blue-500 focus:outline-hidden ${
                isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
              }`}
            />
          </div>

          {/* Subnet Calculator Info Box */}
          {parsed && (
            <div className={`p-3 rounded-xl border text-[11px] font-mono grid grid-cols-2 gap-2 ${
              isLight ? 'bg-blue-50/60 border-blue-200 text-slate-700' : 'bg-blue-950/20 border-blue-900/40 text-slate-300'
            }`}>
              <div>Сеть: <strong>{parsed.network}</strong></div>
              <div>Маска: <strong>{parsed.netmask}</strong></div>
              <div>Шлюз (Первый IP): <strong>{parsed.firstUsable}</strong></div>
              <div>Broadcast: <strong>{parsed.broadcast}</strong></div>
              <div className="col-span-2 text-blue-600 dark:text-blue-400 font-bold">
                Всего доступно хостов: {parsed.totalUsable} IP ({parsed.firstUsable} — {parsed.lastUsable})
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
              Основной шлюз (Default Gateway)
            </label>
            <input
              type="text"
              value={gateway}
              onChange={(e) => setGateway(e.target.value)}
              placeholder="напр. 192.168.20.1"
              className={`w-full text-xs px-3 py-2 font-mono rounded-xl border focus:border-blue-500 focus:outline-hidden ${
                isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
              }`}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
              Динамический диапазон DHCP (Pool)
            </label>
            <input
              type="text"
              value={dhcpRange}
              onChange={(e) => setDhcpRange(e.target.value)}
              placeholder="напр. 192.168.20.100 - 192.168.20.250"
              className={`w-full text-xs px-3 py-2 font-mono rounded-xl border focus:border-blue-500 focus:outline-hidden ${
                isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
              }`}
            />
            <span className="text-[11px] text-slate-400 mt-1 block">
              Адреса из этого диапазона на карте сети будут помечены как DHCP-пул.
            </span>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
              DNS-серверы
            </label>
            <input
              type="text"
              value={dns}
              onChange={(e) => setDns(e.target.value)}
              placeholder="напр. 192.168.10.1, 77.88.8.8"
              className={`w-full text-xs px-3 py-2 font-mono rounded-xl border focus:border-blue-500 focus:outline-hidden ${
                isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
              }`}
            />
          </div>

          {/* Actions */}
          <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
            >
              Отмена
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-medium flex items-center gap-1.5 shadow-md shadow-blue-500/20 cursor-pointer transition-colors"
            >
              <Check className="w-4 h-4" />
              Сохранить параметры
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
