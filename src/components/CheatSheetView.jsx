import React, { useState, useMemo } from 'react';
import {
  BookOpen,
  Search,
  Copy,
  Check,
  Globe,
  Network,
  Shield,
  Layers,
  Zap,
  Tag,
  Hash,
  ArrowRight,
  ExternalLink,
  Info,
  Server,
  Cable,
  Sparkles,
  Sliders
} from 'lucide-react';

// Шпаргалка по портам
const COMMON_PORTS = [
  { port: 20, proto: 'TCP', name: 'FTP-Data', category: 'Передача файлов', desc: 'Передача данных FTP' },
  { port: 21, proto: 'TCP', name: 'FTP-Control', category: 'Передача файлов', desc: 'Управление сессией FTP' },
  { port: 22, proto: 'TCP', name: 'SSH / SFTP', category: 'Удаленный доступ', desc: 'Безопасная оболочка Secure Shell, SCP, SFTP' },
  { port: 23, proto: 'TCP', name: 'Telnet', category: 'Удаленный доступ', desc: 'Нешифрованный терминал (устаревший, небезопасный)' },
  { port: 25, proto: 'TCP', name: 'SMTP', category: 'Почта', desc: 'Пересылка электронной почты между серверами' },
  { port: 53, proto: 'TCP/UDP', name: 'DNS', category: 'Службы', desc: 'Служба доменных имен (Domain Name System)' },
  { port: 67, proto: 'UDP', name: 'DHCP Server', category: 'Службы', desc: 'Сервер автоматической раздачи IP (BOOTP/DHCP)' },
  { port: 68, proto: 'UDP', name: 'DHCP Client', category: 'Службы', desc: 'Клиент получения сетевого адреса по DHCP' },
  { port: 69, proto: 'UDP', name: 'TFTP', category: 'Передача файлов', desc: 'Trivial FTP для загрузки прошивок и конфигов сетевого оборудования' },
  { port: 80, proto: 'TCP', name: 'HTTP', category: 'Веб', desc: 'Незащищенный веб-трафик (World Wide Web)' },
  { port: 88, proto: 'TCP/UDP', name: 'Kerberos', category: 'Аутентификация', desc: 'Служба аутентификации Microsoft Active Directory' },
  { port: 110, proto: 'TCP', name: 'POP3', category: 'Почта', desc: 'Получение почты почтовым клиентом' },
  { port: 123, proto: 'UDP', name: 'NTP', category: 'Службы', desc: 'Синхронизация точного времени (Network Time Protocol)' },
  { port: 143, proto: 'TCP', name: 'IMAP', category: 'Почта', desc: 'Синхронизация папок и сообщений почты' },
  { port: 161, proto: 'UDP', name: 'SNMP', category: 'Мониторинг', desc: 'Опрос телеметрии коммутаторов, роутеров и серверов' },
  { port: 162, proto: 'UDP', name: 'SNMP Trap', category: 'Мониторинг', desc: 'Прием алертов и аварийных сообщений от оборудования' },
  { port: 389, proto: 'TCP/UDP', name: 'LDAP', category: 'Каталог / AD', desc: 'Легковесный протокол доступа к каталогу Active Directory' },
  { port: 443, proto: 'TCP', name: 'HTTPS / TLS', category: 'Веб', desc: 'Защищенный веб-трафик с SSL/TLS шифрованием' },
  { port: 445, proto: 'TCP', name: 'SMB / CIFS', category: 'Файлы', desc: 'Сетевые папки Windows, общие принтеры и ресурсы' },
  { port: 514, proto: 'UDP/TCP', name: 'Syslog', category: 'Логирование', desc: 'Сбор системных журналов и событий оборудования' },
  { port: 636, proto: 'TCP', name: 'LDAPS', category: 'Каталог / AD', desc: 'Защищенный протокол каталога LDAP поверх SSL' },
  { port: 873, proto: 'TCP', name: 'Rsync', category: 'Резервное копирование', desc: 'Синхронизация файлов и бэкапов Linux' },
  { port: 993, proto: 'TCP', name: 'IMAPS', category: 'Почта', desc: 'Защищенный протокол IMAP поверх SSL' },
  { port: 995, proto: 'TCP', name: 'POP3S', category: 'Почта', desc: 'Защищенный протокол POP3 поверх SSL' },
  { port: 1433, proto: 'TCP', name: 'MS SQL Server', category: 'Базы данных', desc: 'СУБД Microsoft SQL Server' },
  { port: 1521, proto: 'TCP', name: 'Oracle DB', category: 'Базы данных', desc: 'Слушатель СУБД Oracle Database' },
  { port: 3306, proto: 'TCP', name: 'MySQL / MariaDB', category: 'Базы данных', desc: 'СУБД MySQL / MariaDB' },
  { port: 3389, proto: 'TCP/UDP', name: 'RDP', category: 'Удаленный доступ', desc: 'Удаленный рабочий стол Windows Remote Desktop' },
  { port: 5060, proto: 'UDP/TCP', name: 'SIP', category: 'Телефония VoIP', desc: 'Инициация сеансов IP-телефонии (Asterisk, FreePBX)' },
  { port: 5061, proto: 'TCP', name: 'SIPS', category: 'Телефония VoIP', desc: 'Защищенная IP-телефония с TLS шифрованием' },
  { port: 5432, proto: 'TCP', name: 'PostgreSQL', category: 'Базы данных', desc: 'СУБД PostgreSQL (в т.ч. сервер 1С:Предприятие)' },
  { port: 5900, proto: 'TCP', name: 'VNC', category: 'Удаленный доступ', desc: 'Графический удаленный доступ Virtual Network Computing' },
  { port: 8006, proto: 'TCP', name: 'Proxmox VE', category: 'Виртуализация', desc: 'Веб-консоль управления гипервизором Proxmox VE' },
  { port: 8080, proto: 'TCP', name: 'HTTP Proxy / Alt', category: 'Веб / Сервисы', desc: 'Альтернативный HTTP порт, прокси-серверы, UniFi Controller' },
  { port: 8291, proto: 'TCP', name: 'MikroTik Winbox', category: 'Сетевое оборудование', desc: 'Фирменная утилита управления RouterOS Winbox' },
  { port: 8443, proto: 'TCP', name: 'UniFi Controller', category: 'Сетевое оборудование', desc: 'Веб-панель управления сетью UniFi / HTTPS' },
  { port: 10050, proto: 'TCP', name: 'Zabbix Agent', category: 'Мониторинг', desc: 'Агент мониторинга Zabbix' },
  { port: 10051, proto: 'TCP', name: 'Zabbix Server', category: 'Мониторинг', desc: 'Трапы и прием данных сервером Zabbix' }
];

