import type { SVGProps } from 'react'

function IconBase({ children, ...props }: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{children}</svg>
}

export const TodayIcon = (props: SVGProps<SVGSVGElement>) => <IconBase {...props}><path d="M5 4.5h14v15H5z"/><path d="M8 2.5v4M16 2.5v4M5 9h14"/><path d="m9 14 2 2 4-4"/></IconBase>
export const LibraryIcon = (props: SVGProps<SVGSVGElement>) => <IconBase {...props}><path d="M4 4h6v16H4zM14 4h6v16h-6z"/><path d="M7 8h0M17 8h0"/></IconBase>
export const ProgressIcon = (props: SVGProps<SVGSVGElement>) => <IconBase {...props}><path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/></IconBase>
export const SettingsIcon = (props: SVGProps<SVGSVGElement>) => <IconBase {...props}><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.4 1A8 8 0 0 0 15 6l-.3-2.5h-4L10.5 6A8 8 0 0 0 9 7.1l-2.4-1-2 3.4 2 1.5a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.4-1a8 8 0 0 0 1.5 1.1l.3 2.5h4L15 18a8 8 0 0 0 1.5-1.1l2.4 1 2-3.4-2-1.5a7 7 0 0 0 .1-1Z"/></IconBase>
export const SearchIcon = (props: SVGProps<SVGSVGElement>) => <IconBase {...props}><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></IconBase>
export const BackIcon = (props: SVGProps<SVGSVGElement>) => <IconBase {...props}><path d="m15 18-6-6 6-6"/></IconBase>

