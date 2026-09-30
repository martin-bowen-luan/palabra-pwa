import type { PrimaryRange } from './types'
import styles from '../styles/App.module.css'
export function PrimaryRangeFilter({value,onChange,label}:{value:PrimaryRange;onChange:(value:PrimaryRange)=>void;label:string}) {
  return <div className={styles.bookRange} role="group" aria-label={`${label}范围`}>
    <label>{label}年级<select aria-label={`${label}年级`} value={value.grade??''} onChange={e=>onChange({...value,grade:e.target.value?Number(e.target.value) as PrimaryRange['grade']:undefined})}><option value="">全部年级</option>{[1,2,3,4,5,6].map(g=><option key={g} value={g}>{g} 年级</option>)}</select></label>
    <label>{label}学期<select aria-label={`${label}学期`} value={value.semester??''} onChange={e=>onChange({...value,semester:e.target.value?Number(e.target.value) as PrimaryRange['semester']:undefined})}><option value="">全部学期</option><option value="1">上学期</option><option value="2">下学期</option></select></label>
  </div>
}
