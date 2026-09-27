import type { VocabularyEntry } from '../types'
import { vocabulary as legacy } from '../data/vocabulary'
import type { SpanishGrammar } from './types'
import source from './data/source/course-source.json'
import basesText from './data/base-sentences.txt?raw'
import verbsText from './data/verb-sentences.txt?raw'
import agreementText from './data/agreement-sentences.txt?raw'
import { assertUniqueSentences, nounGender, parseSentence } from './data/validate'
import { contextMeanings, contextualParts, finiteMeanings, lexicalDiscriminators } from './data/context'

interface SourceRecord {
  word: string
  pos: string
  tags: string[]
  forms: Array<{ form: string; tags: string[] }>
  verbs: Array<{ form: string; tense: string; person: number; number: string; pronoun: string }>
}
const sourceRecords: SourceRecord[] = source.records
const revisions: Record<string, string> = source.wordRevisions
const pos: Record<string, string> = { 名词: 'noun', 动词: 'verb', 形容词: 'adj', 副词: 'adv', 数词: 'num', 代词: 'pron', 感叹词: 'intj', 短语: 'intj' }
// Only established gender counterparts share a family, never unrelated homographs.
const families: Record<string, string> = { niña: 'niño', amiga: 'amigo', hija: 'hijo', hermana: 'hermano', abuela: 'abuelo', señora: 'señor' }
const notes: Record<string, string> = {
  agua: '阴性；单数前直接加定冠词时用 el，形容词仍用阴性；不定冠词通常用 un。',
  hambre: '阴性不可数用法；说 el hambre，但 mucha hambre。',
  mano: '以 -o 结尾，但为阴性。', foto: 'fotografía 的缩略形式，阴性。',
  día: '以 -a 结尾，但为阳性。', mapa: '以 -a 结尾，但为阳性。',
  azúcar: '可用阳性或阴性；本课不把 el/la 的差异当作拼写错误。',
  mar: '可用阳性或阴性；日常用法多为 el mar，复数通常为 los mares。',
  gente: '集合名词，单数时动词用单数；gentes 常指不同群体的人。',
  estudiante: '通性名词，词形不随性别变化；本句用 la/las 指女性。',
  joven: '词形不随性别变化；复数 jóvenes 增加重音符号。',
  bebé: '可用 el/la bebé；本课单数句用 el。',
  médico: '本课 masculino médico / femenino médica；也有 la médico 用法。',
  otro: '此处作限定语，与所修饰的名词保持性数一致。',
  uno: '此处指代阳性名词 camino；阴性数词为 una，名词前可缩为 un。',
  todo: '此句为中性代词，指“一切”；不涉及限定词 todo/toda/todos/todas。',
  sed: '此处为不可数阴性名词；来源未列复数。',
  dinero: '此处为不可数的“钱”；罕见复数 dineros 不纳入本课。',
  salud: '此处为“健康”；来源的 saludes 有其他用法，不纳入本课。',
}
const genderZh = { masculine: '阳性', feminine: '阴性', common: '通性', variable: '阴阳两性均可' }
const numberZh = { singular: '单数', plural: '复数', invariable: '不变形' }
const tenseZh = { present: '现在时', preterite: '简单过去时', imperfect: '过去未完成时', future: '简单将来时' }
function sentences(text: string) {
  const result = new Map<string, string>()
  for (const line of text.trim().split('\n')) {
    const cut = line.indexOf('|'), key = line.slice(0, cut)
    if (cut < 1 || result.has(key)) throw new Error(`Duplicate/invalid Spanish sentence key: ${key}`)
    result.set(key, line.slice(cut + 1))
  }
  return result
}
const bases = sentences(basesText), verbs = sentences(verbsText), agreement = sentences(agreementText)
function recordFor(base: VocabularyEntry): SourceRecord {
  const candidates = sourceRecords.filter(r => r.word === base.term)
  const record = candidates.find(r => r.pos === pos[base.partOfSpeech] && (r.pos !== 'verb' || r.verbs.length))
    ?? (base.term === 'otro' ? candidates.find(r => r.pos === 'det') : undefined)
    ?? (base.term === 'sí' ? candidates.find(r => r.pos === 'intj') : undefined)
  if (!record) throw new Error(`No pinned grammatical source: ${base.id}/${base.term}`)
  return record
}
function baseGrammar(base: VocabularyEntry, record: SourceRecord): SpanishGrammar {
  if (base.partOfSpeech === '动词') return { mood: 'infinitive' }
  const noteZh = notes[base.term]
  if (base.term === 'uno') return { gender: 'masculine', number: 'singular', noteZh }
  if (base.partOfSpeech === '形容词') return { gender: 'masculine', number: 'singular', noteZh }
  if (base.partOfSpeech !== '名词') return { number: 'invariable', noteZh }
  let gender: SpanishGrammar['gender'] = nounGender(record.tags)
  if (['azúcar', 'mar'].includes(base.term)) gender = 'variable'
  if (['fin', 'médico', 'color'].includes(base.term)) gender = 'masculine'
  return { gender, number: 'singular', noteZh }
}
function label(grammar: SpanishGrammar, partOfSpeech: string) {
  if (grammar.mood === 'infinitive') return '动词不定式'
  if (grammar.tense) return `陈述式${tenseZh[grammar.tense]} · 第${grammar.person}人称${numberZh[grammar.number!]}（${grammar.pronoun}）`
  return [partOfSpeech, grammar.gender && genderZh[grammar.gender], grammar.number && numberZh[grammar.number]].filter(Boolean).join(' · ')
}
function unit(base: VocabularyEntry, id: string, term: string, grammar: SpanishGrammar, sentence: string | undefined, sentenceKey = base.id): VocabularyEntry {
  if (!sentence) throw new Error(`Missing reviewed sentence: ${id}`)
  const parsed = parseSentence(sentence, term)
  const text = parsed.before + parsed.answer + parsed.after
  const grammarLabel = label(grammar, contextualParts[base.id] ?? base.partOfSpeech)
  const lemma = families[base.term] ?? base.term
  const contextualMeaning = contextMeanings[sentenceKey] ?? (grammar.tense && finiteMeanings[base.term]) ?? base.meaningZh
  const meaningZh = id === base.id ? base.meaningZh : contextualMeaning
  // Dictionary notes may contain example answers; never include them before recall.
  // Finite exercises identify the requested verb, and derived exercises identify
  // their source word unless it is itself the answer (e.g. lunes/grande).
  const instruction = grammar.tense ? `原形 ${base.term}`
    : id !== base.id && term !== base.term ? `原词 ${base.term}`
      : lexicalDiscriminators[id] ?? ''
  const cueZh = `${instruction ? `${instruction}；` : ''}本句：${contextualMeaning}；${grammarLabel}`
  return {
    ...base, id, term, meaningZh, chinese: meaningZh, spanish: term, example: text, exampleZh: parsed.translationZh,
    examples: [{ text, translationZh: parsed.translationZh, author: 'Original course sentence; model self-reviewed', license: 'CC-BY-SA-4.0' }],
    spanishData: {
      lemmaId: legacy.find(word => word.term === lemma)!.id, lemma, kind: id === base.id ? 'lemma' : 'form', grammar, grammarLabel, eligible: true,
      cloze: { id: `es:cloze:v1:${id}`, ...parsed, cueZh, reviewed: true, provenance: 'original', reviewVersion: 1 },
      source: { ...source.source, revision: revisions[base.term] },
    },
  }
}
const consumed = new Set<string>()
const baseUnits = legacy.map(base => unit(base, base.id, base.term, baseGrammar(base, recordFor(base)), bases.get(base.id)))
const formUnits = legacy.flatMap(base => {
  const record = recordFor(base)
  if (base.partOfSpeech === '动词') return record.verbs.map(form => {
    const personIndex = form.person + (form.number === 'plural' ? 3 : 0)
    const key = `${base.term}.${form.tense}.${personIndex}`
    consumed.add(key)
    return unit(base, `es:form:${base.id}:${form.tense}:${personIndex}`, form.form, {
      mood: 'indicative', tense: form.tense as SpanishGrammar['tense'], person: form.person as 1 | 2 | 3,
      number: form.number as 'singular' | 'plural', pronoun: form.pronoun,
    }, verbs.get(key), key)
  })
  return [...agreement].filter(([key]) => key.startsWith(`${base.id}.`)).map(([key, sentence]) => {
    const suffix = key.slice(base.id.length + 1)
    const original = baseGrammar(base, record)
    const gender = suffix[0] === 'f' ? 'feminine' : suffix[0] === 'm' ? 'masculine' : original.gender
    const number = suffix.endsWith('p') ? 'plural' : 'singular'
    const answer = /\[([^\]]+)\]/.exec(sentence)?.[1]
    // Same-spelling adjective feminine singular is explicitly source-supported by both gender tags.
    const invariantFeminine = suffix === 'fs' && answer === base.term && record.tags.includes('feminine') && record.tags.includes('masculine')
    const supported = record.forms.some(f => f.form === answer
      && (number !== 'plural' || f.tags.includes('plural'))
      && (number !== 'singular' || !f.tags.includes('plural'))
      && (suffix[0] !== 'f' || f.tags.includes('feminine'))
      && (suffix[0] !== 'm' || f.tags.includes('masculine') || (!f.tags.includes('feminine') && original.gender === 'masculine')))
    if (!answer || (!supported && !invariantFeminine)) throw new Error(`Unattested source form: ${key}/${answer}`)
    consumed.add(key)
    const noteZh = base.term === 'uno' && suffix === 'fs' ? '本句指代阴性复数名词所指事物中的一个，使用阴性单数。' : original.noteZh
    return unit(base, `es:form:${base.id}:${suffix}`, answer, { ...original, gender, number, noteZh }, sentence, key)
  })
})
if (bases.size !== legacy.length || [...verbs.keys(), ...agreement.keys()].some(key => !consumed.has(key))) throw new Error('Orphan Spanish sentence')
const units = [...baseUnits, ...formUnits]
assertUniqueSentences(units.map(word => word.spanishData!.cloze))

/** Offline corpus: only compact grammatical facts and authored sentences enter the bundle. */
export const spanishVocabulary: VocabularyEntry[] = units
