import { useEffect, useRef } from 'react'

/*
 * WASD / ok tuşlarını re-render tetiklemeden bir ref içinde tutar.
 * Oyun döngüsü her karede ref.current içinden okur — React asla
 * tuş basışları yüzünden yeniden render edilmez.
 */
export function useInput() {
  const keys = useRef<Record<string, boolean>>({})

  useEffect(() => {
    const set = (code: string, value: boolean) => {
      keys.current[code] = value
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.code === 'ArrowUp' ||
        e.code === 'ArrowDown' ||
        e.code === 'ArrowLeft' ||
        e.code === 'ArrowRight' ||
        e.code === 'Space'
      ) {
        e.preventDefault()
      }
      set(e.code, true)
    }

    const onKeyUp = (e: KeyboardEvent) => set(e.code, false)

    const onBlur = () => {
      keys.current = {}
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [])

  return keys
}
