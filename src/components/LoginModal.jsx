import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { X, LogIn, Shield, User, Lock, AlertCircle } from 'lucide-react';

export default function LoginModal({ isOpen, onClose }) {
  const { login, switchRoleQuickly } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError('Заполните логин и пароль');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await login(username.trim(), password);
      onClose();
    } catch (err) {
      setError(err.message || 'Ошибка авторизации');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = async (role) => {
    setLoading(true);
    setError('');
    try {
      await switchRoleQuickly(role);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-md rounded-2xl bg-slate-900 border border-slate-700/80 shadow-2xl p-6 text-white overflow-hidden">
        {/* Декоративное свечение */}
        <div className="absolute -top-16 -right-16 w-36 h-36 bg-blue-500/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 -left-16 w-36 h-36 bg-emerald-500/20 rounded-full blur-3xl pointer-events-none" />

        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Авторизация в системе</h2>
              <p className="text-xs text-slate-400">Управление доступом SwitchBook RBAC</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center gap-2.5 text-sm text-red-300">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Имя пользователя (логин)
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin / engineer / viewer"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-800/80 border border-slate-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm text-white placeholder-slate-500 outline-none transition"
                autoFocus
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Пароль
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-800/80 border border-slate-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm text-white placeholder-slate-500 outline-none transition"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-2.5 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 font-medium text-sm flex items-center justify-center gap-2 transition shadow-lg shadow-blue-600/30 disabled:opacity-50"
          >
            <LogIn className="w-4 h-4" />
            {loading ? 'Вход в систему...' : 'Войти'}
          </button>
        </form>

        {/* Быстрый вход под предустановленными ролями */}
        <div className="mt-6 pt-5 border-t border-slate-800/80">
          <p className="text-xs text-slate-400 mb-3 text-center">
            Быстрый вход под стандартными учетными записями:
          </p>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => handleQuickLogin('admin')}
              className="p-2.5 rounded-xl bg-red-950/40 hover:bg-red-900/50 border border-red-800/50 text-left transition group"
            >
              <div className="text-xs font-bold text-red-300 group-hover:text-red-200">Администратор</div>
              <div className="text-[10px] text-slate-400">admin / admin123</div>
            </button>
            <button
              type="button"
              onClick={() => handleQuickLogin('engineer')}
              className="p-2.5 rounded-xl bg-blue-950/40 hover:bg-blue-900/50 border border-blue-800/50 text-left transition group"
            >
              <div className="text-xs font-bold text-blue-300 group-hover:text-blue-200">Инженер</div>
              <div className="text-[10px] text-slate-400">engineer / engineer123</div>
            </button>
            <button
              type="button"
              onClick={() => handleQuickLogin('viewer')}
              className="p-2.5 rounded-xl bg-slate-800/60 hover:bg-slate-750 border border-slate-700/80 text-left transition group"
            >
              <div className="text-xs font-bold text-slate-300 group-hover:text-slate-200">Наблюдатель</div>
              <div className="text-[10px] text-slate-400">viewer / viewer123</div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
