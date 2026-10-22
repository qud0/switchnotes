import React, { useState, useMemo } from 'react';
import { 
  BookOpen, Plus, Search, Pin, Trash2, Edit3, X, Check,
  Tag, Calendar, Sparkles, FileText, Code, CheckSquare
} from 'lucide-react';
import { api } from '../api';

export default function NotesView({ notes = [], onReloadNotes, theme = 'dark' }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingNote, setEditingNote] = useState(null);

  // Form state
  const [formTitle, setFormTitle] = useState('');
  const [formCategory, setFormCategory] = useState('СКС');
  const [formColor, setFormColor] = useState('#3b82f6');
  const [formPinned, setFormPinned] = useState(false);
  const [formContent, setFormContent] = useState('');

  const categories = useMemo(() => {
    const set = new Set(['СКС', 'VLAN', 'MikroTik', 'SNR', 'Ubiquiti', 'Регламент']);
    notes.forEach(n => { if (n.category) set.add(n.category); });
    return Array.from(set);
  }, [notes]);

  const filteredNotes = useMemo(() => {
    let list = [...notes];
    if (selectedCategory !== 'all') {
      list = list.filter(n => n.category === selectedCategory);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(n => 
        n.title?.toLowerCase().includes(q) ||
        n.content?.toLowerCase().includes(q) ||
        n.category?.toLowerCase().includes(q)
      );
    }

    // Sort: pinned first, then by date desc
    return list.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
    });
  }, [notes, selectedCategory, searchQuery]);

  const handleOpenNewNote = () => {
    setEditingNote(null);
    setFormTitle('');
    setFormCategory('СКС');
    setFormColor('#3b82f6');
    setFormPinned(false);
    setFormContent('');
    setIsModalOpen(true);
  };

  const handleOpenEditNote = (note) => {
    setEditingNote(note);
    setFormTitle(note.title || '');
    setFormCategory(note.category || 'СКС');
    setFormColor(note.color || '#3b82f6');
    setFormPinned(Boolean(note.pinned));
    setFormContent(note.content || '');
    setIsModalOpen(true);
  };

  const handleSaveNote = async (e) => {
    e.preventDefault();
    if (!formTitle.trim()) return;

    const payload = {
      title: formTitle.trim(),
      category: formCategory.trim() || 'Общее',
      color: formColor,
      pinned: formPinned,
      content: formContent.trim()
    };

    try {
      if (editingNote) {
        await api.updateNote(editingNote.id, payload);
      } else {
        await api.createNote(payload);
      }
      setIsModalOpen(false);
      onReloadNotes();
    } catch (err) {
      alert(`Ошибка сохранения заметки: ${err.message}`);
    }
  };

  const handleDeleteNote = async (id, title) => {
    if (!window.confirm(`Удалить заметку "${title}"?`)) return;
    try {
      await api.deleteNote(id);
      onReloadNotes();
    } catch (err) {
      alert(`Ошибка удаления заметки: ${err.message}`);
    }
  };

  const insertSnippet = (snippet) => {
    setFormContent(prev => prev + '\n' + snippet);
  };

  return (
    <div className="space-y-6">
      {/* Top Controls Toolbar */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-xl backdrop-blur-md">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white tracking-wide flex items-center gap-2">
                Инженерный блокнот
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20 font-semibold">
                  Notes & Cheatsheets
                </span>
              </h1>
              <p className="text-xs text-slate-400">
                Памятки по CLI, регламенты маркировки СКС, схемы обжима и настройки VLAN
              </p>
            </div>
          </div>

          <button
            onClick={handleOpenNewNote}
            className="h-9 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs flex items-center gap-1.5 shadow-lg shadow-blue-500/20 transition-all shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Новая заметка</span>
          </button>
        </div>

        {/* Filter bar & Search */}
        <div className="mt-4 pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-slate-400 mr-1 font-semibold">Категория:</span>
            <button
              onClick={() => setSelectedCategory('all')}
              className={`h-8 px-3 rounded-lg text-xs font-medium transition-colors ${
                selectedCategory === 'all'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              Все ({notes.length})
            </button>
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`h-8 px-3 rounded-lg text-xs font-medium transition-colors ${
                  selectedCategory === cat
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Поиск по тексту заметок..."
              className="w-full h-8 pl-8 pr-3 bg-slate-950/80 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Notes Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredNotes.length === 0 ? (
          <div className="col-span-full py-16 text-center text-slate-500 bg-slate-900/40 rounded-2xl border border-dashed border-slate-800">
            <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-30 text-purple-400" />
            <p className="text-sm font-semibold text-slate-300">Заметок не найдено</p>
            <p className="text-xs text-slate-500 mt-1">
              Создайте первую заметку или измените поисковый запрос
            </p>
          </div>
        ) : (
          filteredNotes.map(note => (
            <div 
              key={note.id}
              className={`rounded-2xl border bg-slate-900/90 shadow-xl overflow-hidden flex flex-col justify-between transition-all hover:border-slate-700 ${
                note.pinned ? 'border-purple-500/40' : 'border-slate-800'
              }`}
            >
              {/* Card Header */}
              <div className="p-4 border-b border-slate-800/80 flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span 
                    className="w-3 h-3 rounded-full shrink-0 mt-0.5"
                    style={{ backgroundColor: note.color || '#3b82f6' }}
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-white tracking-wide">
                        {note.title}
                      </h3>
                      {note.pinned && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20">
                          <Pin className="w-2.5 h-2.5" />
                          Закреплено
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-slate-400 font-medium">
                      {note.category} • {note.updatedAt ? new Date(note.updatedAt).toLocaleDateString() : ''}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleOpenEditNote(note)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                    title="Редактировать"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDeleteNote(note.id, note.title)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-800/80 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors"
                    title="Удалить"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Card Content with whitespace & bullet styling */}
              <div className="p-4 text-xs text-slate-300 space-y-2 whitespace-pre-wrap font-sans leading-relaxed flex-1">
                {note.content}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal Add / Edit Note */}
      {isModalOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              if (formTitle.trim() || formContent.trim()) {
                if (!window.confirm('В заметке есть несохраненный текст. Закрыть без сохранения?')) return;
              }
              setIsModalOpen(false);
            }
          }}
        >
          <div className="bg-slate-900 border border-slate-800 w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
              <h2 className="text-base font-semibold text-white">
                {editingNote ? 'Редактирование заметки' : 'Новая инженерная заметка'}
              </h2>
              <button
                type="button"
                onClick={() => {
                  if (formTitle.trim() || formContent.trim()) {
                    if (!window.confirm('В заметке есть несохраненный текст. Закрыть без сохранения?')) return;
                  }
                  setIsModalOpen(false);
                }}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveNote} className="p-6 space-y-4 overflow-y-auto flex-1 text-xs">
              <div>
                <label className="text-slate-300 font-semibold block mb-1">Заголовок заметки:</label>
                <input
                  type="text"
                  required
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="Например: Схема обжима T568B или Команды RouterOS"
                  className="w-full h-10 px-3 bg-slate-950 border border-slate-700 rounded-xl text-white font-medium focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-slate-300 font-semibold block mb-1">Категория:</label>
                  <input
                    type="text"
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    placeholder="СКС, VLAN, MikroTik..."
                    className="w-full h-10 px-3 bg-slate-950 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="text-slate-300 font-semibold block mb-1">Цветовая метка:</label>
                  <div className="flex items-center gap-2 h-10">
                    {['#3b82f6', '#10b981', '#f43f5e', '#8b5cf6', '#f59e0b', '#06b6d4'].map(c => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setFormColor(c)}
                        className={`w-6 h-6 rounded-full border-2 transition-transform ${
                          formColor === c ? 'scale-110 border-white' : 'border-transparent'
                        }`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="pinNote"
                  checked={formPinned}
                  onChange={(e) => setFormPinned(e.target.checked)}
                  className="rounded border-slate-700 text-blue-600 focus:ring-0"
                />
                <label htmlFor="pinNote" className="text-slate-300 cursor-pointer select-none">
                  Закрепить вверху списка (📌 Важная памятка)
                </label>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-slate-300 font-semibold">Содержимое заметки:</label>
                  <div className="flex items-center gap-1.5 text-[11px]">
                    <button
                      type="button"
                      onClick={() => insertSnippet('`show mac-address-table`')}
                      className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 hover:text-white"
                    >
                      + Код
                    </button>
                    <button
                      type="button"
                      onClick={() => insertSnippet('* Пункт списка 1\n* Пункт списка 2')}
                      className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 hover:text-white"
                    >
                      + Список
                    </button>
                  </div>
                </div>
                <textarea
                  rows={9}
                  value={formContent}
                  onChange={(e) => setFormContent(e.target.value)}
                  placeholder="Введите текст заметки, команды CLI, инструкции по настройке..."
                  className="w-full p-3 bg-slate-950 border border-slate-700 rounded-xl text-white font-mono text-xs focus:outline-none focus:border-blue-500 leading-relaxed"
                />
              </div>

              <div className="pt-3 border-t border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="h-9 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="h-9 px-5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold flex items-center gap-1.5 shadow-md shadow-blue-500/20"
                >
                  <Check className="w-4 h-4" />
                  <span>Сохранить</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
