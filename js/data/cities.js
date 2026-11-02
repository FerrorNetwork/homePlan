// Города и регионы (FR-45, FR-46). work — коэффициент расценок работ к базе справочника,
// material — коэффициент региональной цены материалов, если магазин не даёт региональную цену.
export const CITIES = [
  { name: 'Москва', region: 'Москва', tz: 'Europe/Moscow', work: 1.42, material: 1.06 },
  { name: 'Санкт-Петербург', region: 'Санкт-Петербург', tz: 'Europe/Moscow', work: 1.28, material: 1.04 },
  { name: 'Самара', region: 'Самарская область', tz: 'Europe/Samara', work: 1.0, material: 1.0 },
  { name: 'Казань', region: 'Республика Татарстан', tz: 'Europe/Moscow', work: 1.06, material: 1.0 },
  { name: 'Нижний Новгород', region: 'Нижегородская область', tz: 'Europe/Moscow', work: 1.03, material: 1.0 },
  { name: 'Екатеринбург', region: 'Свердловская область', tz: 'Asia/Yekaterinburg', work: 1.1, material: 1.02 },
  { name: 'Челябинск', region: 'Челябинская область', tz: 'Asia/Yekaterinburg', work: 0.96, material: 1.01 },
  { name: 'Пермь', region: 'Пермский край', tz: 'Asia/Yekaterinburg', work: 0.97, material: 1.01 },
  { name: 'Уфа', region: 'Республика Башкортостан', tz: 'Asia/Yekaterinburg', work: 0.98, material: 1.0 },
  { name: 'Новосибирск', region: 'Новосибирская область', tz: 'Asia/Novosibirsk', work: 1.04, material: 1.04 },
  { name: 'Омск', region: 'Омская область', tz: 'Asia/Omsk', work: 0.94, material: 1.04 },
  { name: 'Красноярск', region: 'Красноярский край', tz: 'Asia/Krasnoyarsk', work: 1.08, material: 1.07 },
  { name: 'Краснодар', region: 'Краснодарский край', tz: 'Europe/Moscow', work: 1.08, material: 1.01 },
  { name: 'Ростов-на-Дону', region: 'Ростовская область', tz: 'Europe/Moscow', work: 1.02, material: 1.0 },
  { name: 'Воронеж', region: 'Воронежская область', tz: 'Europe/Moscow', work: 0.96, material: 0.99 },
  { name: 'Волгоград', region: 'Волгоградская область', tz: 'Europe/Volgograd', work: 0.93, material: 1.0 },
  { name: 'Саратов', region: 'Саратовская область', tz: 'Europe/Saratov', work: 0.92, material: 1.0 },
  { name: 'Тюмень', region: 'Тюменская область', tz: 'Asia/Yekaterinburg', work: 1.07, material: 1.03 },
  { name: 'Владивосток', region: 'Приморский край', tz: 'Asia/Vladivostok', work: 1.18, material: 1.12 },
  { name: 'Минск', region: 'Беларусь', tz: 'Europe/Minsk', work: 0.82, material: 1.05 },
  { name: 'Алматы', region: 'Казахстан', tz: 'Asia/Almaty', work: 0.85, material: 1.08 },
];

export const cityByName = name => CITIES.find(c => c.name === name) || CITIES[2];

// Приблизительное автоопределение по часовому поясу браузера; пользователь может изменить город.
export function detectCity() {
  let tz = '';
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch {}
  return CITIES.find(c => c.tz === tz) || null;
}
