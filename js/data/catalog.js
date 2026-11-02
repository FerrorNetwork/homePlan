// Демонстрационный каталог. Каждая запись — товар с ID, размерами, ценами по магазинам, датой и ссылкой.
// Цены и магазины демонстрационные (store.demo = true) и в интерфейсе так и помечаются.
// ИИ выбирает только ID отсюда или из импортированных фидов (раздел 5 ТЗ).

export const CATEGORIES = [
  'Мебель', 'Кухни', 'Сантехника', 'Плитка и керамогранит', 'Напольные покрытия',
  'Обои и краски', 'Двери и окна', 'Освещение', 'Электроустановочные изделия', 'Текстиль и декор', 'Бытовая техника',
];

export const STORES = [
  { id: 'dm', name: 'ДомМаркет', demo: true, cities: '*', deliveryDays: 2, feedLagDays: 0 },
  { id: 'sb', name: 'СтройБаза', demo: true, cities: ['Москва', 'Санкт-Петербург', 'Самара', 'Казань', 'Нижний Новгород', 'Екатеринбург', 'Челябинск', 'Пермь', 'Уфа', 'Новосибирск', 'Краснодар', 'Ростов-на-Дону', 'Воронеж', 'Волгоград', 'Саратов', 'Тюмень'], deliveryDays: 3, feedLagDays: 1 },
  { id: 'ip', name: 'Интерьер Плюс', demo: true, cities: ['Москва', 'Санкт-Петербург', 'Самара', 'Казань', 'Нижний Новгород', 'Екатеринбург', 'Краснодар'], deliveryDays: 5, feedLagDays: 12 },
];

