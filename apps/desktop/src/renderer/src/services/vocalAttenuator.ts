/**
 * 人声衰减（K 歌 / 随心唱）
 *
 * 策略：Mid/Side + 仅压低人声频段 Mid（约 180Hz–4.5kHz），
 * 低频/高频 Mid 多保留，并略抬 Side，尽量保住伴奏清晰度。
 * 关闭 K 歌时走干声直通，避免分频链路染色。
 *
 * 注意：createMediaElementSource 每个 HTMLMediaElement 只能调用一次。
 */

export type VocalAttenuatorOptions = {
  karaokeMode?: boolean
  /** 0 = 最大消人声，1 = 保留完整人声 */
  vocalLevel?: number
}

type Graph = {
  ctx: AudioContext
  source: MediaElementAudioSourceNode
  dryGain: GainNode
  wetGain: GainNode
  midLowGain: GainNode
  midVocalGain: GainNode
  midHighGain: GainNode
  sideGain: GainNode
  clarityShelf: BiquadFilterNode
  wetMakeup: GainNode
}

function clamp01(v: number) {
  return Math.min(1, Math.max(0, v))
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

export class VocalAttenuator {
  private graph: Graph
  private karaokeMode = false
  private vocalLevel = 1
  private disposed = false

  private constructor(graph: Graph, opts?: VocalAttenuatorOptions) {
    this.graph = graph
    if (opts?.karaokeMode != null) this.karaokeMode = opts.karaokeMode
    if (opts?.vocalLevel != null) this.vocalLevel = clamp01(opts.vocalLevel)
    this.applyGains(true)
  }

  static attach(audio: HTMLAudioElement, opts?: VocalAttenuatorOptions): VocalAttenuator {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new AC()

    const source = ctx.createMediaElementSource(audio)

    // 干声：原曲直通
    const dryGain = ctx.createGain()
    dryGain.gain.value = 1
    source.connect(dryGain)
    dryGain.connect(ctx.destination)

    // 湿声：M/S 人声处理
    const wetGain = ctx.createGain()
    wetGain.gain.value = 0

    const splitter = ctx.createChannelSplitter(2)
    const merger = ctx.createChannelMerger(2)
    source.connect(splitter)

    const midL = ctx.createGain()
    const midR = ctx.createGain()
    midL.gain.value = 0.5
    midR.gain.value = 0.5
    const midBus = ctx.createGain()
    midBus.gain.value = 1

    const sideL = ctx.createGain()
    const sideR = ctx.createGain()
    sideL.gain.value = 0.5
    sideR.gain.value = -0.5
    const sideBus = ctx.createGain()
    sideBus.gain.value = 1
    const sideGain = ctx.createGain()
    sideGain.gain.value = 1

    splitter.connect(midL, 0)
    splitter.connect(midR, 1)
    splitter.connect(sideL, 0)
    splitter.connect(sideR, 1)
    midL.connect(midBus)
    midR.connect(midBus)
    sideL.connect(sideBus)
    sideR.connect(sideBus)
    sideBus.connect(sideGain)

    // 三段：低 / 人声带 / 高 —— 只大力压人声带
    const lowLp = ctx.createBiquadFilter()
    lowLp.type = 'lowpass'
    lowLp.frequency.value = 220
    lowLp.Q.value = 0.707

    const vocalHp = ctx.createBiquadFilter()
    vocalHp.type = 'highpass'
    vocalHp.frequency.value = 180
    vocalHp.Q.value = 0.707
    const vocalLp = ctx.createBiquadFilter()
    vocalLp.type = 'lowpass'
    vocalLp.frequency.value = 4500
    vocalLp.Q.value = 0.707

    const highHp = ctx.createBiquadFilter()
    highHp.type = 'highpass'
    highHp.frequency.value = 4200
    highHp.Q.value = 0.707

    const midLowGain = ctx.createGain()
    const midVocalGain = ctx.createGain()
    const midHighGain = ctx.createGain()
    midLowGain.gain.value = 1
    midVocalGain.gain.value = 1
    midHighGain.gain.value = 1

    // 分频重叠补偿，避免湿声整体过响
    const midSum = ctx.createGain()
    midSum.gain.value = 0.72

    midBus.connect(lowLp)
    lowLp.connect(midLowGain)
    midLowGain.connect(midSum)

    midBus.connect(vocalHp)
    vocalHp.connect(vocalLp)
    vocalLp.connect(midVocalGain)
    midVocalGain.connect(midSum)

    midBus.connect(highHp)
    highHp.connect(midHighGain)
    midHighGain.connect(midSum)

    const leftMid = ctx.createGain()
    const leftSide = ctx.createGain()
    const rightMid = ctx.createGain()
    const rightSide = ctx.createGain()
    leftMid.gain.value = 1
    leftSide.gain.value = 1
    rightMid.gain.value = 1
    rightSide.gain.value = -1

    const leftSum = ctx.createGain()
    const rightSum = ctx.createGain()
    leftSum.gain.value = 1
    rightSum.gain.value = 1

    midSum.connect(leftMid)
    midSum.connect(rightMid)
    sideGain.connect(leftSide)
    sideGain.connect(rightSide)
    leftMid.connect(leftSum)
    leftSide.connect(leftSum)
    rightMid.connect(rightSum)
    rightSide.connect(rightSum)

    const clarityShelf = ctx.createBiquadFilter()
    clarityShelf.type = 'highshelf'
    clarityShelf.frequency.value = 5500
    clarityShelf.gain.value = 0

    const wetMakeup = ctx.createGain()
    wetMakeup.gain.value = 1

    leftSum.connect(merger, 0, 0)
    rightSum.connect(merger, 0, 1)
    merger.connect(clarityShelf)
    clarityShelf.connect(wetMakeup)
    wetMakeup.connect(wetGain)
    wetGain.connect(ctx.destination)

    return new VocalAttenuator(
      {
        ctx,
        source,
        dryGain,
        wetGain,
        midLowGain,
        midVocalGain,
        midHighGain,
        sideGain,
        clarityShelf,
        wetMakeup,
      },
      opts,
    )
  }

  get context() {
    return this.graph.ctx
  }

  get isKaraokeMode() {
    return this.karaokeMode
  }

  get level() {
    return this.vocalLevel
  }

  async resume() {
    if (this.disposed) return
    if (this.graph.ctx.state === 'suspended') {
      try {
        await this.graph.ctx.resume()
      } catch {
        // ignore
      }
    }
  }

  setKaraokeMode(on: boolean) {
    if (this.disposed || this.karaokeMode === on) return
    this.karaokeMode = on
    this.applyGains()
  }

  setVocalLevel(level: number) {
    if (this.disposed) return
    const next = clamp01(level)
    if (Math.abs(next - this.vocalLevel) < 0.001) return
    this.vocalLevel = next
    this.applyGains()
  }

  private applyGains(immediate = false) {
    const { dryGain, wetGain, midLowGain, midVocalGain, midHighGain, sideGain, clarityShelf, wetMakeup } =
      this.graph
    const t = this.graph.ctx.currentTime
    const ramp = immediate ? 0.012 : 0.08

    if (!this.karaokeMode) {
      this.setGain(dryGain.gain, 1, t, ramp)
      this.setGain(wetGain.gain, 0, t, ramp)
      this.setGain(wetMakeup.gain, 1, t, ramp)
      clarityShelf.gain.cancelScheduledValues(t)
      clarityShelf.gain.setValueAtTime(clarityShelf.gain.value, t)
      clarityShelf.gain.linearRampToValueAtTime(0, t + ramp)
      return
    }

    const v = this.vocalLevel
    // 人声带最低约 0.06，避免完全挖空产生伪影
    const vocal = lerp(0.06, 1, v)
    const low = lerp(0.9, 1, v)
    const high = lerp(0.75, 1, v)
    const side = lerp(1.2, 1, v)
    const shelfDb = lerp(2.4, 0, v)
    const makeup = lerp(1.1, 1, v)

    this.setGain(dryGain.gain, 0, t, ramp)
    this.setGain(wetGain.gain, 1, t, ramp)
    this.setGain(midLowGain.gain, low, t, ramp)
    this.setGain(midVocalGain.gain, vocal, t, ramp)
    this.setGain(midHighGain.gain, high, t, ramp)
    this.setGain(sideGain.gain, side, t, ramp)
    this.setGain(wetMakeup.gain, makeup, t, ramp)

    clarityShelf.gain.cancelScheduledValues(t)
    clarityShelf.gain.setValueAtTime(clarityShelf.gain.value, t)
    clarityShelf.gain.linearRampToValueAtTime(shelfDb, t + ramp)
  }

  private setGain(param: AudioParam, value: number, t: number, ramp: number) {
    param.cancelScheduledValues(t)
    param.setValueAtTime(param.value, t)
    param.linearRampToValueAtTime(value, t + ramp)
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    try {
      this.graph.source.disconnect()
    } catch {
      // ignore
    }
    void this.graph.ctx.close()
  }
}
