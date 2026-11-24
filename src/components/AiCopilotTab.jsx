import React, { useState, useEffect } from 'react';
import { 
  Bot, Sparkles, AlertTriangle, CheckCircle2, ShieldAlert, 
  Send, RefreshCw, Zap, Wrench, Copy, Check, Terminal, HelpCircle
} from 'lucide-react';
import { api } from '../api';

export default function AiCopilotTab({
  switchId,
  port,
  theme = 'dark'
}) {
  const [loading, setLoading] = useState(true);
  const [diagnosis, setDiagnosis] = useState(null);
  const [chatQuery, setChatQuery] = useState('');
  const [chatHistory, setChatHistory] = useState([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [fixApplied, setFixApplied] = useState(false);
  const [error, setError] = useState(null);

  const isLight = theme === 'light';

  useEffect(() => {
    let active = true;

    async function loadDiagnosis() {
      if (!switchId || !port) return;
      setLoading(true);
      setError(null);
      setFixApplied(false);
      setChatHistory([]);

      try {
        const res = await api.getCopilotDiagnosis(switchId, port.id);
        if (!active) return;
        setDiagnosis(res.diagnosis);
      } catch (err) {
        if (!active) return;
        setError(err.message || 'Ошибка загрузки диагноза AI Copilot');
      } finally {
        if (active) setLoading(false);
      }
    }

    loadDiagnosis();

    return () => {
      active = false;
    };
  }, [switchId, port?.id]);

  const handleAsk = async (e) => {
    e?.preventDefault();
    if (!chatQuery.trim() || chatLoading) return;

    const q = chatQuery.trim();
    setChatQuery('');
    setChatLoading(true);

    setChatHistory(prev => [...prev, { role: 'user', text: q }]);

    try {
      const res = await api.askCopilot(switchId, port.id, q);
      setChatHistory(prev => [...prev, { 
        role: 'copilot', 
        text: res.answer, 
        suggestedScript: res.suggestedScript 
      }]);
    } catch (err) {
      setChatHistory(prev => [...prev, { 
        role: 'copilot', 
        text: `Ошибка: ${err.message}` 
      }]);
    } finally {
      setChatLoading(false);
    }
  };

  const handleApplyFix = async (scriptToRun) => {
    const script = scriptToRun || diagnosis?.remediationScript;
    if (!script) return;

    try {
      await api.applyCopilotFix(switchId, port.id, script);
      setFixApplied(true);
      setTimeout(() => setFixApplied(false), 4000);
    } catch (err) {
      alert(`Ошибка применения исправления: ${err.message}`);
    }
  };

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-slate-400 gap-3 font-sans">
        <Sparkles className="w-6 h-6 animate-spin text-purple-400" />
        <span className="text-xs">AI Copilot анализирует телеметрию порта {port?.name || port?.number}...</span>
      </div>
    );
  }

  if (error || !diagnosis) {
    return (
      <div className="p-6 text-center text-rose-400 font-sans text-xs">
        <AlertTriangle className="w-8 h-8 mx-auto mb-2 opacity-80" />
        <p className="font-semibold">{error || 'Диагностика AI недоступна'}</p>
      </div>
    );
  }

  const isWarning = diagnosis.severity === 'warning';
  const isCritical = diagnosis.severity === 'critical';
  const isOptimal = diagnosis.severity === 'optimal';

  return (
    <div className={`p-4 h-full overflow-y-auto space-y-4 font-sans ${isLight ? 'bg-slate-50 text-slate-800' : 'bg-slate-950 text-slate-200'}`}>
      {/* Copilot Diagnosis Card */}
      <div className={`p-4 rounded-2xl border shadow-lg space-y-3 ${
        isCritical 
          ? 'bg-rose-500/10 border-rose-500/30' 
          : isWarning 
          ? 'bg-amber-500/10 border-amber-500/30' 
          : (isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800')
      }`}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
              isCritical ? 'bg-rose-500/20 text-rose-400' :
              isWarning ? 'bg-amber-500/20 text-amber-400' : 'bg-purple-500/20 text-purple-400'
            }`}>
              <Bot className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
                  <span>{diagnosis.title}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] uppercase font-bold ${
                    isCritical ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' :
                    isWarning ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                    'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  }`}>
                    {diagnosis.severity}
                  </span>
                </h3>
              </div>
              <p className="text-[11px] text-slate-400">
                Интерфейс {diagnosis.portName} • Свитч {diagnosis.switchName}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-lg bg-black/30 text-purple-300 border border-purple-500/20 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-purple-400" />
              <span>Уверенность AI: {diagnosis.confidence}%</span>
            </span>
          </div>
        </div>

        {/* Correlation badges */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
          {diagnosis.correlations.map((cor, i) => (
            <div key={i} className="p-2 rounded-xl bg-black/20 border border-slate-800/80 text-xs">
              <span className="text-[10px] text-slate-400 block">{cor.label}</span>
              <span className={`font-mono font-bold ${
                cor.status === 'critical' ? 'text-rose-400' :
                cor.status === 'warning' ? 'text-amber-400' : 'text-emerald-400'
              }`}>
                {cor.value}
              </span>
            </div>
          ))}
        </div>

        {/* Executive Summary Explanation */}
        <div className="p-3 rounded-xl bg-black/25 text-xs leading-relaxed text-slate-300 border border-slate-800/60">
          <p>{diagnosis.explanation}</p>
        </div>

        {/* Action Plan */}
        {diagnosis.actionPlan && diagnosis.actionPlan.length > 0 && (
          <div className="space-y-1.5 pt-1">
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
              Рекомендуемый порядок устранения:
            </span>
            <ul className="space-y-1 text-xs text-slate-300">
              {diagnosis.actionPlan.map((step, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="w-4 h-4 rounded-full bg-blue-500/20 text-blue-400 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                    {idx + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Remediation CLI Script */}
        {diagnosis.remediationScript && (
          <div className="pt-2 border-t border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5 text-blue-400" />
                Сгенерированный рецепт исправления (CLI):
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => handleCopy(diagnosis.remediationScript)}
                  className="px-2 py-1 rounded-md text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center gap-1 transition-colors"
                >
                  {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copied ? 'Скопировано' : 'Копировать'}</span>
                </button>
                <button
                  onClick={() => handleApplyFix(diagnosis.remediationScript)}
                  className="px-3 py-1 rounded-md text-[11px] font-bold bg-blue-600 hover:bg-blue-500 text-white flex items-center gap-1.5 transition-all shadow-md shadow-blue-500/20"
                >
                  <Zap className="w-3 h-3 text-amber-300" />
                  <span>{fixApplied ? 'Применено!' : 'Применить исправление'}</span>
                </button>
              </div>
            </div>
            <pre className="p-2.5 rounded-xl bg-black/80 font-mono text-[11px] text-emerald-400 overflow-x-auto border border-emerald-950">
              {diagnosis.remediationScript}
            </pre>
          </div>
        )}
      </div>

      {/* Interactive Natural Language Chat */}
      <div className={`p-4 rounded-2xl border space-y-3 ${
        isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
      }`}>
        <div className="flex items-center gap-2 text-xs font-bold text-slate-300">
          <HelpCircle className="w-4 h-4 text-purple-400" />
          <span>Спросить AI Copilot о порте {diagnosis.portName}:</span>
        </div>

        {/* Chat History */}
        {chatHistory.length > 0 && (
          <div className="space-y-2 max-h-48 overflow-y-auto p-2 rounded-xl bg-black/20 text-xs">
            {chatHistory.map((item, idx) => (
              <div key={idx} className={`p-2.5 rounded-xl ${
                item.role === 'user' 
                  ? 'bg-blue-600/20 text-blue-200 ml-6 border border-blue-500/20' 
                  : 'bg-purple-600/20 text-purple-200 mr-6 border border-purple-500/20'
              }`}>
                <div className="font-bold text-[10px] text-slate-400 mb-0.5">
                  {item.role === 'user' ? 'Вы' : 'AI Copilot'}:
                </div>
                <p>{item.text}</p>
                {item.suggestedScript && (
                  <div className="mt-2 pt-2 border-t border-purple-500/30 flex items-center justify-between">
                    <pre className="text-[10px] font-mono text-emerald-300">{item.suggestedScript}</pre>
                    <button
                      onClick={() => handleApplyFix(item.suggestedScript)}
                      className="px-2 py-0.5 rounded text-[10px] bg-purple-600 hover:bg-purple-500 text-white font-semibold"
                    >
                      Применить
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Input form */}
        <form onSubmit={handleAsk} className="flex items-center gap-2">
          <input
            type="text"
            value={chatQuery}
            onChange={(e) => setChatQuery(e.target.value)}
            placeholder="Спросите AI (например: «Почему скорость 100M?», «Как перевести в VLAN 40?»)..."
            className={`flex-1 px-3 py-1.5 text-xs rounded-xl border focus:outline-none focus:border-purple-500 ${
              isLight ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-700 text-slate-100'
            }`}
          />
          <button
            type="submit"
            disabled={!chatQuery.trim() || chatLoading}
            className="h-8 px-4 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm"
          >
            {chatLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            <span>Спросить</span>
          </button>
        </form>
      </div>
    </div>
  );
}
