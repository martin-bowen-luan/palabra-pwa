import { NavLink } from 'react-router-dom'
import { GroupIcon, LibraryIcon, ProgressIcon, SettingsIcon, TodayIcon } from './Icons'
import { useGroups } from '../groups/GroupsProvider'
import styles from '../styles/App.module.css'

const items = [
  { to: '/today', label: '今日', icon: TodayIcon },
  { to: '/library', label: '词库', icon: LibraryIcon },
  { to: '/groups', label: '小组', icon: GroupIcon },
  { to: '/progress', label: '进度', icon: ProgressIcon },
  { to: '/settings', label: '设置', icon: SettingsIcon },
]

export function BottomNav() {
  const groups = useGroups()
  return <nav className={styles.bottomNav} aria-label="主导航">
    {items.filter(item => item.to !== '/groups' || groups.configured).map(({ to, label, icon: Icon }) => (
      <NavLink key={to} to={to} className={({ isActive }) => `${styles.navItem} ${isActive ? styles.navItemActive : ''}`}>
        <Icon />
        <span>{label}</span>
      </NavLink>
    ))}
  </nav>
}
