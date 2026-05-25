import { createContext, useReducer, useMemo, type ReactNode } from 'react'
import { dataReducer, initialDataState, type DataState, type DataAction } from '../reducers/dataReducer'

interface DataContextValue {
  state: DataState
  dispatch: React.Dispatch<DataAction>
}

export const DataContext = createContext<DataContextValue>({
  state: initialDataState,
  dispatch: () => {},
})

export function DataContextProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(dataReducer, initialDataState)
  const value = useMemo(() => ({ state, dispatch }), [state, dispatch])
  return (
    <DataContext.Provider value={value}>
      {children}
    </DataContext.Provider>
  )
}
