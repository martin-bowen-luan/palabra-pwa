import { useGroups } from './GroupsProvider'
import { SecretCode } from './IdentityPanel'
import styles from './Groups.module.css'

export function GroupInvitation({ onClose }: { onClose: () => void }) {
  const groups = useGroups()
  const owner = groups.group?.group.ownerId === groups.profile?.profileId
  return <section className={styles.invitePanel} aria-label="邀请朋友">
    <div className={styles.header}><h2>邀请朋友</h2>{!groups.invite && <button className={styles.quiet} onClick={onClose}>收起邀请</button>}</div>
    {groups.invite ? groups.invite.confirmed ? <>
      <SecretCode label="邀请码" value={groups.invite.secret}/>
      <p className={styles.caption}>仅分享给信任的朋友，7 天内有效。朋友打开“小组”，选择“加入朋友的小组”后粘贴即可。</p>
      <button className={`${styles.primary} ${styles.fullWidth}`} disabled={groups.busy} onClick={() => void groups.dismissInvite().then(ok => { if (ok) onClose() })}>我已保存邀请码</button>
    </> : <>
      <p>邀请码操作结果尚待确认，请继续原操作。</p>
      <button className={styles.primary} disabled={groups.busy || !groups.online} onClick={() => void groups.inviteGroup(groups.invite!.action, groups.invite!.name)}>确认邀请码操作</button>
    </> : owner ? <>
      <p>生成邀请码，发给想一起学习的朋友。</p>
      <p className={styles.caption}>新邀请码 7 天有效，生成后旧码立即失效。</p>
      <button className={`${styles.primary} ${styles.fullWidth}`} disabled={groups.busy || !groups.online} onClick={() => void groups.inviteGroup('rotate')}>生成新邀请码</button>
      {!groups.online && <p className={styles.caption}>当前离线，联网后即可生成邀请码。</p>}
    </> : <p>请向组主索取邀请码，再分享给想加入的朋友。只有组主可以生成新码。</p>}
  </section>
}
