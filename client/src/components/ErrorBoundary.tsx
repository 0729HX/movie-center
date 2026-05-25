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
        <div className="error-boundary">
          <div className="error-boundary-icon">🤷</div>
          <h2 className="error-boundary-title">页面渲染出错</h2>
          <p className="error-boundary-msg">
            {this.state.error?.message || '未知错误'}
          </p>
          <button
            className="error-boundary-btn"
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
