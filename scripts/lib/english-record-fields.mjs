export const cleanText=value=>String(value??'').normalize('NFC').replace(/\s+/gu,' ').trim()
export const termKey=value=>cleanText(value).toLowerCase()
export const exampleKey=example=>`${cleanText(example.text)}\n${cleanText(example.translationZh)}`
const posToken='(?:link-v|adj|adv|pron|prep|conj|interj|int|aux|num|det|art|vt|vi|v|n)\\.'
const pos=new RegExp(`(?:^|[;；|\\s])(${posToken}(?:\\s*&\\s*${posToken})*)\\s*`,'giu')
export function definitionSenses(value) {
  const text=cleanText(value).replace(/^释义\s*[:：]?\s*/u,'')
  const matches=[...text.matchAll(pos)]
  if(!matches.length)return text?[{partOfSpeech:'',meaningZh:text.replace(/[；;|]+$/u,'')}]:[]
  return matches.map((m,i)=>({partOfSpeech:m[1],meaningZh:text.slice(m.index+m[0].length,matches[i+1]?.index??text.length).trim().replace(/[；;|]+$/u,'')})).filter(s=>s.meaningZh)
}
export function bilingualSenses(sections=[]) {
  const text=sections.find(s=>s.title==='双语释义')?.text??''
  let partOfSpeech=''
  return text.split(/\r?\n/u).flatMap(line=>{
    line=cleanText(line)
    if(/^(?:n|v|vt|vi|adj|adv|pron|prep|conj|int|interj|num|det|art)\.$/u.test(line)){partOfSpeech=line;return []}
    if(!/[\u3400-\u9fff]/u.test(line)||/^[（(].*[）)]$/u.test(line))return []
    return [{partOfSpeech,meaningZh:line.replace(/^\[[^\]]+\]\s*/u,'')}]
  })
}
export function bilingualExamples(sections=[]) {
  const lines=String(sections.find(s=>s.title==='双语例句')?.text??'').split(/\r?\n/u).map(cleanText).filter(Boolean)
  const results=[]
  for(let i=0;i<lines.length-1;i++) {
    const text=lines[i],translationZh=lines[i+1]
    if(!/[\u3400-\u9fff]/u.test(text)&&/[a-z]/iu.test(text)&&/[.!?][”"']?$/u.test(text)&&text.split(/\s/u).length>=2&&/[\u3400-\u9fff]/u.test(translationZh)&&!/^用作|^作为|^更多|https?:|www\./u.test(translationZh)) {results.push({text,translationZh});i++}
  }
  return results.slice(0,3)
}
export function pronunciation(pronunciations=[]) {
  const p=pronunciations.find(p=>/^美/u.test(p.text))??pronunciations[0]
  if(!p)return undefined
  if(p.audio_url&&!/^https:\/\//u.test(p.audio_url))throw new Error('Non HTTPS audio')
  const ipa=p.text?.match(/\[([^\]]+)\]/u)?.[1]
  return {ipa:ipa?`/${ipa}/`:'',accent:/^英/u.test(p.text)?'uk':'us',...(p.audio_url?{audioPath:p.audio_url,audioKind:'human',sourceUrl:p.audio_url}:{})}
}
