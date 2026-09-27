import { afterEach, describe, expect, it, vi } from 'vitest'
import { WiktionaryClient, parseEnglishEntry } from './dictionary'

const html = '<div class="mw-parser-output"><div class="mw-heading mw-heading2"><h2 id="English">English</h2></div><h3>Pronunciation</h3><span class="IPA">/rɛk/</span><div class="mw-heading mw-heading3"><h3>Noun</h3></div><p>headword</p><ol><li>A destroyed <b>ship</b>.<dl><dd>Unwanted quotation.</dd></dl><script>evil()</script></li><li>A ruined thing.</li></ol><h3>Translations</h3><ol><li>Not a definition</li></ol></div>'
const ok = (value: unknown) => new Response(JSON.stringify(value))
const toc = (sections = [{hLevel:2,line:'English',index:'1'}]) => ({parse:{tocdata:{sections}}})
afterEach(()=>vi.useRealTimers())
describe('Wiktionary adapter',()=>{
  it('does not bind native fetch to the dictionary client',async()=>{
    const fetcher=vi.fn<typeof fetch>(function(this:unknown,input){
      if(this!==undefined)throw new TypeError('Illegal invocation')
      return Promise.resolve(ok(new URL(String(input)).searchParams.get('prop')==='tocdata'?toc():{parse:{text:html,revid:123}}))
    })
    await expect(new WiktionaryClient(fetcher).lookup('wreck')).resolves.toMatchObject({term:'wreck'})
  })
  it('extracts only safe POS definitions and optional IPA with revision attribution',()=>{
    expect(parseEnglishEntry('wreck',html,123)).toMatchObject({term:'wreck',ipa:'/rɛk/',definitions:[{partOfSpeech:'Noun',text:'A destroyed ship.'},{partOfSpeech:'Noun',text:'A ruined thing.'}],source:'wiktionary',revisionId:123,sourceUrl:'https://en.wiktionary.org/w/index.php?title=wreck&oldid=123'})
    expect(parseEnglishEntry('wreck',html.replace('<span class="IPA">/rɛk/</span>',''),123).ipa).toBeUndefined()
  })
  it('accepts inflections but rejects unexpected HTML instead of declaring the word absent',()=>{
    expect(parseEnglishEntry('means','<h2 id="English">English</h2><h3>Verb</h3><ol><li>Third-person singular of mean.</li></ol>',2).definitions[0].text).toContain('mean')
    expect(()=>parseEnglishEntry('wreck','<h2>English</h2><p>Broken layout</p>',2)).toThrow('暂时无法验证')
  })
  it('requests only English with credentials omitted, follows actual section number, and coalesces lookups',async()=>{
    const fetcher=vi.fn<typeof fetch>().mockResolvedValueOnce(ok(toc([{hLevel:2,line:'Dutch',index:'1'},{hLevel:2,line:'English',index:'9'}]))).mockResolvedValueOnce(ok({parse:{text:html,revid:123}}))
    const client=new WiktionaryClient(fetcher)
    const [a,b]=await Promise.all([client.lookup('wreck'),client.lookup('wreck')])
    expect(a).toEqual(b);expect(a.definitions).toHaveLength(2)
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(new URL(String(fetcher.mock.calls[1][0])).searchParams.get('section')).toBe('9')
    expect(fetcher.mock.calls[0][1]).toMatchObject({credentials:'omit'})
  })
  it.each([{error:{code:'missingtitle'}},toc([{hLevel:2,line:'French',index:'1'}])])('rejects missing English entries without fetching definitions',async response=>{
    const fetcher=vi.fn<typeof fetch>().mockResolvedValue(ok(response))
    await expect(new WiktionaryClient(fetcher).lookup('zzzzz')).rejects.toThrow('未找到有效英语词条')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it.each([new Response('no',{status:429}),ok({unexpected:true}),ok({error:{code:'ratelimited'}}),ok({parse:{tocdata:{sections:[{}]}}})])('reports service errors as unavailable with no automatic retry',async response=>{
    const fetcher=vi.fn<typeof fetch>().mockResolvedValue(response)
    await expect(new WiktionaryClient(fetcher).lookup('wreck')).rejects.toThrow('暂时无法验证')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('cancels and times out without retry even if a transport never resolves',async()=>{
    vi.useFakeTimers()
    const fetcher=vi.fn<typeof fetch>().mockImplementation(()=>new Promise(()=>{}))
    const client=new WiktionaryClient(fetcher)
    const control=new AbortController()
    const cancelled=expect(client.lookup('wreck',control.signal)).rejects.toMatchObject({name:'AbortError'})
    control.abort();await cancelled
    const timed=expect(client.lookup('means')).rejects.toThrow('超时')
    await vi.advanceTimersByTimeAsync(15000);await timed
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
})
