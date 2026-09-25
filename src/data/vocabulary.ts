import type { VocabularyEntry } from '../types'

type RawWord = readonly [spanish: string, chinese: string, partOfSpeech: string]

const groups: Array<{ key: string; category: string; words: RawWord[] }> = [
  {
    key: 'basic', category: '日常基础', words: [
      ['hola', '你好', '感叹词'], ['adiós', '再见', '感叹词'], ['gracias', '谢谢', '感叹词'], ['por favor', '请', '短语'],
      ['sí', '是；对', '副词'], ['no', '不；不是', '副词'], ['perdón', '抱歉；原谅', '名词'], ['bien', '好；很好', '副词'],
      ['mal', '不好；糟糕', '副词'], ['mucho', '很多', '副词'], ['poco', '少；一点', '副词'], ['más', '更多', '副词'],
      ['menos', '更少', '副词'], ['también', '也', '副词'], ['aquí', '这里', '副词'], ['allí', '那里', '副词'],
      ['ahora', '现在', '副词'], ['hoy', '今天', '副词'], ['mañana', '明天', '副词'], ['ayer', '昨天', '副词'],
      ['siempre', '总是', '副词'], ['nunca', '从不', '副词'], ['algo', '某事；一些', '代词'], ['nada', '什么也没有', '代词'],
      ['todo', '全部', '代词'], ['otro', '另一个', '形容词'], ['mismo', '相同的', '形容词'], ['muy', '非常', '副词'],
      ['ya', '已经', '副词'], ['todavía', '仍然；还', '副词'],
    ],
  },
  {
    key: 'people', category: '人与家庭', words: [
      ['persona', '人', '名词'], ['hombre', '男人', '名词'], ['mujer', '女人', '名词'], ['niño', '男孩', '名词'],
      ['niña', '女孩', '名词'], ['amigo', '男性朋友', '名词'], ['amiga', '女性朋友', '名词'], ['familia', '家庭', '名词'],
      ['madre', '母亲', '名词'], ['padre', '父亲', '名词'], ['hijo', '儿子', '名词'], ['hija', '女儿', '名词'],
      ['hermano', '兄弟', '名词'], ['hermana', '姐妹', '名词'], ['abuelo', '祖父；外祖父', '名词'], ['abuela', '祖母；外祖母', '名词'],
      ['marido', '丈夫', '名词'], ['esposa', '妻子', '名词'], ['nombre', '名字', '名词'], ['gente', '人们', '名词'],
      ['bebé', '婴儿', '名词'], ['estudiante', '学生', '名词'], ['profesor', '老师', '名词'], ['compañero', '同伴；同学', '名词'],
      ['vecino', '邻居', '名词'], ['señor', '先生', '名词'], ['señora', '女士', '名词'], ['joven', '年轻人', '名词'],
      ['adulto', '成年人', '名词'], ['pareja', '伴侣；一对', '名词'],
    ],
  },
  {
    key: 'time', category: '数字与时间', words: [
      ['uno', '一', '数词'], ['dos', '二', '数词'], ['tres', '三', '数词'], ['cuatro', '四', '数词'],
      ['cinco', '五', '数词'], ['seis', '六', '数词'], ['siete', '七', '数词'], ['ocho', '八', '数词'],
      ['nueve', '九', '数词'], ['diez', '十', '数词'], ['día', '天', '名词'], ['semana', '星期；周', '名词'],
      ['mes', '月', '名词'], ['año', '年', '名词'], ['hora', '小时；点钟', '名词'], ['minuto', '分钟', '名词'],
      ['segundo', '秒', '名词'], ['momento', '时刻', '名词'], ['fecha', '日期', '名词'], ['calendario', '日历', '名词'],
      ['lunes', '星期一', '名词'], ['martes', '星期二', '名词'], ['miércoles', '星期三', '名词'], ['jueves', '星期四', '名词'],
      ['viernes', '星期五', '名词'], ['sábado', '星期六', '名词'], ['domingo', '星期日', '名词'], ['mediodía', '中午', '名词'],
      ['medianoche', '午夜', '名词'], ['fin', '结束；末尾', '名词'],
    ],
  },
  {
    key: 'food', category: '饮食', words: [
      ['agua', '水', '名词'], ['café', '咖啡', '名词'], ['té', '茶', '名词'], ['leche', '牛奶', '名词'],
      ['pan', '面包', '名词'], ['arroz', '米饭', '名词'], ['carne', '肉', '名词'], ['pescado', '鱼肉', '名词'],
      ['pollo', '鸡肉；鸡', '名词'], ['huevo', '鸡蛋', '名词'], ['queso', '奶酪', '名词'], ['fruta', '水果', '名词'],
      ['manzana', '苹果', '名词'], ['naranja', '橙子', '名词'], ['plátano', '香蕉', '名词'], ['verdura', '蔬菜', '名词'],
      ['tomate', '番茄', '名词'], ['patata', '土豆', '名词'], ['sopa', '汤', '名词'], ['ensalada', '沙拉', '名词'],
      ['desayuno', '早餐', '名词'], ['almuerzo', '午餐', '名词'], ['cena', '晚餐', '名词'], ['comida', '食物；一餐', '名词'],
      ['azúcar', '糖', '名词'], ['sal', '盐', '名词'], ['botella', '瓶子', '名词'], ['vaso', '玻璃杯', '名词'],
      ['taza', '杯子', '名词'], ['plato', '盘子；菜肴', '名词'],
    ],
  },
  {
    key: 'home', category: '家与物品', words: [
      ['casa', '家；房子', '名词'], ['habitación', '房间', '名词'], ['cocina', '厨房', '名词'], ['baño', '浴室', '名词'],
      ['puerta', '门', '名词'], ['ventana', '窗户', '名词'], ['mesa', '桌子', '名词'], ['silla', '椅子', '名词'],
      ['cama', '床', '名词'], ['sofá', '沙发', '名词'], ['lámpara', '灯', '名词'], ['llave', '钥匙', '名词'],
      ['libro', '书', '名词'], ['cuaderno', '笔记本', '名词'], ['papel', '纸', '名词'], ['bolígrafo', '圆珠笔', '名词'],
      ['teléfono', '电话；手机', '名词'], ['ordenador', '电脑', '名词'], ['reloj', '钟；手表', '名词'], ['foto', '照片', '名词'],
      ['ropa', '衣服', '名词'], ['camisa', '衬衫', '名词'], ['pantalón', '裤子', '名词'], ['zapato', '鞋', '名词'],
      ['bolsa', '袋子；包', '名词'], ['dinero', '钱', '名词'], ['cosa', '东西；事情', '名词'], ['regalo', '礼物', '名词'],
      ['juego', '游戏', '名词'], ['música', '音乐', '名词'],
    ],
  },
  {
    key: 'places', category: '地点与出行', words: [
      ['ciudad', '城市', '名词'], ['pueblo', '小镇；村庄', '名词'], ['calle', '街道', '名词'], ['plaza', '广场', '名词'],
      ['parque', '公园', '名词'], ['tienda', '商店', '名词'], ['mercado', '市场', '名词'], ['restaurante', '餐馆', '名词'],
      ['hotel', '酒店', '名词'], ['escuela', '学校', '名词'], ['universidad', '大学', '名词'], ['oficina', '办公室', '名词'],
      ['hospital', '医院', '名词'], ['farmacia', '药房', '名词'], ['banco', '银行', '名词'], ['estación', '车站', '名词'],
      ['aeropuerto', '机场', '名词'], ['playa', '海滩', '名词'], ['país', '国家', '名词'], ['mapa', '地图', '名词'],
      ['viaje', '旅行', '名词'], ['coche', '汽车', '名词'], ['autobús', '公交车', '名词'], ['tren', '火车', '名词'],
      ['avión', '飞机', '名词'], ['bicicleta', '自行车', '名词'], ['billete', '票；钞票', '名词'], ['maleta', '行李箱', '名词'],
      ['camino', '道路；路线', '名词'], ['dirección', '方向；地址', '名词'],
    ],
  },
  {
    key: 'verbs', category: '常用动作', words: [
      ['ser', '是（本质）', '动词'], ['estar', '是；在（状态）', '动词'], ['tener', '有', '动词'], ['hacer', '做', '动词'],
      ['ir', '去', '动词'], ['venir', '来', '动词'], ['ver', '看见', '动词'], ['mirar', '观看', '动词'],
      ['hablar', '说话', '动词'], ['decir', '说；告诉', '动词'], ['escuchar', '听', '动词'], ['leer', '阅读', '动词'],
      ['escribir', '写', '动词'], ['comer', '吃', '动词'], ['beber', '喝', '动词'], ['dormir', '睡觉', '动词'],
      ['vivir', '生活；居住', '动词'], ['trabajar', '工作', '动词'], ['estudiar', '学习', '动词'], ['aprender', '学习；学会', '动词'],
      ['comprar', '购买', '动词'], ['pagar', '付款', '动词'], ['abrir', '打开', '动词'], ['cerrar', '关闭', '动词'],
      ['buscar', '寻找', '动词'], ['encontrar', '找到', '动词'], ['querer', '想要；爱', '动词'], ['poder', '能够', '动词'],
      ['necesitar', '需要', '动词'], ['ayudar', '帮助', '动词'],
    ],
  },
  {
    key: 'adjectives', category: '描述', words: [
      ['bueno', '好的', '形容词'], ['malo', '坏的', '形容词'], ['grande', '大的', '形容词'], ['pequeño', '小的', '形容词'],
      ['nuevo', '新的', '形容词'], ['viejo', '旧的；年老的', '形容词'], ['joven', '年轻的', '形容词'], ['bonito', '漂亮的', '形容词'],
      ['feo', '难看的', '形容词'], ['fácil', '容易的', '形容词'], ['difícil', '困难的', '形容词'], ['rápido', '快的', '形容词'],
      ['lento', '慢的', '形容词'], ['caliente', '热的', '形容词'], ['frío', '冷的', '形容词'], ['limpio', '干净的', '形容词'],
      ['sucio', '脏的', '形容词'], ['abierto', '开着的', '形容词'], ['cerrado', '关着的', '形容词'], ['lleno', '满的', '形容词'],
      ['vacío', '空的', '形容词'], ['feliz', '快乐的', '形容词'], ['triste', '难过的', '形容词'], ['cansado', '疲倦的', '形容词'],
      ['importante', '重要的', '形容词'], ['diferente', '不同的', '形容词'], ['igual', '相同的', '形容词'], ['correcto', '正确的', '形容词'],
      ['posible', '可能的', '形容词'], ['listo', '准备好的；聪明的', '形容词'],
    ],
  },
  {
    key: 'body', category: '身体与健康', words: [
      ['cuerpo', '身体', '名词'], ['cabeza', '头', '名词'], ['cara', '脸', '名词'], ['ojo', '眼睛', '名词'],
      ['nariz', '鼻子', '名词'], ['boca', '嘴', '名词'], ['diente', '牙齿', '名词'], ['oreja', '耳朵', '名词'],
      ['pelo', '头发', '名词'], ['cuello', '脖子', '名词'], ['brazo', '手臂', '名词'], ['mano', '手', '名词'],
      ['dedo', '手指', '名词'], ['pierna', '腿', '名词'], ['pie', '脚', '名词'], ['espalda', '背部', '名词'],
      ['corazón', '心脏；内心', '名词'], ['salud', '健康', '名词'], ['dolor', '疼痛', '名词'], ['médico', '医生', '名词'],
      ['medicina', '药', '名词'], ['enfermo', '生病的', '形容词'], ['sano', '健康的', '形容词'], ['hambre', '饥饿', '名词'],
      ['sed', '口渴', '名词'], ['sueño', '困意；梦', '名词'], ['descanso', '休息', '名词'], ['ejercicio', '锻炼', '名词'],
      ['caminar', '走路', '动词'], ['correr', '跑步', '动词'],
    ],
  },
  {
    key: 'world', category: '自然与颜色', words: [
      ['sol', '太阳', '名词'], ['luna', '月亮', '名词'], ['cielo', '天空', '名词'], ['estrella', '星星', '名词'],
      ['mar', '海', '名词'], ['río', '河流', '名词'], ['montaña', '山', '名词'], ['árbol', '树', '名词'],
      ['flor', '花', '名词'], ['animal', '动物', '名词'], ['perro', '狗', '名词'], ['gato', '猫', '名词'],
      ['pájaro', '鸟', '名词'], ['tiempo', '天气；时间', '名词'], ['lluvia', '雨', '名词'], ['viento', '风', '名词'],
      ['nube', '云', '名词'], ['rojo', '红色的', '形容词'], ['azul', '蓝色的', '形容词'], ['verde', '绿色的', '形容词'],
      ['amarillo', '黄色的', '形容词'], ['blanco', '白色的', '形容词'], ['negro', '黑色的', '形容词'], ['gris', '灰色的', '形容词'],
      ['marrón', '棕色的', '形容词'], ['color', '颜色', '名词'], ['primavera', '春天', '名词'], ['verano', '夏天', '名词'],
      ['otoño', '秋天', '名词'], ['invierno', '冬天', '名词'],
    ],
  },
]

