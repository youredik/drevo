import { z } from "zod";

export const loginSchema = z.object({
  login: z.string().min(1, "Укажите login"),
  password: z.string().min(1, "Укажите password"),
});

export const personFormSchema = z.object({
  sex: z.union([z.literal(0), z.literal(1)]).optional().default(1),
  firstName: z.string().optional().default(""),
  lastName: z.string().optional().default(""),
  fatherId: z.number().int().optional(),
  motherId: z.number().int().optional(),
  birthPlace: z.string().optional(),
  birthDay: z.string().optional(),
  deathPlace: z.string().optional(),
  deathDay: z.string().optional(),
  address: z.string().optional(),
  orderByDad: z.number().int().optional(),
  orderByMom: z.number().int().optional(),
  orderBySpouse: z.number().int().optional(),
  marryDay: z.string().optional(),
}).refine(
  (data) => data.firstName || data.lastName,
  { message: "Укажите имя или фамилию" }
);

export const createUserSchema = z.object({
  login: z.string().min(1, "Укажите login"),
  password: z.string().min(6, "Пароль должен быть не менее 6 символов"),
  role: z.enum(["admin", "manager", "viewer"], { message: "Допустимые роли: admin, manager, viewer" }),
});

export const updateUserSchema = z.object({
  login: z.string().min(1).optional(),
  password: z.string().min(6).optional(),
  role: z.enum(["admin", "manager", "viewer"]).optional(),
});

export const bioSchema = z.object({
  type: z.enum(["open", "lock"], { message: "Допустимые типы: open, lock" }),
  text: z.string(),
});

export const favoriteSchema = z.object({
  personId: z.number().int().positive("Укажите personId"),
});

export const spouseSchema = z.object({
  spouseId: z.number().int().positive("Укажите spouseId"),
});

export const childSchema = z.object({
  childId: z.number().int().positive("Укажите childId"),
});

export const parentSchema = z.object({
  fatherId: z.number().int().optional(),
  motherId: z.number().int().optional(),
});

export const photoUploadSchema = z.object({
  data: z.string().min(1, "Укажите data (base64)"),
  filename: z.string().optional(),
});

export function validate<T>(schema: z.ZodSchema<T>, data: unknown): { success: true; data: T } | { success: false; error: string } {
  const result = schema.safeParse(data);
  if (result.success) return { success: true, data: result.data };
  const firstIssue = result.error.issues[0];
  return { success: false, error: firstIssue?.message || "Ошибка валидации" };
}
