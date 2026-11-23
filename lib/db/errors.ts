/** An error whose message is safe to show the user (plain words, no file paths, no SQL). Anything else becomes a generic 500. */
export class HttpError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
  }
}
