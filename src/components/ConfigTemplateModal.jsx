import React, { useState, useMemo } from 'react';
import {
  X,
  Code2,
  Copy,
  Check,
  Download,
  Terminal,
  Server,
  Play,
  Layers,
  Sparkles,
  BookOpen,
  Plus,
  Trash2,
  CheckCircle2
} from 'lucide-react';

export const BUILTIN_TEMPLATES = [
  {
    id: 'cisco-access-hardening',
    name: 'Cisco IOS: Защищённый Access-порт (L2 Hardening)',
    vendor: 'Cisco',
    description: 'Шаблон абонентского порта с PortFast, BPDU Guard, DHCP Snooping, Dynamic ARP Inspection и ограничением штормов.',
    template: `! ==============================================================================
! Шаблон безопасного доступа Cisco IOS / Catalyst
! Коммутатор: {{hostname}} (IP: {{mgmt_ip}})
! ==============================================================================
interface {{interface_name}}
 description {{port_description}}
 switchport mode access
 switchport access vlan {{vlan_id}}
 switchport nonegotiate
 spanning-tree portfast
 spanning-tree bpduguard enable
 ip dhcp snooping limit rate 50
 storm-control broadcast level 5.00
 storm-control action shutdown
 no cdp enable
 no shutdown
exit`
  },
  {
    id: 'cisco-trunk-lacp',
    name: 'Cisco IOS: Аплинк LACP (Port-Channel Trunk)',
    vendor: 'Cisco',
    description: 'Агрегированный транк 802.3ad для соединения с ядром сети.',
    template: `interface Port-channel{{channel_group}}
 description UPLINK-TO-CORE-{{hostname}}
 switchport mode trunk
 switchport trunk allowed vlan {{allowed_vlans}}
 switchport trunk native vlan {{native_vlan}}
 spanning-tree guard root
!
interface range {{uplink_ports}}
 channel-group {{channel_group}} mode active
 channel-protocol lacp
 no shutdown
exit`
  },
  {
    id: 'mikrotik-bridge-vlan',
    name: 'MikroTik RouterOS v7: Bridge VLAN & Mgmt',
    vendor: 'MikroTik',
    description: 'Настройка аппаратно-ускоренного моста (Hardware Offload) с фильтрацией VLAN и изолированным управлением.',
    template: `# ==============================================================================
# MikroTik RouterOS v7 - Hardware Bridge VLAN Filtering
# Device: {{hostname}} (Модель: {{model}})
# ==============================================================================
/system identity set name="{{hostname}}"

/interface bridge
add name=bridge vlan-filtering=no protocol-mode=rstp comment="Core Bridge"

/interface bridge port
add bridge=bridge interface={{uplink_port}} pvid={{native_vlan}} comment="Uplink"
add bridge=bridge interface={{access_port}} pvid={{vlan_id}} comment="{{port_description}}"

/interface bridge vlan
add bridge=bridge tagged=bridge,{{uplink_port}} vlan-ids={{mgmt_vlan}}
add bridge=bridge tagged={{uplink_port}} untagged={{access_port}} vlan-ids={{vlan_id}}

/interface vlan
add interface=bridge name=vlan{{mgmt_vlan}}-mgmt vlan-id={{mgmt_vlan}}

/ip address
add address={{mgmt_ip}} interface=vlan{{mgmt_vlan}}-mgmt network={{network_ip}}

/ip route
add dst-address=0.0.0.0/0 gateway={{gateway}}

/interface bridge set bridge vlan-filtering=yes`
  },
  {
    id: 'huawei-hybrid-voice',
    name: 'Huawei VRP: Hybrid Port (Data + Voice VLAN)',
    vendor: 'Huawei',
    description: 'Конфигурация порта с разделением трафика ПК (Native) и IP-телефона с тегированием Voice VLAN.',
    template: `# ==============================================================================
# Huawei VRP Enterprise Port Template
# Switch: {{hostname}}
# ==============================================================================
system-view
sysname {{hostname}}

vlan {{vlan_id}}
 description DATA-USERS
vlan {{voice_vlan}}
 description IP-TELEPHONY-VOICE
quit

interface {{interface_name}}
 description {{port_description}}
 port link-type hybrid
 port hybrid pvid vlan {{vlan_id}}
 port hybrid untagged vlan {{vlan_id}}
 port hybrid tagged vlan {{voice_vlan}}
 voice-vlan {{voice_vlan}} enable
 voice-vlan mode auto
 stp edged-port enable
 loopback-detect enable
 quit`
  },
  {
    id: 'snr-baseline',
    name: 'SNR NAG: Базовый профиль безопасности (AAA, SSH, Syslog)',
    vendor: 'SNR',
    description: 'Первоначальная инициализация коммутаторов SNR S2900 / S300G: отключение Telnet, включение SSHv2, NTP и Syslog.',
    template: `! ==============================================================================
! Базовый профиль безопасности SNR NAG (Comware CLI)
! Хост: {{hostname}}
! ==============================================================================
hostname {{hostname}}
ip ssh server enable
ip ssh version 2
crypto key generate rsa

clock timezone MSK add 03:00:00
sntp server {{ntp_server}}
sntp enable
sntp poll-interval 1800

logging host {{syslog_server}}
logging trap warning

snmp-server community {{snmp_community}} ro
snmp-server enable

spanning-tree mode rstp
spanning-tree bpdu-guard enable`
  },
  {
    id: 'eltex-mes-access',
    name: 'Eltex MES: Мультисервисный порт доступа (L2 + QoS)',
    vendor: 'Eltex',
    description: 'Настройка коммутатора доступа Eltex серии MES2300/MES2400 с привязкой VLAN и защитой от петель.',
    template: `! ==============================================================================
! Eltex MES Access Port Configuration
! Switch: {{hostname}}
! ==============================================================================
interface {{interface_name}}
 description {{port_description}}
 switchport mode access
 switchport access vlan {{vlan_id}}
 spanning-tree portfast
 spanning-tree bpduguard enable
 loopback-detection enable
 qos trust cos
 exit`
  }
];

