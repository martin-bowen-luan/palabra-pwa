import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { spanishFixture } from './fixtures'
import { SpanishDictionary, groupSpanishResults } from './SpanishDictionary'
import { SpanishPrompt } from './SpanishPrompt'
import type { SpanishGrammar } from './types'

afterEach(cleanup)

describe('Spanish dictionary grammar',()=>{
  it.each<[SpanishGrammar['gender'],string]>([['masculine','阳性'],['feminine','阴性'],['common','通性'],['variable','阴阳两性均可']])('marks %s gender consistently without losing written grammar', (gender,label)=>{
    const word=spanishFixture()
    word.spanishData!.grammar={gender,number:'singular'}
    word.spanishData!.grammarLabel=`名词 · ${label} · 单数`
    render(<><SpanishPrompt word={word} revealed={false}/><SpanishDictionary word={word} vocabulary={[word]} progress={{}} select={()=>{}}/></>)
    const genders=screen.getAllByText(label,{exact:true})
    expect(genders).toHaveLength(3)
    for(const tag of genders)expect(tag).toHaveAttribute('data-gender',gender)
    expect(screen.getAllByLabelText('语法标签')).toHaveLength(3)
    for(const tags of screen.getAllByLabelText('语法标签'))expect(tags).toHaveTextContent(`名词 · ${label} · 单数`)
  })
  it('links to a readable source page instead of the one-gigabyte source download',()=>{
    const word=spanishFixture()
    word.spanishData!.source.url='https://kaikki.org/dictionary/Spanish/kaikki.org-dictionary-Spanish.jsonl'
    render(<SpanishDictionary word={word} vocabulary={[word]} progress={{}} select={()=>{}}/>)
    expect(screen.getByRole('link',{name:'词典来源'})).toHaveAttribute('href','https://kaikki.org/dictionary/Spanish/index.html')
    expect(screen.getByRole('link',{name:'来源与许可说明'})).toHaveAttribute('href',`${import.meta.env.BASE_URL}licenses/Spanish-Wiktionary.txt`)
  })
  it('groups homographs while retaining distinct analyses',()=>{
    const a=spanishFixture('ser-fui','fui','ser'),b=spanishFixture('ir-fui','fui','ir')
    expect(groupSpanishResults([a,b])).toHaveLength(1)
    expect(groupSpanishResults([a,b])[0].words.map(w=>w.id)).toEqual(['ser-fui','ir-fui'])
  })
  it('shows sourced grammar and linked tense forms, without merging progress',async()=>{
    const word=spanishFixture(),past=spanishFixture('es:test:hable','hablé')
    past.spanishData!.grammar.tense='preterite';past.spanishData!.grammarLabel='简单过去时 · 第一人称单数'
    let selected=''
    render(<SpanishDictionary word={word} vocabulary={[word,past]} progress={{}} select={id=>{selected=id}}/>)
    expect(screen.getAllByText('陈述式现在时 · 第一人称单数（yo）')).toHaveLength(2)
    await userEvent.click(screen.getByRole('button',{name:/hablé/}))
    expect(selected).toBe('es:test:hable')
    expect(screen.getByRole('link',{name:'词典来源'})).toHaveAttribute('href','https://en.wiktionary.org/wiki/hablar')
  })
})
