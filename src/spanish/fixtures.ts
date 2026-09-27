// Test fixtures intentionally live outside production imports.
import type { VocabularyEntry } from '../types'
export function spanishFixture(id='es:test:hablo', term='hablo', lemmaId='verb-hablar'): VocabularyEntry {
  return {id,language:'es',term,partOfSpeech:'动词',meaningZh:'说；说话',category:'常用动作',examples:[{text:`Yo ${term} español con mi vecina.`,translationZh:'我和邻居说西班牙语。'}],spanishData:{lemmaId,lemma:'hablar',kind:'form',grammar:{mood:'indicative',tense:'present',person:1,number:'singular',pronoun:'yo'},grammarLabel:'陈述式现在时 · 第一人称单数（yo）',eligible:true,source:{url:'https://en.wiktionary.org/wiki/hablar',revision:'fixture',license:'CC BY-SA 4.0'},cloze:{id:`q:${id}`,before:'Yo ',answer:term,after:' español con mi vecina.',translationZh:'我和邻居说西班牙语。',cueZh:'说（西班牙语）',reviewed:true,provenance:'original',reviewVersion:1}}}
}
