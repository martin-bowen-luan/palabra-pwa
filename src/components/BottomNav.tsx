import { NavLink } from 'react-router-dom'
import { LibraryIcon, ProgressIcon, SettingsIcon, TodayIcon } from './Icons'
import styles from '../styles/App.module.css'

const items = [
  { to: '/today', label: '今日', icon: TodayIcon },
  { to: '/library', label: '词库', icon: LibraryIcon },
  { to: '/progress', label: '进度', icon: ProgressIcon },
  { to: '/settings', label: '设置', icon: SettingsIcon },
]

export function BottomNav() {
  return <nav className={styles.bottomNav} aria-label="主导航">
    {items.map(({ to, label, icon: Icon }) => (
      <NavLink key={to} to={to} className={({ isActive }) => `${styles.navItem} ${isActive ? styles.navItemActive : ''}`}>
        <Icon />
        <span>{label}</span>
      </NavLink>
    ))}
  </nav>
}

