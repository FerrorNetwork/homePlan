// Справочник расценок работ (FR-46). Базовые цены — для коэффициента города 1,0 и уровня «Стандарт».
// Это демонстрационный справочник: значения ориентировочные и требуют замены на проверенную региональную базу.
export const RATES_META = {
  version: '2026.4-demo',
  date: '2026-10-01',
  title: 'Демо-справочник расценок ДомПроект',
  accuracyWorks: '±10–15%',
};

export const LEVELS = {
  econ: { name: 'Эконом', k: 0.8 },
  standard: { name: 'Стандарт', k: 1.0 },
  premium: { name: 'Премиум', k: 1.45 },
};

export const SECTIONS = [
  { id: 'demo', name: 'Демонтаж и подготовка' },
  { id: 'rough', name: 'Черновые работы' },
  { id: 'electric', name: 'Электрика' },
  { id: 'plumbing', name: 'Сантехника и отопление' },
  { id: 'finish', name: 'Отделка' },
  { id: 'tile', name: 'Плитка' },
  { id: 'furniture', name: 'Мебель и техника' },
  { id: 'lighting', name: 'Освещение и декор' },
  { id: 'overhead', name: 'Накладные и непредвиденные' },
];

export const RATES = {
  // Демонтаж и подготовка
  demoFloor: { name: 'Демонтаж напольного покрытия', unit: 'м²', price: 220, section: 'demo' },
  demoWalls: { name: 'Снятие старой отделки стен', unit: 'м²', price: 180, section: 'demo' },
  demoPartition: { name: 'Снос перегородок', unit: 'м²', price: 650, section: 'demo' },
  prepProtect: { name: 'Укрытие и защита помещений', unit: 'м²', price: 60, section: 'demo' },
  // Черновые
  partitionBuild: { name: 'Возведение перегородок (пазогребень)', unit: 'м²', price: 1150, section: 'rough' },
  screed: { name: 'Стяжка пола до 50 мм', unit: 'м²', price: 690, section: 'rough' },
  plaster: { name: 'Штукатурка стен по маякам', unit: 'м²', price: 620, section: 'rough' },
  ceilingLevel: { name: 'Выравнивание потолка', unit: 'м²', price: 540, section: 'rough' },
  waterproof: { name: 'Гидроизоляция мокрых зон', unit: 'м²', price: 450, section: 'rough' },
  // Электрика
  elPoint: { name: 'Монтаж электроточки (розетка/выключатель)', unit: 'шт', price: 420, section: 'electric' },
  elDevice: { name: 'Установка розетки/выключателя в готовый подрозетник', unit: 'шт', price: 260, section: 'electric' },
  elLight: { name: 'Монтаж точки освещения', unit: 'шт', price: 480, section: 'electric' },
  elBox: { name: 'Монтаж распределительной коробки', unit: 'шт', price: 380, section: 'electric' },
  elCable: { name: 'Прокладка кабеля', unit: 'пог. м', price: 75, section: 'electric' },
  elChase: { name: 'Штробление под кабель', unit: 'пог. м', price: 260, section: 'electric' },
  elPanel: { name: 'Сборка и монтаж щитка', unit: 'шт', price: 4500, section: 'electric' },
  elBreaker: { name: 'Установка автомата/УЗО в щиток', unit: 'шт', price: 450, section: 'electric' },
  // Сантехника и отопление
  plPoint: { name: 'Вывод точки водоснабжения/канализации', unit: 'шт', price: 1900, section: 'plumbing' },
  plFixture: { name: 'Установка сантехприбора', unit: 'шт', price: 2600, section: 'plumbing' },
  plPipe: { name: 'Прокладка труб водоснабжения', unit: 'пог. м', price: 420, section: 'plumbing' },
  plSewer: { name: 'Прокладка канализации', unit: 'пог. м', price: 480, section: 'plumbing' },
  plCollector: { name: 'Монтаж коллектора', unit: 'шт', price: 5200, section: 'plumbing' },
  htRadiator: { name: 'Установка радиатора', unit: 'шт', price: 3800, section: 'plumbing' },
  htPipe: { name: 'Прокладка труб отопления', unit: 'пог. м', price: 520, section: 'plumbing' },
  htFloor: { name: 'Монтаж тёплого пола', unit: 'м²', price: 900, section: 'plumbing' },
  htBoiler: { name: 'Монтаж котла', unit: 'шт', price: 12000, section: 'plumbing' },
  vent: { name: 'Монтаж вентканала/вытяжки', unit: 'шт', price: 2300, section: 'plumbing' },
  ventDuct: { name: 'Прокладка воздуховода', unit: 'пог. м', price: 650, section: 'plumbing' },
  // Отделка
  paintWalls: { name: 'Шпаклёвка и покраска стен', unit: 'м²', price: 560, section: 'finish' },
  paintOnly: { name: 'Грунтовка и покраска стен по готовому основанию', unit: 'м²', price: 290, section: 'finish' },
  wallpaper: { name: 'Поклейка обоев', unit: 'м²', price: 360, section: 'finish' },
  paintCeiling: { name: 'Шпаклёвка и покраска потолка', unit: 'м²', price: 620, section: 'finish' },
  paintCeilingOnly: { name: 'Покраска потолка по готовому основанию', unit: 'м²', price: 330, section: 'finish' },
  laminate: { name: 'Укладка ламината/паркетной доски', unit: 'м²', price: 450, section: 'finish' },
  baseboard: { name: 'Монтаж плинтуса', unit: 'пог. м', price: 190, section: 'finish' },
  doorInstall: { name: 'Установка межкомнатной двери', unit: 'шт', price: 4200, section: 'finish' },
  // Плитка
  tileFloor: { name: 'Укладка плитки на пол', unit: 'м²', price: 1450, section: 'tile' },
  tileWall: { name: 'Укладка плитки на стены', unit: 'м²', price: 1650, section: 'tile' },
  tileGrout: { name: 'Затирка швов', unit: 'м²', price: 250, section: 'tile' },
  // Мебель
  assembly: { name: 'Сборка и установка мебели', unit: 'шт', price: 1200, section: 'furniture' },
  kitchenInstall: { name: 'Монтаж кухонного гарнитура', unit: 'пог. м', price: 3200, section: 'furniture' },
  // Освещение
  lightInstall: { name: 'Подвес и подключение светильника', unit: 'шт', price: 850, section: 'lighting' },
  curtainInstall: { name: 'Монтаж карниза', unit: 'шт', price: 900, section: 'lighting' },
  // Накладные
  delivery: { name: 'Доставка (за заказ в магазине)', unit: 'заказ', price: 1500, section: 'overhead' },
  lifting: { name: 'Подъём на этаж', unit: 'этаж×заказ', price: 350, section: 'overhead' },
  garbage: { name: 'Вывоз строительного мусора', unit: 'м³', price: 2300, section: 'overhead' },
};

