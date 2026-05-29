import type { FC } from 'react'

interface Props {
  title: string
  message: string
  onCancel: () => void
  onRemoveOnly: () => void
  onDeleteFiles: () => void
  deleting?: boolean
}

const BatchConfirmDialog: FC<Props> = ({ title, message, onCancel, onRemoveOnly, onDeleteFiles, deleting }) => {
  return (
    <div className="batch-confirm-backdrop" onClick={onCancel}>
      <div className="batch-confirm-dialog" onClick={e => e.stopPropagation()}>
        <div className="batch-confirm-title">{title}</div>
        <div className="batch-confirm-msg">{message}</div>
        <div className="batch-confirm-actions">
          <button className="genre-pill" onClick={onCancel}>取消</button>
          <button className="batch-toolbar-delete" onClick={onRemoveOnly} disabled={deleting}>仅移除记录</button>
          <button className="batch-toolbar-delete" onClick={onDeleteFiles} disabled={deleting}>删除文件和记录</button>
        </div>
      </div>
    </div>
  )
}

export default BatchConfirmDialog
