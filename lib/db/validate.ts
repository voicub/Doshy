import { HttpError } from "./errors.ts";

export const isCount = (n: unknown, max: number): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= max;

export const badRequest = (message: string) => new HttpError(400, "bad_request", message);