// Шпаргалка по маскам подсетей IPv4
const SUBNET_MASKS = [
  { cidr: '/32', mask: '255.255.255.255', wildcard: '0.0.0.0', total: 1, usable: 1, desc: 'Одиночный хост (Loopback, host route)' },
  { cidr: '/31', mask: '255.255.255.254', wildcard: '0.0.0.1', total: 2, usable: 2, desc: 'Point-to-Point линк между маршрутизаторами (RFC 3021)' },
  { cidr: '/30', mask: '255.255.255.252', wildcard: '0.0.0.3', total: 4, usable: 2, desc: 'Классический P2P линк между двумя узлами' },
  { cidr: '/29', mask: '255.255.255.248', wildcard: '0.0.0.7', total: 8, usable: 6, desc: 'Малый блок внешних белых IP / DMZ провайдера' },
  { cidr: '/28', mask: '255.255.255.240', wildcard: '0.0.0.15', total: 16, usable: 14, desc: 'Малая подсеть для серверной стойки или PDU' },
  { cidr: '/27', mask: '255.255.255.224', wildcard: '0.0.0.31', total: 32, usable: 30, desc: 'Подсеть отдела до 30 устройств' },
  { cidr: '/26', mask: '255.255.255.192', wildcard: '0.0.0.63', total: 64, usable: 62, desc: 'Четверть сети класса C (до 62 хостов)' },
  { cidr: '/25', mask: '255.255.255.128', wildcard: '0.0.0.127', total: 128, usable: 126, desc: 'Половина сети класса C (до 126 хостов)' },
  { cidr: '/24', mask: '255.255.255.0', wildcard: '0.0.0.255', total: 256, usable: 254, desc: 'Стандартная подсеть этажа/VLAN (Класс C)' },
  { cidr: '/23', mask: '255.255.254.0', wildcard: '0.0.1.255', total: 512, usable: 510, desc: 'Двойная подсеть (до 510 хостов)' },
  { cidr: '/22', mask: '255.255.252.0', wildcard: '0.0.3.255', total: 1024, usable: 1022, desc: 'Большой кампус / Wi-Fi гостевая сеть (до 1022 хостов)' },
  { cidr: '/21', mask: '255.255.248.0', wildcard: '0.0.7.255', total: 2048, usable: 2046, desc: 'Крупная сеть предприятия (до 2046 хостов)' },
  { cidr: '/20', mask: '255.255.240.0', wildcard: '0.0.15.255', total: 4096, usable: 4094, desc: 'Корпоративная сеть завода (до 4094 хостов)' },
  { cidr: '/16', mask: '255.255.0.0', wildcard: '0.0.255.255', total: 65536, usable: 65534, desc: 'Полный класс B (например, 172.16.0.0/16)' },
  { cidr: '/8', mask: '255.0.0.0', wildcard: '0.255.255.255', total: 16777216, usable: 16777214, desc: 'Полный класс A (например, 10.0.0.0/8)' }
];

