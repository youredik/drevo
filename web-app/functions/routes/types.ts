import type { DataRepository } from "../shared/data-repository.js";

export interface YcEvent {
  httpMethod: string;
  url: string;
  headers: Record<string, string>;
  queryStringParameters: Record<string, string>;
  body: string;
  isBase64Encoded: boolean;
}

export interface YcResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  isBase64Encoded: boolean;
}

export interface RouteContext {
  method: string;
  apiPath: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  event: YcEvent;
  repo: DataRepository;
  useYdb: boolean;
  cors: Record<string, string>;
}

export type RouteHandler = (ctx: RouteContext) => Promise<YcResponse | null>;
