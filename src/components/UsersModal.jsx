import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { 
  X, Users, UserPlus, Shield, KeyRound, Trash2, Edit3, CheckCircle, 
  AlertCircle, ShieldAlert, Check, RefreshCw 
} from 'lucide-react';

const ROLE_INFO = {
  admin: {
    label: 'Главный администратор',
    badge: 'bg-red-500/20 text-red-300 border-red-500/30',
    desc: 'Полный доступ ко всей системе, пользователям, бэкапам и удалению'
  },
  engineer: {
    label: 'Сетевой инженер',
    badge: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    desc: 'Управление портами, VLAN, кабельным журналом, Web-SSH и диагностикой'
  },
  viewer: {
    label: 'Наблюдатель (Только чтение)',
    badge: 'bg-slate-700/60 text-slate-300 border-slate-600',
    desc: 'Просмотр топологии, лицевых панелей, карты и IPAM без возможности изменений'
  }
};

export default function UsersModal({ isOpen, onClose }) {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Состояние создания нового пользователя
  const [isCreating, setIsCreating] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState('engineer');

  // Состояние редактирования пользователя
  const [editingUser, setEditingUser] = useState(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editRole, setEditRole] = useState('engineer');
  const [editActive, setEditActive] = useState(true);
  const [editPassword, setEditPassword] = useState('');

  const loadUsers = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.getUsers();
      setUsers(data);
    } catch (err) {
      setError(err.message || 'Ошибка загрузки пользователей');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadUsers();
      setIsCreating(false);
      setEditingUser(null);
      setError('');
      setSuccess('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!newUsername.trim() || !newPassword) {
      setError('Логин и пароль обязательны');
      return;
    }
    try {
      await api.createUser({
        username: newUsername.trim(),
        password: newPassword,
        name: newName.trim(),
        email: newEmail.trim(),
        role: newRole
      });
      setSuccess(`Пользователь "${newUsername.trim()}" успешно создан!`);
      setIsCreating(false);
      setNewUsername('');
      setNewPassword('');
      setNewName('');
      setNewEmail('');
      setNewRole('engineer');
      loadUsers();
    } catch (err) {
      setError(err.message || 'Не удалось создать пользователя');
    }
  };

  const startEdit = (u) => {
    setEditingUser(u);
    setEditName(u.name || '');
    setEditEmail(u.email || '');
    setEditRole(u.role || 'viewer');
    setEditActive(u.active !== false);
    setEditPassword('');
    setIsCreating(false);
    setError('');
    setSuccess('');
  };

  const handleUpdateUser = async (e) => {
    e.preventDefault();
    if (!editingUser) return;
    setError('');
    setSuccess('');
    try {
      const payload = {
        name: editName.trim(),
        email: editEmail.trim(),
        role: editRole,
        active: editActive
      };
      if (editPassword.trim()) {
        payload.password = editPassword.trim();
      }
      await api.updateUser(editingUser.id, payload);
      setSuccess(`Учетная запись "${editingUser.username}" успешно обновлена!`);
      setEditingUser(null);
      loadUsers();
    } catch (err) {
      setError(err.message || 'Ошибка обновления пользователя');
    }
  };

  const handleDeleteUser = async (u) => {
    if (!window.confirm(`Вы действительно хотите удалить пользователя "${u.username}" (${u.name})?`)) {
      return;
    }
    setError('');
    setSuccess('');
    try {
      await api.deleteUser(u.id);
      setSuccess(`Пользователь "${u.username}" удален`);
      loadUsers();
    } catch (err) {
      setError(err.message || 'Не удалось удалить пользователя');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative w-full max-w-4xl rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl text-white overflow-hidden my-8">
        {/* Заголовок */}
        <div className="flex items-center justify-between p-6 border-b border-slate-800 bg-slate-900/80">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-purple-600/20 text-purple-400 border border-purple-500/30">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold flex items-center gap-2">
                Управление пользователями и правами (RBAC)
              </h2>
              <p className="text-xs text-slate-400">
                Разграничение доступа для администраторов, инженеров и операторов
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadUsers}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              title="Обновить список"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Уведомления */}
        <div className="px-6 pt-4 space-y-2">
          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center gap-2.5 text-sm text-red-300">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
          )}
          {success && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-2.5 text-sm text-emerald-300">
              <Check className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>{success}</span>
            </div>
          )}
        </div>

        {/* Панель кнопок */}
        <div className="p-6 flex items-center justify-between">
          <div className="text-sm text-slate-400">
            Всего пользователей: <span className="text-white font-semibold">{users.length}</span>
          </div>
          {!isCreating && !editingUser && (
            <button
              onClick={() => setIsCreating(true)}
              className="py-2 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-sm font-medium flex items-center gap-2 transition shadow-lg shadow-blue-600/20"
            >
              <UserPlus className="w-4 h-4" />
              Добавить пользователя
            </button>
          )}
        </div>

        {/* Форма создания нового пользователя */}
        {isCreating && (
          <div className="mx-6 mb-6 p-5 rounded-2xl bg-slate-800/70 border border-blue-500/30">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-sm flex items-center gap-2 text-blue-300">
                <UserPlus className="w-4 h-4" />
                Новая учетная запись
              </h3>
              <button
                type="button"
                onClick={() => setIsCreating(false)}
                className="text-xs text-slate-400 hover:text-white"
              >
                Отмена
              </button>
            </div>
            <form onSubmit={handleCreateUser} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Логин (username) <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    placeholder="ivanov"
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-sm text-white focus:border-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Пароль <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="password"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Минимум 4 символа"
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-sm text-white focus:border-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    ФИО / Отображаемое имя
                  </label>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Иван Иванов"
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-sm text-white focus:border-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="ivanov@company.local"
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-sm text-white focus:border-blue-500 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Назначенная роль (RBAC)
                </label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-1">
                  {Object.entries(ROLE_INFO).map(([rKey, info]) => (
                    <button
                      key={rKey}
                      type="button"
                      onClick={() => setNewRole(rKey)}
                      className={`p-3 rounded-xl border text-left transition ${
                        newRole === rKey
                          ? 'border-blue-500 bg-blue-500/10'
                          : 'border-slate-700 bg-slate-900/50 hover:bg-slate-900'
                      }`}
                    >
                      <div className="text-xs font-bold text-white mb-1 flex items-center justify-between">
                        <span>{info.label}</span>
                        {newRole === rKey && <Check className="w-3.5 h-3.5 text-blue-400" />}
                      </div>
                      <div className="text-[11px] text-slate-400 leading-tight">{info.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="py-2 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 transition"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="py-2 px-5 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-medium text-white transition shadow-lg shadow-blue-600/30"
                >
                  Сохранить пользователя
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Форма редактирования пользователя */}
        {editingUser && (
          <div className="mx-6 mb-6 p-5 rounded-2xl bg-slate-800/70 border border-purple-500/30">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-sm flex items-center gap-2 text-purple-300">
                <Edit3 className="w-4 h-4" />
                Редактирование: {editingUser.username}
              </h3>
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="text-xs text-slate-400 hover:text-white"
              >
                Отмена
              </button>
            </div>
            <form onSubmit={handleUpdateUser} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    ФИО / Отображаемое имя
                  </label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-sm text-white focus:border-purple-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-sm text-white focus:border-purple-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Новый пароль (оставьте пустым, чтобы не менять)
                  </label>
                  <input
                    type="password"
                    value={editPassword}
                    onChange={(e) => setEditPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-sm text-white focus:border-purple-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Статус активности
                  </label>
                  <label className="flex items-center gap-2.5 mt-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editActive}
                      onChange={(e) => setEditActive(e.target.checked)}
                      className="w-4 h-4 rounded text-purple-600 focus:ring-0 bg-slate-900 border-slate-700"
                    />
                    <span className="text-xs text-slate-300">Учетная запись активна</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Роль в системе
                </label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-1">
                  {Object.entries(ROLE_INFO).map(([rKey, info]) => (
                    <button
                      key={rKey}
                      type="button"
                      onClick={() => setEditRole(rKey)}
                      className={`p-3 rounded-xl border text-left transition ${
                        editRole === rKey
                          ? 'border-purple-500 bg-purple-500/10'
                          : 'border-slate-700 bg-slate-900/50 hover:bg-slate-900'
                      }`}
                    >
                      <div className="text-xs font-bold text-white mb-1 flex items-center justify-between">
                        <span>{info.label}</span>
                        {editRole === rKey && <Check className="w-3.5 h-3.5 text-purple-400" />}
                      </div>
                      <div className="text-[11px] text-slate-400 leading-tight">{info.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="py-2 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 transition"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="py-2 px-5 rounded-xl bg-purple-600 hover:bg-purple-500 text-xs font-medium text-white transition shadow-lg shadow-purple-600/30"
                >
                  Применить изменения
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Таблица пользователей */}
        <div className="px-6 pb-6 overflow-x-auto">
          <div className="rounded-xl border border-slate-800 overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-800/80 text-xs text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Пользователь</th>
                  <th className="py-3 px-4">ФИО / Email</th>
                  <th className="py-3 px-4">Роль</th>
                  <th className="py-3 px-4">Статус</th>
                  <th className="py-3 px-4">Последний вход</th>
                  <th className="py-3 px-4 text-right">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 bg-slate-900/40">
                {users.map((u) => {
                  const roleConfig = ROLE_INFO[u.role] || ROLE_INFO.viewer;
                  const isCurrent = currentUser?.id === u.id || currentUser?.username === u.username;

                  return (
                    <tr key={u.id} className="hover:bg-slate-800/40 transition">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-white flex items-center gap-1.5">
                          <span>{u.username}</span>
                          {isCurrent && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
                              Вы
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono">{u.id}</div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-slate-200">{u.name || '—'}</div>
                        <div className="text-xs text-slate-400">{u.email || '—'}</div>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${roleConfig.badge}`}>
                          {roleConfig.label}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        {u.active !== false ? (
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            Активен
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                            Отключен
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-400">
                        {u.lastLogin ? new Date(u.lastLogin).toLocaleString('ru-RU') : 'Никогда'}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => startEdit(u)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
                            title="Редактировать пользователя"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteUser(u)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition"
                            title="Удалить пользователя"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Подвал с памяткой по ролям */}
        <div className="p-4 bg-slate-950/60 border-t border-slate-800 flex flex-col md:flex-row items-center justify-between text-xs text-slate-400 gap-2">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
            <span>Пароли защищены алгоритмом PBKDF2-SHA512 со случайной солью (salt).</span>
          </div>
          <button
            onClick={onClose}
            className="py-1.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-white transition text-xs font-medium"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}