const examples: Record<string, readonly [string, string]> = {
  hola: ['Hola, ¿cómo estás?', '你好，你怎么样？'],
  gracias: ['Muchas gracias por tu ayuda.', '非常感谢你的帮助。'],
  también: ['Yo también estudio español.', '我也学习西班牙语。'],
  familia: ['Mi familia vive aquí.', '我的家人住在这里。'],
  mañana: ['Nos vemos mañana.', '我们明天见。'],
  agua: ['Quiero un vaso de agua.', '我想要一杯水。'],
  casa: ['Mi casa está cerca.', '我家就在附近。'],
  ciudad: ['La ciudad es muy grande.', '这座城市很大。'],
  aprender: ['Quiero aprender español.', '我想学习西班牙语。'],
  fácil: ['Este ejercicio es fácil.', '这道练习很容易。'],
  mano: ['Tengo el libro en la mano.', '我手里拿着这本书。'],
  sol: ['Hoy hace sol.', '今天是晴天。'],
}

function genericExample(word: RawWord): readonly [string, string] {
  const [spanish, chinese, partOfSpeech] = word
  if (partOfSpeech === '动词') {
    return [`Hoy practicamos el verbo «${spanish}».`, `今天我们练习动词“${chinese}”。`]
  }
  return [`Hoy aprendemos la palabra «${spanish}».`, `今天我们学习“${chinese}”这个词。`]
}

export const vocabulary: VocabularyEntry[] = groups.flatMap((group) =>
  group.words.map((word, index) => {
    const [spanish, chinese, partOfSpeech] = word
    const [example, exampleZh] = examples[spanish] ?? genericExample(word)
    return {
      id: `${group.key}-${String(index + 1).padStart(2, '0')}`,
      spanish,
      chinese,
      partOfSpeech,
      category: group.category,
      example,
      exampleZh,
    }
  }),
)

export const categories = ['全部', ...groups.map((group) => group.category)]

