import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: any) {
    console.error('[ErrorBoundary] 捕获到渲染错误:', error.message, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-black text-[#f5f5f7] p-10 text-center font-[-apple-system,BlinkMacSystemFont,'SF Pro Display',sans-serif]">
          <div className="text-[48px] mb-4 opacity-60">🤷</div>
          <h2 className="text-[22px] font-bold mb-2 tracking-tight">页面渲染出错</h2>
          <p className="text-[#86868b] text-sm mb-6 max-w-[400px] leading-relaxed">
            {this.state.error?.message || '未知错误'}
          </p>
          <button
            className="bg-gradient-to-br from-[#2997ff] via-[#40a8ff] to-[#64d2ff] text-white border-none py-2.5 px-6 rounded-xl text-[15px] font-semibold cursor-pointer transition-all duration-[0.25s] ease-[var(--ease-spring)] shadow-[0_2px_10px_rgba(41,151,255,0.35)] hover:-translate-y-0.5 hover:shadow-[0_8px_28px_rgba(41,151,255,0.45)] hover:brightness-110"
            onClick={() => {
              this.setState({ hasError: false, error: null })
              window.location.reload()
            }}
          >
            刷新页面
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