// kind — тип предмета для правил расстановки; rooms — типы помещений, где он уместен.
// [id, name, brand, category, kind, [Ш, Г, В] мм, цена ₽, стили, цвет, материал, доп.]
const RAW = [
  // Гостиная
  ['sofa-lund', 'Диван прямой «Лунд» 3-местный', 'Nordhus', 'Мебель', 'sofa', [2140, 930, 820], 54990, ['scandi', 'japandi', 'eco', 'minimal'], '#cfc6b6', 'рогожка'],
  ['sofa-grafit', 'Диван модульный «Графит»', 'Модум', 'Мебель', 'sofa', [2400, 1000, 760], 78990, ['modern', 'minimal', 'hightech'], '#6c706f', 'велюр'],
  ['sofa-loft-leather', 'Диван кожаный «Честер Лофт»', 'Фабрика 12', 'Мебель', 'sofa', [2200, 950, 780], 112000, ['loft', 'vintage', 'artdeco'], '#6b4632', 'кожа'],
  ['sofa-velvet-arc', 'Диван полукруглый «Арка» бархат', 'Декора', 'Мебель', 'sofa', [2300, 1000, 800], 139000, ['artdeco', 'neoclassic'], '#2f5552', 'бархат'],
  ['sofa-provence', 'Диван «Луара» с подушками', 'Прованс Дом', 'Мебель', 'sofa', [2000, 900, 900], 61990, ['provence', 'mediterranean', 'neoclassic'], '#e4ddcf', 'хлопок'],
  ['sofa-corner-oslo', 'Диван угловой «Осло»', 'Nordhus', 'Мебель', 'sofa-corner', [2700, 1650, 820], 89990, ['scandi', 'modern', 'eco'], '#bfb6a6', 'шенилл'],
  ['sofa-corner-urban', 'Диван угловой «Урбан»', 'Модум', 'Мебель', 'sofa-corner', [2800, 1700, 760], 104900, ['modern', 'loft', 'hightech', 'minimal'], '#4c5150', 'велюр'],
  ['armchair-wing', 'Кресло «Ушастик»', 'Nordhus', 'Мебель', 'armchair', [760, 820, 1020], 21990, ['scandi', 'neoclassic', 'provence'], '#9fb0a3', 'букле'],
  ['armchair-cocktail', 'Кресло-коктейль «Ретро-62»', 'Мебель 60-х', 'Мебель', 'armchair', [700, 720, 780], 17490, ['vintage', 'loft', 'artdeco'], '#a8714a', 'ткань/орех'],
  ['armchair-rattan', 'Кресло ротанговое «Бали»', 'ЭкоФорм', 'Мебель', 'armchair', [720, 760, 820], 19990, ['japandi', 'eco', 'mediterranean'], '#c9a979', 'ротанг'],
  ['coffee-round-oak', 'Журнальный стол круглый, дуб', 'Nordhus', 'Мебель', 'coffee-table', [800, 800, 420], 12990, ['scandi', 'japandi', 'eco', 'minimal'], '#c9a87c', 'дуб'],
  ['coffee-metal', 'Журнальный стол металл/стекло', 'Фабрика 12', 'Мебель', 'coffee-table', [1100, 600, 400], 15990, ['loft', 'modern', 'hightech'], '#2e2e2e', 'металл'],
  ['coffee-marble', 'Журнальный стол «Мрамор» латунь', 'Декора', 'Мебель', 'coffee-table', [900, 900, 380], 28990, ['artdeco', 'neoclassic'], '#e8e2d6', 'мрамор'],
  ['coffee-walnut', 'Журнальный стол «Орех» на конусных ножках', 'Мебель 60-х', 'Мебель', 'coffee-table', [1000, 550, 450], 11490, ['vintage', 'provence', 'mediterranean'], '#7b4f30', 'шпон ореха'],
  ['tv-low-oak', 'ТВ-тумба низкая «Сканди» 180', 'Nordhus', 'Мебель', 'tv-stand', [1800, 400, 450], 19990, ['scandi', 'japandi', 'eco', 'minimal', 'provence'], '#d6bf9b', 'дуб'],
  ['tv-gloss', 'ТВ-тумба подвесная глянец 200', 'Модум', 'Мебель', 'tv-stand', [2000, 380, 350], 24990, ['modern', 'hightech', 'minimal', 'artdeco'], '#f2f2f0', 'МДФ глянец'],
  ['tv-loft', 'ТВ-тумба металл/дерево 160', 'Фабрика 12', 'Мебель', 'tv-stand', [1600, 420, 520], 17990, ['loft', 'vintage', 'mediterranean', 'neoclassic'], '#5a4030', 'металл/сосна'],
  ['shelf-open', 'Стеллаж открытый 5 полок', 'Nordhus', 'Мебель', 'bookshelf', [800, 350, 1900], 9990, ['scandi', 'japandi', 'eco', 'minimal', 'modern'], '#e7dcc8', 'ЛДСП'],
  ['shelf-metal', 'Стеллаж металлический «Индастриал»', 'Фабрика 12', 'Мебель', 'bookshelf', [900, 380, 1800], 13490, ['loft', 'hightech', 'vintage'], '#2b2b2b', 'металл'],
  ['sideboard-classic', 'Буфет «Версаль»', 'Декора', 'Мебель', 'bookshelf', [1200, 450, 1600], 46990, ['neoclassic', 'artdeco', 'provence', 'mediterranean'], '#efe8da', 'массив'],
  // Кухня и столовая
  ['kitchen-white-28', 'Кухонный гарнитур прямой 2,8 м, белый матовый', 'КухниРус', 'Кухни', 'kitchen-set', [2800, 600, 2200], 164000, ['scandi', 'minimal', 'modern', 'japandi', 'provence', 'mediterranean'], '#f1efe9', 'МДФ эмаль', { power: 0 }],
  ['kitchen-oak-24', 'Кухонный гарнитур 2,4 м, дуб/графит', 'КухниРус', 'Кухни', 'kitchen-set', [2400, 600, 2200], 148000, ['loft', 'modern', 'eco', 'vintage', 'hightech', 'artdeco', 'neoclassic'], '#4d4b48', 'шпон/ЛДСП'],
  ['kitchen-compact-18', 'Кухонный гарнитур 1,8 м компакт', 'Эконом-кухни', 'Кухни', 'kitchen-set', [1800, 600, 2200], 72990, ['scandi', 'modern', 'minimal', 'provence', 'eco', 'loft', 'vintage', 'japandi', 'mediterranean', 'hightech', 'artdeco', 'neoclassic'], '#e9e5dc', 'ЛДСП'],
  ['fridge-white', 'Холодильник двухкамерный 60 см', 'Бирюса', 'Бытовая техника', 'fridge', [600, 650, 1850], 42990, ['*'], '#f3f3f3', 'металл', { power: 150 }],
  ['dining-round-oak', 'Стол обеденный круглый Ø100, дуб', 'Nordhus', 'Мебель', 'dining-table', [1000, 1000, 750], 27990, ['scandi', 'japandi', 'eco', 'provence'], '#c9a87c', 'дуб'],
  ['dining-rect-loft', 'Стол обеденный 160×85 слэб', 'Фабрика 12', 'Мебель', 'dining-table', [1600, 850, 760], 39990, ['loft', 'eco', 'vintage', 'modern'], '#6d4e36', 'массив'],
  ['dining-ceramic', 'Стол обеденный керамика 140×80', 'Модум', 'Мебель', 'dining-table', [1400, 800, 750], 34990, ['modern', 'minimal', 'hightech', 'artdeco', 'neoclassic', 'mediterranean'], '#d9d6cf', 'керамика'],
  ['chair-oak', 'Стул «Форма» дуб', 'Nordhus', 'Мебель', 'chair', [460, 520, 810], 7990, ['scandi', 'japandi', 'eco', 'minimal', 'provence'], '#c9a87c', 'дуб'],
  ['chair-metal', 'Стул металлический «Цех»', 'Фабрика 12', 'Мебель', 'chair', [440, 500, 820], 5490, ['loft', 'hightech', 'modern', 'vintage'], '#2f2f2f', 'металл'],
  ['chair-velvet', 'Стул мягкий бархат «Мадрид»', 'Декора', 'Мебель', 'chair', [480, 560, 860], 9990, ['artdeco', 'neoclassic', 'mediterranean', 'modern'], '#2f5552', 'бархат'],
  // Спальня
  ['bed-oak-160', 'Кровать 160×200 «Сканди» дуб', 'Nordhus', 'Мебель', 'bed', [1680, 2120, 950], 44990, ['scandi', 'eco', 'minimal', 'provence'], '#d6bf9b', 'дуб'],
  ['bed-soft-160', 'Кровать с мягким изголовьем 160×200', 'Сон-Дом', 'Мебель', 'bed', [1760, 2180, 1200], 52990, ['modern', 'neoclassic', 'artdeco', 'hightech', 'mediterranean'], '#8f9590', 'велюр'],
  ['bed-low-japandi', 'Кровать низкая «Татами» 160×200', 'ЭкоФорм', 'Мебель', 'bed', [1700, 2100, 600], 47990, ['japandi', 'minimal', 'eco'], '#b6977a', 'ясень'],
  ['bed-metal-140', 'Кровать металлическая 140×200', 'Фабрика 12', 'Мебель', 'bed', [1480, 2080, 1000], 27990, ['loft', 'vintage', 'provence'], '#2f2f2f', 'металл'],
  ['nightstand-oak', 'Тумба прикроватная дуб', 'Nordhus', 'Мебель', 'nightstand', [450, 400, 500], 6990, ['scandi', 'japandi', 'eco', 'minimal', 'provence'], '#d6bf9b', 'дуб'],
  ['nightstand-gloss', 'Тумба прикроватная с подсветкой', 'Модум', 'Мебель', 'nightstand', [500, 400, 450], 9490, ['modern', 'hightech', 'artdeco', 'neoclassic', 'mediterranean', 'loft', 'vintage'], '#e9e9e7', 'МДФ'],
  ['wardrobe-2', 'Шкаф-купе 180, белый', 'ШкафСтрой', 'Мебель', 'wardrobe', [1800, 600, 2300], 38990, ['scandi', 'modern', 'minimal', 'hightech', 'japandi', 'eco', 'mediterranean'], '#f2f1ed', 'ЛДСП'],
  ['wardrobe-classic', 'Шкаф распашной «Версаль» 160', 'Декора', 'Мебель', 'wardrobe', [1600, 580, 2200], 54990, ['neoclassic', 'artdeco', 'provence', 'vintage', 'loft'], '#ece4d6', 'массив'],
  ['wardrobe-120', 'Шкаф 120 компактный', 'ШкафСтрой', 'Мебель', 'wardrobe', [1200, 550, 2100], 21990, ['*'], '#e8e3d8', 'ЛДСП'],
  ['dresser-oak', 'Комод 4 ящика дуб', 'Nordhus', 'Мебель', 'dresser', [1000, 450, 850], 18990, ['scandi', 'japandi', 'eco', 'provence', 'minimal'], '#d6bf9b', 'дуб'],
  ['dresser-walnut', 'Комод «Орех» на ножках', 'Мебель 60-х', 'Мебель', 'dresser', [1100, 450, 800], 21990, ['vintage', 'loft', 'artdeco', 'neoclassic', 'modern', 'mediterranean', 'hightech'], '#7b4f30', 'шпон ореха'],
  ['desk-oak', 'Письменный стол 120×60 дуб', 'Nordhus', 'Мебель', 'desk', [1200, 600, 750], 14990, ['scandi', 'japandi', 'eco', 'minimal', 'provence', 'mediterranean'], '#d6bf9b', 'дуб'],
  ['desk-loft', 'Стол рабочий лофт 140×70', 'Фабрика 12', 'Мебель', 'desk', [1400, 700, 750], 16990, ['loft', 'modern', 'hightech', 'vintage', 'artdeco', 'neoclassic'], '#5a4030', 'металл/дерево'],
  ['office-chair', 'Кресло рабочее эргономичное', 'Офис Про', 'Мебель', 'office-chair', [620, 620, 1150], 15990, ['*'], '#3a3d3f', 'сетка'],
  // Прихожая
  ['hall-shoe', 'Обувница 3 секции', 'ШкафСтрой', 'Мебель', 'shoe-cabinet', [900, 300, 1000], 8990, ['*'], '#e8e3d8', 'ЛДСП'],
  ['hall-rack', 'Вешалка напольная с полкой', 'Nordhus', 'Мебель', 'coat-rack', [800, 350, 1800], 7490, ['scandi', 'loft', 'japandi', 'eco', 'minimal', 'modern'], '#c9a87c', 'дуб/металл'],
  ['hall-wardrobe', 'Шкаф для прихожей 100', 'ШкафСтрой', 'Мебель', 'wardrobe', [1000, 450, 2200], 19990, ['*'], '#ece8de', 'ЛДСП'],
  // Ванная
  ['bath-170', 'Ванна акриловая 170×75', 'АкваДом', 'Сантехника', 'bath', [1700, 750, 600], 22990, ['*'], '#ffffff', 'акрил'],
  ['shower-90', 'Душевой уголок 90×90 с поддоном', 'АкваДом', 'Сантехника', 'shower', [900, 900, 2000], 27990, ['modern', 'minimal', 'hightech', 'loft', 'japandi', 'scandi'], '#e9f1f3', 'стекло'],
  ['vanity-80', 'Тумба с раковиной 80 «Терра»', 'АкваДом', 'Сантехника', 'vanity', [800, 460, 850], 24990, ['modern', 'minimal', 'scandi', 'hightech', 'japandi', 'eco'], '#efeeea', 'МДФ'],
  ['vanity-60-classic', 'Тумба с раковиной 60 «Классик»', 'АкваДом', 'Сантехника', 'vanity', [600, 450, 850], 19990, ['*'], '#f2ede3', 'МДФ'],
  ['toilet-wall', 'Унитаз подвесной с инсталляцией', 'Сантек', 'Сантехника', 'toilet', [370, 540, 400], 21990, ['*'], '#ffffff', 'фаянс'],
  ['washer-60', 'Стиральная машина узкая 6 кг', 'Атлант', 'Бытовая техника', 'washer', [600, 450, 850], 32990, ['*'], '#f5f5f5', 'металл', { power: 2100 }],
  ['mirror-round', 'Зеркало круглое Ø60 с подсветкой', 'АкваДом', 'Текстиль и декор', 'mirror', [600, 30, 600], 6990, ['*'], '#dfe7ea', 'стекло', { wall: true }],
  // Освещение
  ['light-ceiling-flat', 'Светильник потолочный плоский Ø50', 'Свет и Дом', 'Освещение', 'ceiling-light', [500, 500, 90], 4990, ['*'], '#fafafa', 'акрил', { power: 36, scene: 'general' }],
  ['light-pendant-arc', 'Подвесной светильник «Дуга» металл', 'Свет и Дом', 'Освещение', 'pendant', [380, 380, 240], 7490, ['loft', 'modern', 'hightech', 'minimal', 'vintage'], '#2a2a2a', 'металл', { power: 40, scene: 'work' }],
  ['light-pendant-paper', 'Подвес «Фонарь» рисовая бумага', 'ЭкоФорм', 'Освещение', 'pendant', [450, 450, 400], 5490, ['japandi', 'scandi', 'eco', 'mediterranean', 'provence'], '#f1ead8', 'бумага', { power: 25, scene: 'work' }],
  ['light-chandelier', 'Люстра «Ампир» 6 рожков латунь', 'Декора', 'Освещение', 'pendant', [650, 650, 550], 23990, ['neoclassic', 'artdeco'], '#c9a96e', 'латунь', { power: 60, scene: 'general' }],
  ['light-track', 'Трековая система 2 м, 4 спота', 'Свет и Дом', 'Освещение', 'track', [2000, 40, 60], 9990, ['modern', 'loft', 'minimal', 'hightech'], '#1e1e1e', 'алюминий', { power: 48, scene: 'work' }],
  ['light-floor', 'Торшер с тканевым абажуром', 'Свет и Дом', 'Освещение', 'floor-lamp', [400, 400, 1600], 6490, ['scandi', 'vintage', 'provence', 'neoclassic', 'eco', 'japandi', 'mediterranean'], '#efe7d6', 'ткань', { power: 15, scene: 'accent' }],
  ['light-floor-arc', 'Торшер дуговой металл', 'Свет и Дом', 'Освещение', 'floor-lamp', [400, 1100, 1900], 9990, ['modern', 'loft', 'hightech', 'artdeco', 'minimal'], '#2a2a2a', 'металл', { power: 15, scene: 'accent' }],
  ['light-sconce', 'Бра настенное', 'Свет и Дом', 'Освещение', 'sconce', [150, 200, 250], 3490, ['*'], '#d8c8a8', 'металл', { power: 10, scene: 'accent', wall: true }],
  // Электроустановочные изделия
  ['socket-white', 'Розетка с заземлением, белая', 'Электро Плюс', 'Электроустановочные изделия', 'socket', [80, 40, 80], 390, ['*'], '#ffffff', 'пластик'],
  ['socket-black', 'Розетка с заземлением, чёрный матовый', 'Электро Плюс', 'Электроустановочные изделия', 'socket', [80, 40, 80], 590, ['loft', 'hightech', 'modern', 'minimal'], '#222222', 'пластик'],
  ['switch-white', 'Выключатель одноклавишный, белый', 'Электро Плюс', 'Электроустановочные изделия', 'switch', [80, 40, 80], 340, ['*'], '#ffffff', 'пластик'],
  // Текстиль и декор
  ['rug-linen', 'Ковёр фактурный «Лён» 160×230', 'Текстиль Дом', 'Текстиль и декор', 'rug', [1600, 2300, 10], 11990, ['scandi', 'japandi', 'eco', 'minimal', 'modern'], '#ddd3c1', 'шерсть/лён', { floor: true }],
  ['rug-persian', 'Ковёр с орнаментом 160×230', 'Текстиль Дом', 'Текстиль и декор', 'rug', [1600, 2300, 10], 14990, ['vintage', 'neoclassic', 'artdeco', 'provence', 'mediterranean', 'loft'], '#8e4a3a', 'полипропилен', { floor: true }],
  ['rug-grey', 'Ковёр короткий ворс графит 200×290', 'Текстиль Дом', 'Текстиль и декор', 'rug', [2000, 2900, 10], 16990, ['modern', 'hightech', 'loft', 'minimal'], '#5f6262', 'полиэстер', { floor: true }],
  ['curtain-linen', 'Шторы льняные 2×140×270', 'Текстиль Дом', 'Текстиль и декор', 'curtains', [2800, 100, 2700], 6990, ['scandi', 'japandi', 'eco', 'provence', 'mediterranean', 'minimal'], '#ece4d4', 'лён', { decor: true }],
  ['curtain-velvet', 'Шторы бархатные 2×150×280', 'Текстиль Дом', 'Текстиль и декор', 'curtains', [3000, 100, 2800], 11990, ['neoclassic', 'artdeco', 'vintage', 'modern', 'loft', 'hightech'], '#3e4a4a', 'бархат', { decor: true }],
  ['plant-monstera', 'Растение «Монстера» в кашпо', 'Зелёный Дом', 'Текстиль и декор', 'plant', [600, 600, 1300], 5990, ['*'], '#5f7a52', 'живое растение', { decor: true }],
  ['plant-olive', 'Оливковое дерево в кашпо', 'Зелёный Дом', 'Текстиль и декор', 'plant', [500, 500, 1500], 8990, ['mediterranean', 'provence', 'japandi', 'eco', 'scandi'], '#8a9a6a', 'живое растение', { decor: true }],
  ['decor-vase', 'Набор ваз керамических', 'Текстиль Дом', 'Текстиль и декор', 'decor', [300, 150, 350], 3490, ['*'], '#d9c6a6', 'керамика', { decor: true, wall: true }],
  // Плитка и керамогранит
  ['tile-stone-60', 'Керамогранит «Тёплый камень» 60×60', 'Керамика РФ', 'Плитка и керамогранит', 'tile-floor', [600, 600, 9], 1890, ['modern', 'minimal', 'scandi', 'japandi', 'eco', 'hightech'], '#cdc4b5', 'керамогранит', { shape: 'rect', pack: 4, unit: 'м²' }],
  ['tile-concrete-60', 'Керамогранит «Бетон» 60×120', 'Керамика РФ', 'Плитка и керамогранит', 'tile-floor', [1200, 600, 9], 2390, ['loft', 'modern', 'minimal', 'hightech'], '#9b9893', 'керамогранит', { shape: 'rect', pack: 2, unit: 'м²' }],
  ['tile-marble-60', 'Керамогранит «Каррара» полир. 60×60', 'Керамика РФ', 'Плитка и керамогранит', 'tile-floor', [600, 600, 9], 2690, ['neoclassic', 'artdeco', 'modern', 'mediterranean', 'provence', 'vintage'], '#efece6', 'керамогранит', { shape: 'rect', pack: 4, unit: 'м²' }],
  ['tile-wood-20', 'Керамогранит «Дуб» 20×120 (ёлочка/палуба)', 'Керамика РФ', 'Плитка и керамогранит', 'tile-floor', [1200, 200, 9], 1990, ['scandi', 'eco', 'japandi', 'vintage', 'provence', 'loft'], '#b38c62', 'керамогранит', { shape: 'plank', pack: 6, unit: 'м²' }],
  ['tile-hex-20', 'Керамогранит шестигранник 20 см', 'Мозаика+', 'Плитка и керамогранит', 'tile-floor', [200, 230, 9], 2490, ['mediterranean', 'artdeco', 'scandi', 'modern', 'provence'], '#e1dccf', 'керамогранит', { shape: 'hex', pack: 25, unit: 'м²' }],
  ['tile-wall-white', 'Плитка настенная «Белый кабанчик» 10×30', 'Керамика РФ', 'Плитка и керамогранит', 'tile-wall', [300, 100, 7], 1390, ['scandi', 'loft', 'minimal', 'modern', 'provence', 'vintage', 'mediterranean', 'eco', 'japandi'], '#f4f3ef', 'керамика', { shape: 'rect', pack: 50, unit: 'м²' }],
  ['tile-wall-30x60', 'Плитка настенная матовая 30×60', 'Керамика РФ', 'Плитка и керамогранит', 'tile-wall', [600, 300, 8], 1590, ['modern', 'minimal', 'hightech', 'japandi', 'scandi', 'eco'], '#d9d6cf', 'керамика', { shape: 'rect', pack: 8, unit: 'м²' }],
  ['tile-wall-zellige', 'Плитка «Зеллиж» синяя 13×13', 'Мозаика+', 'Плитка и керамогранит', 'tile-wall', [130, 130, 9], 3290, ['mediterranean', 'artdeco', 'provence', 'eco'], '#2f6f8f', 'керамика', { shape: 'rect', pack: 44, unit: 'м²' }],
  ['tile-decor-insert', 'Декор-вставка «Орнамент» 20×20', 'Мозаика+', 'Плитка и керамогранит', 'tile-decor', [200, 200, 9], 590, ['*'], '#b56b45', 'керамика', { shape: 'rect', pack: 1, unit: 'шт' }],
  // Напольные покрытия
  ['floor-laminate-oak', 'Ламинат 33 класс «Дуб натуральный»', 'Пол Мастер', 'Напольные покрытия', 'floor-covering', [1380, 193, 8], 890, ['scandi', 'eco', 'japandi', 'minimal', 'modern', 'provence', 'mediterranean'], '#c9a87c', 'ламинат', { packM2: 2.13, unit: 'м²' }],
  ['floor-laminate-grey', 'Ламинат 33 класс «Дуб серый»', 'Пол Мастер', 'Напольные покрытия', 'floor-covering', [1380, 193, 8], 860, ['modern', 'hightech', 'loft', 'minimal'], '#9a948b', 'ламинат', { packM2: 2.13, unit: 'м²' }],
  ['floor-parquet-walnut', 'Паркетная доска «Орех»', 'Пол Мастер', 'Напольные покрытия', 'floor-covering', [2200, 190, 14], 2890, ['vintage', 'neoclassic', 'artdeco', 'loft'], '#6f4a2e', 'массив/шпон', { packM2: 2.5, unit: 'м²' }],
  // Обои и краски
  ['paint-sand', 'Краска интерьерная «Тихий песок» 9 л', 'Краски РФ', 'Обои и краски', 'paint', [0, 0, 0], 3490, ['scandi', 'japandi', 'eco', 'minimal', 'provence', 'mediterranean', 'neoclassic'], '#e6dccb', 'акрил', { coverage: 63 }],
  ['paint-white', 'Краска интерьерная белая матовая 9 л', 'Краски РФ', 'Обои и краски', 'paint', [0, 0, 0], 2990, ['*'], '#f7f6f2', 'акрил', { coverage: 63 }],
  ['paint-graphite', 'Краска интерьерная «Графит» 9 л', 'Краски РФ', 'Обои и краски', 'paint', [0, 0, 0], 3790, ['loft', 'modern', 'hightech', 'artdeco'], '#4b4f52', 'акрил', { coverage: 63 }],
  ['paint-sage', 'Краска интерьерная «Шалфей» 9 л', 'Краски РФ', 'Обои и краски', 'paint', [0, 0, 0], 3590, ['eco', 'provence', 'scandi', 'vintage', 'japandi'], '#a9b59b', 'акрил', { coverage: 63 }],
  ['wallpaper-flizelin', 'Обои флизелиновые под покраску 1,06×10 м', 'Обои Дом', 'Обои и краски', 'wallpaper', [1060, 0, 10000], 1890, ['*'], '#f1ede4', 'флизелин', { coverage: 10.6 }],
  ['wallpaper-pattern', 'Обои с орнаментом «Ампир» 1,06×10 м', 'Обои Дом', 'Обои и краски', 'wallpaper', [1060, 0, 10000], 3290, ['neoclassic', 'artdeco', 'provence', 'vintage'], '#d9c9a7', 'флизелин', { coverage: 10.6 }],
  // Двери
  ['door-white-80', 'Дверь межкомнатная белая 80 см с коробкой', 'Двери РФ', 'Двери и окна', 'door', [800, 40, 2000], 12990, ['*'], '#f4f4f1', 'эмаль'],
  ['door-oak-80', 'Дверь межкомнатная шпон дуба 80 см', 'Двери РФ', 'Двери и окна', 'door', [800, 40, 2000], 18990, ['scandi', 'eco', 'japandi', 'loft', 'vintage', 'provence'], '#c9a87c', 'шпон'],
];

