import React, { useState, useEffect } from 'react';
import { X, Check, Globe, Sparkles, MapPin, HardDrive, Shield } from 'lucide-react';
import { findNextFreeIp } from '../utils/ipamUtils';

const DEVICE_TYPES = [
  { id: 'workstation', label: 'Рабочая станция / ПК' },
  { id: 'server', label: 'Сервер' },
  { id: 'switch', label: 'Коммутатор / Маршрутизатор' },
  { id: 'gateway', label: 'Шлюз подсети' },
  { id: 'printer', label: 'Сетевой принтер / МФУ' },
  { id: 'cctv', label: 'IP-камера / Видеорегистратор' },
  { id: 'ap', label: 'Точка доступа Wi-Fi' },
  { id: 'phone', label: 'IP-телефон / VoIP' },
  { id: 'dhcp', label: 'DHCP Резервация' },
  { id: 'other', label: 'Другое устройство' }
];

export function IpamModal({
  isOpen,
  onClose,
  allocationData = null,
  vlans = [],
  allAllocations = [],
  activeVlanId = null,
  onSave,
  theme = 'dark'
}) {
  if (!isOpen) return null;

  const [ip, setIp] = useState('');
  const [vlanId, setVlanId] = useState(1);
  const [hostname, setHostname] = useState('');
  const [mac, setMac] = useState('');
  const [type, setType] = useState('workstation');
  const [status, setStatus] = useState('active');
  const [location, setLocation] = useState('');
  const [connectedTo, setConnectedTo] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (allocationData) {
      setIp(allocationData.ip || '');
      setVlanId(allocationData.vlanId || 1);
      setHostname(allocationData.hostname || '');
      setMac(allocationData.mac || '');
      setType(allocationData.type || 'workstation');
      setStatus(allocationData.status || 'active');
      setLocation(allocationData.location || '');
      setConnectedTo(allocationData.connectedTo || '');
      setDescription(allocationData.description || '');
    } else {
      const initialVlan = activeVlanId || (vlans[0]?.id || 1);
      setVlanId(initialVlan);
      setHostname('');
      setMac('');
      setType('workstation');
      setStatus('active');
      setLocation('');
      setConnectedTo('');
      setDescription('');

      // Auto-suggest next free IP for this VLAN
      const targetVlan = vlans.find(v => v.id === initialVlan);
      if (targetVlan?.subnet) {
        const nextIp = findNextFreeIp(targetVlan.subnet, allAllocations, targetVlan.dhcpRange);
        setIp(nextIp);
      } else {
        setIp('');
      }
    }
  }, [allocationData, isOpen, activeVlanId, vlans]);

  const handleVlanChange = (newVlanId) => {
    const vId = parseInt(newVlanId, 10);
    setVlanId(vId);
    if (!allocationData) {
      const v = vlans.find(vl => vl.id === vId);
      if (v?.subnet) {
        const nextIp = findNextFreeIp(v.subnet, allAllocations, v.dhcpRange);
        setIp(nextIp);
      }
    }
  };

  const handleAutoFindIp = () => {
    const targetVlan = vlans.find(v => v.id === vlanId);
    if (targetVlan?.subnet) {
      const nextIp = findNextFreeIp(targetVlan.subnet, allAllocations, targetVlan.dhcpRange);
      if (nextIp) {
        setIp(nextIp);
      } else {
        alert('В данной подсети не найдено свободных IP-адресов');
      }
    } else {
      alert('Для выбранного VLAN не задана подсеть');
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!ip.trim()) {
      alert('Укажите IP-адрес');
      return;
    }

    onSave({
      ip: ip.trim(),
      vlanId: parseInt(vlanId, 10),
      hostname: hostname.trim(),
      mac: mac.trim(),
      type,
      status,
      location: location.trim(),
      connectedTo: connectedTo.trim(),
      description: description.trim()
    });
  };

  const isLight = theme === 'light';
  const selectedVlan = vlans.find(v => v.id === vlanId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className={`w-full max-w-xl rounded-2xl border shadow-2xl overflow-hidden transition-colors ${
        isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-slate-100'
      }`}>
        {/* Header */}
        <div className={`px-6 py-4 border-b flex items-center justify-between ${
          isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/70 border-slate-800'
        }`}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center">
              <Globe className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {allocationData ? 'Редактировать IP-адрес' : 'Выделение IP-адреса'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Адресный план сети (IPAM)
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* VLAN Selector */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                VLAN и подсеть *
              </label>
              <select
                value={vlanId}
                onChange={(e) => handleVlanChange(e.target.value)}
                className={`w-full text-xs px-3 py-2 rounded-xl border focus:border-blue-500 focus:outline-hidden ${
                  isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
                }`}
              >
                {vlans.map(v => (
                  <option key={v.id} value={v.id}>
                    VLAN {v.id}: {v.name} {v.subnet ? `(${v.subnet})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* IP Address */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  IP-адрес *
                </label>
                <button
                  type="button"
                  onClick={handleAutoFindIp}
                  className="text-[11px] text-blue-500 hover:text-blue-600 font-medium flex items-center gap-1 cursor-pointer"
                  title="Автоматически подобрать первый свободный IP"
                >
                  <Sparkles className="w-3 h-3" />
                  Свободный IP
                </button>
              </div>
              <input
                type="text"
                required
                value={ip}
                onChange={(e) => setIp(e.target.value)}
                placeholder="192.168.20.10"
                className={`w-full text-xs px-3 py-2 font-mono rounded-xl border focus:border-blue-500 focus:outline-hidden ${
                  isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
                }`}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Hostname */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                Имя хоста / Оборудования
              </label>
              <input
                type="text"
                value={hostname}
                onChange={(e) => setHostname(e.target.value)}
                placeholder="напр. pc-accountant-01"
                className={`w-full text-xs px-3 py-2 rounded-xl border focus:border-blue-500 focus:outline-hidden ${
                  isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
                }`}
              />
            </div>

            {/* MAC Address */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                MAC-адрес
              </label>
              <input
                type="text"
                value={mac}
                onChange={(e) => setMac(e.target.value)}
                placeholder="00:1A:2B:3C:4D:5E"
                className={`w-full text-xs px-3 py-2 font-mono uppercase rounded-xl border focus:border-blue-500 focus:outline-hidden ${
                  isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
                }`}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Device Type */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                Тип устройства
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className={`w-full text-xs px-3 py-2 rounded-xl border focus:border-blue-500 focus:outline-hidden ${
                  isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
                }`}
              >
                {DEVICE_TYPES.map(t => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
            </div>

            {/* Status */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                Статус
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className={`w-full text-xs px-3 py-2 rounded-xl border focus:border-blue-500 focus:outline-hidden ${
                  isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
                }`}
              >
                <option value="active">Активен (В работе)</option>
                <option value="reserved">В резерве</option>
                <option value="offline">Отключен / В архиве</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Location */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                Кабинет / Местоположение
              </label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="напр. Каб. 201 (Бухгалтерия)"
                className={`w-full text-xs px-3 py-2 rounded-xl border focus:border-blue-500 focus:outline-hidden ${
                  isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
                }`}
              />
            </div>

            {/* Connected To (Switch port or Socket) */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                Порт коммутатора / Розетка
              </label>
              <input
                type="text"
                value={connectedTo}
                onChange={(e) => setConnectedTo(e.target.value)}
                placeholder="напр. sw-dist-snr: Gi 1/0/1 (Р-1.1)"
                className={`w-full text-xs px-3 py-2 rounded-xl border focus:border-blue-500 focus:outline-hidden ${
                  isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
                }`}
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
              Назначение / Описание
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Основной ПК бухгалтера по зарплате..."
              className={`w-full text-xs px-3 py-2 rounded-xl border focus:border-blue-500 focus:outline-hidden ${
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
              {allocationData ? 'Сохранить изменения' : 'Выделить IP-адрес'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
