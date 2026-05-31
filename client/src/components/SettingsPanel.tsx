import { useState, useEffect, useCallback, type FC } from 'react'

interface Settings {
  potplayer_path: string
  media_root: string
  tmdb_api_key: string
  omdb_api_key: string
  opensubtitles_api_key: string
  tmm_path: string
  tmm_args: string
  watch_dir: string
  output_dir: string
  // 下载相关
  quark_cookie: string
  quark_target_dir: string
  aria2_rpc_url: string
  aria2_rpc_secret: string
  download_dir: string
  max_concurrent_downloads: string
  min_quality_score: string
  prefer_quality: string
}

const SectionHeading: FC<{ icon: string; title: string }> = ({ icon, title }) => (
  <h3 className="settings-section-heading">
    <span className="settings-section-icon">{icon}</span>
    {title}
  </h3>
)

const SettingsPanel: FC = () => {
  const [settings, setSettings] = useState<Settings>({
    potplayer_path: 'C:\\Program Files\\DAUM\\PotPlayer\\PotPlayerMini64.exe',
    media_root: '',
    tmdb_api_key: '95777cd0ce9652f08bd77103f658cf2b',
    omdb_api_key: '',
    opensubtitles_api_key: '',
    tmm_path: '',
    tmm_args: '--scrape --updateAll',
    watch_dir: '',
    output_dir: '',
    // 下载相关
    quark_cookie: '',
    quark_target_dir: '/影视',
    aria2_rpc_url: 'http://localhost:6800/jsonrpc',
    aria2_rpc_secret: '',
    download_dir: '',
    max_concurrent_downloads: '2',
    min_quality_score: '25',
    prefer_quality: '4K,BluRay,Remux',
  })
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)
  const [watcherActive, setWatcherActive] = useState(false)
  const [watcherMsg, setWatcherMsg] = useState('')
  const [omdbUsage, setOmdbUsage] = useState<{ key: string; usage: number; limit: number; remaining: number }[]>([])
  const [quarkTestResult, setQuarkTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [aria2TestResult, setAria2TestResult] = useState<{ available: boolean; version?: string; error?: string } | null>(null)
  const [browserCookieLoading, setBrowserCookieLoading] = useState(false)
  const [browserCookieResult, setBrowserCookieResult] = useState<{ success: boolean; browser?: string; error?: string } | null>(null)

  const fetchOmdbUsage = useCallback(async () => {
    try {
      const res = await fetch('/api/config/omdb-usage')
      if (res.ok) setOmdbUsage(await res.json())
    } catch { /* 静默 */ }
  }, [])

  useEffect(() => {
    fetch('/api/config')
      .then(r => r.json())
      .then(data => {
        setSettings(prev => ({
          potplayer_path: data.potplayer_path || prev.potplayer_path,
          media_root: data.media_root || '',
          tmdb_api_key: data.tmdb_api_key || prev.tmdb_api_key,
          omdb_api_key: data.omdb_api_key || '',
          opensubtitles_api_key: data.opensubtitles_api_key || '',
          tmm_path: data.tmm_path || '',
          tmm_args: data.tmm_args || prev.tmm_args,
          watch_dir: data.watch_dir || '',
          output_dir: data.output_dir || '',
          // 下载相关
          quark_cookie: data.quark_cookie || '',
          quark_target_dir: data.quark_target_dir || '/影视',
          aria2_rpc_url: data.aria2_rpc_url || 'http://localhost:6800/jsonrpc',
          aria2_rpc_secret: data.aria2_rpc_secret || '',
          download_dir: data.download_dir || '',
          max_concurrent_downloads: data.max_concurrent_downloads || '2',
          min_quality_score: data.min_quality_score || '25',
          prefer_quality: data.prefer_quality || '4K,BluRay,Remux',
        }))
      })
      .catch(() => {})
      .finally(() => setLoading(false))

    fetchOmdbUsage()

    fetch('/api/watcher/status')
      .then(r => r.json())
      .then(s => setWatcherActive(s.active))
      .catch(() => {})
  }, [])

  const handleSave = async () => {
    await fetch('/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
    fetchOmdbUsage()
  }

  const update = (key: keyof Settings, value: string) => {
    setSettings(prev => ({ ...prev, [key]: value }))
  }

  const toggleWatcher = async () => {
    setWatcherMsg('')
    try {
      const body = watcherActive ? {} : { watch_dir: settings.watch_dir }
      const res = await fetch(`/api/watcher/${watcherActive ? 'stop' : 'start'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      setWatcherActive(!watcherActive)
      setWatcherMsg(data.message || '')
    } catch {
      setWatcherMsg('操作失败')
    }
  }

  if (loading) {
    return (
      <div className="settings-view">
        <h1 className="settings-title">设置</h1>
        <p style={{ color: 'var(--text-tertiary)' }}>加载中...</p>
      </div>
    )
  }

  return (
    <div className="settings-view">
      <h1 className="settings-title">设置</h1>

      {/* === 播放器 === */}
      <SectionHeading icon="▶" title="播放器" />
      <div className="settings-group">
        <label>PotPlayer 路径</label>
        <input
          type="text"
          value={settings.potplayer_path}
          onChange={e => update('potplayer_path', e.target.value)}
          placeholder="C:\Program Files\DAUM\PotPlayer\PotPlayerMini64.exe"
        />
      </div>

      {/* === 媒体目录 === */}
      <SectionHeading icon="📁" title="媒体" />
      <div className="settings-group">
        <label>媒体根目录</label>
        <input
          type="text"
          value={settings.media_root}
          onChange={e => update('media_root', e.target.value)}
          placeholder="D:/media"
        />
      </div>

      {/* === API Keys === */}
      <SectionHeading icon="🔑" title="API 密钥" />
      <div className="settings-group">
        <label>TMDB API Key</label>
        <input type="text" value={settings.tmdb_api_key} onChange={e => update('tmdb_api_key', e.target.value)} />
      </div>
      <div className="settings-group">
        <label>OMDb API Key</label>
        <textarea
          className="settings-textarea"
          value={settings.omdb_api_key.split(',').map(k => k.trim()).filter(Boolean).join('\n')}
          onChange={e => update('omdb_api_key', e.target.value.split('\n').map(k => k.trim()).filter(Boolean).join(','))}
          placeholder="每行一个 key，留空则仅显示 TMDB 评分"
          rows={3}
        />
        <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 6 }}>
          用于获取 IMDb、Rotten Tomatoes、Metacritic 评分。支持多个 key 自动轮换（免费 1000 次/天）
        </p>
        {omdbUsage.length > 0 && (
          <div className="omdb-usage-list">
            {omdbUsage.map(s => (
              <div key={s.key} className="omdb-usage-item">
                <span className="omdb-usage-key">***{s.key}</span>
                <div className="omdb-usage-bar">
                  <div
                    className={`omdb-usage-fill${s.remaining === 0 ? ' exhausted' : ''}`}
                    style={{ width: `${Math.min(100, (s.usage / s.limit) * 100)}%` }}
                  />
                </div>
                <span className="omdb-usage-text">{s.usage}/{s.limit}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="settings-group">
        <label>OpenSubtitles API Key</label>
        <input
          type="text"
          value={settings.opensubtitles_api_key}
          onChange={e => update('opensubtitles_api_key', e.target.value)}
          placeholder="留空则字幕搜索不可用"
        />
        <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 6 }}>
          用于搜索和下载字幕。免费注册获取：<a href="https://www.opensubtitles.com/consumers" target="_blank" rel="noopener" style={{ color: 'var(--accent)' }}>opensubtitles.com</a>
        </p>
      </div>

      {/* === TMM 刮削 === */}
      <SectionHeading icon="🔄" title="TMM 自动刮削" />
      <div className="settings-group">
        <label>TMM 命令行工具路径</label>
        <input
          type="text"
          value={settings.tmm_path}
          onChange={e => update('tmm_path', e.target.value)}
          placeholder="D:\TMM\tinyMediaManagerV5\tinyMediaManagerCMD.exe"
        />
      </div>

      <div className="settings-group">
        <label>TMM 命令行参数</label>
        <input
          type="text"
          value={settings.tmm_args}
          onChange={e => update('tmm_args', e.target.value)}
        />
        <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 6 }}>
          默认: --scrape --updateAll
        </p>
      </div>

      <div className="settings-group">
        <label>监控目录</label>
        <input
          type="text"
          value={settings.watch_dir}
          onChange={e => update('watch_dir', e.target.value)}
          placeholder="D:/downloads/new_movies"
        />
        <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 6 }}>
          新视频文件放入此目录后自动触发 TMM 刮削
        </p>
      </div>

      <div className="settings-group">
        <label>刮削后输出目录</label>
        <input
          type="text"
          value={settings.output_dir}
          onChange={e => update('output_dir', e.target.value)}
          placeholder="D:/media/movies"
        />
      </div>

      {/* 监控状态 */}
      <div className="watcher-status">
        <span className={`watcher-dot${watcherActive ? ' active' : ''}`} />
        <span className="watcher-label">
          文件监控: {watcherActive ? '运行中' : '已停止'}
        </span>
        <button
          className={`watcher-toggle-btn ${watcherActive ? 'stop' : 'start'}`}
          onClick={toggleWatcher}
        >
          {watcherActive ? '停止监控' : '启动监控'}
        </button>
      </div>
      {watcherMsg && <p className="watcher-msg">{watcherMsg}</p>}

      {/* === 下载设置 === */}
      <SectionHeading icon="⬇" title="下载设置" />
      <div className="settings-group">
        <label>夸克网盘 Cookie</label>
        <textarea
          className="settings-textarea"
          value={settings.quark_cookie}
          onChange={e => update('quark_cookie', e.target.value)}
          placeholder="从浏览器开发者工具中复制 Cookie, 或点击下方按钮自动读取"
          rows={3}
        />
        <div style={{ display: 'flex', gap: 12, marginTop: 8, alignItems: 'center' }}>
          <button
            className="watcher-toggle-btn start"
            disabled={browserCookieLoading}
            onClick={async () => {
              setBrowserCookieLoading(true)
              setBrowserCookieResult(null)
              try {
                const res = await fetch('/api/download/browser-cookie')
                const data = await res.json()
                if (data.success && data.cookie) {
                  update('quark_cookie', data.cookie)
                  setBrowserCookieResult({ success: true, browser: data.browser })
                } else {
                  setBrowserCookieResult({ success: false, error: data.error })
                }
              } catch {
                setBrowserCookieResult({ success: false, error: '请求失败' })
              } finally {
                setBrowserCookieLoading(false)
              }
            }}
          >
            {browserCookieLoading ? '读取中...' : '从浏览器自动读取'}
          </button>
          {browserCookieResult && (
            <span style={{ fontSize: 12, color: browserCookieResult.success ? '#4ade80' : '#f87171' }}>
              {browserCookieResult.success ? `✓ 从 ${browserCookieResult.browser} 读取成功` : `✕ ${browserCookieResult.error}`}
            </span>
          )}
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 6 }}>
          自动读取需要关闭浏览器, 或手动从 F12 → Network → Cookie 头中复制
        </p>
      </div>

      <div className="settings-group">
        <label>夸克网盘目标目录</label>
        <input
          type="text"
          value={settings.quark_target_dir}
          onChange={e => update('quark_target_dir', e.target.value)}
          placeholder="/影视"
        />
      </div>

      <div className="settings-group">
        <label>Aria2 RPC 地址</label>
        <input
          type="text"
          value={settings.aria2_rpc_url}
          onChange={e => update('aria2_rpc_url', e.target.value)}
          placeholder="http://localhost:6800/jsonrpc"
        />
      </div>

      <div className="settings-group">
        <label>Aria2 RPC 密钥</label>
        <input
          type="text"
          value={settings.aria2_rpc_secret}
          onChange={e => update('aria2_rpc_secret', e.target.value)}
          placeholder="留空则无密钥"
        />
      </div>

      <div className="settings-group">
        <label>本地下载目录</label>
        <input
          type="text"
          value={settings.download_dir}
          onChange={e => update('download_dir', e.target.value)}
          placeholder="D:/downloads/movies"
        />
      </div>

      <div className="settings-group" style={{ display: 'flex', gap: 16 }}>
        <div style={{ flex: 1 }}>
          <label>最大并发下载数</label>
          <input
            type="number"
            min={1}
            max={5}
            value={settings.max_concurrent_downloads}
            onChange={e => update('max_concurrent_downloads', e.target.value)}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label>最低质量分数</label>
          <input
            type="number"
            min={0}
            max={115}
            value={settings.min_quality_score}
            onChange={e => update('min_quality_score', e.target.value)}
          />
        </div>
      </div>

      <div className="settings-group">
        <label>优先质量关键词</label>
        <input
          type="text"
          value={settings.prefer_quality}
          onChange={e => update('prefer_quality', e.target.value)}
          placeholder="4K,BluRay,Remux"
        />
        <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 6 }}>
          逗号分隔, 匹配的资源额外加分优先下载
        </p>
      </div>

      {/* 连接测试按钮 */}
      <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
        <button
          className="watcher-toggle-btn start"
          onClick={async () => {
            setQuarkTestResult(null)
            try {
              const res = await fetch('/api/download/test/quark')
              const data = await res.json()
              setQuarkTestResult(data)
            } catch {
              setQuarkTestResult({ success: false, message: '测试失败' })
            }
          }}
        >
          测试夸克连接
        </button>
        <button
          className="watcher-toggle-btn start"
          onClick={async () => {
            setAria2TestResult(null)
            try {
              const res = await fetch('/api/download/test/aria2')
              const data = await res.json()
              setAria2TestResult(data)
            } catch {
              setAria2TestResult({ available: false, error: '测试失败' })
            }
          }}
        >
          测试 Aria2 连接
        </button>
      </div>
      {quarkTestResult && (
        <p className="watcher-msg" style={{ color: quarkTestResult.success ? '#4ade80' : '#f87171' }}>
          {quarkTestResult.message}
        </p>
      )}
      {aria2TestResult && (
        <p className="watcher-msg" style={{ color: aria2TestResult.available ? '#4ade80' : '#f87171' }}>
          {aria2TestResult.available ? `Aria2 ${aria2TestResult.version}` : `Aria2 不可用: ${aria2TestResult.error}`}
        </p>
      )}

      <button className="settings-save-btn" onClick={handleSave}>
        保存设置
      </button>
      {saved && <p className="settings-success">✓ 设置已保存</p>}
    </div>
  )
}

export default SettingsPanel
