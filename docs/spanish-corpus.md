# Spanish contextual corpus and provenance

The native export is `spanishVocabulary: VocabularyEntry[]` in
`src/spanish/vocabulary.ts`. All data works offline; there is no runtime AI,
fetch, paid API, or credential dependency. The original 300 entries retain
their IDs, terms, general Chinese meanings and general part-of-speech fields.
Their legacy placeholder examples are replaced only in this sidecar provider.
`src/data/vocabulary.ts` is unchanged.

## Course coverage

The course has **1,396 independently identified learning units**:

| Units | Count | Coverage |
| --- | ---: | --- |
| Legacy bases | 300 | Every original ID, including noun/adjective `joven` |
| Finite verb analyses | 768 | 32 verbs × present/preterite/imperfect/future × six persons, including 128 vosotros forms |
| Agreement forms | 328 | 185 noun plurals, 16 additional noun gender forms, 126 adjective/determiner agreement forms, feminine numeral `una` |

Every admitted unit has one independently authored Spanish sentence, Chinese
translation, explicit blank boundaries and a grammatical cue. Sentence files
are keyed, line-oriented editorial inputs, not subject-substitution templates.
The provider performs deterministic assembly and refuses missing sentences,
unattested forms, duplicate keys, orphan sentences and absent noun gender.
It also rejects duplicate full sentences after NFC normalization, lowercasing,
trimming and collapsing whitespace. All 1,396 current complete sentences are unique.

All 42 legacy adjective entries (including the legacy adjectival label for
`otro`) have masculine/feminine × singular/plural analyses. Gender-invariant
spellings have distinct analyses and distinct sentences: for example, masculine
`grande` and feminine `grande` are separate units, as are both plural genders.
Contextual labels identify `otro` as an indefinite determiner. The numeral
`uno` is masculine singular in its sentence, with the separate feminine `una`.
Other cardinal numerals are treated in their numeral use, not as substantivized
names of numbers. Neutral pronominal `todo` is not conflated with the inflecting
determiner; the selected `mucho/poco/más/menos` contexts are adverbial.

The noun inventory contains 189 bases. Four plurals are intentionally not
admitted: `dineros` (marked plural outside the selected ordinary money sense),
`saludes` (regional/other use unlike the selected health sense), `hambres`
(marked plural outside the everyday selected hunger sense), and `sed` (no
plural provided by the source). Their singular base sentences remain eligible.
No omitted unit is replaced by filler or marked reviewed without a sentence.
Type/group readings such as `leches`, `arroces`, `gentes`, `ropas`, `músicas`,
`soles`, and `lunas` have real contextual sentences and, where necessary,
contextual Chinese meanings. Diminutives, superlatives, comparatives, apocopated
forms (`un`, `buen`, `mal`, `gran`), voseo, subjunctive, imperative, compound
tenses and participle-as-verb units are outside this four-tense course.

Families use the canonical existing base ID: all `hablar` units use `verbs-09`;
`niña` links to `niño` (`people-04`), likewise amiga/amigo, hija/hijo,
hermana/hermano, abuela/abuelo and señora/señor. Both original base IDs remain
independent units with independent progress. Noun/adjective `joven` also retain
their separate IDs in a shared spelling family. Unrelated homographs are not
merged: `fui` from `ser` and `ir` has two IDs and source analyses. Lexically
different relations such as padre/madre are not asserted to be one lemma.

## Grammar source: actually retrieved and pinned

Retrieved on **2026-09-27**:

- Index: <https://kaikki.org/dictionary/Spanish/index.html>
- Download: <https://kaikki.org/dictionary/Spanish/kaikki.org-dictionary-Spanish.jsonl>
- Format/source information: <https://kaikki.org/dictionary/rawdata.html>

The retrieved index reports the English Wiktionary dump dated **2026-09-02**,
extracted **2026-09-25**, with Wiktextract references **1a05e46 / e3d6d4e**.
These are source-reported metadata, not invented individual wiki page revisions.
The full download was 1,054,565,867 bytes and has SHA-256:

```text
1019e86ddfea8bb366db80bafcb20d22db7cf2bddd2337004a7a7b270fbab892
```

`src/spanish/data/source/kaikki-selected.jsonl` retains the exact 499 retrieved
records for the 299 unique base spellings, in source order. Its SHA-256 is:

```text
0554f1b655862b49c8eb116ec97a400a4ba9fba7fddb1e03e85d5485497ce660
```

`grammar-source.json` retains the manifest and projected source morphology.
Its `wordRevisions` maps each spelling to SHA-256 of that spelling's exact
retained JSONL lines, including the final newline. Each learning unit's source
revision is that per-word hash (the parent source word for derived forms).
The full download hash, selected snapshot hash and word hashes serve different
purposes; none pretends to be an `oldid` page revision.