// Материалы, нужные по объёмам модели, но не выбираемые из каталога ИИ (цены из того же демо-справочника).
export const BULK = {
  cableSocket: { name: 'Кабель ВВГнг-LS 3×2,5', unit: 'м', price: 98 },
  cableLight: { name: 'Кабель ВВГнг-LS 3×1,5', unit: 'м', price: 68 },
  breaker: { name: 'Автоматический выключатель', unit: 'шт', price: 520 },
  rcd: { name: 'УЗО / дифавтомат 30 мА', unit: 'шт', price: 2400 },
  panelBox: { name: 'Корпус щитка на 24 модуля', unit: 'шт', price: 3200 },
  junction: { name: 'Распаечная коробка', unit: 'шт', price: 120 },
  pipeWater: { name: 'Труба PPR/PEX 20 мм', unit: 'м', price: 160 },
  pipeSewer: { name: 'Труба канализационная 50/110 мм', unit: 'м', price: 240 },
  pipeHeating: { name: 'Труба отопления 20 мм', unit: 'м', price: 190 },
  collector: { name: 'Коллектор с кранами', unit: 'шт', price: 6400 },
  warmFloorMat: { name: 'Водяной тёплый пол (контур)', unit: 'м²', price: 950 },
  duct: { name: 'Воздуховод 100–125 мм', unit: 'м', price: 340 },
  screedMix: { name: 'Смесь для стяжки, 25 кг', unit: 'меш.', price: 330, perM2: 2.0 },
  plasterMix: { name: 'Гипсовая штукатурка, 30 кг', unit: 'меш.', price: 520, perM2: 0.4 },
  putty: { name: 'Шпаклёвка финишная, 20 кг', unit: 'меш.', price: 790, perM2: 0.06 },
  primer: { name: 'Грунтовка глубокого проникновения, 10 л', unit: 'кан.', price: 690, perM2: 0.012 },
  waterproofMix: { name: 'Гидроизоляция обмазочная, 4 кг', unit: 'ведро', price: 1450, perM2: 0.25 },
  partitionBlock: { name: 'Пазогребневая плита', unit: 'м²', price: 820 },
  tileAdhesive: { name: 'Плиточный клей, 25 кг', unit: 'меш.', price: 560 },
  grout: { name: 'Затирка цементная, 2 кг', unit: 'уп.', price: 420 },
  baseboard: { name: 'Плинтус МДФ 2,4 м', unit: 'шт', price: 540 },
  bags: { name: 'Мешки для мусора', unit: 'уп.', price: 290 },
};
