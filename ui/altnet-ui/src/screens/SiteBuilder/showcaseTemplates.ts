import { createDefaultBlock } from "./registry";
import type { Block, Doc } from "./types";

export type ShowcaseTemplate = {
  id: string; category: string; name: string; brand: string; image: "architecture" | "landscape" | "bakery" | "studio" | "books" | "digital" | "photography" | "restaurant" | "florist" | "movement" | "animals" | "science";
  imageAlt: string; eyebrow: string; headline: string; intro: string; action: string; section: string;
  features: [string, string, string]; descriptions: [string, string, string]; story: string; storyText: string; closing: string;
  bg: string; fg: string; muted: string; accent: string; card: string; buttonText: string;
  layout: "left" | "right" | "center" | "editorial" | "image-first";
  faq?: [string, string][];
};

/** Демонстрационные тексты и названия можно изменить после создания проекта. */
export const SHOWCASE_TEMPLATES: ShowcaseTemplate[] = [
  {id:"architecture",category:"Архитектура и интерьер",name:"Тихая форма",brand:"FORMA / СТУДИЯ",image:"architecture",imageAlt:"Светлый интерьер с аркой и фактурными материалами",eyebrow:"АРХИТЕКТУРА · ИНТЕРЬЕРЫ · ДЕТАЛИ",headline:"Пространства, в которых хочется остаться.",intro:"Продуманный дизайн для жизни: естественный свет, честные материалы и внимание к каждой детали.",action:"Смотреть подход",section:"От идеи до последней детали",features:["Архитектура","Интерьеры","Сопровождение"],descriptions:["Идея, объём и пространство в единой композиции.","Материалы и предметы, с которыми приятно жить.","Спокойный процесс от эскиза до реализации."],story:"Меньше лишнего. Больше жизни.",storyText:"Хорошее пространство не спорит с человеком. Оно помогает замедлиться, сосредоточиться и почувствовать себя дома.",closing:"Расскажите о пространстве, которое хотите создать.",bg:"#f1ede5",fg:"#242b25",muted:"#586056",accent:"#4e5f4e",card:"#e6e0d4",buttonText:"#ffffff",layout:"left"},
  {id:"travel",category:"Путешествия и природа",name:"Тихий север",brand:"ТИХИЙ СЕВЕР",image:"landscape",imageAlt:"Горное озеро и лес на рассвете",eyebrow:"МАРШРУТЫ · ПРИРОДА · ВПЕЧАТЛЕНИЯ",headline:"Туда, где снова слышно себя.",intro:"Истории о местах, к которым хочется возвращаться. Неспешные маршруты и красота природы круглый год.",action:"Открыть маршруты",section:"Выберите своё направление",features:["У воды","В горах","В лесу"],descriptions:["Тихие берега, отражения и первые лучи солнца.","Просторные тропы и виды, ради которых стоит идти.","Места, где можно остановиться и просто дышать."],story:"Путешествие начинается с внимания.",storyText:"Мы собираем идеи для поездок, в которых есть место природе, местным историям и собственному ритму.",closing:"Сохраните идею следующего путешествия.",bg:"#e8efea",fg:"#172d2b",muted:"#526965",accent:"#285950",card:"#d6e4da",buttonText:"#ffffff",layout:"right"},
  {id:"bakery",category:"Пекарня и кафе",name:"Мякиш",brand:"МЯКИШ / ПЕКАРНЯ",image:"bakery",imageAlt:"Свежий хлеб и чашка кофе на льняной скатерти",eyebrow:"ХЛЕБ · КОФЕ · ТЁПЛЫЕ ВСТРЕЧИ",headline:"Хороший день начинается с хлеба.",intro:"Ароматная выпечка, неспешный кофе и простые вещи, которые делают утро особенным.",action:"Посмотреть меню",section:"Каждый день — с заботой",features:["Хлеб на закваске","Свежая выпечка","Кофе и чай"],descriptions:["Румяная корочка и мягкий, ароматный мякиш.","Любимые вкусы, приготовленные небольшими партиями.","Тёплая чашка для встречи или тихой паузы."],story:"Место, куда хочется вернуться.",storyText:"Здесь встречаются ремесло, знакомые лица и любовь к хорошей еде. Загляните на завтрак или возьмите хлеб домой.",closing:"Время работы и контакты можно указать здесь.",bg:"#f8f0e3",fg:"#38271e",muted:"#715f51",accent:"#9b4f31",card:"#ead7bd",buttonText:"#ffffff",layout:"left"},
  {id:"portfolio",category:"Портфолио и творчество",name:"Авторская практика",brand:"ПОРТФОЛИО / 01",image:"studio",imageAlt:"Автор работает над рисунком в светлой мастерской",eyebrow:"ИДЕИ · ОБЪЕКТЫ · ИСТОРИИ",headline:"Создаю вещи, у которых есть смысл.",intro:"Портфолио независимого автора: избранные работы, наблюдения и проекты, сделанные с вниманием к деталям.",action:"Смотреть работы",section:"Избранные направления",features:["Идея","Форма","История"],descriptions:["Исследование задачи и поиск ясного решения.","Композиция, материалы и выразительные детали.","Проекты, которые остаются с человеком надолго."],story:"Работа начинается с любопытства.",storyText:"Каждый проект — повод посмотреть на привычное по-новому и найти собственный визуальный язык.",closing:"Есть идея для совместного проекта?",bg:"#f4f1eb",fg:"#292b27",muted:"#62665f",accent:"#695b4c",card:"#e7e1d6",buttonText:"#ffffff",layout:"right"},
  {id:"books",category:"Писатель и книги",name:"Между строк",brand:"МЕЖДУ СТРОК",image:"books",imageAlt:"Книги и чай на деревянном столе",eyebrow:"ИСТОРИИ · КНИГИ · ЗАМЕТКИ",headline:"Истории, которые остаются с нами.",intro:"Место для книг, новых глав и мыслей автора. Откройте дверь в мир, созданный словами.",action:"Открыть книги",section:"В этом пространстве",features:["Книги","Заметки","Об авторе"],descriptions:["Истории, герои и миры, к которым хочется вернуться.","Мысли о работе над текстом и о том, что вдохновляет.","Знакомство с автором и его творческим путём."],story:"У каждой истории есть начало.",storyText:"Здесь можно рассказать о книге, поделиться отрывком и пригласить читателей следить за новыми главами.",closing:"Оставайтесь на связи с автором.",bg:"#f5eee5",fg:"#39252a",muted:"#745f62",accent:"#7d3744",card:"#eaddd1",buttonText:"#ffffff",layout:"center"},
  {id:"tech",category:"Технологии и студия",name:"Новая перспектива",brand:"НОВА / DIGITAL",image:"digital",imageAlt:"Абстрактная стеклянная форма в фиолетовом свете",eyebrow:"ДИЗАЙН · ТЕХНОЛОГИИ · ИДЕИ",headline:"Идеи обретают форму.",intro:"Цифровые проекты для людей: ясная стратегия, выразительный дизайн и внимание к тому, как всё работает.",action:"Изучить подход",section:"Что мы создаём",features:["Стратегия","Дизайн","Развитие"],descriptions:["Превращаем сложные задачи в понятное направление.","Находим характер продукта и его визуальный язык.","Помогаем идее расти вместе с её аудиторией."],story:"Ясность — тоже технология.",storyText:"Красивый интерфейс начинается с понимания людей, контекста и задач. Всё остальное вырастает из этого.",closing:"Расскажите, над чем вы работаете.",bg:"#101019",fg:"#f3f1fa",muted:"#b8b4c8",accent:"#a99aff",card:"#1c1a2b",buttonText:"#17132a",layout:"left"},
  {id:"wellness",category:"Здоровье и спокойствие",name:"Время для себя",brand:"ТИХО / ПРОСТРАНСТВО",image:"architecture",imageAlt:"Уютное светлое пространство с натуральными материалами",eyebrow:"БАЛАНС · ПРИСУТСТВИЕ · ЗАБОТА",headline:"Вернуться к себе.",intro:"Пространство для практик, отдыха и внимательного отношения к своему самочувствию.",action:"Узнать больше",section:"Начните с малого",features:["Движение","Дыхание","Отдых"],descriptions:["Мягкие практики в собственном темпе.","Минуты тишины среди повседневных дел.","Время восстановиться и прислушаться к себе."],story:"Забота — это привычка быть рядом с собой.",storyText:"Здесь можно представить свой подход, расписание и специалистов, не обещая мгновенных результатов.",closing:"Расскажите, как с вами связаться.",bg:"#f0f0e8",fg:"#273c32",muted:"#5b6c60",accent:"#56765e",card:"#dfe8db",buttonText:"#ffffff",layout:"center"},
  {id:"community",category:"Сообщество и экология",name:"Земля рядом",brand:"ЗЕМЛЯ РЯДОМ",image:"landscape",imageAlt:"Лес и горы у спокойного озера",eyebrow:"ЛЮДИ · МЕСТА · ДЕЙСТВИЯ",headline:"Большие перемены начинаются рядом.",intro:"Пространство для местного сообщества, добрых инициатив и бережного отношения к природе.",action:"Узнать об инициативах",section:"Вместе можно больше",features:["Знакомиться","Действовать","Делиться"],descriptions:["Объединяем людей вокруг общих идей.","Начинаем с понятных дел в своём районе.","Рассказываем о находках и опыте сообщества."],story:"Каждое участие имеет значение.",storyText:"Этот шаблон поможет рассказать о вашей инициативе, её целях и способах присоединиться.",closing:"Пригласите людей стать частью сообщества.",bg:"#f1f3e8",fg:"#26382a",muted:"#5d6d5d",accent:"#517744",card:"#dfe9d4",buttonText:"#ffffff",layout:"left"},
  {id:"education",category:"Образование и курсы",name:"Открытый класс",brand:"ОТКРЫТЫЙ КЛАСС",image:"books",imageAlt:"Открытая книга и стопка книг при дневном свете",eyebrow:"ЗНАНИЯ · ПРАКТИКА · ЛЮБОПЫТСТВО",headline:"Учиться — значит открывать новое.",intro:"Понятные материалы и пространство для роста. Представьте свой курс, школу или образовательный проект.",action:"Посмотреть программу",section:"Как устроено обучение",features:["Разбираемся","Пробуем","Растём"],descriptions:["Сложные темы становятся понятнее шаг за шагом.","Применяем новые знания на конкретных примерах.","Собираем опыт, задаём вопросы и идём дальше."],story:"Хороший вопрос открывает путь.",storyText:"Поделитесь программой занятий, расскажите о преподавателях и помогите будущим ученикам найти свой интерес.",closing:"Добавьте информацию о записи и контактах.",bg:"#f8f3e9",fg:"#302c30",muted:"#6a6061",accent:"#8c4d52",card:"#eddfd2",buttonText:"#ffffff",layout:"right"},
  {id:"event",category:"События и конференции",name:"Точка встречи",brand:"ТОЧКА / ВСТРЕЧИ",image:"digital",imageAlt:"Светящаяся абстрактная форма на тёмном фоне",eyebrow:"ЛЮДИ · ИДЕИ · ДИАЛОГ",headline:"Встреча, после которой рождаются идеи.",intro:"Страница события, которое объединяет людей вокруг общих вопросов и новых возможностей.",action:"Смотреть программу",section:"Что вас ждёт",features:["Разговоры","Новые идеи","Знакомства"],descriptions:["Темы, которые действительно хочется обсудить.","Свежий взгляд на привычные задачи.","Люди, с которыми интересно продолжить разговор."],story:"Самое важное происходит между строк программы.",storyText:"Расскажите о теме события, участниках и том, как присоединиться. Дату и место можно указать в контактах.",closing:"Добавьте место, дату и способ связи.",bg:"#14131e",fg:"#f7f3ff",muted:"#c0b8d0",accent:"#c1a5fa",card:"#262034",buttonText:"#1d152c",layout:"center"},
  {id:"cafe",category:"Кофейня и гастрономия",name:"Чашка и время",brand:"ЧАШКА И ВРЕМЯ",image:"bakery",imageAlt:"Кофе и свежая выпечка на столе",eyebrow:"КОФЕ · ВКУС · ВСТРЕЧИ",headline:"Здесь можно никуда не спешить.",intro:"Тёплый кофе, свежая выпечка и маленькое пространство для больших разговоров.",action:"Заглянуть в меню",section:"Для вашего ритма",features:["Утро","День","Встреча"],descriptions:["Начните день с любимого напитка и завтрака.","Сделайте паузу между планами и делами.","Найдите время для тех, кто вам дорог."],story:"Любимые места складываются из деталей.",storyText:"Знакомый аромат, мягкий свет и возможность на минуту остановиться. Расскажите гостям историю вашего места.",closing:"Добавьте адрес, часы работы и контакты.",bg:"#f6ede1",fg:"#33251f",muted:"#756255",accent:"#925739",card:"#e8d7c4",buttonText:"#ffffff",layout:"center"},
  {id:"craft",category:"Мастерская и ремесло",name:"Сделано руками",brand:"МАСТЕРСКАЯ / ФОРМА",image:"studio",imageAlt:"Руки мастера за работой в мастерской",eyebrow:"МАТЕРИАЛ · ВРЕМЯ · МАСТЕРСТВО",headline:"Вещи с характером и историей.",intro:"Авторская мастерская, где идеи превращаются в предметы, созданные с вниманием к форме и материалу.",action:"Посмотреть работы",section:"От замысла к предмету",features:["Материал","Процесс","Детали"],descriptions:["Выбираем фактуры, к которым хочется прикоснуться.","Оставляем время на поиск точного решения.","Создаём предметы, которые приятно использовать."],story:"Красота живёт в работе рук.",storyText:"Этот шаблон поможет показать коллекции, рассказать о процессе и познакомить посетителей с вашей мастерской.",closing:"Пригласите посетителей обсудить вашу работу.",bg:"#f1ece4",fg:"#302b25",muted:"#6f6256",accent:"#9a674b",card:"#e4d7c7",buttonText:"#ffffff",layout:"right"},
  {
    id:"photo", category:"Фотография и визуальные истории", name:"Свет и расстояние", brand:"СВЕТ / РАССТОЯНИЕ", image:"photography",
    imageAlt:"Человек среди песчаных дюн в вечернем свете", eyebrow:"ФОТОГРАФИЯ · МЕСТА · ЛЮДИ", headline:"Сохраняя мгновения, которые остаются.",
    intro:"Визуальный дневник о свете, путешествиях и человеческих историях. Пространство для ваших избранных серий и проектов.", action:"Открыть серии", section:"Три способа смотреть",
    features:["Пейзаж", "История", "Портрет"], descriptions:["Тишина пространства и меняющийся свет.", "Детали, из которых складывается воспоминание.", "Индивидуальность, характер и естественный момент."],
    story:"У каждого кадра есть своё время.", storyText:"Здесь можно рассказать о подходе, показать выбранные работы и познакомить посетителя со своим взглядом.", closing:"Расскажите о вашей идее для съёмки.",
    bg:"#1b1a18", fg:"#f5f0e9", muted:"#c7bcb1", accent:"#e8c1a0", card:"#302a26", buttonText:"#241914", layout:"editorial"
  },
  {
    id:"restaurant", category:"Ресторан и кухня", name:"Соль и огонь", brand:"СОЛЬ / ОГОНЬ", image:"restaurant",
    imageAlt:"Блюдо из сезонных овощей на керамической тарелке", eyebrow:"КУХНЯ · СЕЗОН · ВСТРЕЧИ", headline:"Вкус момента, которым хочется поделиться.",
    intro:"Сезонные продукты, тёплый свет и ужины, которые не хочется торопить. Шаблон для ресторана и авторской кухни.", action:"Узнать о кухне", section:"Наше меню строится вокруг сезона",
    features:["Начало", "Главное", "Завершение"], descriptions:["Лёгкие закуски и первые яркие сочетания.", "Блюда, в которых слышен вкус каждого продукта.", "Десерт и напиток для неспешного финала."],
    story:"За каждым блюдом — внимание к деталям.", storyText:"Расскажите о своей команде, ингредиентах и атмосфере. Названия блюд и условия посещения легко заменить.", closing:"Добавьте адрес, часы работы и способ связи.",
    bg:"#f3ebe0", fg:"#34261f", muted:"#6a584f", accent:"#8a4632", card:"#e8d8c8", buttonText:"#ffffff", layout:"image-first"
  },
  {
    id:"flowers", category:"Цветы и флористика", name:"Сад в городе", brand:"САД / В ГОРОДЕ", image:"florist",
    imageAlt:"Авторская композиция из садовых цветов", eyebrow:"ЦВЕТЫ · СЕЗОН · ПОВОД", headline:"Пусть у каждого дня будет свой цвет.",
    intro:"Цветочные истории для важных встреч, тихих праздников и простого желания порадовать близких.", action:"Посмотреть работы", section:"Цветы для разных историй",
    features:["Букеты", "События", "Пространства"], descriptions:["Композиции с характером и сезонными цветами.", "Детали, которые делают особенный день личным.", "Живые акценты для места, где хочется быть."],
    story:"Красота не обязана быть идеальной.", storyText:"Нас вдохновляют природные формы, неожиданные оттенки и цветы, у которых есть собственный голос.", closing:"Расскажите, какой цветочной истории вы ждёте.",
    bg:"#f7edf0", fg:"#422b36", muted:"#765b68", accent:"#8c4b68", card:"#eddae0", buttonText:"#ffffff", layout:"editorial"
  },
  {
    id:"movement", category:"Движение и спортивная студия", name:"Точка движения", brand:"ТОЧКА / ДВИЖЕНИЯ", image:"movement",
    imageAlt:"Светлая студия для занятий движением", eyebrow:"ДВИЖЕНИЕ · СИЛА · БАЛАНС", headline:"Двигайтесь в своём ритме.",
    intro:"Пространство для занятий, в которых важны внимание к себе, последовательность и удовольствие от движения.", action:"Смотреть направления", section:"Найдите свой формат",
    features:["Практика", "Сила", "Восстановление"], descriptions:["Осваивайте движение с вниманием к технике.", "Укрепляйте привычку заниматься регулярно.", "Оставляйте время на отдых и восстановление."],
    story:"Результат начинается с регулярности.", storyText:"Представьте направления, команду и расписание. Информация о занятиях остаётся редактируемой и не заменяет медицинскую консультацию.", closing:"Укажите расписание и контакт студии.",
    bg:"#e8f0e9", fg:"#18372c", muted:"#4f695b", accent:"#28674e", card:"#d4e4d6", buttonText:"#ffffff", layout:"image-first"
  },
  {
    id:"animals", category:"Помощь животным и приюты", name:"Дом для друга", brand:"ДОМ ДЛЯ ДРУГА", image:"animals",
    imageAlt:"Собака отдыхает рядом с окном", eyebrow:"ЗАБОТА · ДОМ · ВТОРОЙ ШАНС", headline:"Для каждого друга может найтись дом.",
    intro:"Сайт для приюта или волонтёрской команды: расскажите о животных, заботе и людях, которые помогают рядом.", action:"Узнать, как помочь", section:"Небольшие действия имеют значение",
    features:["Знакомиться", "Помогать", "Рассказывать"], descriptions:["Поделитесь историями животных и их характерами.", "Объясните, какая помощь действительно нужна.", "Распространяйте информацию среди друзей и соседей."],
    story:"Забота начинается со знакомства.", storyText:"Разместите проверенную информацию о вашей команде и правилах общения с животными. Способы помощи добавляются владельцем проекта.", closing:"Укажите подтверждённые контакты приюта.",
    bg:"#f7eee3", fg:"#3b3028", muted:"#715e52", accent:"#9b4e35", card:"#edddca", buttonText:"#ffffff", layout:"left",
    faq:[["Как узнать о животных?", "Добавьте сюда актуальный способ связи с вашей командой и порядок знакомства."], ["Чем можно помочь?", "Перечислите реальные потребности и проверенные способы участия."]]
  },
  {
    id:"science", category:"Наука и исследовательский журнал", name:"Горизонт знаний", brand:"ГОРИЗОНТ / ЖУРНАЛ", image:"science",
    imageAlt:"Стеклянные сферы и тонкие световые волокна", eyebrow:"ИДЕИ · ИССЛЕДОВАНИЯ · ОТКРЫТИЯ", headline:"Любопытство меняет границы возможного.",
    intro:"Независимое пространство для исследований, научных историй и вопросов, которые помогают лучше понимать мир.", action:"Исследовать темы", section:"О чём мы рассказываем",
    features:["Вопрос", "Исследование", "Открытие"], descriptions:["Начинаем с того, что действительно интересно.", "Проверяем идеи и внимательно относимся к данным.", "Объясняем результаты ясно и с необходимым контекстом."],
    story:"Знание начинается с хорошего вопроса.", storyText:"Покажите направления исследований, авторов и материалы. Публикуемые данные и утверждения следует проверять самостоятельно.", closing:"Пригласите читателей к диалогу.",
    bg:"#0d1a25", fg:"#edf7fa", muted:"#b0c7cd", accent:"#8adbd5", card:"#18303d", buttonText:"#102a2b", layout:"editorial",
    faq:[["Что можно найти в журнале?", "Опишите направления, авторов и форматы материалов вашего проекта."], ["Как связаться с редакцией?", "Укажите актуальные контакты и правила отправки материалов."]]
  },
];

