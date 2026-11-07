import React, { useState, useEffect } from 'react';
import { X, Check, Layers, MapPin, FileText } from 'lucide-react';
import { useToast } from '../context/ToastContext';

export function PatchPanelModal({
  isOpen,
  onClose,
  panelData = null,
  onSave,
  theme = 'dark'
}) {
  const toast = useToast();
  if (!isOpen) return null;

  const [name, setName] = useState('');
  const [model, setModel] = useState('19" 24xRJ45 Cat.6 UTP 1U');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [portCount, setPortCount] = useState(24);

  useEffect(() => {
    if (panelData) {
      setName(panelData.name || '');
      setModel(panelData.model || '19" 24xRJ45 Cat.6 UTP 1U');
      setLocation(panelData.location || '');
      setNotes(panelData.notes || '');
      setPortCount(panelData.portCount || 24);
    } else {
      setName('');
      setModel('19" 24xRJ45 Cat.6 UTP 1U');
      setLocation('');
      setNotes('');
      setPortCount(24);
    }
  }, [panelData]);

  const handleSafeClose = () => {
    const isDirty =
      name !== (panelData?.name || '') ||
      location !== (panelData?.location || '') ||
      notes !== (panelData?.notes || '');
    if (isDirty) {
      if (!window.confirm('В форме есть несохраненные данные. Закрыть окно без сохранения?')) return;
    }
    onClose();
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.warning('Укажите название патч-панели');
      return;
    }

    onSave({
      name: name.trim(),
      model: model.trim(),
      location: location.trim(),
      notes: notes.trim(),
      portCount: parseInt(portCount) || 24
    });
  };

  const isLight = theme === 'light';

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) handleSafeClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
    >
      <div className={`w-full max-w-lg rounded-2xl border shadow-2xl overflow-hidden transition-colors ${
        isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-slate-100'
      }`}>
        {/* Header */}
        <div className={`px-6 py-4 border-b flex items-center justify-between ${
          isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/70 border-slate-800'
        }`}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {panelData ? 'Редактировать патч-панель' : 'Новая патч-панель'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                19" пассивный кросс для структурированной кабельной системы
              </p>
            </div>
          </div>
          <button
            onClick={handleSafeClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
              Название / Маркировка *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="напр. PP-01 (Этаж 2, Кроссовая 201)"
              className={`w-full text-xs px-3 py-2 rounded-xl border focus:border-blue-500 focus:outline-hidden ${
                isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
              }`}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                Модель / Категория
              </label>
              <input
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="19 24xRJ45 Cat.6 UTP 1U"
                className={`w-full text-xs px-3 py-2 rounded-xl border focus:border-blue-500 focus:outline-hidden ${
                  isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
                }`}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                Количество портов
              </label>
              <select
                disabled={Boolean(panelData)}
                value={portCount}
                onChange={(e) => setPortCount(e.target.value)}
                className={`w-full text-xs px-2.5 py-2 rounded-xl border focus:border-blue-500 focus:outline-hidden ${
                  isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
                }`}
              >
                <option value={24}>24 порта (1U)</option>
                <option value={48}>48 портов (2U)</option>
                <option value={12}>12 портов (10"/мини)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
              Локация и юнит в шкафу
            </label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="напр. 2 этаж, Кроссовая 201, Шкаф ШТВ-1, Unit 13"
              className={`w-full text-xs px-3 py-2 rounded-xl border focus:border-blue-500 focus:outline-hidden ${
                isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
              }`}
            />
            <span className="text-[11px] text-slate-400 mt-1 block">
              Укажите "Unit XX", чтобы патч-панель отображалась в нужном слоте 42U стойки.
            </span>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
              Примечания / Журнал
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Кабели до кабинетов 201-205, разводка T568B..."
              className={`w-full text-xs px-3 py-2 rounded-xl border focus:border-blue-500 focus:outline-hidden ${
                isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'
              }`}
            />
          </div>

          {/* Footer buttons */}
          <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={handleSafeClose}
              className="px-4 py-2 text-xs font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
            >
              Отмена
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-medium flex items-center gap-1.5 shadow-md shadow-blue-500/20 cursor-pointer transition-colors"
            >
              <Check className="w-4 h-4" />
              {panelData ? 'Сохранить изменения' : 'Создать патч-панель'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