// Частные диапазоны RFC 1918 и специальные адреса
const SPECIAL_IPS = [
  { range: '10.0.0.0/8', mask: '255.0.0.0', ips: '10.0.0.0 — 10.255.255.255', rfc: 'RFC 1918 (Класс A)', desc: 'Крупнейший частный диапазон для корпораций и дата-центров (16,7 млн адресов).' },
  { range: '172.16.0.0/12', mask: '255.240.0.0', ips: '172.16.0.0 — 172.31.255.255', rfc: 'RFC 1918 (Класс B)', desc: '16 непрерывных подсетей /16 для филиалов и средних предприятий (1,04 млн адресов).' },
  { range: '192.168.0.0/16', mask: '255.255.0.0', ips: '192.168.0.0 — 192.168.255.255', rfc: 'RFC 1918 (Класс C)', desc: '256 подсетей /24. Самый популярный диапазон для офисов и домашнего оборудования.' },
  { range: '100.64.0.0/10', mask: '255.192.0.0', ips: '100.64.0.0 — 100.127.255.255', rfc: 'RFC 6598 (CGNAT)', desc: 'Carrier-Grade NAT провайдеров для трансляции адресов абонентов.' },
  { range: '127.0.0.0/8', mask: '255.0.0.0', ips: '127.0.0.1 — 127.255.255.254', rfc: 'RFC 1122 (Loopback)', desc: 'Локальная петля хоста (localhost). Пакеты не покидают стек ОС.' },
  { range: '169.254.0.0/16', mask: '255.255.0.0', ips: '169.254.0.1 — 169.254.255.254', rfc: 'RFC 3927 (APIPA / Link-Local)', desc: 'Самоназначение IP при сбое или отсутствии связи с DHCP-сервером.' },
  { range: '224.0.0.0/4', mask: '240.0.0.0', ips: '224.0.0.0 — 239.255.255.255', rfc: 'RFC 5771 (Multicast)', desc: 'Групповая рассылка трафика: OSPF (224.0.0.5/6), RIPv2 (224.0.0.9), PTP, IPTV.' }
];

