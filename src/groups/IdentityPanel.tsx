import { useState } from 'react'
import { useGroups } from './GroupsProvider'
import { Turnstile } from './Turnstile'
import styles from './Groups.module.css'
export function GroupSetupSteps({step}:{step:1|2|3}){
  return <ol className={styles.setupSteps} aria-label="加入小组的步骤">{['设置昵称','保存恢复码','加入小组'].map((label,index)=><li key={label} aria-current={step===index+1?'step':undefined} data-complete={step>index+1}><span aria-hidden="true">{step>index+1?'✓':index+1}</span>{label}</li>)}</ol>
}
export function SecretCode({value,label}:{value:string;label:string}){
  const [copied,setCopied]=useState('')
  const copy=async()=>{try{await navigator.clipboard.writeText(value);setCopied('已复制，请保存到安全位置。')}catch{setCopied('未能复制，请手动选择上面的代码保存。')}}
  return <><label className={styles.field}>{label}<textarea readOnly className={styles.secret} value={value.match(/.{1,8}/g)?.join(' ')??value} rows={3} autoComplete="off" spellCheck={false}/></label><button onClick={()=>void copy()}>复制{label}</button>{copied&&<p role="status" className={styles.caption}>{copied}</p>}</>
}
export function IdentityPanel(){
  const groups=useGroups(),[mode,setMode]=useState<'register'|'recover'>('register'),[nickname,setNickname]=useState(''),[code,setCode]=useState(''),[consent,setConsent]=useState(false),[token,setToken]=useState(''),[attempt,setAttempt]=useState(0)
  const pending=groups.pending
  if(pending)return <section className={styles.section} aria-label="保存恢复码">
    <GroupSetupSteps step={2}/>
    <h2>{pending.result?'请先保存恢复码':'正在确认身份操作'}</h2>
    {pending.result?<><p>恢复码等同于身份钥匙，不要发给朋友。换设备时会生成新码，旧码随即失效。</p><SecretCode value={pending.nextSecret} label="恢复码"/><div className={styles.actions}><button className={styles.primary} disabled={groups.busy} onClick={()=>void groups.confirmIdentity()}>我已安全保存</button></div></>:<>
      <p>请求可能已经成功。先查询原操作结果，不会重复创建身份。</p>
      {pending.action==='recover'&&<label className={styles.field}>原恢复码（仅重试未完成请求时需要）<input value={code} onChange={e=>setCode(e.target.value)} type="password" autoComplete="off"/></label>}
      <button disabled={groups.busy||!groups.online} onClick={()=>void groups.resumeIdentity(code)}>查询并继续原操作</button>
    </>}
  </section>
  const begin=async()=>{await groups.beginIdentity(mode,{nickname,code},token);setToken('');setAttempt(n=>n+1)}
  const unavailable=groups.busy?'正在建立身份，请稍候。':!groups.online?'当前离线，联网后即可继续。':!(mode==='register'?nickname.trim():code.trim())?(mode==='register'?'填写一个朋友认得出的昵称。':'请输入已保存的恢复码。'):!consent?'请先阅读并同意共享范围。':!import.meta.env.DEV&&!token?'完成上方验证后即可继续。':''
  return <section className={styles.section}>
    {mode==='register'&&<GroupSetupSteps step={1}/>}
    <h2>{mode==='register'?'先让朋友认出你':'找回我的身份'}</h2>
    <p className={styles.caption}>只共享加入后的每日新学、复习数量、目标完成率和主动发布的一句话。不上传具体单词、答题内容、AI 密钥或 Wordle 记录。</p>
    <details><summary>共享与恢复说明</summary><p className={styles.caption}>每组最多 10 人，组内保留最近 30 天记录。退出身份会清除本机小组缓存，不删除背词记录。朋友已看到的内容无法收回。云端服务由 Supabase 提供，身份验证使用 Cloudflare；浏览器中的身份仍需防范恶意脚本。</p><p className={styles.caption}>恢复身份会让旧设备失去小组访问权，不会下载完整学习进度。换设备当天的数量取保守汇总，可能少计，不会翻倍。</p></details>
    <div className={styles.tabs}><button aria-pressed={mode==='register'} onClick={()=>setMode('register')}>第一次使用</button><button aria-pressed={mode==='recover'} onClick={()=>setMode('recover')}>恢复身份</button></div>
    {mode==='register'?<label className={styles.field}>昵称<input value={nickname} onChange={e=>setNickname(Array.from(e.target.value).slice(0,20).join(''))} placeholder="朋友认识的名字" autoComplete="nickname"/></label>:<label className={styles.field}>恢复码<input type="password" value={code} onChange={e=>setCode(e.target.value)} autoComplete="off" spellCheck={false}/></label>}
    <label className={styles.check}><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>我同意上述共享范围，并会妥善保存恢复码</label>
    {consent&&<Turnstile key={attempt} onToken={setToken}/>}
    <button className={`${styles.primary} ${styles.fullWidth}`} aria-describedby="identity-next-step" disabled={Boolean(unavailable)} onClick={()=>void begin()}>{mode==='register'?'建立身份':'使用恢复码'}</button>
    <p id="identity-next-step" className={styles.caption} role="status">{unavailable||(mode==='register'?'下一步：保存恢复码，以便换设备时找回。':'恢复后旧设备将失去小组访问权。')}</p>
  </section>
}