Only `source/course-source.json` (143,207 UTF-8 bytes) enters the browser bundle.
The 5.8 MB audit snapshots are not imported by the provider. It also imports the
three small authored sentence files and the contextual-meaning map. The full
download is an external temporary input, not an application asset.

## Reproduce without fetching a changing source

From the project root:

```sh
node scripts/import-spanish.mjs src/spanish/data/source/kaikki-selected.jsonl
npm test -- scripts/import-spanish.test.mjs src/spanish/corpus.test.ts src/spanish/validator.test.ts
```

The default output directory is `src/spanish/data/source/`. An optional second
argument selects another output directory, and all generated outputs stay
inside it. The importer accepts only the pinned full download or the exact
retained subset. A new upstream snapshot is rejected until its checksum and
dated metadata are consciously reviewed and the pin updated. No silent refresh
or spelling generation occurs. Regeneration from the subset reproduces the
manifest, per-word hashes, morphology projection and lean facts exactly.

The extractor chooses indicative forms explicitly tagged with person, number
and the four selected tenses, excludes `vos-form`, and preserves same-spelling
analyses. All 768 course verb answers match these extracted forms. Agreement
forms must match source head forms and gender/number tags, with source-supported
unchanged feminine adjectives admitted as their own analyses.

Noun gender requires source tags; it never defaults from a word ending. The
documented interpretation overrides are: variable `azúcar`/`mar` (raw canonical
head expansions explicitly permit the feminine with the same meaning), and
masculine `fin`, `color`, `médico` in the chosen contexts. `fin`'s feminine source
sense is archaic; modern context is masculine. Source `médico` permits both
personal genders, while the selected base sentence uses `el médico` and the
new forms use the recorded `médica/médicas`. These overrides do not manufacture
spellings. `agua`, `hambre`, `mano`, `foto`, and `día` have explicit explanatory
notes where useful.

## Prompt and review policy

Finite-form cues name the requested infinitive, then the contextual Chinese
meaning and tense/person/number. Derived cues name the source word unless its
spelling is the answer itself. Ordinary base and unchanged-spelling units give
Chinese contextual meaning and grammar only, keeping letter hints optional.
Only the specifically audited `marido` base prompt supplies `首字母 m` to
distinguish it from synonymous `esposo`. The two location adverbs `aquí/allí`
specify the `-í` ending to distinguish `acá/allá`. These three are explicit
task discriminators, not an automatic first-letter hint for every unit.
This is not a claim that natural language sentences exclude every synonym. Complete
illustrative grammar notes belong to dictionary/post-answer use; they are not
concatenated into the pre-answer cue. Tests check every emitted cue for exact
standalone answer leakage. Chinese contextual sense overrides are editorial,
independently authored data; they are not translations claimed to come from
Wiktionary. Only new derived units take these narrowed dictionary meanings;
the original 300 `meaningZh` values remain intact.

The author model read and checked every authored Spanish/Chinese sentence for
target spelling, agreement, tense/person, natural context and translation, then
applied the independent language audit's corrections. No human/native review is
claimed. An independent model audit read all original 1,395 lines, then the
added `una` sentence and changed lines; its review is recorded outside the
repository in `/tmp/spanish-language-audit.md`. The completed scoped re-review
in `/tmp/spanish-language-rereview.md` accepted the final emitted cues and
closed all concrete P2/P3 findings. Model review reduces errors but does not
establish universal uniqueness of every synonym, or validate every dialect.
The course consistently includes Spain-oriented vosotros and vocabulary while
recognizing the third-person usted/ustedes forms.

The raw retained source includes unrelated entry fields for audit fidelity;
none of its example quotations, gloss translations, audio or images becomes a
course sentence or runtime asset. The normalized grammatical data is attributed
to Wiktionary contributors via Kaikki/Wiktextract under CC BY-SA 4.0. Any
upstream third-party quotation retains its own source attribution and terms;
this project does not relabel those quotations as original authored sentences.
See `public/licenses/Spanish-Wiktionary.txt` and the source's copyright notice:
<https://en.wiktionary.org/wiki/Wiktionary:Copyrights>.

## Verification scope

Corpus tests cover legacy preservation, independent IDs, complete four-tense
coverage, all adjective slots, admitted noun plurals, accents, homographs,
gender families, contextual Chinese meanings and absence of answer leakage.
Validator tests were run RED before implementation for explicit blanks,
wrong/accentless answers, placeholders, missing translations and source gender.
Importer tests cover filtering, reproducibility, hashes and unpinned-input
rejection. Full-suite/build outcomes and the exact owned-path list are recorded
in `/tmp/spanish-corpus-report.md`; integration, browser/offline acceptance and
storage wiring remain main's responsibility.