export const SEED_CATALOG = RAW.map(([id, name, brand, category, kind, [w, d, h], price, styles, color, material, extra = {}]) => ({
  id, name, brand, sku: 'DP-' + id.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10),
  category, kind, dims: { w, d, h }, price, styles, color, material,
  model: 'generated', demo: true, ...extra,
}));

// Детерминированный «шум» цены по магазину, чтобы демо-офферы отличались, но не менялись между загрузками.
function hash(str) { let x = 0; for (const c of str) x = (x * 31 + c.charCodeAt(0)) >>> 0; return x; }

export function offersFor(product, today = new Date()) {
  if (product.offers) return product.offers;
  const q = encodeURIComponent(product.name);
  return STORES.map(store => {
    const h = hash(product.id + store.id);
    if (store.id === 'ip' && h % 3 === 0) return null;
    if (store.id === 'sb' && h % 5 === 0) return null;
    const k = store.id === 'dm' ? 1 : store.id === 'sb' ? 0.93 + (h % 13) / 100 : 0.97 + (h % 16) / 100;
    const updated = new Date(today.getTime() - store.feedLagDays * 86400000).toISOString().slice(0, 10);
    return {
      store: store.id, storeName: store.name, demo: true, price: Math.round(product.price * k / 10) * 10,
      updated, url: `https://market.yandex.ru/search?text=${q}`, cities: store.cities, deliveryDays: store.deliveryDays, inStock: store.id === 'dm' || h % 11 !== 0,
    };
  }).filter(Boolean);
}
