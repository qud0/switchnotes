import React, { useState, useEffect } from 'react';
import { X, Check, Link as LinkIcon, Unlink, Network, MapPin, Cable, ArrowRight, ShieldAlert } from 'lucide-react';
import { VirtualTdrTester } from './VirtualTdrTester';

const CABLE_TYPES = [
  'UTP Cat.6',
  'FTP Cat.6',
  'UTP Cat.5e',
  'SFTP Cat.6A',
  'UTP Cat.6 Outdoor'
];

const PATCH_CORD_COLORS = [
  { name: 'Синий', color: '#3b82f6' },
  { name: 'Зеленый', color: '#10b981' },
  { name: 'Желтый', color: '#eab308' },
  { name: 'Красный', color: '#ef4444' },
  { name: 'Фиолетовый', color: '#8b5cf6' },
  { name: 'Бирюзовый', color: '#06b6d4' },
  { name: 'Серый', color: '#64748b' },
  { name: 'Оранжевый', color: '#f97316' }
];

const PATCH_CORD_LENGTHS = ['0.5м', '1м', '1.5м', '2м', '3м', '5м'];

export function PatchPanelPortDrawer({
  isOpen,
  onClose,
  targetPort = null,
  patchPanel = null,
  allSwitches = [],
  onSave,
  theme = 'dark'
}) {
  if (!isOpen || !targetPort) return null;

  const [room, setRoom] = useState(targetPort.room || '');
  const [socket, setSocket] = useState(targetPort.socket || '');
  const [cableType, setCableType] = useState(targetPort.cableType || 'UTP Cat.6');
  const [cableLength, setCableLength] = useState(targetPort.cableLength || '25м');
  const [cableMark, setCableMark] = useState(targetPort.cableMark || '');
  const [status, setStatus] = useState(targetPort.status || 'free');
  const [description, setDescription] = useState(targetPort.description || '');

  // Switch link
  const [isPatched, setIsPatched] = useState(Boolean(targetPort.connectedSwitchId));
  const [connectedSwitchId, setConnectedSwitchId] = useState(targetPort.connectedSwitchId || '');
  const [connectedSwitchPortId, setConnectedSwitchPortId] = useState(targetPort.connectedSwitchPortId || '');
  const [patchCordColor, setPatchCordColor] = useState(targetPort.patchCordColor || '#3b82f6');
  const [patchCordLength, setPatchCordLength] = useState(targetPort.patchCordLength || '1м');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (targetPort) {
      setRoom(targetPort.room || '');
      setSocket(targetPort.socket || `Р-${targetPort.number}`);
      setCableType(targetPort.cableType || 'UTP Cat.6');
      setCableLength(targetPort.cableLength || '25м');
      setCableMark(targetPort.cableMark || `К-${targetPort.number}`);
      setStatus(targetPort.status || 'free');
      setDescription(targetPort.description || '');
      setIsPatched(Boolean(targetPort.connectedSwitchId));
      setConnectedSwitchId(targetPort.connectedSwitchId || '');
      setConnectedSwitchPortId(targetPort.connectedSwitchPortId || '');
      setPatchCordColor(targetPort.patchCordColor || '#3b82f6');
      setPatchCordLength(targetPort.patchCordLength || '1м');
    }
  }, [targetPort]);

  const selectedSwitch = allSwitches.find(s => s.id === connectedSwitchId);
  const selectedSwitchPort = selectedSwitch?.ports?.find(p => p.id === connectedSwitchPortId || p.number === connectedSwitchPortId);

  const handleSelectSwitch = (swId) => {
    setConnectedSwitchId(swId);
    const sw = allSwitches.find(s => s.id === swId);
    if (sw && sw.ports?.length > 0) {
      setConnectedSwitchPortId(sw.ports[0].id);
    } else {
      setConnectedSwitchPortId('');
    }
  };

  const handleUnpatch = () => {
    setIsPatched(false);
    setConnectedSwitchId('');
    setConnectedSwitchPortId('');
    if (status === 'connected') setStatus('free');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    const updateData = {
      room: room.trim(),
      socket: socket.trim(),
      cableType,
      cableLength: cableLength.trim(),
      cableMark: cableMark.trim(),
      status: isPatched && connectedSwitchId ? 'connected' : status,
      description: description.trim(),
      connectedSwitchId: isPatched && connectedSwitchId ? connectedSwitchId : null,
      connectedSwitchPortId: isPatched && connectedSwitchPortId ? connectedSwitchPortId : null,
      patchCordColor,
      patchCordLength
    };

    try {
      await onSave(targetPort.id, updateData);
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const isLight = theme === 'light';

  return (
    <div className={`fixed inset-y-0 right-0 z-50 w-full sm:w-120 shadow-2xl flex flex-col transition-colors border-l ${
      isLight
        ? 'bg-white border-slate-200 text-slate-800'
        : 'bg-slate-900/98 border-slate-800 text-slate-100'
    }`}>
      {/* Header */}
      <div className={`px-6 py-4 border-b flex items-center justify-between ${
        isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/70 border-slate-800'
      }`}>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-lg font-bold text-blue-600 dark:text-blue-400">
              Порт #{targetPort.number}
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full font-mono bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
              {patchPanel?.name || 'Патч-панель'}
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Пассивный порт RJ45 Keystone (Трассировка СКС)
          </p>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Body Form */}
      <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-6 flex-1">
        {/* End-to-End Tracing Preview Card */}
        <div className={`p-4 rounded-xl border ${
          isLight ? 'bg-blue-50/60 border-blue-200' : 'bg-blue-950/20 border-blue-900/40'
        }`}>
          <div className="flex items-center gap-2 text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider mb-2">
            <Cable className="w-3.5 h-3.5" />
            Трассировка кабельной линии
          </div>
          <div className="space-y-2 text-xs font-mono">
            {/* Wall Socket */}
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-md bg-amber-500/20 text-amber-500 flex items-center justify-center text-[10px] font-bold">1</span>
              <span className="text-slate-500">Розетка:</span>
              <span className="font-bold text-slate-800 dark:text-slate-200">
                {room || 'Кабинет не указан'} / {socket || 'Без номера'}
              </span>
            </div>

            {/* Cable */}
            <div className="flex items-center gap-2 pl-7 text-[11px] text-slate-500 border-l-2 border-dashed border-blue-400/40 ml-2.5 py-0.5">
              <span>{cableType} ({cableLength || '25м'})</span>
              {cableMark && <span className="bg-slate-200 dark:bg-slate-800 px-1.5 py-0.2 rounded-xs">№ {cableMark}</span>}
            </div>

            {/* Patch Panel */}
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-md bg-blue-500/20 text-blue-500 flex items-center justify-center text-[10px] font-bold">2</span>
              <span className="text-slate-500">Патч-панель:</span>
              <span className="font-bold text-slate-800 dark:text-slate-200">
                {patchPanel?.name || 'PP-01'} [Порт {targetPort.number}]
              </span>
            </div>

            {/* Patch Cord */}
            {isPatched && selectedSwitch ? (
              <>
                <div className="flex items-center gap-2 pl-7 text-[11px] text-slate-500 border-l-2 border-dashed border-blue-400/40 ml-2.5 py-0.5">
                  <span
                    className="w-2.5 h-2.5 rounded-full inline-block shrink-0"
                    style={{ backgroundColor: patchCordColor }}
                  />
                  <span>Патчкорд ({patchCordLength})</span>
                  <ArrowRight className="w-3 h-3 text-slate-400" />
                </div>

                {/* Switch Port */}
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-md bg-emerald-500/20 text-emerald-500 flex items-center justify-center text-[10px] font-bold">3</span>
                  <span className="text-slate-500">Коммутатор:</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">
                    {selectedSwitch.name} ({selectedSwitchPort?.name || 'Порт ' + selectedSwitchPort?.number})
                  </span>
                  {selectedSwitchPort?.pvid && (
                    <span className="text-[10px] px-1.5 py-0.2 rounded-xs bg-slate-200 dark:bg-slate-800 font-mono">
                      VLAN {selectedSwitchPort.pvid}
                    </span>
                  )}
                </div>
              </>
            ) : (
              <div className="flex items-center gap-2 pl-7 text-[11px] text-slate-400 border-l-2 border-dashed border-slate-400/20 ml-2.5 py-0.5">
                <span>Патчкорд не подключен (порт свободен)</span>
              </div>
            )}
          </div>
        </div>

        {/* Room and Wall Socket */}
        <div className="space-y-4">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-blue-500" />
            Рабочее место / Розетка в помещении
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                Кабинет / Помещение
              </label>
              <input
                type="text"
                value={room}
                onChange={(e) => setRoom(e.target.value)}
                placeholder="напр. Каб. 201 (Бухгалтерия)"
                className={`w-full text-xs px-3 py-2 rounded-xl border focus:border-blue-500 focus:outline-hidden ${
                  isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
                }`}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                Номер розетки на стене
              </label>
              <input
                type="text"
                value={socket}
                onChange={(e) => setSocket(e.target.value)}
                placeholder="напр. Р-1.1"
                className={`w-full text-xs px-3 py-2 rounded-xl border focus:border-blue-500 focus:outline-hidden ${
                  isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
                }`}
              />
            </div>
          </div>
        </div>

        {/* Cable specs */}
        <div className="space-y-4">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <Cable className="w-3.5 h-3.5 text-blue-500" />
            Параметры кабеля (витая пара)
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                Тип кабеля
              </label>
              <select
                value={cableType}
                onChange={(e) => setCableType(e.target.value)}
                className={`w-full text-xs px-2.5 py-2 rounded-xl border focus:border-blue-500 focus:outline-hidden ${
                  isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
                }`}
              >
                {CABLE_TYPES.map(ct => (
                  <option key={ct} value={ct}>{ct}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                Длина трассы
              </label>
              <input
                type="text"
                value={cableLength}
                onChange={(e) => setCableLength(e.target.value)}
                placeholder="напр. 28м"
                className={`w-full text-xs px-3 py-2 rounded-xl border focus:border-blue-500 focus:outline-hidden ${
                  isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
                }`}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                Маркировка кабеля
              </label>
              <input
                type="text"
                value={cableMark}
                onChange={(e) => setCableMark(e.target.value)}
                placeholder="напр. К-201-1"
                className={`w-full text-xs px-3 py-2 rounded-xl border focus:border-blue-500 focus:outline-hidden ${
                  isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
                }`}
              />
            </div>
          </div>
        </div>

        {/* Patch to Switch */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <LinkIcon className="w-3.5 h-3.5 text-blue-500" />
              Коммутация в коммутатор (Патч-корд)
            </h4>
            {isPatched ? (
              <button
                type="button"
                onClick={handleUnpatch}
                className="text-xs text-rose-500 hover:text-rose-600 flex items-center gap-1 cursor-pointer font-medium"
              >
                <Unlink className="w-3 h-3" />
                Отключить патчкорд
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setIsPatched(true);
                  if (allSwitches.length > 0) handleSelectSwitch(allSwitches[0].id);
                }}
                className="text-xs text-blue-500 hover:text-blue-600 flex items-center gap-1 cursor-pointer font-medium"
              >
                <LinkIcon className="w-3 h-3" />
                Скоммутировать
              </button>
            )}
          </div>

          {isPatched && (
            <div className={`p-4 rounded-xl border space-y-4 ${
              isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
            }`}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Switch selector */}
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                    Коммутатор
                  </label>
                  <select
                    value={connectedSwitchId}
                    onChange={(e) => handleSelectSwitch(e.target.value)}
                    className={`w-full text-xs px-2.5 py-2 rounded-xl border focus:border-blue-500 focus:outline-hidden ${
                      isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
                    }`}
                  >
                    {allSwitches.map(sw => (
                      <option key={sw.id} value={sw.id}>
                        {sw.name} ({sw.vendor} {sw.model})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Switch Port selector */}
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                    Порт коммутатора
                  </label>
                  <select
                    value={connectedSwitchPortId}
                    onChange={(e) => setConnectedSwitchPortId(e.target.value)}
                    className={`w-full text-xs px-2.5 py-2 rounded-xl border focus:border-blue-500 focus:outline-hidden ${
                      isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
                    }`}
                  >
                    {selectedSwitch?.ports?.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name || 'Порт ' + p.number} {p.pvid ? `(VLAN ${p.pvid})` : ''} {p.connectedTo ? `[${p.connectedTo}]` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Patch cord color & length */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                    Цвет патч-корда
                  </label>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {PATCH_CORD_COLORS.map(c => (
                      <button
                        type="button"
                        key={c.color}
                        title={c.name}
                        onClick={() => setPatchCordColor(c.color)}
                        className={`w-6 h-6 rounded-full border-2 transition-transform cursor-pointer ${
                          patchCordColor === c.color ? 'scale-120 border-white ring-2 ring-blue-500' : 'border-transparent hover:scale-110'
                        }`}
                        style={{ backgroundColor: c.color }}
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                    Длина патч-корда
                  </label>
                  <select
                    value={patchCordLength}
                    onChange={(e) => setPatchCordLength(e.target.value)}
                    className={`w-full text-xs px-2.5 py-2 rounded-xl border focus:border-blue-500 focus:outline-hidden ${
                      isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
                    }`}
                  >
                    {PATCH_CORD_LENGTHS.map(l => (
                      <option key={l} value={l}>{l}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Status & Description */}
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                Статус порта
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className={`w-full text-xs px-2.5 py-2 rounded-xl border focus:border-blue-500 focus:outline-hidden ${
                  isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
                }`}
              >
                <option value="free">Свободен</option>
                <option value="connected">Скоммутирован</option>
                <option value="reserved">В резерве</option>
                <option value="damaged">Поврежден / Обрыв</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                Назначение / Описание
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="напр. ПК Главбуха + Телефон"
                className={`w-full text-xs px-3 py-2 rounded-xl border focus:border-blue-500 focus:outline-hidden ${
                  isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
                }`}
              />
            </div>
          </div>
        </div>

        {/* Virtual TDR Cable Diagnostics */}
        <VirtualTdrTester
          portNumber={targetPort.number}
          portName={`П${targetPort.number}`}
          connectedSocket={socket || `Р-${targetPort.number}`}
          cableLength={cableLength || '25м'}
          speed="1G"
          theme={theme}
        />

        {/* Actions */}
        <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
          >
            Отмена
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-medium flex items-center gap-1.5 shadow-md shadow-blue-500/20 cursor-pointer transition-colors disabled:opacity-50"
          >
            <Check className="w-4 h-4" />
            {loading ? 'Сохранение...' : 'Сохранить изменения'}
          </button>
        </div>
      </form>
    </div>
  );
}
