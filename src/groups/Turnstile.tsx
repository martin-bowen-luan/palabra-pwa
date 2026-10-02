import { useEffect,useRef,useState } from 'react'
interface TurnstileApi {render:(element:HTMLElement,options:Record<string,unknown>)=>string;remove:(id:string)=>void}
declare global {interface Window {turnstile?:TurnstileApi}}
let scriptPromise:Promise<void>|undefined
function load(){
  if(window.turnstile)return Promise.resolve()
  if(!scriptPromise)scriptPromise=new Promise<void>((resolve,reject)=>{
    const script=document.createElement('script');script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';script.async=true;script.defer=true
    script.onload=()=>resolve();script.onerror=()=>{script.remove();scriptPromise=undefined;reject(new Error('captcha unavailable'))};document.head.append(script)
  })
  return scriptPromise
}
export function Turnstile({onToken}:{onToken:(token:string)=>void}){
  const ref=useRef<HTMLDivElement>(null),callback=useRef(onToken);callback.current=onToken
  const [error,setError]=useState(''),key=import.meta.env.VITE_TURNSTILE_SITE_KEY
  useEffect(()=>{
    if(!key)return
    let active=true,id:string|undefined
    void load().then(()=>{
      if(!active||!ref.current||!window.turnstile)return
      id=window.turnstile.render(ref.current,{sitekey:key,theme:'auto',size:'flexible',callback:(token:string)=>{if(active){setError('');callback.current(token)}},
        'expired-callback':()=>{if(active){callback.current('');setError('验证已过期，请重新验证。')}},
        'error-callback':()=>{if(active){callback.current('');setError('验证暂不可用，请检查网络后重试。')}},
      })
    }).catch(()=>{if(active)setError('无法加载验证码，请检查网络后重试。')})
    return()=>{active=false;if(id)window.turnstile?.remove(id)}
  },[key])
  if(!key)return import.meta.env.DEV?null:<p role="alert">尚未配置身份验证码，请稍后再试。</p>
  return <><div ref={ref} aria-label="身份安全验证"/>{error&&<p role="alert">{error}</p>}</>
}