// Категории витой пары и оптики
const CABLE_STANDARDS = [
  { cat: 'Cat.5e (UTP/FTP)', speed: '1 Гбит/с', freq: '100 МГц', maxLen: '100 метров', use: 'Базовые рабочие места, офисные ПК, VoIP телефоны.' },
  { cat: 'Cat.6 (UTP/STP)', speed: '1-10 Гбит/с', freq: '250 МГц', maxLen: '100м (1G) / 55м (10G)', use: 'Современный офисный стандарт, Wi-Fi 6 точки доступа, камеры CCTV.' },
  { cat: 'Cat.6A (S/FTP)', speed: '10 Гбит/с', freq: '500 МГц', maxLen: '100 метров', use: 'Магистральные линии серверных, 10GBASE-T линки к СХД.' },
  { cat: 'Cat.7 / Cat.7A', speed: '10-40 Гбит/с', freq: '600-1000 МГц', maxLen: '100 метров', use: 'Промышленные помехозащищенные цеха с тяжелым оборудованием.' },
  { cat: 'SMF (Оптика OS2 9/125)', speed: '10-100 Гбит/с', freq: '1310/1550 нм', maxLen: 'До 10-40 км', use: 'Магистрали между зданиями завода (ВОЛС), уличная прокладка.' },
  { cat: 'MMF (Оптика OM3/OM4 50/125)', speed: '10-40 Гбит/с', freq: '850 нм (Laser)', maxLen: '300-550 метров', use: 'Серверные кроссы внутри стойки, высокоскоростные транки к ядру.' }
];