const wrap = (extra: Record<string, string | number> = {}) => ({ pt: 0, pb: 0, bs: "none", ...extra });

function heading(text: string, spec: ShowcaseTemplate, size: number, level: "h1" | "h2" | "h3" = "h2", align: "left" | "center" = "left"): Block {
  const modern = ["tech", "event", "education", "movement", "science"].includes(spec.id);
  return { ...createDefaultBlock("heading"), text, level, align, style: wrap({ ff: modern ? "system-ui" : "Georgia", fs: size, fw: modern ? 650 : 400, lh: 1.12, tc: spec.fg, mb: 12 }),
    styleByBp: { mobile: { fs: Math.round(size * .65), lh: 1.16 } } };
}
function paragraph(text: string, color: string, size = 16, align: "left" | "center" = "left"): Block {
  return { ...createDefaultBlock("p"), text, align, style: wrap({ fs: size, lh: 1.6, tc: color, mb: 12 }) };
}
function button(label: string, href: string, spec: ShowcaseTemplate, align: "left" | "center" | "right" = "left"): Block {
  return { ...createDefaultBlock("btn"), label, href, align, style: wrap({ mt: 14, mb: 8 }),
    buttonStyleByBp: { desktop: { bg: spec.accent, color: spec.buttonText, radius: 6, paddingX: 24, paddingY: 14, hoverBg: spec.fg, hoverColor: spec.bg } } };
}
function section(cells: Block[][], weights: number[], style: Record<string, string | number> = {}, anchorId?: string): Block {
  return { ...createDefaultBlock("section", weights), layoutCells: cells, layoutPreset: weights, anchorId,
    layoutGap: 24, pad: "sm", theme: "auto", bg: "none", style: wrap(style),
    layoutByBp: { mobile: { mode: "stack", gap: 16 } } };
}

