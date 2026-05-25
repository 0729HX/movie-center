import { type FC } from 'react'
import LocalMediaView from '../components/LocalMediaView'
import { useData } from '../context/hooks'

const LocalPage: FC = () => {
  const { state } = useData()

  return (
    <div className="page-transition">
      <LocalMediaView
        items={state.localMedia}
        loading={state.loading}
      />
    </div>
  )
}

export default LocalPage
