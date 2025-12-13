import { RefObject, useCallback, useEffect, useState } from 'react'
import { useResize } from '@/Utils/Hooks/useResize'

export const useDimensions = (ref: RefObject<HTMLElement>, deps: any[]) => {
  const [dimensions, setDimensions] = useState({
    height: 300,
    width: 300,
  })

  const updateDimensions = useCallback(() => {
    setDimensions({
      width: ref?.current?.clientWidth ?? 300,
      height: ref?.current?.clientHeight ?? 300,
    })
  }, [ref])

  useEffect(() => {
    updateDimensions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updateDimensions, ...deps])

  useResize(updateDimensions)

  return dimensions
}
