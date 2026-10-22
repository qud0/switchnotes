import { Client } from 'ldapts';
import dns from 'node:dns';

/**
 * Converts Active Directory 64-bit Windows FileTime (100-nanosecond intervals since Jan 1, 1601 UTC)
 * to a standard JavaScript Date object.
 */
export function fileTimeToDate(fileTime) {
  if (!fileTime || fileTime === '0' || fileTime === 0) return null;
  try {
    const ftBig = BigInt(fileTime);
    // 11644473600000 milliseconds between 1601-01-01 and 1970-01-01
    const msSinceEpoch = (ftBig / 10000n) - 11644473600000n;
    const date = new Date(Number(msSinceEpoch));
    return isNaN(date.getTime()) ? null : date;
  } catch {
    return null;
  }
}

/**
 * Extracts a domain name from a Base DN (e.g., 'DC=corp,DC=local' -> 'corp.local')
 */
export function baseDnToDomain(baseDn = '') {
  const parts = baseDn
    .split(',')
    .map(p => p.trim())
    .filter(p => p.toUpperCase().startsWith('DC='))
    .map(p => p.substring(3));
  return parts.join('.');
}

/**
 * Checks if an IPv4 address is inside a CIDR subnet (e.g. '192.168.20.0/24')
 */
export function isIpInSubnet(ip, cidr) {
  if (!ip || !cidr || !cidr.includes('/')) return false;
  try {
    const [netStr, prefixStr] = cidr.trim().split('/');
    const prefix = parseInt(prefixStr, 10);
    if (isNaN(prefix) || prefix < 0 || prefix > 32) return false;

    const ipToLong = (addr) => addr.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
    const ipL = ipToLong(ip);
    const netL = ipToLong(netStr);
    const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;

    return (ipL & mask) === (netL & mask);
  } catch {
    return false;
  }
}

/**
 * Resolves a hostname with a custom DNS server and a timeout.
 */
export async function resolveHostIp(hostname, dnsServerIp, timeoutMs = 2500) {
  if (!hostname) return null;
  const resolver = new dns.promises.Resolver();
  if (dnsServerIp) {
    try {
      resolver.setServers([dnsServerIp]);
    } catch {
      // fallback to system default
    }
  }

  const resolvePromise = resolver.resolve4(hostname).then(ips => (ips && ips.length > 0 ? ips[0] : null));
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('DNS Timeout')), timeoutMs)
  );

  try {
    return await Promise.race([resolvePromise, timeoutPromise]);
  } catch {
    return null;
  }
}

export class AdSyncService {
  constructor() {
    this.storage = null;
    this.timer = null;
    this.isSyncing = false;
  }

  init(storage) {
    this.storage = storage;
    this.scheduleNextRun();
    console.log('[AdSyncService] Служба синхронизации Active Directory инициализирована');
  }

  scheduleNextRun() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    if (!this.storage) return;
    const settings = this.storage.getAdSettings();
    if (!settings.enabled || !settings.autoSyncEnabled) return;

    const intervalHours = Math.max(1, parseInt(settings.syncIntervalHours) || 6);
    const intervalMs = intervalHours * 60 * 60 * 1000;

