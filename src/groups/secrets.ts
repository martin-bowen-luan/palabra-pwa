export function makeSecret(bytes:16|32):string {
  if(bytes!==16&&bytes!==32) throw new Error('Invalid secret length')
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)),b=>b.toString(16).padStart(2,'0')).join('')
}
export async function hashSecret(code:string):Promise<string> {
  const normalized=code.replace(/\s/g,'').toLowerCase()
  if(!/^(?:[a-f0-9]{32}|[a-f0-9]{64})$/.test(normalized)) throw new Error('代码格式不正确')
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(normalized))),b=>b.toString(16).padStart(2,'0')).join('')
}
