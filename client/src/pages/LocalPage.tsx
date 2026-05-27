import { useState, type FC } from 'react'
import LocalMediaView from '../components/LocalMediaView'
import MetadataScrapePanel from '../components/MetadataScrapePanel'
import OrganizePanel from '../components/OrganizePanel'
import { useData, useApp } from '../context/hooks'

type Tab = 'media' | 'scrape' | 'organize'

const LocalPage: FC = () => {
  const { state } = useData()
  const { fetchLocal } = useApp()
  const [activeTab, setActiveTab] = useState<Tab>('media')
  const [showScrape, setShowScrape] = useState(false)
  const [showOrganize, setShowOrganize] = useState(false)

  return (
    <div className="page-transition">
      {/* Tab bar */}
      <div className="px-[var(--content-padding)] pt-[calc(var(--nav-height)+20px)] mb-5">
        <div className="flex items-center gap-1 bg-white/[0.03] rounded-[10px] p-1 border border-white/[0.04] w-fit">
          <button
            onClick={() => setActiveTab('media')}
            className={`py-1.5 px-4 text-xs font-semibold rounded-[8px] transition-all duration-200 ${
              activeTab === 'media'
                ? 'bg-white/[0.08] text-text-primary shadow-sm'
                : 'text-text-tertiary hover:text-text-secondary'
            }`}
          >
            媒体库
          </button>
          <button
            onClick={() => { setActiveTab('scrape'); setShowScrape(true); setShowOrganize(false) }}
            className={`py-1.5 px-4 text-xs font-semibold rounded-[8px] transition-all duration-200 ${
              activeTab === 'scrape'
                ? 'bg-white/[0.08] text-text-primary shadow-sm'
                : 'text-text-tertiary hover:text-text-secondary'
            }`}
          >
            元数据抓取
          </button>
          <button
            onClick={() => { setActiveTab('organize'); setShowOrganize(true); setShowScrape(false) }}
            className={`py-1.5 px-4 text-xs font-semibold rounded-[8px] transition-all duration-200 ${
              activeTab === 'organize'
                ? 'bg-white/[0.08] text-text-primary shadow-sm'
                : 'text-text-tertiary hover:text-text-secondary'
            }`}
          >
            文件整理
          </button>
        </div>
      </div>

      {/* Panels */}
      <div className="px-[var(--content-padding)]">
        {activeTab === 'scrape' && (
          <MetadataScrapePanel
            visible={showScrape}
            onClose={() => { setShowScrape(false); setActiveTab('media') }}
            onComplete={() => fetchLocal()}
          />
        )}
        {activeTab === 'organize' && (
          <OrganizePanel
            visible={showOrganize}
            onClose={() => { setShowOrganize(false); setActiveTab('media') }}
            onComplete={() => fetchLocal()}
          />
        )}
      </div>

      {/* Main media view (always rendered for media tab, and visible below panels for others) */}
      <div className={activeTab !== 'media' ? 'mt-2' : ''}>
        <LocalMediaView
          items={state.localMedia}
          loading={state.loading}
        />
      </div>
    </div>
  )
}

export default LocalPage
