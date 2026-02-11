export interface Person {
  id: number;
  sex: 0 | 1; // 0=female, 1=male
  firstName: string;
  lastName: string;
  fatherId: number;
  motherId: number;
  birthPlace: string;
  birthDay: string; // DD.MM.YYYY or YYYY
  deathPlace: string;
  deathDay: string; // DD.MM.YYYY or empty
  address: string;
  spouseIds: number[];
  childrenIds: number[];
  orderByDad: number;
  orderByMom: number;
  orderBySpouse: number;
  marryDay: string; // DD.MM.YYYY or empty
}

export interface PersonCard {
  person: Person;
  father: PersonBrief | null;
  mother: PersonBrief | null;
  spouses: PersonBrief[];
  children: PersonBrief[];
  photos: string[];
  age: string;
  zodiac: string;
  hasBio: boolean;
  hasLockedBio: boolean;
}

export interface PersonBrief {
  id: number;
  firstName: string;
  lastName: string;
  sex: 0 | 1;
  birthDay: string;
  deathDay: string;
  photo: string;
  childCount: number;
  age: string;
}

export interface SearchResult {
  id: number;
  firstName: string;
  lastName: string;
  sex: 0 | 1;
  birthDay: string;
  deathDay: string;
  address: string;
  age: string;
  photo: string;
  matchField: string;
}

export interface EventItem {
  id: number;
  firstName: string;
  lastName: string;
  sex: 0 | 1;
  birthDay: string;
  deathDay: string;
  marryDay: string;
  eventType: "birthday" | "memorial" | "wedding";
  eventDate: string; // DD.MM
  yearsCount: number;
  daysUntil: number;
  photo: string;
}

export interface TreeNode {
  id: number;
  firstName: string;
  lastName: string;
  sex: 0 | 1;
  isAlive: boolean;
  photo: string;
  children: TreeNode[];
}

export interface KinshipResult {
  person1: PersonBrief;
  person2: PersonBrief;
  commonAncestor: PersonBrief | null;
  pathFromPerson1: PersonBrief[];
  pathFromPerson2: PersonBrief[];
  relationship: string;
}

export interface FamilyMember {
  person: PersonBrief;
  relation: string; // "Отец", "Мать", "Брат", "Сестра", etc.
  category: "self" | "parents" | "siblings" | "children" | "grandchildren" | "greatGrandchildren";
}

export interface StatsData {
  totalPersons: number;
  maleCount: number;
  femaleCount: number;
  aliveCount: number;
  deceasedCount: number;
  ageDistribution: Record<string, number>;
  longestLived: PersonBrief[];
}

export interface AppUser {
  id: string;
  login: string;
  passwordHash: string;
  role: "admin" | "manager" | "viewer";
  createdAt: string;
}

export interface AuthResponse {
  token: string;
  user: {
    id: string;
    login: string;
    role: "admin" | "manager" | "viewer";
  };
}

export interface AppConfig {
  appName: string;
  appDescription: string;
  telegramLink: string;
  defaultEventDays: number;
  defaultStartPage: "home" | "tree" | "events";
  aboutText: string;
  infoText: string;
  dataCollectionDate: string;
}

export interface ValidationIssue {
  type: string;
  personId: number;
  message: string;
}

export interface ValidationResult {
  issues: ValidationIssue[];
  counts: Record<string, number>;
}

export interface PersonFormData {
  sex: 0 | 1;
  firstName: string;
  lastName: string;
  fatherId?: number;
  motherId?: number;
  birthPlace?: string;
  birthDay?: string;
  deathPlace?: string;
  deathDay?: string;
  address?: string;
  orderByDad?: number;
  orderByMom?: number;
  orderBySpouse?: number;
  marryDay?: string;
}
