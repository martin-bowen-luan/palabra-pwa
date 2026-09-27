/** No word-ending heuristics: noun gender must be present in the pinned source. */
export function nounGender(tags: string[]): 'masculine' | 'feminine' | 'common' {
  const masculine = tags.includes('masculine'), feminine = tags.includes('feminine')
  if (!masculine && !feminine) throw new Error('Missing source noun gender')
  return masculine && feminine ? 'common' : feminine ? 'feminine' : 'masculine'
}

/** Different analyses still require different full contextual sentences. */
export function assertUniqueSentences(sentences: Array<{ before: string; answer: string; after: string }>) {
  const seen = new Set<string>()
  for (const cloze of sentences) {
    const sentence = `${cloze.before}${cloze.answer}${cloze.after}`.normalize('NFC').toLowerCase().trim().replace(/\s+/g, ' ')
    if (seen.has(sentence)) throw new Error(`Duplicate Spanish sentence: ${sentence}`)
    seen.add(sentence)
  }
}

/** Fail closed: an unreviewed/missing sentence must never become a practice item. */
export function parseSentence(line: string, term: string) {
  const [sentence, translationZh, extra] = line.split('|')
  const match = /^([^\[\]]*)\[([^\[\]]+)\]([^\[\]]*)$/.exec(sentence)
  if (!match || extra !== undefined || !/[\u4e00-\u9fff]/.test(translationZh ?? '')
    || /aprendemos la palabra|practicamos el verbo|___|\{\{|«|»/i.test(sentence)
    || match[2].normalize('NFC').toLowerCase() !== term.normalize('NFC').toLowerCase()
    || sentence.trim().split(/\s+/).length < 3) {
    throw new Error(`Invalid Spanish cloze for ${term}: ${line}`)
  }
  return { before: match[1], answer: match[2], after: match[3], translationZh }
}
