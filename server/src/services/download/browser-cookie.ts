/**
 * 浏览器 Cookie 自动读取模块
 *
 * v10/v11 Cookie: 使用 DPAPI + AES-256-GCM 解密
 * v20 Cookie (Chrome v127+): 使用 App-Bound Encryption，需要 SYSTEM 权限，无法从用户进程解密
 *
 * 方案:
 * 1. 浏览器关闭时 → 直接读取 SQLite 数据库并解密
 * 2. 浏览器运行时 → 尝试 VSS 复制后读取；若全部 v20 加密则提示关闭浏览器
 */
import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import crypto from 'crypto';

// ======================== 浏览器路径 ========================

interface BrowserInfo {
  name: string;
  cookieDbPath: string;
  localStatePath: string;
}

function getBrowserPaths(): BrowserInfo[] {
  const localAppData = process.env.LOCALAPPDATA || '';

  const browsers: BrowserInfo[] = [];

  const configs = [
    { name: 'Chrome', dataDir: path.join(localAppData, 'Google', 'Chrome', 'User Data') },
    { name: 'Edge', dataDir: path.join(localAppData, 'Microsoft', 'Edge', 'User Data') },
    { name: 'Brave', dataDir: path.join(localAppData, 'BraveSoftware', 'Brave-Browser', 'User Data') },
  ];

  for (const cfg of configs) {
    if (!existsSync(cfg.dataDir)) continue;

    const defaultCookie = path.join(cfg.dataDir, 'Default', 'Network', 'Cookies');
    const localState = path.join(cfg.dataDir, 'Local State');

    if (existsSync(defaultCookie)) {
      browsers.push({ name: cfg.name, cookieDbPath: defaultCookie, localStatePath: localState });
    }

    // 检查其他 Profile
    for (let i = 1; i <= 5; i++) {
      const profileCookie = path.join(cfg.dataDir, `Profile ${i}`, 'Network', 'Cookies');
      if (existsSync(profileCookie)) {
        browsers.push({ name: `${cfg.name} (Profile ${i})`, cookieDbPath: profileCookie, localStatePath: localState });
      }
    }
  }

  return browsers;
}

// ======================== DPAPI 解密 ========================

async function decryptMasterKey(localStatePath: string): Promise<Buffer> {
  const { Dpapi } = await import('@primno/dpapi');
  const content = await fs.readFile(localStatePath, 'utf-8');
  const localState = JSON.parse(content);
  const encryptedKeyB64 = localState.os_crypt?.encrypted_key;
  if (!encryptedKeyB64) throw new Error('未找到加密密钥');

  const encryptedKey = Buffer.from(encryptedKeyB64, 'base64');
  const prefix = encryptedKey.subarray(0, 5).toString('ascii');
  if (prefix !== 'DPAPI') throw new Error('密钥格式不正确');

  const decrypted = Dpapi.unprotectData(encryptedKey.subarray(5), null, 'CurrentUser');
  return Buffer.from(decrypted);
}

// ======================== Cookie 解密 ========================

function decryptCookieValue(encryptedValue: Buffer, key: Buffer): string | null {
  const prefix = encryptedValue.subarray(0, 3).toString('ascii');

  // v10/v11: AES-256-GCM with DPAPI key
  if (prefix === 'v10' || prefix === 'v11') {
    try {
      const nonce = encryptedValue.subarray(3, 15);
      const ciphertext = encryptedValue.subarray(15, encryptedValue.length - 16);
      const authTag = encryptedValue.subarray(encryptedValue.length - 16);

      const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce);
      decipher.setAuthTag(authTag);
      let decrypted = decipher.update(ciphertext);
      decrypted = Buffer.concat([decrypted, decipher.final()]);
      return decrypted.toString('utf-8');
    } catch {
      return null;
    }
  }

  // v20: App-Bound Encryption (Chrome v127+)，无法从用户进程解密
  if (prefix === 'v20') {
    return null;
  }

  // 无前缀: 可能是未加密的旧格式
  try {
    return encryptedValue.toString('utf-8');
  } catch {
    return null;
  }
}

// ======================== 数据库读取 ========================

interface CookieEntry {
  name: string;
  value: string;
  domain: string;
}

