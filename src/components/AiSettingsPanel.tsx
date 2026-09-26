import { useEffect, useRef, useState } from 'react'
import { useAi } from '../ai/AiProvider'
import { useAppState } from '../app/AppState'
import type { AiSettings } from '../ai/types'
import styles from './AiSettingsPanel.module.css'

const qwenRegions = [
  { name: '中国内地（北京）', url: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
  { name: '国际（新加坡）', url: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1' },
]
export function AiSettingsPanel() {
  const { service, settings, ready, unlocked, hasCredential, busy: analyzing, error: loadError } = useAi()
  const { vocabulary } = useAppState()
  const [draft, setDraft] = useState(settings)
  const [consent, setConsent] = useState(settings.consentVersion === 1)
  const [destinationConfirmed, setDestinationConfirmed] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [password, setPassword] = useState('')
  const [unlockPassword, setUnlockPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [confirmClear, setConfirmClear] = useState<'configuration' | 'analyses'>()
  const pending = useRef(false)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => { setDraft(settings); setConsent(settings.consentVersion === 1); setApiKey(''); setPassword(''); setUnlockPassword(''); setDestinationConfirmed(false) }, [settings])
  const perform = async (action: () => Promise<void>, success = '') => {
    if (pending.current) return
    pending.current = true; setBusy(true); setError(''); setMessage('')
    try { await action(); if (mounted.current) setMessage(success) }
    catch (error) { if (mounted.current) setError(error instanceof Error ? error.message : '操作失败，请重试。') }
    finally { pending.current = false; if (mounted.current) { setBusy(false); setPassword(''); setUnlockPassword(''); setApiKey('') } }
  }
  const endpoint = (baseUrl: string, provider = draft.provider) => {
    setDraft(current => ({ ...current, baseUrl, provider })); setApiKey(''); setPassword(''); setDestinationConfirmed(false)
  }
  const provider = (value: AiSettings['provider']) => {
    endpoint(value === 'deepseek' ? 'https://api.deepseek.com' : value === 'qwen' ? qwenRegions[0].url : '', value)
  }
  if (!ready) return <section className={styles.panel}><h2>AI 词汇分析</h2><p>正在读取本地配置…</p></section>
  return <section className={styles.panel} aria-label="AI 设置">
    <header><h2>AI 词汇分析</h2><span>{settings.enabled ? unlocked ? '已解锁' : '密钥已锁定' : '未启用'}</span></header>
    <label className={styles.toggle}><span>启用 AI 词汇分析</span><input type="checkbox" checked={settings.enabled} disabled={busy || Boolean(loadError)} onChange={event => void perform(() => service.setEnabled(event.target.checked, consent))} /></label>
    <p>自动补充你查看过的英语词汇，不扫描整本词库。已有结果可离线查看；模型分析可能出错，原词典资料会保留。</p>
    <details className={styles.disclosure} open={settings.consentVersion !== 1}>
      <summary>数据、费用与密钥安全</summary>
      <p>当前单词、释义、例句和构词资料会发送到你填写的服务地址，不发送学习记录。调用费用由你的 API 账户承担。</p>
      <p>密钥用本地密码加密保存，刷新后需解锁。解锁期间仍需信任此设备与网页；加密不能防止恶意网页脚本读取已解锁的密钥。忘记密码只能清除后重新配置。</p>
      <label className={styles.check}><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} />我已了解并同意数据发送、费用和本地密钥风险</label>
    </details>
    {settings.enabled && <>
      <details open={!hasCredential} className={styles.disclosure}>
        <summary>{hasCredential ? '修改模型配置' : '配置模型'}</summary>
        <form className={styles.form} onSubmit={event => {
          event.preventDefault()
          void perform(async () => {
            if (!destinationConfirmed) throw new Error('请确认密钥将发送的服务地址。')
            await service.configure({ ...draft, enabled: settings.enabled, consentVersion: consent ? 1 : 0 }, apiKey, password)
          }, '配置已加密保存。')
        }}>
          <label>服务商<select value={draft.provider} onChange={event => provider(event.target.value as AiSettings['provider'])}><option value="deepseek">DeepSeek</option><option value="qwen">Qwen（通义千问）</option><option value="custom">自定义兼容接口</option></select></label>
          {draft.provider === 'qwen' && <><label>Qwen 地域<select value={qwenRegions.some(region => region.url === draft.baseUrl) ? draft.baseUrl : ''} onChange={event => endpoint(event.target.value)}><option value="" disabled>自定义地址</option>{qwenRegions.map(region => <option key={region.url} value={region.url}>{region.name}</option>)}</select></label><p>密钥和地域必须匹配。若控制台提供专属地址，请在下方替换。</p></>}
          <label>API 地址（Base URL）<input type="url" required value={draft.baseUrl} onChange={event => endpoint(event.target.value)} placeholder="https://api.example.com/v1" spellCheck={false} autoCapitalize="none" /></label>
          <label>模型名<input required value={draft.model} maxLength={120} onChange={event => setDraft(current => ({ ...current, model: event.target.value }))} placeholder="填写服务商提供的模型名" autoCapitalize="none" spellCheck={false} /></label>
          <label>API 密钥<input type="password" required value={apiKey} onChange={event => setApiKey(event.target.value)} autoComplete="off" maxLength={2048} /></label>
          <label>本地加密密码<input type="password" required minLength={8} value={password} onChange={event => setPassword(event.target.value)} autoComplete="new-password" maxLength={256} /></label>
          <small>至少 8 个字符；这是本机解锁密码，不是服务商密码。</small>
          <label className={styles.check}><input type="checkbox" checked={destinationConfirmed} onChange={event => setDestinationConfirmed(event.target.checked)} />确认仅向此地址发送密钥：{draft.baseUrl || '请填写地址'}</label>
          <button className={styles.primary} disabled={busy}>加密保存并解锁</button>
        </form>
      </details>
      {hasCredential && <div className={styles.unlock}>
        <p>{settings.model} · {settings.baseUrl}</p>
        {!unlocked ? <form className={styles.form} onSubmit={event => { event.preventDefault(); void perform(() => service.unlock(unlockPassword), '已解锁，本次使用有效。') }}><label>解锁密码<input type="password" required value={unlockPassword} onChange={event => setUnlockPassword(event.target.value)} autoComplete="current-password" maxLength={256} /></label><button disabled={busy}>解锁密钥</button></form> : <button disabled={busy} onClick={() => { service.lock(); setMessage('密钥已锁定。') }}>锁定密钥</button>}
        <button disabled={busy || !unlocked || analyzing || !vocabulary.some(word => word.language === 'en')} onClick={() => void perform(async () => {
          const sample = vocabulary.find(word => word.language === 'en')!
          await service.analyze(sample, { force: true })
        }, '连接成功，示例词分析已缓存。')}>测试连接（产生少量用量）</button>
        <p>接口需允许浏览器跨域请求。不支持时，请使用你自己的可信兼容网关；应用不会转交给公共代理。</p>
      </div>}
      <p>例句朗读使用系统英语语音，不消耗模型额度；不必解锁密钥。离线朗读需设备安装本地英语语音。</p>
    </>}
    <div className={styles.actions}>
      {hasCredential && <button disabled={busy} onClick={() => setConfirmClear('configuration')}>清除模型配置与密钥</button>}
      <button disabled={busy} onClick={() => setConfirmClear('analyses')}>清空全部 AI 分析</button>
    </div>
    {confirmClear && <div className={styles.confirm}><p>{confirmClear === 'configuration' ? '清除后会关闭 AI，学习记录和已缓存分析仍保留。' : '仅删除 AI 补充资料，不影响原词库、密钥和学习记录。'}</p><button disabled={busy} onClick={() => void perform(async () => { if (confirmClear === 'configuration') await service.clearConfiguration(); else await service.clearAnalyses(); setConfirmClear(undefined) }, '已清除。')}>确认清除</button><button disabled={busy} onClick={() => setConfirmClear(undefined)}>取消</button></div>}
    {(error || loadError) && <p role="alert" className={styles.error}>{error || loadError}</p>}
    {message && <p role="status">{message}</p>}
  </section>
}
