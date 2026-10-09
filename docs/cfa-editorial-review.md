# CFA editorial gap-fill and targeted-correction review

Reviewed on 2026-10-09. This is a bounded, AI-authored and AI-reviewed content supplement. `reviewed: true` records this editorial review; it does not mean external human review, CFA Institute endorsement, or approval of the complete source corpus.

The final revision includes the original gap fills, the subsequently authorized 17 definition corrections and six example replacements, and the final six CFA-context corrections identified during browser review. The latter six receive both definitions and original examples. This report supersedes the initial gap-only review.

## Scope, attribution, and source-quality notice

Only `src/data/cfa-editorial.json` and this report were changed. No importer, UI, parser, source dictionary, other existing file, Git state, or deployment was changed in this content task. Both output files were absent before the initial task. The later correction pass changed only the 23 specifically targeted existing entries and added the six newly requested keys; all other 128 original sidecar entries remain unchanged.

Integration contract:

- Preserve exact source terms and IDs. Sidecar keys use the existing NFC/whitespace/lowercase `termKey` normalization; no source word was silently renamed.
- Preserve original source records and provenance in the generated dictionary, while using these explicitly labeled editorial overrides for the corrected CFA meanings/examples.
- Attribute all editorial definitions and examples to **Palabra 编辑补充**. Each targeted-correction entry has a `note` beginning with `编辑纠错`, distinguishing definition overrides, example overrides, or both.
- All 154 example pairs are original compositions, not dictionary quotations, recovered sentences, or text copied from the references below. Do not inherit a dictionary URL as their source.
- The agreed JSON shape remains `{reviewed: true, definition?, example?: [English, Chinese], note?}`. The JSON contains no external URLs, author fields, invented source IDs, or false source claims; the importer applies attribution.
- Product testing, generated-dictionary verification, the visible quality notice, and deployment are the integrating agent's responsibility.

Suggested source-quality notice consistent with the approved scope:

> 本词库依据用户提供的词典整理，包含通用词义，并对已识别的 CFA 语境问题作了编辑补充和定点纠正。它是非官方学习辅助资料，未经全库逐项专业审校，不代表 CFA Institute 官方教材或认证。

The examples are educational illustrations, not investment recommendations, current market reports, tax advice, or a complete statement of accounting or regulatory rules.

## Source and review method

- Source: `/home/martin/Documents/Codex/2026-09-26/xie/outputs/CFA一级必备词汇完整词典.json`.
- Source size: 69,122,892 bytes.
- Source generation timestamp: `2026-10-09T06:09:08.064939+00:00`.
- Source SHA-256: `8a629cd6f171cd1bdb37f175bbb277a6cfcd5f199b85f0edeb05644d4d9a2629`.
- Parser: `scripts/lib/english-record-fields.mjs`, using `termKey`, `definitionSenses`, `bilingualSenses`, and `bilingualExamples`.
- Final editorial JSON SHA-256: `47e007af1705638c260f8f5ebf07de9167daff172fee04a835d126f391e239ee`.

The source was parsed locally without dumping its HTML. Review used source terms and definitions, English-definition section text where useful, parsed examples, fragmented example sections, and preceding/following definitions around all 18 initial definition gaps. Context checks included housing loan/student loan, waterfall/auto loan/originate, deductible/deferred tax asset/tax base, sovereign/pure-play/callable, and surplus/prevailing/interconnect.

For the final six terms, the actual source examples were read before editing: mezzanine examples concerned building floors and theater seats; drawdown had a truncated military sentence; fixed income had broken sentences about household income; pension funds repeated the misleading 抚恤基金 translation; gilt concerned gold plating; duration concerned elapsed time. All six now have original examples aligned to the added CFA sense.

Every added definition and example pair received an AI editorial pass for grammar, Chinese translation alignment, target usage, and domain meaning. The final pass distinguishes systematic risk from systemic risk, survivorship from survivorship bias, duration measures from elapsed time, and fixed-income assets from guaranteed investment returns. This remains a targeted review, not a full-corpus semantic audit.

