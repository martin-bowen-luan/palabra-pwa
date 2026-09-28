import { useLayoutEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppState } from '../app/AppState'
import { SpellingComparison } from '../components/SpellingComparison'
import { SpellingAnswer } from '../components/SpellingAnswer'
import { currentSpanishWord, normalizeSpanish, spanishHint } from './course'
import { useSpanish } from './SpanishProvider'
import { SpanishPrompt } from './SpanishPrompt'
import { SpanishGrammarLabel } from './SpanishGrammarLabel'
import base from '../styles/App.module.css'
import styles from './Spanish.module.css'

export function SpanishStudyPage() {
  const {activeSession,vocabulary}=useAppState()
  const course=useSpanish(),navigate=useNavigate()
  const word=activeSession?.spanish?currentSpanishWord(activeSession):undefined
  const state=activeSession?.spanish
  const identity=`${activeSession?.startedAt}:${activeSession?.practice?.promptNumber}`
  const [input,setInput]=useState(state?.draft??'')
  const inputRef=useRef<HTMLInputElement>(null)
  const feedback=state?.feedback
  useLayoutEffect(()=>{setInput(state?.draft??'');if(!state?.feedback)inputRef.current?.focus()},[identity,feedback])
  // A competing tab can replace this prompt's draft without changing its word.
  useLayoutEffect(()=>{if(course.error.startsWith('本组已在其他页面更新'))setInput(state?.draft??'')},[course.error,state?.draft])
  if(!word||!state||!activeSession)return <main className={base.page}><h1>本组已结束</h1><button className={base.primaryButton} onClick={()=>navigate('/today')}>回到今日</button></main>
  const question=word.spanishData!.cloze
  const hint=spanishHint(question.answer,state.hintCount)
  const alternatives=feedback&&!feedback.correct?vocabulary.filter(w=>normalizeSpanish(w.term)===normalizeSpanish(feedback.input)&&w.spanishData).slice(0,4):[]
  const edit=(value:string)=>{setInput(value);course.draft(value)}
  const insert=(character:string)=>{
    const start=inputRef.current?.selectionStart??input.length,end=inputRef.current?.selectionEnd??input.length
    edit(input.slice(0,start)+character+input.slice(end));inputRef.current?.focus()
    requestAnimationFrame(()=>inputRef.current?.setSelectionRange(start+character.length,start+character.length))
  }
  const finish=async(action:()=>Promise<boolean>)=>{if(await action())navigate('/result')}
  return <main className={`${base.studyPage} ${styles.study}`}>
    <header className={base.studyHeader}>
      <button className={base.quietButton} disabled={course.busy} onClick={()=>void course.flush().then(saved=>{if(saved)navigate('/today')})}>结束</button>
      <div className={base.studyHeaderActions}><span>{state.resolvedIds.length} / {activeSession.wordIds.length}</span><button className={base.fluentButton} disabled={course.busy} onClick={()=>void finish(course.fluent)}>标为熟练</button></div>
    </header>
    <div className={base.studyProgress}><span style={{width:`${state.resolvedIds.length/activeSession.wordIds.length*100}%`}}/></div>
    {course.error&&<p role="alert" className={styles.error}>{course.error}{course.error.includes('请刷新页面后继续')&&<button className={base.textButton} onClick={()=>window.location.reload()}>刷新页面</button>}</p>}
    <SpanishPrompt word={word} revealed={Boolean(feedback)}/>
    {!feedback?<form className={styles.answer} onSubmit={event=>{event.preventDefault();void course.submit(input)}}>
      <label className={styles.inputLabel} htmlFor="spanish-answer">填写缺少的西语词</label>
      <input ref={inputRef} id="spanish-answer" lang="es" value={input} onChange={event=>edit(event.target.value)} disabled={course.busy} autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false} maxLength={100} enterKeyHint="done"/>
      <div className={styles.accents} aria-label="西语字母">{['á','é','í','ó','ú','ü','ñ'].map(char=><button key={char} type="button" disabled={course.busy} onClick={()=>insert(char)}>{char}</button>)}</div>
      <div className={styles.hint} aria-live="polite" aria-atomic="true">{state.hintCount>0&&<><span lang="es">{hint.mask}</span><small>已提示 {state.hintCount} / {hint.limit} 个字母</small></>}</div>
      <button type="button" className={base.textButton} disabled={course.busy||state.hintCount>=hint.limit} onClick={()=>void course.hint()}>{state.hintCount>=hint.limit?'本词提示已用完':'提示字母'}</button>
      <button className={base.primaryButton} disabled={course.busy||!input.trim()}>检查答案</button>
      <button type="button" className={base.textButton} disabled={course.busy} onClick={()=>void course.reveal(input)}>不认识</button>
      <button type="button" className={base.textButton} disabled={course.busy} onClick={()=>void finish(course.skip)}>跳过，稍后复习</button>
    </form>:<section className={styles.feedback} aria-label="答题反馈">
      <p className={feedback.correct?styles.correct:styles.error} role="status">{feedback.correct?'拼写正确':'再看一下这个词形'}</p>
      {feedback.assisted&&feedback.correct&&<p>稍后需要再无提示拼对一次。</p>}
      {!feedback.correct&&(feedback.answerRevealed?<SpellingAnswer answer={question.answer} language="es"/>:<SpellingComparison input={feedback.input} word={{...word,term:question.answer,spellingVariants:[]}}/>)}
      {!feedback.answerRevealed&&alternatives.length>0&&<div className={styles.grammarComparison}><h2>哪里不同</h2><p>你写的词形在词典中对应：</p>{alternatives.map(item=><p key={item.id}><span lang="es">{item.term}</span>：{item.spanishData!.lemma} · <SpanishGrammarLabel data={item.spanishData!}/></p>)}<p>本题需要：<SpanishGrammarLabel data={word.spanishData!}/></p></div>}
      <p><span className={styles.grammar}>{word.partOfSpeech}</span>　{word.meaningZh}</p>
      <p className={styles.grammar}>原词：<span lang="es">{word.spanishData!.lemma}</span>{word.spanishData!.grammar.noteZh&&` · ${word.spanishData!.grammar.noteZh}`}</p>
      <button className={base.textButton} onClick={()=>navigate(`/library?word=${encodeURIComponent(word.id)}`,{state:{wordLinkFrom:'/study'}})}>查看词典与变化表</button>
      <button className={base.primaryButton} disabled={course.busy} onClick={()=>void finish(course.next)}>{feedback.correct?'继续':feedback.answerRevealed?'重新拼写':'立即重做'}</button>
      {!feedback.correct&&<button className={base.textButton} disabled={course.busy} onClick={()=>void finish(course.skip)}>跳过，稍后复习</button>}
    </section>}
  </main>
}