export function ConfigTemplateModal({
  isOpen,
  onClose,
  switches = [],
  vlans = [],
  theme = 'dark'
}) {
  if (!isOpen) return null;

  const isLight = theme === 'light';

  // State
  const [selectedTemplateId, setSelectedTemplateId] = useState(BUILTIN_TEMPLATES[0].id);
  const [selectedSwitchId, setSelectedSwitchId] = useState(() => switches[0]?.id || '');
  const [selectedVlanId, setSelectedVlanId] = useState(() => vlans[0]?.vlanId || 10);

  // Template editor
  const [templateList, setTemplateList] = useState(() => {
    const saved = localStorage.getItem('switchbook_custom_templates');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return [...BUILTIN_TEMPLATES, ...parsed];
      } catch {
        return BUILTIN_TEMPLATES;
      }
    }
    return BUILTIN_TEMPLATES;
  });

  const activeTemplate = useMemo(() => {
    return templateList.find(t => t.id === selectedTemplateId) || templateList[0];
  }, [templateList, selectedTemplateId]);

  const [currentTemplateText, setCurrentTemplateText] = useState(activeTemplate.template);

  // Re-sync when template changes
  const handleSelectTemplate = (tmpl) => {
    setSelectedTemplateId(tmpl.id);
    setCurrentTemplateText(tmpl.template);
  };

  // Switch context
  const activeSwitch = useMemo(() => {
    return switches.find(s => String(s.id) === String(selectedSwitchId)) || switches[0];
  }, [switches, selectedSwitchId]);

  const activeVlan = useMemo(() => {
    return vlans.find(v => Number(v.vlanId) === Number(selectedVlanId)) || vlans[0] || { vlanId: 10, name: 'Default-VLAN' };
  }, [vlans, selectedVlanId]);

  // Variables Map
  const variables = useMemo(() => {
    const mgmtIp = activeSwitch?.ip || '192.168.10.10';
    const ipParts = mgmtIp.split('.');
    const network = ipParts.length === 4 ? `${ipParts[0]}.${ipParts[1]}.${ipParts[2]}.0` : '192.168.10.0';
    const gateway = ipParts.length === 4 ? `${ipParts[0]}.${ipParts[1]}.${ipParts[2]}.1` : '192.168.10.1';

    return {
      hostname: activeSwitch?.name || 'SW-CORE-01',
      model: activeSwitch?.model || 'Catalyst / CRS',
      vendor: activeSwitch?.vendor || 'Cisco',
      mgmt_ip: mgmtIp,
      network_ip: network,
      gateway: gateway,
      mgmt_vlan: 10,
      vlan_id: activeVlan.vlanId,
      vlan_name: activeVlan.name,
      voice_vlan: 30,
      interface_name: 'GigabitEthernet0/1',
      port_description: `PC-WORKSTATION-VLAN${activeVlan.vlanId}`,
      uplink_ports: 'TenGigabitEthernet0/25-26',
      uplink_port: 'sfp-sfpplus1',
      access_port: 'ether1',
      channel_group: 1,
      native_vlan: 1,
      allowed_vlans: '10,20,30,40,99',
      ntp_server: '192.168.10.1',
      syslog_server: '192.168.10.5',
      snmp_community: 'public'
    };
  }, [activeSwitch, activeVlan]);

  // Render Template with {{variables}}
  const renderedConfig = useMemo(() => {
    let result = currentTemplateText;
    Object.entries(variables).forEach(([key, val]) => {
      const reg = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g');
      result = result.replace(reg, String(val));
    });
    return result;
  }, [currentTemplateText, variables]);

  // Copy state
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(renderedConfig);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Download config file
  const handleDownload = () => {
    const blob = new Blob([renderedConfig], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${variables.hostname}_provision.cfg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-5">
      <div className={`w-full max-w-6xl max-h-[92vh] flex flex-col rounded-2xl border shadow-2xl overflow-hidden ${
        isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-slate-100'
      }`}>
        {/* Header */}
        <div className={`p-4 sm:p-5 border-b flex items-center justify-between shrink-0 ${
          isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/70 border-slate-800'
        }`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
              <Code2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold flex items-center gap-2">
                Генератор конфигураций на шаблонах (Template Engine)
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20">
                  Jinja2 • Mustache • Multi-Vendor
                </span>
              </h2>
              <p className="text-xs text-slate-500">
                Быстрое развёртывание типовых конфигураций с подстановкой реальных параметров из базы данных
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toolbar: Switch Context & VLAN Context */}
        <div className={`p-3 border-b flex flex-wrap items-center justify-between gap-3 shrink-0 ${
          isLight ? 'bg-slate-100/70 border-slate-200' : 'bg-slate-950/40 border-slate-800/80'
        }`}>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5 text-xs">
              <Server className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-slate-400 font-semibold">Коммутатор:</span>
              <select
                value={selectedSwitchId}
                onChange={(e) => setSelectedSwitchId(e.target.value)}
                className="h-8 px-2.5 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono text-xs outline-none focus:border-purple-500 cursor-pointer"
              >
                {switches.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.vendor || 'Switch'}, {s.ip || 'no ip'})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1.5 text-xs">
              <Layers className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-slate-400 font-semibold">Целевой VLAN:</span>
              <select
                value={selectedVlanId}
                onChange={(e) => setSelectedVlanId(Number(e.target.value))}
                className="h-8 px-2.5 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono text-xs outline-none focus:border-purple-500 cursor-pointer"
              >
                {vlans.map(v => (
                  <option key={v.id} value={v.vlanId}>
                    VLAN {v.vlanId} — {v.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="h-8 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Скопировано!' : 'Копировать CLI'}</span>
            </button>
            <button
              onClick={handleDownload}
              className="h-8 px-3 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Скачать .cfg</span>
            </button>
          </div>
        </div>

        {/* Main Body: 2 Columns */}
        <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-slate-800">
          {/* Column 1: Template Selection & Variable Inspector (4 cols) */}
          <div className="lg:col-span-4 p-4 overflow-y-auto space-y-4">
            <div>
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">
                Библиотека шаблонов:
              </span>
              <div className="space-y-1.5">
                {templateList.map(tmpl => {
                  const isSelected = tmpl.id === selectedTemplateId;
                  return (
                    <button
                      key={tmpl.id}
                      type="button"
                      onClick={() => handleSelectTemplate(tmpl)}
                      className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-purple-600/15 border-purple-500/50 shadow-xs'
                          : 'bg-slate-950/60 border-slate-800/80 hover:bg-slate-900'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-[10px] font-mono font-bold px-1.5 py-0.2 rounded border ${
                          tmpl.vendor === 'Cisco'
                            ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                            : tmpl.vendor === 'MikroTik'
                              ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                              : tmpl.vendor === 'Huawei'
                                ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                        }`}>
                          {tmpl.vendor}
                        </span>
                        {isSelected && <Sparkles className="w-3.5 h-3.5 text-purple-400" />}
                      </div>
                      <h4 className="text-xs font-bold text-white line-clamp-1">{tmpl.name}</h4>
                      <p className="text-[11px] text-slate-500 line-clamp-2 mt-0.5 leading-relaxed">
                        {tmpl.description}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Variable Tags Drawer */}
            <div className="pt-2 border-t border-slate-800">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">
                Доступные переменные шаблона:
              </span>
              <div className="space-y-1 font-mono text-[11px]">
                {Object.entries(variables).slice(0, 9).map(([key, val]) => (
                  <div key={key} className="p-1.5 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between">
                    <span className="text-purple-400 font-bold">{'{{' + key + '}}'}</span>
                    <span className="text-slate-300 font-normal truncate max-w-[140px]">{String(val)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Column 2: Template Code Editor & Live Rendered Preview (8 cols) */}
          <div className="lg:col-span-8 flex flex-col h-full overflow-hidden">
            {/* Split Top/Bottom: Editable Source vs Rendered Result */}
            <div className="flex-1 flex flex-col p-4 overflow-hidden space-y-3">
              <div className="flex items-center justify-between shrink-0">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                  Результат генерации CLI (Готово к отправке на свитч):
                </span>
                <span className="text-[11px] text-emerald-400 font-mono">
                  ● Подставлены данные {variables.hostname}
                </span>
              </div>

              {/* Rendered Preview Console */}
              <div className="flex-1 rounded-xl bg-slate-950 border border-slate-800 p-4 font-mono text-xs text-emerald-400 overflow-y-auto leading-relaxed shadow-inner">
                <pre className="whitespace-pre-wrap">{renderedConfig}</pre>
              </div>

              {/* Collapsible raw template editor */}
              <div className="shrink-0 space-y-1.5 pt-2 border-t border-slate-800">
                <span className="text-[11px] text-slate-500 font-semibold block">
                  Исходный код шаблона (поддерживает редактирование):
                </span>
                <textarea
                  value={currentTemplateText}
                  onChange={(e) => setCurrentTemplateText(e.target.value)}
                  rows={4}
                  className="w-full p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 text-slate-300 font-mono text-xs focus:border-purple-500 outline-none resize-none"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className={`p-4 border-t flex items-center justify-between shrink-0 ${
          isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/70 border-slate-800'
        }`}>
          <span className="text-xs text-slate-500">
            Шаблоны сохраняют синтаксис вендоров и поддерживают экспорт в консоль Web-SSH
          </span>

          <button
            type="button"
            onClick={onClose}
            className="h-9 px-5 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs font-semibold cursor-pointer"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}