## Final counts

| Check | Count |
| --- | ---: |
| Source records / unique normalized source terms | 1,152 / 1,152 |
| Original missing parsed Chinese meanings | 18 |
| Original missing parsed bilingual examples | 142 |
| Original example gaps with no 双语例句 section | 140 |
| Original fragmented-section gaps: ongoing, prevailing | 2 |
| Final sidecar term keys | 157 |
| Missing-definition fills | 18 |
| Additional known-error definition corrections | 23 = 17 + 6 |
| Total editorial definitions | 41 |
| Missing-example fills | 142 |
| Additional source-example replacements | 12 = 6 + 6 |
| Total original bilingual example pairs | 154 |
| Entries with both definition and example | 38 |
| Definition-only entries | 3 |
| Example-only entries | 116 |
| Entries marked reviewed: true | 157 |
| Entries with editorial notes | 40 |
| Complete normalized term found literally in example | 152 |
| Documented spelling/grammar exceptions | 2 |
| Remaining parsed Chinese-meaning gaps | 0 |
| Remaining parsed-example gaps | 0 |

The original gap counts remain **18 and 142**. The final totals **41 and 154** also include targeted overrides of populated but wrong, misleading, unrelated, or broken source content. Definitions are present exactly for the union of the 18 original definition gaps and the 23 authorized definition corrections. Examples are present exactly for the union of the 142 original example gaps and the 12 authorized example corrections.

The 17 initial definition corrections and six initial example replacements apply to existing sidecar keys. The six final terms are additional sidecar keys, giving 151 + 6 = 157. All keys resolve to the same 1,152 source terms; no dictionary members or IDs are added or renamed by this file.

## Original 18 missing-definition fills

| Term | Editorial decision |
| --- | --- |
| serve to | 起到作用、有助于；followed by a verb infinitive. |
| a pool of | A collection of funds, loans, assets, or other resources. |
| student loan | 助学贷款 for tuition and related study/living expenses. |
| auto loan | 汽车贷款. Also receives an original replacement example in the follow-up. |
| cease to | Stop doing something; followed by a verb infinitive. |
| made up | Invented/fictitious or composed of in `be made up of`; new example uses composition. |
| transactions costs | 交易成本, including commissions, spreads, and market impact; source variant retained. |
| in lieu | Instead; use `in lieu of` with the object being replaced. |
| credit default swaps | Credit protection contracts with fees and compensation upon specified credit events. |
| ongoing | Currently in progress or continuing. |
| pure-play | Focused on one business or industry, including comparable-company analysis. |
| ally with | Form an alliance or cooperative relationship with. |
| deferred tax asset | Qualifying future tax reductions arising from deductible temporary differences, carried-forward losses, or tax credits; recognition is conditional. |
| be reluctant to | Be unwilling or hesitant to do something. |
| prevailing | Current or generally applicable, especially a market rate or price. |
| perceive as | Regard A as B, using `perceive A as B`. |
| whistle blower | A person reporting organizational wrongdoing; source spelling retained. |
| prudence | Caution and careful judgment under uncertainty. |

## Targeted definition corrections: 23

The following issues are now corrected by explicit editorial `definition` overrides. They are no longer merely flagged for later work. Existing original source content remains attributable to its original provider under the integration contract.