export default function CheatSheetView({ theme = 'dark' }) {
  const isLight = theme === 'light';
  const [activeTab, setActiveTab] = useState('ports'); // 'ports' | 'subnets' | 'special_ips' | 'cables' | 'calc'
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPortCategory, setSelectedPortCategory] = useState('all');
  const [copiedText, setCopiedText] = useState(null);

  // Калькулятор подсетей (мини)
  const [calcIp, setCalcIp] = useState('192.168.10.0');
  const [calcPrefix, setCalcPrefix] = useState(24);

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text);
    setCopiedText(text);
    setTimeout(() => setCopiedText(null), 1800);
  };

  // Расчет параметров подсети для калькулятора
  const subnetCalcResult = useMemo(() => {
    try {
      const parts = calcIp.split('.').map(Number);
      if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) {
        return null;
      }
      const prefix = parseInt(calcPrefix, 10);
      if (isNaN(prefix) || prefix < 0 || prefix > 32) return null;

      const ipNum = ((parts[0] << 24) >>> 0) + ((parts[1] << 16) >>> 0) + ((parts[2] << 8) >>> 0) + (parts[3] >>> 0);
      const maskNum = prefix === 0 ? 0 : ((0xFFFFFFFF << (32 - prefix)) >>> 0);
      const networkNum = (ipNum & maskNum) >>> 0;
      const broadcastNum = (networkNum | (~maskNum >>> 0)) >>> 0;

      const toDotted = (num) => [
        (num >>> 24) & 255,
        (num >>> 16) & 255,
        (num >>> 8) & 255,
        num & 255
      ].join('.');

      const wildcardNum = (~maskNum) >>> 0;
      const totalHosts = Math.pow(2, 32 - prefix);
      const usableHosts = prefix >= 31 ? (prefix === 31 ? 2 : 1) : Math.max(0, totalHosts - 2);

      const firstHost = prefix >= 31 ? toDotted(networkNum) : toDotted(networkNum + 1);
      const lastHost = prefix >= 31 ? toDotted(broadcastNum) : toDotted(broadcastNum - 1);

      return {
        network: toDotted(networkNum),
        netmask: toDotted(maskNum),
        wildcard: toDotted(wildcardNum),
        broadcast: toDotted(broadcastNum),
        firstHost,
        lastHost,
        totalHosts,
        usableHosts
      };
    } catch (e) {
      return null;
    }
  }, [calcIp, calcPrefix]);

  // Фильтрация портов
  const filteredPorts = useMemo(() => {
    return COMMON_PORTS.filter(p => {
      const matchesSearch = !searchQuery || 
        String(p.port).includes(searchQuery) ||
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.desc.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.proto.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesCat = selectedPortCategory === 'all' || p.category === selectedPortCategory;
      return matchesSearch && matchesCat;
    });
  }, [searchQuery, selectedPortCategory]);

  const portCategories = useMemo(() => {
    const set = new Set(COMMON_PORTS.map(p => p.category));
    return ['all', ...Array.from(set)];
  }, []);

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className={`p-6 rounded-2xl border transition-colors shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4 ${
        isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
      }`}>
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-linear-to-tr from-amber-500 to-orange-500 flex items-center justify-center text-white shadow-md shadow-amber-500/20 shrink-0">
            <BookOpen className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Инженерная шпаргалка сетевика
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold font-mono bg-amber-500/10 text-amber-500 border border-amber-500/20">
                Cheat Sheet
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Справочник сетевых портов, масок подсетей IPv4, частных диапазонов RFC 1918, стандартов СКС и калькулятор CIDR
            </p>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className={`p-1 rounded-xl border flex items-center gap-1 overflow-x-auto shrink-0 ${
          isLight ? 'bg-slate-100 border-slate-200' : 'bg-slate-950 border-slate-800'
        }`}>
          <button
            onClick={() => setActiveTab('ports')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'ports'
                ? 'bg-amber-500 text-white shadow-xs'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Hash className="w-3.5 h-3.5" />
            <span>Сетевые порты ({COMMON_PORTS.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('subnets')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'subnets'
                ? 'bg-amber-500 text-white shadow-xs'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Маски подсетей (/32 - /8)</span>
          </button>

          <button
            onClick={() => setActiveTab('calc')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'calc'
                ? 'bg-amber-500 text-white shadow-xs'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>IP-калькулятор CIDR</span>
          </button>

          <button
            onClick={() => setActiveTab('special_ips')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'special_ips'
                ? 'bg-amber-500 text-white shadow-xs'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Диапазоны RFC 1918</span>
          </button>

          <button
            onClick={() => setActiveTab('cables')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'cables'
                ? 'bg-amber-500 text-white shadow-xs'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Cable className="w-3.5 h-3.5" />
            <span>Кабели & Оптика</span>
          </button>
        </div>
      </div>

      {/* --- TAB 1: СЕТЕВЫЕ ПОРТЫ --- */}
      {activeTab === 'ports' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            {/* Search */}
            <div className={`relative w-full sm:w-80 rounded-xl border flex items-center ${
              isLight ? 'bg-white border-slate-300' : 'bg-slate-900 border-slate-800'
            }`}>
              <Search className="w-4 h-4 ml-3 text-slate-400 shrink-0" />
              <input
                type="text"
                placeholder="Поиск по номеру порта или протоколу (ssh, 443, snmp)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-2.5 py-2 text-xs bg-transparent outline-hidden font-mono text-slate-900 dark:text-white"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="mr-2 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Category filter pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
              {portCategories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setSelectedPortCategory(cat)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer shrink-0 ${
                    selectedPortCategory === cat
                      ? 'bg-amber-500 text-white shadow-xs'
                      : isLight
                      ? 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                  }`}
                >
                  {cat === 'all' ? 'Все категории' : cat}
                </button>
              ))}
            </div>
          </div>

          {/* Ports Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {filteredPorts.map(p => (
              <div
                key={`${p.port}-${p.proto}`}
                className={`p-3.5 rounded-xl border transition-all hover:shadow-md group ${
                  isLight
                    ? 'bg-white border-slate-200 hover:border-amber-400'
                    : 'bg-slate-900/80 border-slate-800 hover:border-amber-500/50'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-sm text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20">
                      {p.port}
                    </span>
                    <span className="text-[10px] font-mono font-bold text-slate-400 uppercase">
                      {p.proto}
                    </span>
                  </div>
                  <button
                    onClick={() => handleCopy(`${p.port}`)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-amber-500 cursor-pointer p-1"
                    title="Скопировать порт"
                  >
                    {copiedText === String(p.port) ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>

                <div className="font-mono font-bold text-xs text-slate-900 dark:text-white truncate">
                  {p.name}
                </div>

                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed line-clamp-2" title={p.desc}>
                  {p.desc}
                </div>

                <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800/60 flex items-center justify-between text-[10px]">
                  <span className="text-slate-400 font-medium">Категория:</span>
                  <span className="text-amber-600 dark:text-amber-400 font-semibold">{p.category}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* --- TAB 2: МАСКИ ПОДСЕТЕЙ --- */}
      {activeTab === 'subnets' && (
        <div className={`rounded-2xl border overflow-hidden shadow-sm ${
          isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
        }`}>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className={`border-b font-mono text-[11px] uppercase ${
                  isLight ? 'bg-slate-50 border-slate-200 text-slate-500' : 'bg-slate-950/60 border-slate-800 text-slate-400'
                }`}>
                  <th className="py-3 px-4">Префикс CIDR</th>
                  <th className="py-3 px-4">Маска подсети (Subnet Mask)</th>
                  <th className="py-3 px-4">Обратная маска (Wildcard)</th>
                  <th className="py-3 px-4 text-right">Всего адресов</th>
                  <th className="py-3 px-4 text-right">Полезных хостов</th>
                  <th className="py-3 px-4">Типичное назначение в сети</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
                {SUBNET_MASKS.map(s => (
                  <tr
                    key={s.cidr}
                    className={`hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors ${
                      s.cidr === '/24' ? 'bg-amber-500/5 font-bold' : ''
                    }`}
                  >
                    <td className="py-2.5 px-4">
                      <span className="font-bold text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20">
                        {s.cidr}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-slate-800 dark:text-slate-200 font-semibold">
                      {s.mask}
                    </td>
                    <td className="py-2.5 px-4 text-slate-400">
                      {s.wildcard}
                    </td>
                    <td className="py-2.5 px-4 text-right text-slate-600 dark:text-slate-400">
                      {s.total.toLocaleString()}
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                        {s.usable.toLocaleString()}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 font-sans text-slate-500 dark:text-slate-400 text-[11px]">
                      {s.desc}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* --- TAB 3: IP-КАЛЬКУЛЯТОР CIDR --- */}
      {activeTab === 'calc' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Controls */}
          <div className={`p-5 rounded-2xl border space-y-4 ${
            isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
          }`}>
            <div className="flex items-center gap-2 border-b pb-3 border-slate-200 dark:border-slate-800">
              <Sliders className="w-4 h-4 text-amber-500" />
              <h3 className="font-bold text-sm text-slate-900 dark:text-white">Параметры подсети</h3>
            </div>

            <div>
              <label className="block text-slate-400 text-xs mb-1 font-medium">IP-адрес или подсеть:</label>
              <input
                type="text"
                value={calcIp}
                onChange={(e) => setCalcIp(e.target.value.trim())}
                placeholder="192.168.10.0"
                className={`w-full px-3 py-2 rounded-xl border text-xs font-mono outline-hidden ${
                  isLight ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-slate-950 border-slate-800 text-white'
                }`}
              />
            </div>

            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-slate-400 font-medium">Длина префикса:</span>
                <span className="font-mono font-bold text-amber-500">/{calcPrefix}</span>
              </div>
              <input
                type="range"
                min="8"
                max="32"
                value={calcPrefix}
                onChange={(e) => setCalcPrefix(Number(e.target.value))}
                className="w-full accent-amber-500 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-400 font-mono mt-1">
                <span>/8 (Class A)</span>
                <span>/16 (Class B)</span>
                <span>/24 (Class C)</span>
                <span>/32 (Host)</span>
              </div>
            </div>

            {/* Quick buttons */}
            <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
              <span className="text-[11px] text-slate-400 mb-2 block">Быстрые префиксы:</span>
              <div className="grid grid-cols-4 gap-1.5 font-mono text-xs">
                {[24, 25, 26, 27, 28, 29, 30, 31].map(p => (
                  <button
                    key={p}
                    onClick={() => setCalcPrefix(p)}
                    className={`py-1 rounded-lg border text-center transition-colors cursor-pointer ${
                      calcPrefix === p
                        ? 'bg-amber-500 text-white border-amber-500 font-bold'
                        : isLight
                        ? 'bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-700'
                        : 'bg-slate-950 border-slate-800 hover:bg-slate-850 text-slate-300'
                    }`}
                  >
                    /{p}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Results display */}
          <div className={`lg:col-span-2 p-5 rounded-2xl border ${
            isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
          }`}>
            <div className="flex items-center justify-between border-b pb-3 border-slate-200 dark:border-slate-800 mb-4">
              <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                <span>Сетевой расчет</span>
                <span className="font-mono text-xs font-normal text-slate-400">({calcIp}/{calcPrefix})</span>
              </h3>
              {subnetCalcResult && (
                <button
                  onClick={() => handleCopy(`${subnetCalcResult.network}/${calcPrefix}`)}
                  className="text-xs text-amber-500 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Копировать CIDR</span>
                </button>
              )}
            </div>

            {subnetCalcResult ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 font-mono text-xs">
                <div className={`p-3 rounded-xl border ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'}`}>
                  <div className="text-[10px] text-slate-400 font-sans uppercase font-bold">Адрес сети (Network):</div>
                  <div className="text-sm font-bold text-amber-500 mt-0.5">{subnetCalcResult.network}</div>
                </div>

                <div className={`p-3 rounded-xl border ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'}`}>
                  <div className="text-[10px] text-slate-400 font-sans uppercase font-bold">Маска подсети (Netmask):</div>
                  <div className="text-sm font-bold text-slate-800 dark:text-white mt-0.5">{subnetCalcResult.netmask}</div>
                </div>

                <div className={`p-3 rounded-xl border ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'}`}>
                  <div className="text-[10px] text-slate-400 font-sans uppercase font-bold">Первый доступный хост:</div>
                  <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">{subnetCalcResult.firstHost}</div>
                </div>

                <div className={`p-3 rounded-xl border ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'}`}>
                  <div className="text-[10px] text-slate-400 font-sans uppercase font-bold">Последний доступный хост:</div>
                  <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">{subnetCalcResult.lastHost}</div>
                </div>

                <div className={`p-3 rounded-xl border ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'}`}>
                  <div className="text-[10px] text-slate-400 font-sans uppercase font-bold">Широковещательный (Broadcast):</div>
                  <div className="text-sm font-bold text-rose-500 mt-0.5">{subnetCalcResult.broadcast}</div>
                </div>

                <div className={`p-3 rounded-xl border ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'}`}>
                  <div className="text-[10px] text-slate-400 font-sans uppercase font-bold">Обратная маска (Wildcard):</div>
                  <div className="text-sm font-bold text-slate-400 mt-0.5">{subnetCalcResult.wildcard}</div>
                </div>

                <div className={`sm:col-span-2 p-3 rounded-xl border flex items-center justify-between ${
                  isLight ? 'bg-amber-50/60 border-amber-200' : 'bg-amber-950/20 border-amber-900/40'
                }`}>
                  <div>
                    <span className="text-[11px] font-sans text-slate-500 dark:text-slate-400 font-medium">Полезных адресов для устройств:</span>
                    <div className="text-lg font-bold text-amber-500">{subnetCalcResult.usableHosts.toLocaleString()} хостов</div>
                  </div>
                  <div className="text-right">
                    <span className="text-[11px] font-sans text-slate-500 dark:text-slate-400 font-medium">Всего IP в блоке:</span>
                    <div className="text-base font-semibold text-slate-700 dark:text-slate-300">{subnetCalcResult.totalHosts.toLocaleString()}</div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-8 text-center text-slate-400">
                Введите корректный IPv4 адрес (например, 192.168.1.0)
              </div>
            )}
          </div>
        </div>
      )}

      {/* --- TAB 4: ЧАСТНЫЕ ДИАПАЗОНЫ RFC 1918 --- */}
      {activeTab === 'special_ips' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {SPECIAL_IPS.map(item => (
            <div
              key={item.range}
              className={`p-4 rounded-2xl border transition-all ${
                isLight ? 'bg-white border-slate-200 shadow-xs' : 'bg-slate-900 border-slate-800 shadow-md'
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="font-mono font-bold text-sm text-amber-500 bg-amber-500/10 px-2.5 py-0.5 rounded-lg border border-amber-500/20">
                  {item.range}
                </span>
                <span className="text-[11px] font-bold text-slate-400 font-mono">
                  {item.rfc}
                </span>
              </div>

              <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-950 font-mono text-xs space-y-1 mb-2.5">
                <div className="flex items-center justify-between text-slate-500">
                  <span>Диапазон:</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">{item.ips}</span>
                </div>
                <div className="flex items-center justify-between text-slate-500">
                  <span>Маска:</span>
                  <span className="text-slate-400">{item.mask}</span>
                </div>
              </div>

              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                {item.desc}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* --- TAB 5: КАБЕЛИ И СТАНДАРТЫ СКС --- */}
      {activeTab === 'cables' && (
        <div className="space-y-4">
          <div className={`p-4 rounded-2xl border grid grid-cols-1 md:grid-cols-2 gap-4 ${
            isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
          }`}>
            <div className="space-y-2">
              <h4 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
                <Cable className="w-4 h-4 text-blue-500" />
                <span>Схема раскладки витой пары T568B (Прямой кабель)</span>
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Стандарт, принятый в РФ и СНГ для подключения рабочих мест и патч-панелей:
              </p>
              <div className="grid grid-cols-2 gap-1.5 font-mono text-xs">
                <div className="p-1.5 rounded-md bg-orange-500/10 border border-orange-500/30 text-orange-600 dark:text-orange-400 font-bold">1. Бело-оранжевый (Tx+)</div>
                <div className="p-1.5 rounded-md bg-orange-500/20 border border-orange-500/40 text-orange-700 dark:text-orange-300 font-bold">2. Оранжевый (Tx-)</div>
                <div className="p-1.5 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 font-bold">3. Бело-зеленый (Rx+)</div>
                <div className="p-1.5 rounded-md bg-blue-500/20 border border-blue-500/40 text-blue-700 dark:text-blue-300 font-bold">4. Синий</div>
                <div className="p-1.5 rounded-md bg-blue-500/10 border border-blue-500/30 text-blue-600 dark:text-blue-400 font-bold">5. Бело-синий</div>
                <div className="p-1.5 rounded-md bg-emerald-500/20 border border-emerald-500/40 text-emerald-700 dark:text-emerald-300 font-bold">6. Зеленый (Rx-)</div>
                <div className="p-1.5 rounded-md bg-amber-800/10 border border-amber-800/30 text-amber-800 dark:text-amber-600 font-bold">7. Бело-коричневый</div>
                <div className="p-1.5 rounded-md bg-amber-800/20 border border-amber-800/40 text-amber-900 dark:text-amber-500 font-bold">8. Коричневый</div>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-amber-500" />
                <span>Правило 90 + 10 метров (Permanent Link)</span>
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Максимальная протяженность канала Ethernet по витой паре — <strong>100 метров</strong>:
              </p>
              <ul className="text-xs text-slate-600 dark:text-slate-300 space-y-1.5 list-disc list-inside">
                <li><strong>90 метров:</strong> Стационарный кабель (Permanent Link) от патч-панели до розетки в кабель-канале / лотке.</li>
                <li><strong>10 метров:</strong> Суммарная длина гибких патч-кордов (до 5м в шкафу + до 5м на рабочем месте).</li>
                <li><strong>Радиус изгиба:</strong> не менее 4 внешних диаметров кабеля для UTP и не менее 8 для экранированного FTP/STP.</li>
              </ul>
            </div>
          </div>

          {/* Cable types table */}
          <div className={`rounded-2xl border overflow-hidden shadow-sm ${
            isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
          }`}>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className={`border-b font-mono text-[11px] uppercase ${
                    isLight ? 'bg-slate-50 border-slate-200 text-slate-500' : 'bg-slate-950/60 border-slate-800 text-slate-400'
                  }`}>
                    <th className="py-3 px-4">Категория / Тип среды</th>
                    <th className="py-3 px-4">Скорость</th>
                    <th className="py-3 px-4">Частота / Длина волны</th>
                    <th className="py-3 px-4">Предельная дистанция</th>
                    <th className="py-3 px-4">Где применяется на объекте</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
                  {CABLE_STANDARDS.map(c => (
                    <tr key={c.cat} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="py-2.5 px-4 font-bold text-amber-500">
                        {c.cat}
                      </td>
                      <td className="py-2.5 px-4 text-emerald-600 dark:text-emerald-400 font-bold">
                        {c.speed}
                      </td>
                      <td className="py-2.5 px-4 text-slate-400">
                        {c.freq}
                      </td>
                      <td className="py-2.5 px-4 text-slate-700 dark:text-slate-300 font-semibold">
                        {c.maxLen}
                      </td>
                      <td className="py-2.5 px-4 font-sans text-slate-500 dark:text-slate-400 text-[11px]">
                        {c.use}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
