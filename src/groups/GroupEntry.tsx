import { Link } from 'react-router-dom'
import { useGroups } from './GroupsProvider'
import styles from './Groups.module.css'
export function GroupEntry(){
  const groups=useGroups()
  if(!groups.configured)return null
  const unread=groups.activity?.nudges.filter(n=>n.receiverId===groups.profile?.profileId&&!n.readAt).length??0
  return <Link to="/groups" className={styles.entry}><span>好友小组</span><small>{unread?`${unread} 条轻提醒`:groups.group?.group.name??'一起打卡，互相加油'}</small></Link>
}