async function readCookiesFromDb(
  dbPath: string,
  domain: string,
  key: Buffer,
): Promise<{ cookies: CookieEntry[]; allEncrypted: boolean }> {
  const tmpDir = path.join(path.dirname(dbPath), '.cookie_read_tmp');
  const tmpPath = path.join(tmpDir, 'Cookies');

  try {
    await fs.mkdir(tmpDir, { recursive: true });

    // 尝试直接复制（浏览器关闭时）
    let copied = false;
    try {
      await fs.copyFile(dbPath, tmpPath);
      copied = true;
    } catch {
      // 浏览器运行中，尝试 VSS
      copied = await copyFileViaVss(dbPath, tmpPath);
    }

    if (!copied) {
      throw new Error('无法复制 Cookie 数据库');
    }

    // 复制 WAL/SHM 文件
    const walPath = dbPath + '-wal';
    const shmPath = dbPath + '-shm';
    try { await fs.copyFile(walPath, tmpPath + '-wal'); } catch {}
    try { await fs.copyFile(shmPath, tmpPath + '-shm'); } catch {}

    // 读取数据库
    const Database = (await import('better-sqlite3')).default;
    const db = new Database(tmpPath, { readonly: true });

    try {
      const rows = db.prepare(
        "SELECT name, encrypted_value, host_key FROM cookies WHERE host_key LIKE ? OR host_key LIKE ?"
      ).all(`%${domain}%`, `%.${domain}%`) as any[];

      const cookies: CookieEntry[] = [];
      let v20Count = 0;
      let decryptedCount = 0;

      for (const row of rows) {
        const buf = Buffer.from(row.encrypted_value);
        if (buf.length === 0) continue;

        const prefix = buf.subarray(0, 3).toString('ascii');
        if (prefix === 'v20') {
          v20Count++;
          continue; // 跳过 v20 加密的 Cookie
        }

        const value = decryptCookieValue(buf, key);
        if (value) {
          cookies.push({ name: row.name, value, domain: row.host_key });
          decryptedCount++;
        }
      }

      const allEncrypted = v20Count > 0 && decryptedCount === 0;
      return { cookies, allEncrypted };
    } finally {
      db.close();
    }
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

// ======================== VSS 复制 ========================

async function copyFileViaVss(src: string, dest: string): Promise<boolean> {
  const { execSync } = await import('child_process');
  const destDir = path.dirname(dest);
  const linkDir = path.join(destDir, '.vss_link_' + Date.now());
  const scriptPath = path.join(destDir, '.vss_copy.ps1');

  try {
    await fs.mkdir(destDir, { recursive: true });

    const psScript = `
$ErrorActionPreference = 'Stop'
$src = '${src.replace(/'/g, "''")}'
$dest = '${dest.replace(/'/g, "''")}'
$destDir = '${destDir.replace(/'/g, "''")}'
$linkDir = '${linkDir.replace(/'/g, "''")}'

if (!(Test-Path $destDir)) { New-Item -ItemType Directory -Path $destDir -Force | Out-Null }

$drive = $src.Substring(0, 2) + '\\'
$shadow = Invoke-CimMethod -ClassName Win32_ShadowCopy -MethodName Create -Arguments @{Volume=$drive; Context='ClientAccessible'}
if (-not $shadow.ShadowID) { throw 'VSS failed' }

$device = $null
for ($i = 0; $i -lt 10; $i++) {
  Start-Sleep -Milliseconds 500
  $shadows = Get-CimInstance Win32_ShadowCopy | Sort-Object InstallDate -Descending
  if ($shadows -and $shadows.Count -gt 0) {
    $device = $shadows[0].DeviceObject
    if ($device) { break }
  }
}
if (-not $device) { throw 'VSS device not found' }

cmd /c mklink /D "$linkDir" "$device" 2>&1 | Out-Null
try {
  $shadowSrc = Join-Path $linkDir $src.Substring(2)
  if (Test-Path $shadowSrc) {
    Copy-Item $shadowSrc $dest -Force
    Write-Output 'OK'
  } else {
    throw "File not found in shadow copy"
  }
} finally {
  cmd /c rmdir "$linkDir" 2>&1 | Out-Null
}
`;

    await fs.writeFile(scriptPath, psScript, 'utf-8');
    execSync(
      `powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}"`,
      { stdio: 'pipe', timeout: 30000, encoding: 'utf-8' },
    );
    return existsSync(dest);
  } catch {
    try { execSync(`cmd /c rmdir "${linkDir}" 2>nul`, { stdio: 'pipe' }); } catch {}
    try { await fs.unlink(scriptPath); } catch {}
    return false;
  }
}

// ======================== 导出 ========================

export interface BrowserCookieResult {
  success: boolean;
  browser?: string;
  cookie?: string;
  domains?: string[];
  error?: string;
}

// ======================== CDP 获取 Cookie ========================

/**
 * 通过 Chrome DevTools Protocol 从运行中的浏览器获取 Cookie
 * 需要浏览器启动时带有 --remote-debugging-port 参数
 */
async function readCookieViaCDP(port: number): Promise<BrowserCookieResult> {
  const http = await import('http');

  // 检查 CDP 端口是否可用
  const checkPort = (): Promise<boolean> =>
    new Promise((resolve) => {
      const req = http.get(`http://127.0.0.1:${port}/json/version`, (res) => {
        let d = '';
        res.on('data', (c: Buffer) => d += c);
        res.on('end', () => resolve(d.includes('Browser')));
      });
      req.on('error', () => resolve(false));
      req.setTimeout(2000, () => { req.destroy(); resolve(false); });
    });

  if (!(await checkPort())) return { success: false, error: '' };

  try {
    // 获取页面列表
    const pages = await new Promise<any[]>((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}/json`, (res) => {
        let d = '';
        res.on('data', (c: Buffer) => d += c);
        res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve([]); } });
      }).on('error', reject);
    });

    if (pages.length === 0) return { success: false, error: '' };

    // 使用第一个页面的 WebSocket 获取 Cookie
    const wsUrl = pages[0].webSocketDebuggerUrl;
    if (!wsUrl) return { success: false, error: '' };

    const { WebSocket } = await import('ws');
    const cookies = await new Promise<any[]>((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      const timeout = setTimeout(() => { ws.close(); reject(new Error('timeout')); }, 5000);

      ws.on('open', () => {
        ws.send(JSON.stringify({
          id: 1,
          method: 'Network.getCookies',
          params: { urls: ['https://quark.cn', 'https://pan.quark.cn', 'https://b.quark.cn', 'https://uop.quark.cn'] },
        }));
      });

      ws.on('message', (data: any) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.id === 1) {
            clearTimeout(timeout);
            ws.close();
            resolve(msg.result?.cookies || []);
          }
        } catch { /* ignore */ }
      });

      ws.on('error', (e: Error) => { clearTimeout(timeout); reject(e); });
    });

    if (cookies.length === 0) return { success: false, error: '' };

    const domains = [...new Set(cookies.map((c: any) => c.domain))];
    const cookieStr = cookies.map((c: any) => `${c.name}=${c.value}`).join('; ');

    console.log(`[BrowserCookie] 通过 CDP 获取到 ${cookies.length} 个 Cookie`);
    return { success: true, browser: 'CDP', cookie: cookieStr, domains };
  } catch {
    return { success: false, error: '' };
  }
}

// ======================== 主流程 ========================

/**
 * 从本地浏览器读取夸克网盘 Cookie
 * 优先级: CDP (运行中) → SQLite 解密 (已关闭) → 提示手动复制
 */
export async function readQuarkCookie(): Promise<BrowserCookieResult> {
  if (process.platform !== 'win32') {
    return { success: false, error: '浏览器 Cookie 读取仅支持 Windows 平台' };
  }

  // 方案 1: 尝试 CDP 连接（浏览器带 --remote-debugging-port 运行时）
  for (const port of [9222, 9223, 9224, 19222]) {
    const cdpResult = await readCookieViaCDP(port);
    if (cdpResult.success) return cdpResult;
  }

  // 方案 2: 尝试读取 SQLite 数据库（浏览器关闭时）
  const browsers = getBrowserPaths();
  if (browsers.length === 0) {
    return { success: false, error: '未找到 Chromium 浏览器 (Chrome/Edge/Brave)' };
  }

  for (const browser of browsers) {
    try {
      const key = await decryptMasterKey(browser.localStatePath);
      const { cookies, allEncrypted } = await readCookiesFromDb(browser.cookieDbPath, 'quark.cn', key);

      if (allEncrypted) {
        console.warn(`[BrowserCookie] ${browser.name}: 全部 v20 加密`);
        continue;
      }

      if (cookies.length === 0) continue;

      const domains = [...new Set(cookies.map(c => c.domain))];
      const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ');

      console.log(`[BrowserCookie] 从 ${browser.name} 读取到 ${cookies.length} 个夸克 Cookie`);
      return { success: true, browser: browser.name, cookie: cookieStr, domains };
    } catch (err: any) {
      console.warn(`[BrowserCookie] ${browser.name} 读取失败: ${err.message}`);
    }
  }

  // 方案 3: 提示手动复制
  return {
    success: false,
    error: '浏览器 Cookie 使用 v20 加密无法自动解密。请手动复制：打开 pan.quark.cn → F12 → Network → 刷新 → 点任意请求 → 复制 Cookie 头',
  };
}

export async function readDomainCookies(domain: string): Promise<BrowserCookieResult> {
  return readQuarkCookie();
}
