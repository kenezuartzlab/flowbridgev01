type EventName = string | symbol;
type Listener = (...args: any[]) => void;

type EventEmitterInstance = {
  listenersByEvent: Map<EventName, Listener[]>;
  addListener: (eventName: EventName, listener: Listener) => EventEmitterInstance;
  on: (eventName: EventName, listener: Listener) => EventEmitterInstance;
  prependListener: (eventName: EventName, listener: Listener) => EventEmitterInstance;
  once: (eventName: EventName, listener: Listener) => EventEmitterInstance;
  prependOnceListener: (eventName: EventName, listener: Listener) => EventEmitterInstance;
  removeListener: (eventName: EventName, listener: Listener) => EventEmitterInstance;
  off: (eventName: EventName, listener: Listener) => EventEmitterInstance;
  removeAllListeners: (eventName?: EventName) => EventEmitterInstance;
  emit: (eventName: EventName, ...args: any[]) => boolean;
  listenerCount: (eventName: EventName) => number;
  listeners: (eventName: EventName) => Listener[];
  rawListeners: (eventName: EventName) => Listener[];
  eventNames: () => EventName[];
  setMaxListeners: () => EventEmitterInstance;
  getMaxListeners: () => number;
};

export type EventEmitter = EventEmitterInstance;

export interface EventEmitterConstructor {
  new (): EventEmitterInstance;
  (): EventEmitterInstance;
  EventEmitter: EventEmitterConstructor;
  defaultMaxListeners: number;
  once: typeof once;
}

export const EventEmitter = function EventEmitter(this: EventEmitterInstance | undefined) {
  const target = this instanceof EventEmitter ? this : Object.create(EventEmitter.prototype);
  target.listenersByEvent = new Map<EventName, Listener[]>();
  return target;
} as EventEmitterConstructor;

EventEmitter.prototype.addListener = function addListener(eventName: EventName, listener: Listener) {
  return this.on(eventName, listener);
};

EventEmitter.prototype.on = function on(eventName: EventName, listener: Listener) {
  const listeners = this.listenersByEvent.get(eventName) ?? [];
  listeners.push(listener);
  this.listenersByEvent.set(eventName, listeners);
  return this;
};

EventEmitter.prototype.prependListener = function prependListener(eventName: EventName, listener: Listener) {
  const listeners = this.listenersByEvent.get(eventName) ?? [];
  listeners.unshift(listener);
  this.listenersByEvent.set(eventName, listeners);
  return this;
};

EventEmitter.prototype.once = function onceListener(eventName: EventName, listener: Listener) {
  const wrapped: Listener = (...args) => {
    this.removeListener(eventName, wrapped);
    listener(...args);
  };
  return this.on(eventName, wrapped);
};

EventEmitter.prototype.prependOnceListener = function prependOnceListener(eventName: EventName, listener: Listener) {
  const wrapped: Listener = (...args) => {
    this.removeListener(eventName, wrapped);
    listener(...args);
  };
  return this.prependListener(eventName, wrapped);
};

EventEmitter.prototype.removeListener = function removeListener(eventName: EventName, listener: Listener) {
  const listeners = this.listenersByEvent.get(eventName);
  if (!listeners) return this;
  const next = listeners.filter((item: Listener) => item !== listener);
  if (next.length) this.listenersByEvent.set(eventName, next);
  else this.listenersByEvent.delete(eventName);
  return this;
};

EventEmitter.prototype.off = function off(eventName: EventName, listener: Listener) {
  return this.removeListener(eventName, listener);
};

EventEmitter.prototype.removeAllListeners = function removeAllListeners(eventName?: EventName) {
  if (typeof eventName === 'undefined') this.listenersByEvent.clear();
  else this.listenersByEvent.delete(eventName);
  return this;
};

EventEmitter.prototype.emit = function emit(eventName: EventName, ...args: any[]) {
  const listeners = this.listenersByEvent.get(eventName);
  if (!listeners?.length) return false;
  for (const listener of [...listeners]) listener(...args);
  return true;
};

EventEmitter.prototype.listenerCount = function listenerCount(eventName: EventName) {
  return this.listenersByEvent.get(eventName)?.length ?? 0;
};

EventEmitter.prototype.listeners = function listeners(eventName: EventName) {
  return [...(this.listenersByEvent.get(eventName) ?? [])];
};

EventEmitter.prototype.rawListeners = function rawListeners(eventName: EventName) {
  return this.listeners(eventName);
};

EventEmitter.prototype.eventNames = function eventNames() {
  return [...this.listenersByEvent.keys()];
};

EventEmitter.prototype.setMaxListeners = function setMaxListeners() {
  return this;
};

EventEmitter.prototype.getMaxListeners = function getMaxListeners() {
  return EventEmitter.defaultMaxListeners;
};

EventEmitter.defaultMaxListeners = 10;
EventEmitter.EventEmitter = EventEmitter;

export function once(emitter: EventEmitterInstance, eventName: EventName) {
  return new Promise<any[]>((resolve) => {
    emitter.once(eventName, (...args) => resolve(args));
  });
}

EventEmitter.once = once;

export default EventEmitter;