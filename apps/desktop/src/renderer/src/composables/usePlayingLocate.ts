import {
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
  type Ref,
} from 'vue'

function getScrollParent(el: HTMLElement | null): HTMLElement | null {
  let node = el?.parentElement ?? null
  while (node) {
    const style = getComputedStyle(node)
    const oy = style.overflowY
    if (
      (oy === 'auto' || oy === 'scroll' || oy === 'overlay') &&
      node.scrollHeight > node.clientHeight + 1
    ) {
      return node
    }
    node = node.parentElement
  }
  return null
}

function isElInView(active: HTMLElement, root: HTMLElement | null) {
  const ar = active.getBoundingClientRect()
  if (!root) {
    const vh = window.innerHeight
    const visibleTop = Math.max(ar.top, 0)
    const visibleBottom = Math.min(ar.bottom, vh)
    return visibleBottom - visibleTop >= ar.height * 0.5
  }
  const rr = root.getBoundingClientRect()
  const visibleTop = Math.max(ar.top, rr.top)
  const visibleBottom = Math.min(ar.bottom, rr.bottom)
  return visibleBottom - visibleTop >= ar.height * 0.5
}

export function usePlayingLocate(options: {
  rootRef: Ref<HTMLElement | null>
  /** 当前播放行是否在本列表中（且应显示定位能力） */
  hasCurrent: () => boolean
  /** 当前播放行 DOM */
  getActiveEl: () => HTMLElement | null
  /** 显式滚动容器；不传则从 root / active 向上找 */
  scrollRef?: Ref<HTMLElement | null>
  /** 额外依赖（如列表长度、筛选），变化时重新检测 */
  deps?: () => unknown
}) {
  const showLocate = ref(false)
  let scrollTimer: ReturnType<typeof setTimeout> | null = null
  let boundScrollEl: HTMLElement | Window | null = null
  let ro: ResizeObserver | null = null

  function resolveScrollRoot(): HTMLElement | null {
    if (options.scrollRef?.value) return options.scrollRef.value
    const active = options.getActiveEl()
    if (active) return getScrollParent(active)
    return getScrollParent(options.rootRef.value)
  }

  function updateLocateVisible() {
    if (!options.hasCurrent()) {
      showLocate.value = false
      return
    }
    const active = options.getActiveEl()
    if (!active) {
      showLocate.value = false
      return
    }
    showLocate.value = !isElInView(active, resolveScrollRoot())
  }

  function onScroll() {
    if (scrollTimer) clearTimeout(scrollTimer)
    scrollTimer = setTimeout(updateLocateVisible, 80)
  }

  function unbindScroll() {
    if (!boundScrollEl) return
    boundScrollEl.removeEventListener('scroll', onScroll)
    boundScrollEl = null
  }

  function bindScroll() {
    unbindScroll()
    const root = resolveScrollRoot()
    const target: HTMLElement | Window = root || window
    target.addEventListener('scroll', onScroll, { passive: true })
    boundScrollEl = target
  }

  function locateCurrent() {
    const active = options.getActiveEl()
    if (!active) return
    active.scrollIntoView({ block: 'center', behavior: 'smooth' })
    window.setTimeout(updateLocateVisible, 360)
  }

  async function refresh() {
    await nextTick()
    bindScroll()
    updateLocateVisible()
  }

  onMounted(() => {
    void refresh()
    window.addEventListener('resize', onScroll)
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => onScroll())
      if (options.rootRef.value) ro.observe(options.rootRef.value)
    }
  })

  onBeforeUnmount(() => {
    if (scrollTimer) clearTimeout(scrollTimer)
    unbindScroll()
    window.removeEventListener('resize', onScroll)
    ro?.disconnect()
    ro = null
  })

  watch(
    () => [options.hasCurrent(), options.deps?.()] as const,
    () => {
      void refresh()
    },
  )

  watch(
    () => options.rootRef.value,
    (el) => {
      if (el && ro) ro.observe(el)
      void refresh()
    },
  )

  return {
    showLocate,
    locateCurrent,
    updateLocateVisible,
    refresh,
  }
}
