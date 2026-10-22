import React, { useState } from 'react';
import { X, Plus, Trash2, Edit2, Check, Tag } from 'lucide-react';
import { api } from '../api';

const PRESET_COLORS = [
  '#ef4444',
  '#f97316',
  '#f59e0b',
  '#10b981',
  '#06b6d4',
  '#3b82f6',
  '#6366f1',
  '#8b5cf6',
  '#d946ef',
  '#f43f5e',
  '#64748b',
  '#14b8a6'
];

export function VlanModal({ isOpen, onClose, vlans, onVlansUpdated, theme = 'dark' }) {
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({ id: '', name: '', color: '#3b82f6', description: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;
  const isLight = theme === 'light';

  const handleStartCreate = () => {
    setEditingId('new');
    setFormData({
      id: '',
      name: '',
      color: PRESET_COLORS[Math.floor(Math.random() * PRESET_COLORS.length)],
      description: ''
    });
    setError('');
  };

  const handleStartEdit = (vlan) => {
    setEditingId(vlan.id);
    setFormData({
      id: vlan.id,
      name: vlan.name,
      color: vlan.color,
      description: vlan.description || ''
    });
    setError('');
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setError('');
    const vlanId = parseInt(formData.id);
    if (isNaN(vlanId) || vlanId < 1 || vlanId > 4094) {
      setError('Номер VLAN должен быть числом от 1 до 4094');
      return;
    }

    try {
      setLoading(true);
      if (editingId === 'new') {
        await api.createVlan({
          id: vlanId,
          name: formData.name.trim() || `VLAN ${vlanId}`,
          color: formData.color,
          description: formData.description.trim()
        });
      } else {
        await api.updateVlan(editingId, {
          name: formData.name.trim() || `VLAN ${vlanId}`,
          color: formData.color,
          description: formData.description.trim()
        });
      }
      setEditingId(null);
      await onVlansUpdated();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm(`Вы уверены, что хотите удалить VLAN ${id}?`)) return;
    try {
      setLoading(true);
      await api.deleteVlan(id);
      await onVlansUpdated();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
      <div className={`border rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden transition-colors ${
        isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-700/80 text-slate-100'
      }`}>
        {/* Header */}
        <div className={`px-6 py-4 border-b flex items-center justify-between ${
          isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/50 border-slate-800'
        }`}>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-500/10 rounded-lg text-blue-500">
              <Tag className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Справочник VLAN</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Цвета и названия VLAN используются на всех коммутаторах</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-500 text-sm">
              {error}
            </div>
          )}

          {/* Form */}
          {editingId !== null && (
            <form onSubmit={handleSave} className={`p-4 rounded-xl border space-y-4 ${
              isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-800/60 border-slate-700'
            }`}>
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-200">
                {editingId === 'new' ? 'Добавить новый VLAN' : `Редактировать VLAN ${editingId}`}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">VLAN ID (1-4094)</label>
                  <input
                    type="number"
                    min="1"
                    max="4094"
                    disabled={editingId !== 'new'}
                    value={formData.id}
                    onChange={(e) => setFormData({ ...formData, id: e.target.value })}
                    required
                    placeholder="20"
                    className={`w-full border rounded-lg px-3 py-2 text-sm font-mono focus:border-blue-500 focus:outline-hidden disabled:opacity-50 ${
                      isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-900 border-slate-700 text-white'
                    }`}
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs text-slate-500 mb-1">Название VLAN</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Например: Office-Workstations"
                    className={`w-full border rounded-lg px-3 py-2 text-sm focus:border-blue-500 focus:outline-hidden ${
                      isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-900 border-slate-700 text-white'
                    }`}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1">Цвет индикации</label>
                <div className="flex items-center gap-2 flex-wrap">
                  {PRESET_COLORS.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setFormData({ ...formData, color: c })}
                      className={`w-7 h-7 rounded-lg transition-transform ${formData.color === c ? 'scale-125 ring-2 ring-blue-500 ring-offset-2' : 'hover:scale-110'}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                  <input
                    type="color"
                    value={formData.color}
                    onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                    className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0"
                    title="Выбрать свой цвет"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1">Описание / Назначение</label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Где используется или подсеть"
                  className={`w-full border rounded-lg px-3 py-2 text-sm focus:border-blue-500 focus:outline-hidden ${
                    isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-slate-900 border-slate-700 text-white'
                  }`}
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingId(null)}
                  className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-white rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-lg shadow-sm cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  Сохранить
                </button>
              </div>
            </form>
          )}

          {editingId === null && (
            <button
              onClick={handleStartCreate}
              className={`w-full flex items-center justify-center gap-2 py-2.5 px-4 border border-dashed rounded-xl transition-all text-sm font-medium cursor-pointer ${
                isLight
                  ? 'border-slate-300 hover:border-blue-500 text-slate-600 hover:text-blue-600 bg-slate-50 hover:bg-blue-50/50'
                  : 'border-slate-700 hover:border-blue-500/50 text-slate-400 hover:text-blue-400 bg-slate-800/30 hover:bg-blue-500/5'
              }`}
            >
              <Plus className="w-4 h-4" />
              Добавить VLAN
            </button>
          )}

          {/* VLAN List */}
          <div className="space-y-2">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Список VLAN ({vlans.length})
            </div>
            <div className={`divide-y border rounded-xl overflow-hidden ${
              isLight ? 'divide-slate-200 border-slate-200 bg-white' : 'divide-slate-800/80 border-slate-800 bg-slate-950/40'
            }`}>
              {vlans.map((vlan) => (
                <div
                  key={vlan.id}
                  className={`p-3.5 flex items-center justify-between gap-3 transition-colors ${
                    isLight ? 'hover:bg-slate-50' : 'hover:bg-slate-800/40'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className="w-4 h-4 rounded-md shrink-0 shadow-xs"
                      style={{ backgroundColor: vlan.color }}
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`font-mono font-bold text-sm ${isLight ? 'text-slate-900' : 'text-white'}`}>
                          VLAN {vlan.id}
                        </span>
                        <span className={`font-medium text-sm truncate ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                          {vlan.name}
                        </span>
                      </div>
                      {vlan.description && (
                        <div className="text-xs text-slate-500 truncate mt-0.5">{vlan.description}</div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleStartEdit(vlan)}
                      className={`p-1.5 rounded-lg transition-colors ${
                        isLight ? 'text-slate-500 hover:text-blue-600 hover:bg-slate-100' : 'text-slate-400 hover:text-blue-400 hover:bg-slate-800'
                      }`}
                      title="Редактировать"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    {vlan.id !== 1 && (
                      <button
                        onClick={() => handleDelete(vlan.id)}
                        className={`p-1.5 rounded-lg transition-colors ${
                          isLight ? 'text-slate-500 hover:text-red-600 hover:bg-slate-100' : 'text-slate-400 hover:text-red-400 hover:bg-slate-800'
                        }`}
                        title="Удалить"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className={`px-6 py-3 border-t flex justify-end ${
          isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/50 border-slate-800'
        }`}>
          <button
            onClick={onClose}
            className={`px-4 py-2 rounded-lg text-sm transition-colors cursor-pointer ${
              isLight ? 'bg-slate-200 hover:bg-slate-300 text-slate-800' : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
            }`}
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}
