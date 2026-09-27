/** Authored contextual senses; legacy base dictionary meanings remain unchanged. */
export const contextMeanings: Record<string, string> = {
  'basic-07': '请求原谅', 'basic-07.p': '宽恕；原谅',
  'basic-10': '非常；很', 'basic-11': '少（修饰睡觉）', 'basic-12': '更（修饰远近）',
  'basic-13': '更少（价格更低）', 'basic-25': '一切',
  'people-10.p': '父母', 'people-15.p': '祖父母；外祖父母',
  'people-18.ms': '丈夫', 'people-18.mp': '丈夫们',
  'people-20.p': '各地的人们；不同人群', 'people-24.p': '同事',
  'time-30.p': '末尾（此处指周末）',
  'food-01.p': '水域中的水', 'food-03.p': '不同种类的茶',
  'food-04.p': '不同种类的奶', 'food-06.p': '米饭菜肴',
  'food-07.p': '各类肉', 'food-26.p': '盐类（此处指矿物盐）',
  'home-15.p': '文件', 'home-21.p': '衣物', 'home-30.p': '不同文化的音乐',
  'body-09.p': '毛；猫毛', 'body-17.p': '心形', 'body-26.p': '梦',
  'world-01.p': '恒星', 'world-02.p': '天然卫星', 'world-14.p': '年代；时期',
  'adjectives-30': '准备好的', 'adjectives-30.fs': '准备好的',
  'adjectives-30.mp': '准备好的', 'adjectives-30.fp': '准备好的',
  'ser.preterite.2': '表现得；是', 'ver.preterite.4': '看（电影）',
  'ver.imperfect.6': '看（鱼）', 'estudiar.present.2': '学习；研读（医学）',
  'estudiar.present.4': '研究；仔细考察', 'estudiar.present.6': '研究；仔细考察',
  'estudiar.preterite.3': '研究；仔细考察', 'estudiar.preterite.4': '研究；仔细考察',
  'estudiar.preterite.6': '研究；仔细考察', 'estudiar.imperfect.5': '研究；仔细考察',
  'estudiar.future.1': '研究；仔细考察', 'estudiar.future.3': '研究；仔细考察',
  'estudiar.future.5': '分析', 'estudiar.future.6': '研究；仔细考察',
  'correr.imperfect.3': '流淌', 'trabajar.imperfect.3': '加工（木材）',
  'vivir.preterite.2': '经历', 'vivir.preterite.3': '活到',
  'vivir.preterite.6': '经历', 'vivir.imperfect.3': '靠……维生', 'vivir.future.5': '经历',
}

/** Only author/auditor-identified lexical ambiguities receive supplied spelling cues. */
export const lexicalDiscriminators: Record<string, string> = {
  'people-17': '首字母 m',
  'basic-15': '本题使用以 -í 结尾的地点副词',
  'basic-16': '本题使用以 -í 结尾的地点副词',
}

export const contextualParts: Record<string, string> = {
  'basic-10': '程度副词（本句）', 'basic-11': '程度副词（本句）',
  'basic-12': '比较程度副词（本句）', 'basic-13': '比较数量副词（本句）',
  'basic-25': '中性代词用法', 'basic-26': '不定限定词', 'time-01': '数词代词用法',
}

export const finiteMeanings: Record<string, string> = {
  ser: '是；身份、性质或评价', estar: '处于；位于（状态或位置）',
  ver: '看见；看', mirar: '看；注视', hacer: '做；进行',
}