| Term key | Corrected CFA meaning / important boundary |
| --- | --- |
| maintenance margin | 维持保证金: minimum equity or margin maintained while holding a position; replaces “维修范围”, without prescribing a universal regulatory percentage. |
| off-balance-sheet | 表外的: not recognized as an asset or liability on the balance sheet; disclosure in notes may still be necessary. |
| repo | 回购协议: securities sold with an agreement to repurchase on agreed terms, used for short-term financing; replaces “重新达成协议”. |
| ppi | 生产者价格指数, producer price index; measures average changes in prices received by producers. |
| proxy statement | 委托投票说明书: disclosures used to solicit shareholder proxy votes, distinct from a signed proxy authorization. |
| fund of funds | 基金中的基金: a fund investing in other funds; replaces “总投资公司”. |
| carrying value | 账面价值: amount recognized and reported for an asset or liability. |
| cross-sectional | 横截面的: observations of different entities at the same time or period, rather than “代表性的”. |
| top down | 自上而下地: macroeconomic and industry analysis preceding individual-company analysis; source spacing retained. |
| liquidity ratio | 流动性比率: a category including current and quick ratios, not current ratio alone. |
| flat fee | 固定金额收费: not a fixed percentage charged against asset or transaction value. |
| systematic risk | 市场共同因素导致且分散持仓无法消除的风险; distinct from systemic financial contagion risk. |
| backfill | 补录开始报送前的历史业绩; selective backfilling can create bias. |
| survivorship | 存续、幸存; explanation connects the term to survivorship bias without equating survival itself with bias. |
| tranche | 一档证券或债务、分层份额 with distinct payment priority or risk/return characteristics; not limited to an IMF loan installment. |
| estate tax | 遗产税, not solely real-estate taxation; specific rules depend on jurisdiction. |
| international monetary fund | 国际货币基金组织, replacing 国际货币基金会. |
| gilt | 英国国债: sterling-denominated UK government bonds; replaces pig/gold-plating senses in the CFA view. |
| duration | 久期: distinguishes the present-value-weighted cash-flow timing of Macaulay duration from modified duration's price/yield sensitivity. |
| mezzanine | 夹层融资: typically junior to senior debt and senior to common equity, potentially with equity participation. |
| drawdown | 回撤 from a previous high, often expressed as a percentage; not water-level decline or loan drawdown in this context. |
| fixed income | 固定收益资产类别, principally debt instruments with contractual cash-flow arrangements; neither a guaranteed return nor restricted to fixed coupons. |
| pension funds | 养老基金（复数）: pooled investments supporting retirement benefits, replacing 抚恤基金. |

## Targeted source-example replacements: 12

All examples below are new editorial compositions. These replace the broken or unrelated source examples for CFA presentation, rather than claiming that those source examples were reviewed and approved.

| Term | New English example | Review focus |
| --- | --- | --- |
| auto loan | The borrower repays the auto loan in monthly installments. | Replaces “auto open loan” and broken translation. |
| made up | The portfolio is made up of government bonds and corporate bonds. | Correct `be made up of` usage and aligned composition translation. |
| credit default swaps | The bank bought protection through credit default swaps on corporate debt. | A complete sentence illustrating purchase of credit protection. |
| pure-play | The analyst selected a pure-play retailer as a comparable company. | Single-business comparison, without source fragments or joined words. |
| ally with | The firm plans to ally with a payment provider to enter a new market. | Correct target construction; does not repeat source gloss typo “untie”. |
| in lieu | The company issued shares in lieu of a cash payment. | Complete `in lieu of` structure; no unfilled quotation-number blank. |
| gilt | The fund bought a gilt issued by the UK government. | Government-bond meaning, not gold plating. |
| duration | The analyst used modified duration to estimate the bond's price sensitivity to a small yield change. | Explicit duration type and local price sensitivity. |
| mezzanine | The acquisition used mezzanine financing alongside senior debt and equity. | Acquisition financing, not a building floor. |
| drawdown | The portfolio fell from its peak value of 100 to 90, a drawdown of 10 percent. | Hypothetical, arithmetically correct 10% peak-to-current decline. |
| fixed income | The fund's fixed income allocation includes government and corporate bonds. | Asset allocation, not household income. |
| pension funds | Pension funds invest contributions to help meet future retirement payments. | Retirement funding and aligned 养老基金 translation. |

Each JSON `example` also contains its corresponding reviewed Chinese translation. All 12 replacements contain their complete normalized target term literally.

## Term preservation and two matching exceptions

