import { Link } from 'react-router-dom'
import { useGroups } from './GroupsProvider'
import { GroupIcon } from '../components/Icons'
import styles from './Groups.module.css'
export function GroupEntry(){
  const groups=useGroups()
  if(!groups.configured)return null
  const unread=groups.activity?.nudges.filter(n=>n.receiverId===groups.profile?.profileId&&!n.readAt).length??0
  return <Link to="/groups" className={styles.entry}>
    <GroupIcon width={28} height={28}/><span className={styles.entryCopy}><strong>进入学习小组</strong><small>{unread?`${unread} 条朋友的提醒`:groups.group?.group.name??'和朋友一起打卡，互相加油'}</small></span>
    <span className={styles.entryAction} aria-hidden="true">进入</span>
  </Link>
}
