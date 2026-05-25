import { useState, useEffect, type FC } from 'react'

interface Settings {
  potplayer_path: string
  media_root: string
  tmdb_api_key: string
  omdb_api_key: string
  tmm_path: string
  tmm_args: string
  watch_dir: string
  output_dir: string
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
    tmm_path: '',
    tmm_args: '--scrape --updateAll',
    watch_dir: '',
    output_dir: '',
  })
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)
  const [watcherActive, setWatcherActive] = useState(false)
  const [watcherMsg, setWatcherMsg] = useState('')

  useEffect(() => {
    fetch('/api/config')
      .then(r => r.json())
      .then(data => {
        setSettings(prev => ({
          potplayer_path: data.potplayer_path || prev.potplayer_path,
          media_root: data.media_root || '',
          tmdb_api_key: data.tmdb_api_key || prev.tmdb_api_key,
          omdb_api_key: data.omdb_api_key || '',
          tmm_path: data.tmm_path || '',
          tmm_args: data.tmm_args || prev.tmm_args,
          watch_dir: data.watch_dir || '',
          output_dir: data.output_dir || '',
        }))
      })
      .catch(() => {})
      .finally(() => setLoading(false))

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
        <input
          type="text"
          value={settings.omdb_api_key}
          onChange={e => update('omdb_api_key', e.target.value)}
          placeholder="留空则仅显示 TMDB 评分"
        />
        <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 6 }}>
          用于获取 IMDb、Rotten Tomatoes、Metacritic 评分
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

      <button className="settings-save-btn" onClick={handleSave}>
        保存设置
      </button>
      {saved && <p className="settings-success">✓ 设置已保存</p>}
    </div>
  )
}

export default SettingsPanel
