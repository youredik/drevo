import type { Person } from "./types.js";

export function parseDate(dateStr: string): Date | null {
  if (!dateStr || dateStr.trim() === "") return null;
  const trimmed = dateStr.trim();

  // Full date: DD.MM.YYYY
  const fullMatch = trimmed.match(/^(\d{1,2})\.(\d{2})\.(\d{4})$/);
  if (fullMatch) {
    const [, day, month, year] = fullMatch;
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  }

  // Year only: YYYY
  const yearMatch = trimmed.match(/^(\d{4})$/);
  if (yearMatch) {
    return new Date(parseInt(yearMatch[1]), 0, 1);
  }

  return null;
}

export function isFullDate(dateStr: string): boolean {
  return /^\d{1,2}\.\d{2}\.\d{4}$/.test(dateStr.trim());
}

export function calculateAge(birthDay: string, deathDay: string): string {
  const birth = parseDate(birthDay);
  if (!birth) return "";

  const end = deathDay ? parseDate(deathDay) : new Date();
  if (!end) return "";

  let years = end.getFullYear() - birth.getFullYear();
  const monthDiff = end.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && end.getDate() < birth.getDate())) {
    years--;
  }

  if (years < 0) return "";
  return `${years} ${yearWord(years)}`;
}

export function calculateAgeNumber(birthDay: string, deathDay: string): number {
  const birth = parseDate(birthDay);
  if (!birth) return -1;

  const end = deathDay ? parseDate(deathDay) : new Date();
  if (!end) return -1;

  let years = end.getFullYear() - birth.getFullYear();
  const monthDiff = end.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && end.getDate() < birth.getDate())) {
    years--;
  }

  return years;
}

function yearWord(n: number): string {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs >= 11 && abs <= 19) return "лет";
  if (last === 1) return "год";
  if (last >= 2 && last <= 4) return "года";
  return "лет";
}

const ZODIAC_SIGNS = [
  { name: "Козерог", icon: "♑", from: [12, 22], to: [1, 19] },
  { name: "Водолей", icon: "♒", from: [1, 20], to: [2, 18] },
  { name: "Рыбы", icon: "♓", from: [2, 19], to: [3, 20] },
  { name: "Овен", icon: "♈", from: [3, 21], to: [4, 19] },
  { name: "Телец", icon: "♉", from: [4, 20], to: [5, 20] },
  { name: "Близнецы", icon: "♊", from: [5, 21], to: [6, 20] },
  { name: "Рак", icon: "♋", from: [6, 21], to: [7, 22] },
  { name: "Лев", icon: "♌", from: [7, 23], to: [8, 22] },
  { name: "Дева", icon: "♍", from: [8, 23], to: [9, 22] },
  { name: "Весы", icon: "♎", from: [9, 23], to: [10, 22] },
  { name: "Скорпион", icon: "♏", from: [10, 23], to: [11, 21] },
  { name: "Стрелец", icon: "♐", from: [11, 22], to: [12, 21] },
] as const;

export function getZodiac(birthDay: string): { name: string; icon: string } | null {
  if (!isFullDate(birthDay)) return null;
  const date = parseDate(birthDay);
  if (!date) return null;

  const month = date.getMonth() + 1;
  const day = date.getDate();

  for (const sign of ZODIAC_SIGNS) {
    const [fromM, fromD] = sign.from;
    const [toM, toD] = sign.to;

    if (fromM === 12 && toM === 1) {
      if ((month === 12 && day >= fromD) || (month === 1 && day <= toD)) {
        return { name: sign.name, icon: sign.icon };
      }
    } else {
      if ((month === fromM && day >= fromD) || (month === toM && day <= toD)) {
        return { name: sign.name, icon: sign.icon };
      }
    }
  }
  return null;
}

export function formatDateRu(dateStr: string): string {
  if (!dateStr || dateStr.trim() === "") return "";
  const trimmed = dateStr.trim();

  if (/^\d{4}$/.test(trimmed)) return `${trimmed} г.`;

  const match = trimmed.match(/^(\d{1,2})\.(\d{2})\.(\d{4})$/);
  if (!match) return trimmed;

  const months = [
    "января", "февраля", "марта", "апреля", "мая", "июня",
    "июля", "августа", "сентября", "октября", "ноября", "декабря",
  ];

  const [, day, month, year] = match;
  const monthIdx = parseInt(month) - 1;
  return `${parseInt(day)} ${months[monthIdx]} ${year} г.`;
}

export function getDayMonth(dateStr: string): string | null {
  if (!isFullDate(dateStr)) return null;
  const match = dateStr.trim().match(/^(\d{1,2})\.(\d{2})\.\d{4}$/);
  if (!match) return null;
  return `${match[1].padStart(2, "0")}.${match[2]}`;
}

export function isPersonAlive(person: Person): boolean {
  return !person.deathDay || person.deathDay.trim() === "";
}

export function getPersonFullName(person: Person): string {
  return `${person.lastName} ${person.firstName}`.trim();
}

const MONTH_NAMES: Record<string, string> = {
  "январь": ".01.", "января": ".01.", "янв": ".01.",
  "февраль": ".02.", "февраля": ".02.", "фев": ".02.",
  "март": ".03.", "марта": ".03.", "мар": ".03.",
  "апрель": ".04.", "апреля": ".04.", "апр": ".04.",
  "май": ".05.", "мая": ".05.",
  "июнь": ".06.", "июня": ".06.", "июн": ".06.",
  "июль": ".07.", "июля": ".07.", "июл": ".07.",
  "август": ".08.", "августа": ".08.", "авг": ".08.",
  "сентябрь": ".09.", "сентября": ".09.", "сен": ".09.",
  "октябрь": ".10.", "октября": ".10.", "окт": ".10.",
  "ноябрь": ".11.", "ноября": ".11.", "ноя": ".11.",
  "декабрь": ".12.", "декабря": ".12.", "дек": ".12.",
};

export function normalizeSearchQuery(query: string): string {
  let q = query.toLowerCase().trim();
  for (const [name, num] of Object.entries(MONTH_NAMES)) {
    q = q.replace(name, num);
  }
  return q;
}