    this.timer = setTimeout(async () => {
      try {
        console.log('[AdSyncService] Запуск плановой автосинхронизации с Active Directory...');
        await this.syncAdToIpam();
      } catch (err) {
        console.error('[AdSyncService] Ошибка фоновой автосинхронизации:', err.message);
      } finally {
        this.scheduleNextRun();
      }
    }, intervalMs);
    this.timer.unref();
  }

  /**
   * Connect and authenticate to LDAP/LDAPS.
   */
  async createLdapClient(settings) {
    const server = (settings.server || '').trim();
    if (!server) throw new Error('Не указан адрес контроллера домена (DC/LDAP)');

    const port = parseInt(settings.port) || (settings.useTls ? 636 : 389);
    const protocol = settings.useTls ? 'ldaps' : 'ldap';
    const url = `${protocol}://${server}:${port}`;

    const client = new Client({
      url,
      timeout: 10000,
      connectTimeout: 8000,
      tlsOptions: {
        rejectUnauthorized: false
      }
    });

    const bindDn = (settings.bindDn || '').trim();
    const password = settings.password || '';

    if (bindDn) {
      await client.bind(bindDn, password);
    } else {
      await client.bind('', ''); // anonymous bind
    }

    return client;
  }

  /**
   * Tests LDAP connection and credentials.
   */
  async testConnection(settings) {
    const startTime = Date.now();
    let client = null;
    try {
      client = await this.createLdapClient(settings);
      const elapsed = Date.now() - startTime;
      return {
        ok: true,
        responseTimeMs: elapsed,
        message: `Успешное подключение к контроллеру домена за ${elapsed} мс`
      };
    } catch (err) {
      return {
        ok: false,
        message: `Ошибка подключения: ${err.message}`
      };
    } finally {
      if (client) {
        try {
          await client.unbind();
        } catch {}
      }
    }
  }

  /**
   * Searches Active Directory for computer accounts and attempts DNS resolution.
   */
  async queryAdComputers(settings) {
    const baseDn = (settings.baseDn || '').trim();
    if (!baseDn) throw new Error('Не указан Base DN (например, DC=corp,DC=local)');

    const searchBase = (settings.searchBase || '').trim() || baseDn;
    const filterInactiveDays = parseInt(settings.filterInactiveDays) || 0;
    const dnsServer = (settings.dnsServer || '').trim() || (settings.server || '').trim();
    const domainFallback = baseDnToDomain(baseDn);

    let client = null;
    const computers = [];

    try {
      client = await this.createLdapClient(settings);

      // Filter: only computer objects, not disabled accounts
      const searchFilter = '(&(objectClass=computer)(!(userAccountControl:1.2.840.113556.1.4.803:=2)))';

      const searchOptions = {
        scope: 'sub',
        filter: searchFilter,
        attributes: [
          'cn',
          'dNSHostName',
          'description',
          'operatingSystem',
          'operatingSystemVersion',
          'lastLogonTimestamp',
          'pwdLastSet',
          'whenCreated',
          'whenChanged',
          'distinguishedName'
        ],
        paged: { pageSize: 500 }
      };

      const result = await client.search(searchBase, searchOptions);
      const now = Date.now();
      const maxAgeMs = filterInactiveDays > 0 ? filterInactiveDays * 24 * 60 * 60 * 1000 : 0;

      for (const entry of result.searchEntries) {
        const cn = entry.cn ? String(entry.cn) : '';
        const dNSHostName = entry.dNSHostName ? String(entry.dNSHostName) : '';
        const description = entry.description ? (Array.isArray(entry.description) ? entry.description.join('; ') : String(entry.description)) : '';
        const os = entry.operatingSystem ? `${entry.operatingSystem} ${entry.operatingSystemVersion || ''}`.trim() : '';

        // Calculate last logon date
        const lastLogonDate = fileTimeToDate(entry.lastLogonTimestamp) || fileTimeToDate(entry.pwdLastSet);

        // Filter inactive accounts
        let isInactive = false;
        if (maxAgeMs > 0 && lastLogonDate) {
          if (now - lastLogonDate.getTime() > maxAgeMs) {
            isInactive = true;
          }
        }

        computers.push({
          cn,
          hostname: dNSHostName || (cn && domainFallback ? `${cn}.${domainFallback}` : cn),
          rawDns: dNSHostName,
          description,
          os,
          dn: entry.distinguishedName || '',
          lastLogon: lastLogonDate ? lastLogonDate.toISOString() : null,
          isInactive
        });
      }
    } finally {
      if (client) {
        try {
          await client.unbind();
        } catch {}
      }
    }

    // Filter active items
    const activeComputers = computers.filter(c => !c.isInactive);

    // Concurrently resolve DNS in batches of 15
    const batchSize = 15;
    const resolvedList = [];

    for (let i = 0; i < activeComputers.length; i += batchSize) {
      const batch = activeComputers.slice(i, i + batchSize);
      const promises = batch.map(async (comp) => {
        let ip = null;
        if (comp.hostname) {
          ip = await resolveHostIp(comp.hostname, dnsServer);
        }
        if (!ip && comp.rawDns && comp.rawDns !== comp.hostname) {
          ip = await resolveHostIp(comp.rawDns, dnsServer);
        }
        return {
          ...comp,
          ip: ip || null
        };
      });

      const batchResults = await Promise.all(promises);
      resolvedList.push(...batchResults);
    }

    return {
      totalFound: computers.length,
      inactiveSkipped: computers.length - activeComputers.length,
      activeCount: activeComputers.length,
      items: resolvedList
    };
  }

  /**
   * Previews computers and matches them to VLANs and existing IPAM records.
   */
  async previewAdSync(settingsOverride = null) {
    const settings = settingsOverride || this.storage.getAdSettings();
    const queryResult = await this.queryAdComputers(settings);

    const vlans = this.storage.getVlans();
    const existingAllocations = this.storage.getIpAllocations();

    const targetVlanId = settings.targetVlanId ? parseInt(settings.targetVlanId) : null;

    const previewItems = queryResult.items.map(item => {
      let matchedVlan = null;
      if (item.ip) {
        // Try to match VLAN by CIDR subnet
        matchedVlan = vlans.find(v => v.subnet && isIpInSubnet(item.ip, v.subnet));
      }

      const vlanId = matchedVlan ? matchedVlan.id : (targetVlanId || 1);
      const vlanName = matchedVlan ? matchedVlan.name : (vlans.find(v => v.id === vlanId)?.name || 'Default');

      // Check against existing IPAM record
      const existing = item.ip ? existingAllocations.find(a => a.ip === item.ip && a.vlanId === vlanId) : null;

      let action = 'skip_no_ip';
      if (item.ip) {
        if (!existing) {
          action = 'create';
        } else if (existing.hostname !== item.hostname) {
          action = 'update_hostname';
        } else {
          action = 'update_metadata';
        }
      }

      // Determine suggested device type
      let type = 'workstation';
      const osLower = (item.os || '').toLowerCase();
      const hostLower = (item.hostname || '').toLowerCase();
      if (osLower.includes('server') || hostLower.startsWith('srv-') || hostLower.startsWith('dc')) {
        type = 'server';
      }

      return {
        cn: item.cn,
        hostname: item.hostname,
        ip: item.ip,
        vlanId,
        vlanName,
        type,
        os: item.os,
        description: item.description,
        lastLogon: item.lastLogon,
        action,
        existingRecord: existing || null
      };
    });

    return {
      totalFound: queryResult.totalFound,
      inactiveSkipped: queryResult.inactiveSkipped,
      withIpCount: previewItems.filter(i => !!i.ip).length,
      toCreateCount: previewItems.filter(i => i.action === 'create').length,
      toUpdateCount: previewItems.filter(i => i.action.startsWith('update')).length,
      items: previewItems
    };
  }

  /**
   * Executes the synchronization to IPAM.
   */
  async syncAdToIpam(settingsOverride = null) {
    if (this.isSyncing) {
      throw new Error('Синхронизация уже выполняется');
    }
    this.isSyncing = true;

    try {
      const settings = settingsOverride || this.storage.getAdSettings();
      const preview = await this.previewAdSync(settings);

      let created = 0;
      let updated = 0;

      for (const item of preview.items) {
        if (!item.ip) continue;

        if (item.action === 'create') {
          try {
            this.storage.createIpAllocation({
              ip: item.ip,
              vlanId: item.vlanId,
              hostname: item.hostname,
              type: item.type,
              status: 'active',
              description: item.description || `Импортировано из AD (${item.os || 'Windows'})`,
              location: 'Active Directory',
              adSync: true,
              adDomain: baseDnToDomain(settings.baseDn),
              adOs: item.os,
              adLastLogon: item.lastLogon,
              adSyncTime: new Date().toISOString()
            });
            created++;
          } catch (err) {
            console.warn(`[AdSyncService] Пропущен IP ${item.ip}:`, err.message);
          }
        } else if (item.action.startsWith('update') && item.existingRecord) {
          try {
            this.storage.updateIpAllocation(item.existingRecord.id, {
              hostname: item.hostname,
              description: item.description || item.existingRecord.description,
              adSync: true,
              adDomain: baseDnToDomain(settings.baseDn),
              adOs: item.os || item.existingRecord.adOs,
              adLastLogon: item.lastLogon || item.existingRecord.adLastLogon,
              adSyncTime: new Date().toISOString()
            });
            updated++;
          } catch (err) {
            console.warn(`[AdSyncService] Ошибка обновления IP ${item.ip}:`, err.message);
          }
        }
      }

      // Update storage adSettings with sync metadata
      const updatedSettings = this.storage.updateAdSettings({
        lastSync: new Date().toISOString(),
        lastStatus: 'success',
        lastCount: created + updated,
        lastCreated: created,
        lastUpdated: updated,
        lastError: null
      });

      this.storage.logAction(
        'ad_sync',
        'ipam',
        `Синхронизация с Active Directory: добавлено ${created}, обновлено ${updated} IP-адресов`,
        { created, updated, totalInAd: preview.totalFound }
      );

      return {
        success: true,
        created,
        updated,
        totalInAd: preview.totalFound,
        settings: updatedSettings
      };
    } catch (err) {
      this.storage.updateAdSettings({
        lastSync: new Date().toISOString(),
        lastStatus: 'error',
        lastError: err.message
      });
      throw err;
    } finally {
      this.isSyncing = false;
    }
  }
}

export const adSyncService = new AdSyncService();
