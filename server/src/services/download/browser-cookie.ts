/**
 * 浏览器 Cookie 自动读取模块
 * 从本地 Chrome/Edge 浏览器的 SQLite 数据库中读取指定域名的 Cookie
 *
 * 支持: Chrome 80+, Edge 80+ (AES-256-GCM 加密)
 * 仅 Windows 平台
 */
import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import crypto from 'crypto';

// ======================== 浏览器路径 ========================

interface BrowserInfo {
  name: string;
  dataDir: string;
  cookieDbPath: string;
  localStatePath: string;
}

/** 获取常见的 Chromium 浏览器路径 */
function getBrowserPaths(): BrowserInfo[] {
  const localAppData = process.env.LOCALAPPDATA || '';
  const appData = process.env.APPDATA || '';

  const browsers: BrowserInfo[] = [];

  // Chrome
  const chromeData = path.join(localAppData, 'Google', 'Chrome', 'User Data');
  if (existsSync(chromeData)) {
    browsers.push({
      name: 'Chrome',
      dataDir: chromeData,
      cookieDbPath: path.join(chromeData, 'Default', 'Network', 'Cookies'),
      localStatePath: path.join(chromeData, 'Local State'),
    });
    // 也检查 Profile 1, Profile 2 等
    for (let i = 1; i <= 5; i++) {
      const profilePath = path.join(chromeData, `Profile ${i}`, 'Network', 'Cookies');
      if (existsSync(profilePath)) {
        browsers.push({
          name: `Chrome (Profile ${i})`,
          dataDir: chromeData,
          cookieDbPath: profilePath,
          localStatePath: path.join(chromeData, 'Local State'),
        });
      }
    }
  }

  // Edge
  const edgeData = path.join(localAppData, 'Microsoft', 'Edge', 'User Data');
  if (existsSync(edgeData)) {
    browsers.push({
      name: 'Edge',
      dataDir: edgeData,
      cookieDbPath: path.join(edgeData, 'Default', 'Network', 'Cookies'),
      localStatePath: path.join(edgeData, 'Local State'),
    });
  }

  // Brave
  const braveData = path.join(localAppData, 'BraveSoftware', 'Brave-Browser', 'User Data');
  if (existsSync(braveData)) {
    browsers.push({
      name: 'Brave',
      dataDir: braveData,
      cookieDbPath: path.join(braveData, 'Default', 'Network', 'Cookies'),
      localStatePath: path.join(braveData, 'Local State'),
    });
  }

  return browsers;
}

// ======================== DPAPI 解密 ========================

/**
 * 使用 DPAPI 解密 Chrome 的加密密钥
 * Chrome v80+ 在 Local State 中存储 AES-256-GCM 密钥，用 DPAPI 加密
 */
async function decryptChromeKey(localStatePath: string): Promise<Buffer> {
  // 读取 Local State JSON
  const content = await fs.readFile(localStatePath, 'utf-8');
  const localState = JSON.parse(content);
  const encryptedKeyB64 = localState.os_crypt?.encrypted_key;

  if (!encryptedKeyB64) {
    throw new Error('未找到加密密钥 (os_crypt.encrypted_key)');
  }

  // Base64 解码，去掉 "DPAPI" 前缀 (5 字节)
  const encryptedKey = Buffer.from(encryptedKeyB64, 'base64');
  const dpapiPayload = encryptedKey.subarray(5); // 跳过 "DPAPI" 前缀

  // 使用 DPAPI 解密
  const { Dpapi } = await import('@primno/dpapi');
  const decryptedKey = Dpapi.unprotectData(dpapiPayload, null, 'CurrentUser');

  return Buffer.from(decryptedKey);
}

// ======================== Cookie 解密 ========================

/**
 * 解密 Chrome v80+ 的 Cookie 值
 * 加密格式: v10/v11 + 12字节 nonce + ciphertext + 16字节 auth_tag
 */
function decryptCookieValue(encryptedValue: Buffer, key: Buffer): string {
  // Chrome v10/v11 格式
  const version = encryptedValue.subarray(0, 3).toString('ascii');

  if (version === 'v10' || version === 'v11') {
    const nonce = encryptedValue.subarray(3, 15);
    const ciphertext = encryptedValue.subarray(15, encryptedValue.length - 16);
    const authTag = encryptedValue.subarray(encryptedValue.length - 16);

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(ciphertext);
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    return decrypted.toString('utf-8');
  }

  // 旧版 Chrome (v00 或无前缀) 使用 DPAPI 直接解密
  const { Dpapi } = require('@primno/dpapi');
  const decrypted = Dpapi.unprotectData(encryptedValue, null, 'CurrentUser');
  return Buffer.from(decrypted).toString('utf-8');
}

// ======================== 数据库读取 ========================