/** Создаёт документ из обычных блоков редактора; картинка уже локальная data URL. */
export function createShowcaseDocument(spec: ShowcaseTemplate, imageData: string): Doc {
  if (!/^data:image\/(png|jpeg|webp|gif);base64,[a-z0-9+/=]+$/i.test(imageData)) throw new Error("Не удалось загрузить локальное изображение шаблона.");
  const mark = paragraph(spec.brand, spec.fg, 13);
  mark.style = wrap({ fs: 13, fw: 700, tc: spec.fg, letterSpacing: 1.5 });
  const nav = section([[mark], [button("Контакты", "#contacts", spec, "right")]], [3, 2]);
  if (nav.type === "section") nav.layoutByBp = { mobile: { mode: "columns", weights: [3, 2], gap: 8 } };
  const heroCopy: Block[] = [paragraph(spec.eyebrow, spec.accent, 12), heading(spec.headline, spec, 58, "h1"), paragraph(spec.intro, spec.muted, 18), button(spec.action, "#offer", spec)];
  const image: Block = { ...createDefaultBlock("img"), cid: imageData, alt: spec.imageAlt, style: wrap(),
    imageStyleByBp: { desktop: { width: 100, height: 440, fit: "cover", radius: 14 }, mobile: { height: 250 } } };
  const editorialCopy = () => section([[paragraph(spec.eyebrow, spec.accent, 12), heading(spec.headline, spec, 58, "h1")],
    [paragraph(spec.intro, spec.muted, 18), button(spec.action, "#offer", spec)]], [6, 4]);
  const hero = spec.layout === "editorial" ? [editorialCopy(), section([[image]], [1])]
    : spec.layout === "image-first" ? [section([[image]], [1]), editorialCopy()]
    : [spec.layout === "center"
      ? section([[paragraph(spec.eyebrow, spec.accent, 12, "center"), heading(spec.headline, spec, 58, "h1", "center"), paragraph(spec.intro, spec.muted, 18, "center"), button(spec.action, "#offer", spec, "center"), image]], [1])
      : section(spec.layout === "left" ? [heroCopy, [image]] : [[image], heroCopy], spec.layout === "left" ? [5, 6] : [6, 5])];
  const featureCells = spec.features.map((feature, i) => [paragraph(`0${i + 1} /`, spec.accent, 12), heading(feature, spec, 25, "h3"), paragraph(spec.descriptions[i], spec.muted, 15)]);
  const featureHeader = section([[paragraph("НАШ ПОДХОД", spec.accent, 12), heading(spec.section, spec, 37)]], [1], { mt: 28 }, "offer");
  const separateCards = ["tech", "portfolio", "education", "craft", "science", "movement", "photo"].includes(spec.id);
  const features = separateCards
    ? section(featureCells.map(cell => [section([cell], [1], { bg: spec.card, br: 14, pl: 20, pr: 20 })]), [1, 1, 1])
    : section(featureCells, [1, 1, 1], { bg: spec.card, br: 14, pl: 24, pr: 24 });
  const story = section([[paragraph("О НАС", spec.accent, 12), heading(spec.story, spec, 40)], [paragraph(spec.storyText, spec.muted, 17), button("Связаться", "#contacts", spec)]], [1, 1], { mt: 30 });
  const faq: Block[] = spec.faq?.length ? [section([
    [paragraph("ВОПРОСЫ И ОТВЕТЫ", spec.accent, 12), heading("Полезно знать", spec, 34)],
    [{ ...createDefaultBlock("accordion"), variant: "ghost", size: "md", allowMultiple: false, allowToggle: true,
      items: spec.faq.map(([title, content], i) => ({ id: `faq-${i + 1}`, title, content, open: false })), style: wrap() }],
  ], [1, 2], { mt: 28 })] : [];
  const contact = section([[paragraph("КОНТАКТЫ", spec.accent, 12), heading(spec.closing, spec, 34), paragraph("Замените этот текст своими контактами и удобным способом связи.", spec.muted, 15)]], [1], { mt: 28, bg: spec.card, br: 14, pl: 24, pr: 24 }, "contacts");
  return { title: spec.name, description: spec.intro, theme: { accent: spec.accent, background: spec.bg, foreground: spec.fg, container: 1200, showTitle: false }, blocks: [nav, ...hero, featureHeader, features, story, ...faq, contact] };
}

// Каждый вызов фабрики создаёт новые ID с помощью штатного реестра редактора.
export const showcaseTemplateCount = SHOWCASE_TEMPLATES.length;
