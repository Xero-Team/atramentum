/**
 * 让「系统返回」先关掉应用内的浮层，而不是直接跳走。
 *
 * 为什么需要：装到桌面后是独立窗口，没有浏览器返回按钮，Android 的返回手势
 * 是唯一的「退一步」入口。浮层原先不进 history，按返回会直接跳离当前页——
 * 在浏览器里还不算明显（有返回按钮兜底），装成应用之后就很别扭。
 *
 * 做法是经典的 history 陷阱：浮层打开时压一条带标记的历史，返回键先弹掉它；
 * 浮层被 ✕ / 遮罩关掉时，再把这条历史悄悄弹掉，免得留下一条「死历史」
 * （留着的话用户会觉得返回键时灵时不灵）。
 *
 * 两个容易写错的地方：
 * 1. 叠着的浮层。多个浮层各挂一个监听，一次返回会把它们全关掉。所以用栈记录，
 *    一次 popstate 只关最上面那层。
 * 2. 关浮层的同时发生路由跳转。比如在目录抽屉里点一节课：跳转和关抽屉在同一个
 *    事件里，跳转先把历史顶掉了，此时再 back() 会把刚做完的跳转撤销掉。
 *    所以关的时候要确认「当前这条历史还带着我的标记」，不是就别动。
 */
import { useEffect, useRef } from 'react'

interface Entry {
  id: number
  close: () => void
}

const stack: Entry[] = []
/** 由我们自己调 history.back() 引发的 popstate——这类不该拿去关浮层 */
let selfPops = 0
let listening = false
let seq = 0

function onPopState() {
  if (selfPops > 0) {
    selfPops--
    return
  }
  stack.pop()?.close()
}

/** 压一层「返回即关闭」，返回的是取消函数——直接当 useEffect 的 cleanup 用 */
export function pushBackHandler(close: () => void): () => void {
  if (!listening) {
    listening = true
    window.addEventListener('popstate', onPopState)
  }

  const id = ++seq
  const entry: Entry = { id, close }
  stack.push(entry)
  // 展开原有 state：React Router 在 history.state 里存了 key / idx，
  // 整个覆盖掉会让它的前进后退判定失准
  window.history.pushState({ ...window.history.state, moxueOverlay: id }, '')

  return () => {
    const i = stack.findIndex((e) => e.id === id)
    if (i < 0) return // 已经是返回键关掉的，那条历史被浏览器消费掉了
    stack.splice(i, 1)
    if ((window.history.state as { moxueOverlay?: number } | null)?.moxueOverlay !== id) return
    selfPops++
    window.history.back()
  }
}

/** 把浮层的开关绑到系统返回上。onClose 走 ref，避免它每次渲染换新函数时重复压历史 */
export function useBackToClose(open: boolean, onClose: () => void): void {
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    if (!open) return
    return pushBackHandler(() => closeRef.current())
  }, [open])
}
