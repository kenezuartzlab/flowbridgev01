const browserFetch = globalThis.fetch.bind(globalThis) as typeof globalThis.fetch;

export { browserFetch as fetch };
export const Headers = globalThis.Headers;
export const Request = globalThis.Request;
export const Response = globalThis.Response;

export default browserFetch;