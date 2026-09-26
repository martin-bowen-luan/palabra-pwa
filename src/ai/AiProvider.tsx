import { createContext, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { storage, type PalabraStorage } from '../data/storage'
import { pronunciationPlayer } from '../audio/pronunciation'
import type { VocabularyEntry } from '../types'
import type { WordAiAnalysis } from './types'
import { AiService } from './service'

const Context = createContext<AiService | null>(null)
export function AiProvider({ children, storageClient = storage }: { children: ReactNode; storageClient?: PalabraStorage }) {
  const service = useMemo(() => new AiService(storageClient), [storageClient])
  const state = useSyncExternalStore(service.subscribe, service.getSnapshot)
  const location = useLocation()
  const wasEnabled = useRef(false)
  useEffect(() => {
    void service.load()
    const refresh = () => { void service.load() }
    const lock = () => { service.lock(); pronunciationPlayer.stop() }
    window.addEventListener('focus', refresh)
    window.addEventListener('pagehide', lock)
    return () => { window.removeEventListener('focus', refresh); window.removeEventListener('pagehide', lock); service.dispose() }
  }, [service])
  useEffect(() => {
    if (wasEnabled.current && !state.settings.enabled) pronunciationPlayer.stop()
    wasEnabled.current = state.settings.enabled
  }, [state.settings.enabled])
  useEffect(() => () => { service.cancelRequests(); pronunciationPlayer.stop() }, [service, location.pathname])
  return <Context.Provider value={service}>{children}</Context.Provider>
}
export function useAi() {
  const service = useContext(Context)
  if (!service) throw new Error('AI provider missing')
  const state = useSyncExternalStore(service.subscribe, service.getSnapshot)
  return { service, ...state }
}

export function useWordAi(word: VocabularyEntry) {
  const { service, settings, unlocked, ready, cacheEpoch, wordCacheEpochs } = useAi()
  const deletionEpoch = `${cacheEpoch}:${wordCacheEpochs[word.id] ?? 0}`
  const [analysis, setAnalysis] = useState<WordAiAnalysis>()
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const force = useRef(false)
  const deleted = useRef(false)
  const lastEpoch = useRef(deletionEpoch)
  useEffect(() => {
    const controller = new AbortController()
    if (lastEpoch.current !== deletionEpoch) { deleted.current = true; lastEpoch.current = deletionEpoch; setAnalysis(undefined); setMessage('已删除 AI 分析，可手动重新分析。') }
    if (!ready || !settings.enabled || word.language !== 'en' || deleted.current) { setLoading(false); return }
    const forceRequest = force.current
    force.current = false
    if (!forceRequest) setAnalysis(undefined)
    setLoading(true); setMessage('')
    void service.analyze(word, { signal: controller.signal, force: forceRequest }).then(result => {
      if (!controller.signal.aborted) setAnalysis(result)
    }).catch(error => {
      if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : 'AI 分析失败，请手动重试。')
    }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [service, word, settings.enabled, settings.revision, unlocked, ready, deletionEpoch, attempt])
  const regenerate = () => { deleted.current = false; force.current = true; setAttempt(n => n + 1) }
  const remove = async () => {
    try { await service.clearAnalyses(word.id) }
    catch { setMessage('未能删除本地分析，请重试。') }
  }
  return { analysis: settings.enabled ? analysis : undefined, message, loading, regenerate, remove, enabled: settings.enabled }
}
