import { buildEnglishGroup } from '../domain/memoryRounds'
import { projectWordbook } from './catalog'
import type { VocabularyEntry,WordProgress,StudySession,StudyMode } from '../types'
import type { WordbookCatalog,PrimaryRange } from './types'
export function buildWordbookGroup(args:{words:VocabularyEntry[];book:WordbookCatalog;range:PrimaryRange;progress:Record<string,WordProgress>;sessions:StudySession[];goal:number;mode:StudyMode;reviewScope:'book'|'all-english';now:Date;extra?:number}) {
  const {words,book,range,progress,sessions,goal,mode,reviewScope,now,extra}=args
  const candidates=mode==='review'&&reviewScope==='all-english'?words:projectWordbook(words,book,mode==='learn'?range:{})
  return buildEnglishGroup(candidates,progress,sessions,goal,mode,now,extra)
}
