import { useRef, useState } from 'react'
import { useGroups } from './GroupsProvider'
import { GroupSetupSteps } from './IdentityPanel'
import { groupErrorText } from './client'
import styles from './Groups.module.css'

export function JoinGroup() {
  const groups = useGroups()
  const [mode, setMode] = useState<'join' | 'create'>()
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [preview, setPreview] = useState<{ name: string; memberCount: number }>()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const version = useRef(0)
  const choose = (next: 'join' | 'create') => {
    version.current++; setMode(next); setPreview(undefined); setError(''); setBusy(false)
  }
  const inspect = async () => {
    const turn = ++version.current
    setBusy(true); setError('')
    try {
      const data = await groups.call<{ name: string; memberCount: number }>('preview_invite', { p_code: code.trim() })
      if (turn === version.current) setPreview(data)
    } catch (cause) { if (turn === version.current) setError(groupErrorText(cause)) }
    finally { if (turn === version.current) setBusy(false) }
  }
  const unavailable = groups.busy ? '正在保存，请稍候。' : !groups.online ? '当前离线，联网后即可创建或加入。' : ''
  return <section className={styles.section}>
    <GroupSetupSteps step={3}/>
    <h2>和谁一起学？</h2>
    <p className={styles.caption}>每人可加入一个小组，最多 10 人。</p>
    <div className={styles.joinChoices}>
      <button aria-pressed={mode === 'join'} onClick={() => choose('join')}><strong>加入朋友的小组</strong><span>我有邀请码</span></button>
      <button aria-pressed={mode === 'create'} onClick={() => choose('create')}><strong>创建小组</strong><span>邀请朋友一起学</span></button>
    </div>
    {mode === 'join' && <form className={styles.flowForm} onSubmit={e => { e.preventDefault(); if (!unavailable && !busy && code.trim()) void inspect() }}>
      <label className={styles.field}>朋友的邀请码<input value={code} onChange={e => { version.current++; setCode(e.target.value); setPreview(undefined); setBusy(false) }} placeholder="粘贴朋友分享的邀请码" autoComplete="off" spellCheck={false}/></label>
      <button className={`${styles.primary} ${styles.fullWidth}`} disabled={busy || Boolean(unavailable) || !code.trim()}>{busy ? '正在查看邀请…' : '查看邀请'}</button>
      {preview && <div className={styles.invitePreview}><h3>{preview.name}</h3><p>目前 {preview.memberCount} / 10 人</p><button type="button" className={`${styles.primary} ${styles.fullWidth}`} disabled={Boolean(unavailable) || preview.memberCount >= 10} onClick={() => void groups.perform('join_group', { p_code: code.trim(), p_operation_id: crypto.randomUUID() })}>确认加入</button>{preview.memberCount >= 10 && <p className={styles.caption}>小组已满，请联系朋友腾出名额。</p>}</div>}
    </form>}
    {mode === 'create' && <form className={styles.flowForm} onSubmit={e => { e.preventDefault(); if (!unavailable && Array.from(name.trim()).length >= 2) void groups.inviteGroup('create', name.trim()) }}>
      <label className={styles.field}>新小组名称<input value={name} onChange={e => setName(Array.from(e.target.value).slice(0, 30).join(''))} placeholder="例如：每天十个词"/></label>
      <p className={styles.caption}>2–30 个字。创建后会生成邀请码，分享给朋友即可。</p>
      <button className={`${styles.primary} ${styles.fullWidth}`} disabled={Boolean(unavailable) || Array.from(name.trim()).length < 2}>确认创建</button>
    </form>}
    {unavailable && <p className={styles.caption} role="status">{unavailable}</p>}
    {error && <p className={styles.error} role="alert">{error}</p>}
  </section>
}
