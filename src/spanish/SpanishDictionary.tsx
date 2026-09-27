import type { VocabularyEntry, WordProgress } from '../types'
import { normalizeSpanish } from './course'
import styles from './Spanish.module.css'

const tenseNames:Record<string,string>={present:'陈述式现在时',preterite:'简单过去时',imperfect:'过去未完成时',future:'简单将来时',other:'原形与性数变化'}
export function groupSpanishResults(words:VocabularyEntry[]):Array<{term:string;words:VocabularyEntry[]}> {
  const groups=new Map<string,{term:string;words:VocabularyEntry[]}>()
  for(const word of words) {
    const key=normalizeSpanish(word.term),group=groups.get(key)
    if(group)group.words.push(word)
    else groups.set(key,{term:word.term,words:[word]})
  }
  return [...groups.values()]
}
export function SpanishDictionary({word,vocabulary,progress,select}:{word:VocabularyEntry;vocabulary:VocabularyEntry[];progress:Record<string,WordProgress>;select:(id:string)=>void}) {
  const data=word.spanishData
  if(!data)return null
  const related=vocabulary.filter(w=>w.spanishData?.lemmaId===data.lemmaId)
  const readableSource=data.source.url==='https://kaikki.org/dictionary/Spanish/kaikki.org-dictionary-Spanish.jsonl'
    ? 'https://kaikki.org/dictionary/Spanish/index.html' : data.source.url
  return <section className={styles.dictionary} aria-label="西语语法与变化表">
    <h2>语法与变化</h2><p>{data.grammarLabel}</p>
    {data.grammar.noteZh&&<p className={styles.grammar}>{data.grammar.noteZh}</p>}
    <p className={styles.grammar}>原词：<span lang="es">{data.lemma}</span> · 每个词形单独记录掌握程度</p>
    {['other','present','preterite','imperfect','future'].map(tense=>{
      const forms=related.filter(w=>(w.spanishData?.grammar.tense??'other')===tense)
      return forms.length>0&&<div key={tense}><h3>{tenseNames[tense]}</h3>{forms.map(form=><button type="button" key={form.id} className={styles.formRow} aria-current={form.id===word.id?'true':undefined} onClick={()=>select(form.id)}><strong lang="es">{form.term}</strong><span>{form.spanishData!.grammarLabel}<br/>{progress[form.id]?.skipReview?'熟练 · 无需复习':progress[form.id]?'已学习':'未学习'}</span></button>)}</div>
    })}
    <p className={styles.source}><a href={readableSource} target="_blank" rel="noreferrer">词典来源</a> · {data.source.license}<br/><a href={`${import.meta.env.BASE_URL}licenses/Spanish-Wiktionary.txt`} target="_blank" rel="noreferrer">来源与许可说明</a><br/>资料版本：{data.source.revision}<br/>情境例句为本项目编写；离线提供，不在学习时生成。</p>
  </section>
}