interface CookieEntry {
  name: string;
  value: string;
  domain: string;
  path: string;
  expiresUtc: number;
  isSecure: boolean;
  isHttpOnly: boolean;
}

/**
 * 使用 Windows VSS（卷影复制）复制被锁定的文件
 * 浏览器运行时会独占锁定 Cookie 数据库，普通复制无法读取
 * VSS 可以创建文件系统的快照，从中读取文件的副本
 */
async function copyFileViaVss(src: string, dest: string): Promise<boolean> {
  const { execSync } = await import('child_process');
  const destDir = path.dirname(dest);

  // 创建临时符号链接目录
  const linkDir = path.join(destDir, '.vss_link_' + Date.now());
  const scriptPath = path.join(destDir, '.vss_copy.ps1');

  try {
    if (!(existsSync(destDir))) {
      await fs.mkdir(destDir, { recursive: true });
    }

    // 写入 PowerShell 脚本文件（避免命令行转义问题）
    const psScript = `
$ErrorActionPreference = 'Stop'
$src = '${src.replace(/'/g, "''")}'
$dest = '${dest.replace(/'/g, "''")}'
$destDir = '${destDir.replace(/'/g, "''")}'
$linkDir = '${linkDir.replace(/'/g, "''")}'

if (!(Test-Path $destDir)) { New-Item -ItemType Directory -Path $destDir -Force | Out-Null }

# 创建卷影副本
$drive = $src.Substring(0, 2) + '\\'
$before = (Get-CimInstance Win32_ShadowCopy).Count
$shadow = Invoke-CimMethod -ClassName Win32_ShadowCopy -MethodName Create -Arguments @{Volume=$drive; Context='ClientAccessible'}
if (-not $shadow.ShadowID) { throw 'VSS failed' }

# 等待卷影副本就绪（重试查找新创建的卷影）
$device = $null
for ($i = 0; $i -lt 10; $i++) {
  Start-Sleep -Milliseconds 500
  $shadows = Get-CimInstance Win32_ShadowCopy | Sort-Object InstallDate -Descending
  if ($shadows -and $shadows.Count -gt 0) {
    $latest = $shadows[0]
    $device = $latest.DeviceObject
    if ($device) { break }
  }
}
if (-not $device) { throw 'VSS device not found after 5s' }

# 创建符号链接访问卷影副本
cmd /c mklink /D "$linkDir" "$device" 2>&1 | Out-Null

try {
  # 计算卷影副本中的文件路径
  $srcRelative = $src.Substring(2)
  $shadowSrc = Join-Path $linkDir $srcRelative

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
  } catch (err: any) {
    console.warn('[VSS] 复制失败:', err.stderr?.toString()?.substring(0, 200) || err.message?.substring(0, 200));
    // 清理可能残留的符号链接和脚本
    try { execSync(`cmd /c rmdir "${linkDir}" 2>nul`, { stdio: 'pipe' }); } catch {}
    try { await fs.unlink(scriptPath); } catch {}
    return false;
  }
}

/**
 * 从 SQLite 数据库读取指定域名的 Cookie
 * 支持浏览器运行时读取（通过共享读取模式复制文件）
 */
async function readCookiesFromDb(
  dbPath: string,
  domain: string,
  key: Buffer,
): Promise<CookieEntry[]> {
  const tmpDir = path.join(path.dirname(dbPath), '.cookie_tmp');
  const tmpPath = path.join(tmpDir, 'Cookies');
  const tmpWalPath = path.join(tmpDir, 'Cookies-wal');
  const tmpShmPath = path.join(tmpDir, 'Cookies-shm');

  try {
    await fs.mkdir(tmpDir, { recursive: true });

    // 使用 VSS 卷影复制绕过浏览器锁
    const copied = await copyFileViaVss(dbPath, tmpPath);
    if (!copied) {
      throw new Error('无法复制 Cookie 数据库（VSS 失败）');
    }

    // 也复制 WAL 和 SHM 文件（Chrome 使用 WAL 模式）
    const walPath = dbPath + '-wal';
    const shmPath = dbPath + '-shm';
    if (existsSync(walPath)) {
      await copyFileViaVss(walPath, tmpWalPath).catch(() => {});
    }
    if (existsSync(shmPath)) {
      await copyFileViaVss(shmPath, tmpShmPath).catch(() => {});
    }
  } catch (err: any) {
    throw new Error(`无法复制 Cookie 数据库: ${err.message}`);
  }

  try {
    const Database = (await import('better-sqlite3')).default;
    const db = new Database(tmpPath, { readonly: true });

    try {
      // 查询域名匹配的 Cookie
      const rows = db.prepare(`
        SELECT name, encrypted_value, host_key, path, expires_utc, is_secure, is_httponly
        FROM cookies
        WHERE host_key LIKE ? OR host_key LIKE ?
      `).all(`%${domain}%`, `%.${domain}%`) as any[];

      const cookies: CookieEntry[] = [];

      for (const row of rows) {
        try {
          const encryptedValue = row.encrypted_value;
          if (!encryptedValue || encryptedValue.length === 0) continue;

          let value: string;
          // 检查是否加密 (有 v10/v11 前缀)
          const buf = Buffer.from(encryptedValue);
          const prefix = buf.subarray(0, 3).toString('ascii');
          if (prefix === 'v10' || prefix === 'v11') {
            value = decryptCookieValue(buf, key);
          } else {
            // 未加密或旧格式
            value = buf.toString('utf-8');
          }

          if (value) {
            cookies.push({
              name: row.name,
              value,
              domain: row.host_key,
              path: row.path,
              // Chrome 时间戳: 微秒 since 1601-01-01
              expiresUtc: row.expires_utc ? Math.floor(row.expires_utc / 1000000 - 11644473600) : 0,
              isSecure: !!row.is_secure,
              isHttpOnly: !!row.is_httponly,
            });
          }
        } catch {
          // 单个 Cookie 解密失败，跳过
        }
      }

      return cookies;
    } finally {
      db.close();
    }
  } finally {
    // 清理临时文件
    await fs.unlink(tmpPath).catch(() => {});
    await fs.unlink(tmpWalPath).catch(() => {});
    await fs.unlink(tmpShmPath).catch(() => {});
    await fs.rmdir(tmpDir).catch(() => {});
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

/**
 * 从本地浏览器读取夸克网盘 Cookie
 * 自动遍历所有 Chromium 浏览器配置文件
 */
export async function readQuarkCookie(): Promise<BrowserCookieResult> {
  if (process.platform !== 'win32') {
    return { success: false, error: '浏览器 Cookie 读取仅支持 Windows 平台' };
  }

  const browsers = getBrowserPaths();
  if (browsers.length === 0) {
    return { success: false, error: '未找到 Chromium 浏览器 (Chrome/Edge/Brave)' };
  }

  for (const browser of browsers) {
    try {
      // 读取并解密 AES 密钥
      const key = await decryptChromeKey(browser.localStatePath);

      // 读取 Cookie
      const cookies = await readCookiesFromDb(browser.cookieDbPath, 'quark.cn', key);

      if (cookies.length === 0) continue;

      // 组装 Cookie 字符串 (按 domain 分组)
      const domains = [...new Set(cookies.map(c => c.domain))];
      const cookieStr = cookies
        .map(c => `${c.name}=${c.value}`)
        .join('; ');

      // 验证是否包含关键 Cookie
      const hasPuid = cookies.some(c => c.name === '__puus' || c.name === '__pus');
      const hasMsessionid = cookies.some(c => c.name === 'MSESSIONID' || c.name === '__uid');

      if (!hasPuid && !hasMsessionid) {
        console.warn(`[BrowserCookie] ${browser.name}: 找到 ${cookies.length} 个夸克 Cookie，但缺少关键认证 Cookie`);
      }

      console.log(`[BrowserCookie] 从 ${browser.name} 读取到 ${cookies.length} 个夸克 Cookie`);
      return {
        success: true,
        browser: browser.name,
        cookie: cookieStr,
        domains,
      };
    } catch (err: any) {
      console.warn(`[BrowserCookie] ${browser.name} 读取失败: ${err.message}`);
      // 继续尝试下一个浏览器
    }
  }

  return {
    success: false,
    error: '未在任何浏览器中找到夸克网盘 Cookie。请先在浏览器中登录夸克网盘 (pan.quark.cn)',
  };
}

/**
 * 从本地浏览器读取指定域名的全部 Cookie (通用接口)
 */
export async function readDomainCookies(domain: string): Promise<BrowserCookieResult> {
  if (process.platform !== 'win32') {
    return { success: false, error: '浏览器 Cookie 读取仅支持 Windows 平台' };
  }

  const browsers = getBrowserPaths();
  if (browsers.length === 0) {
    return { success: false, error: '未找到 Chromium 浏览器' };
  }

  for (const browser of browsers) {
    try {
      const key = await decryptChromeKey(browser.localStatePath);
      const cookies = await readCookiesFromDb(browser.cookieDbPath, domain, key);

      if (cookies.length === 0) continue;

      const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ');

      return {
        success: true,
        browser: browser.name,
        cookie: cookieStr,
        domains: [...new Set(cookies.map(c => c.domain))],
      };
    } catch (err: any) {
      console.warn(`[BrowserCookie] ${browser.name} 读取失败: ${err.message}`);
    }
  }

  return { success: false, error: `未找到 ${domain} 的 Cookie` };
}
