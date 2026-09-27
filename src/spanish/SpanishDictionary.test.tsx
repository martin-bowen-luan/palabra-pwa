import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { spanishFixture } from './fixtures'
import { SpanishDictionary, groupSpanishResults } from './SpanishDictionary'

afterEach(cleanup)

describe('Spanish dictionary grammar',()=>{
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
    expect(screen.getByText('陈述式现在时 · 第一人称单数（yo）')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button',{name:/hablé/}))
    expect(selected).toBe('es:test:hable')
    expect(screen.getByRole('link',{name:'词典来源'})).toHaveAttribute('href','https://en.wiktionary.org/wiki/hablar')
  })
})
