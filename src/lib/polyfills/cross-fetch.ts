const fetchPonyfill: typeof fetch = (...args) => fetch(...args);

export const fetch = fetchPonyfill;
export const Headers = globalThis.Headers;
export const Request = globalThis.Request;
export const Response = globalThis.Response;

export default fetchPonyfill;