- `perceive as`: “Investors may perceive the delay as a sign of financial stress.” The object naturally separates `perceive` and `as`; the note documents the grammar.
- `capital gain tax`: example uses the conventional `capital gains tax`. The source key stays singular; the note documents the difference.
- `retained earning`: example uses standard plural `retained earnings`; the literal substring check still passes.
- `transactions costs`: source variant retained; note identifies the more common `transaction costs`.
- `whistle blower`: source two-word form retained; common alternatives noted.
- `quasi`: example uses the compound `quasi-money`.
- `top down`: adverbial source form retained; attributive `top-down` explained.
- `excruciate` and `preload`: unusual/non-core terms remain as supplied, with appropriate general-language or financial-app examples and no speculative renaming.
- Abbreviation keys remain normalized lowercase; examples use conventional uppercase where appropriate.

## Verification and limits

A read-only Node check against the saved JSON, actual source, and existing parser passed after the corrections. It verified:

- 1,152 source records and 1,152 unique normalized source terms.
- Exact sidecar key-set coverage and exact definition/example field sets, including the separate 23-definition and 12-example correction lists.
- The targeted correction sets do not overlap the original missing-field sets for their respective fields; this prevents inflating the original gap counts.
- All 29 targeted correction entries have clear `编辑纠错` notes. All 157 entries have `reviewed: true`, and only agreed fields are present.
- Supported part-of-speech prefixes and parsable Chinese meanings for all 41 definitions.
- Exactly 154 distinct two-string bilingual pairs, English first and Chinese second, with nonempty content and sentence punctuation.
- English examples use printable ASCII, with no fullwidth Latin/punctuation, Chinese characters, or unbalanced double quotes. Chinese translations contain Chinese text and use Chinese sentence punctuation.
- Strings are trimmed and NFC-normalized, with no control characters or Unicode replacement characters.
- No placeholder wording, duplicate example pairs, raw source HTML fields, script tags, or external URLs in the JSON.
- Exactly 152 literal term matches and the two explicitly documented exceptions above.
- Zero remaining parsed Chinese-meaning or example gaps after combining source data and editorial content.
- Saved JSON equals the reviewed draft; all 128 untargeted entries from the original sidecar remain byte-equivalent at the serialized-entry level.

Coverage checks do not constitute a full-corpus semantic audit. The supplied dictionary still contains general-language meanings and may contain other unreviewed errors outside the explicit lists. The six additional corrections came from browser review of the first 80 words; that observation does not establish that all 80 were comprehensively audited. No external human review, product implementation tests, or deployment is claimed here.

The initial gap-only task encountered a permission-review timeout, followed by a successful single retry, and a sandbox mount issue on a read-only validation. Its validation succeeded outside that sandbox. The correction pass used successful read-only checks and only the same two authorized output files.

## Supporting domain checks

These references informed selected meaning checks. None is attributed as the author of any original example.

- [IFRS Foundation: IAS 12 Income Taxes](https://www.ifrs.org/issued-standards/list-of-standards/ias-12-income-taxes/) — deferred tax assets and conditional recognition.
- [CFA Institute: Measurement Biases in Hedge Fund Performance Data](https://rpc.cfainstitute.org/research/financial-analysts-journal/2009/measurement-biases-in-hedge-fund-performance-data-an-update) — entry/backfill and exit/survivorship bias.
- [BLS: Producer Price Index](https://www.bls.gov/ppi/) — prices received by producers.
- [Investor.gov: Executive Compensation](https://www.investor.gov/introduction-investing/investing-basics/glossary/executive-compensation) — compensation information in proxy statements used for shareholder voting.
- [FINRA: Margin Debt at Record Levels—Know the Risks](https://syndication.finra.org/content/margin-debt-record-levels-know-risks) — maintenance margin and account equity, without using a specific regulatory percentage.
- [UK Debt Management Office: About Gilts](https://www.dmo.gov.uk/responsibilities/gilt-market/about-gilts/) — UK government sterling liabilities.
- [CFA Institute: Yield-Based Bond Duration Measures and Properties](https://www.cfainstitute.org/insights/professional-learning/refresher-readings/2026/yield-based-bond-duration-measures-and-properties) — Macaulay and modified duration.
