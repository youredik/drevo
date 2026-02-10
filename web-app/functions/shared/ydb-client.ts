import ydb from "ydb-sdk";
import {
  MetadataAuthService,
  IamAuthService,
  TokenAuthService,
  getSACredentialsFromJson,
  type IAuthService,
} from "ydb-sdk";
import { readFileSync } from "fs";

const { Driver } = ydb;

let driver: InstanceType<typeof Driver> | null = null;

export function getYdbEndpoint(): string {
  return process.env.YDB_ENDPOINT || "";
}

export function getYdbDatabase(): string {
  return process.env.YDB_DATABASE || "";
}

export function isYdbConfigured(): boolean {
  return !!(process.env.YDB_ENDPOINT && process.env.YDB_DATABASE);
}

export async function getYdbDriver(): Promise<InstanceType<typeof Driver>> {
  if (driver) return driver;

  const endpoint = getYdbEndpoint();
  const database = getYdbDatabase();

  if (!endpoint || !database) {
    throw new Error("YDB_ENDPOINT and YDB_DATABASE must be set");
  }

  let authService: IAuthService;

  // In Cloud Functions: use metadata service (automatic SA auth)
  // Locally with SA key file: use IAM auth with SA credentials
  // Locally with yc/ydb token: use token auth
  if (process.env.YDB_SA_KEY_FILE) {
    const saKeyJson = readFileSync(process.env.YDB_SA_KEY_FILE, "utf-8");
    const saCredentials = getSACredentialsFromJson(saKeyJson);
    authService = new IamAuthService(saCredentials);
  } else if (process.env.YDB_TOKEN) {
    authService = new TokenAuthService(process.env.YDB_TOKEN);
  } else if (process.env.YC_SERVICE_ACCOUNT_KEY_FILE) {
    const saKeyJson = readFileSync(process.env.YC_SERVICE_ACCOUNT_KEY_FILE, "utf-8");
    const saCredentials = getSACredentialsFromJson(saKeyJson);
    authService = new IamAuthService(saCredentials);
  } else {
    // Default: metadata service (works in Cloud Functions)
    authService = new MetadataAuthService();
  }

  driver = new Driver({ endpoint, database, authService });
  const ready = await driver.ready(10000);
  if (!ready) {
    driver = null;
    throw new Error("YDB driver failed to connect within 10 seconds");
  }

  console.log(`YDB connected: ${endpoint} / ${database}`);
  return driver;
}

export async function closeYdbDriver(): Promise<void> {
  if (driver) {
    await driver.destroy();
    driver = null;
  }
}
