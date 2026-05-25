import { useContext } from 'react'
import { DataContext } from './DataContext'
import { AppContext } from './AppContext'
import { DetailContext } from './DetailContext'

export function useData() {
  return useContext(DataContext)
}

export function useApp() {
  return useContext(AppContext)
}

export function useDetail() {
  return useContext(DetailContext)
}
