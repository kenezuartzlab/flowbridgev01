type EventName = string | symbol;
type Listener = (...args: any[]) => void;

export class EventEmitter {
  static EventEmitter: typeof EventEmitter;
  static defaultMaxListeners = 10;

  private listenersByEvent = new Map<EventName, Listener[]>();

  addListener(eventName: EventName, listener: Listener) {
    return this.on(eventName, listener);
  }

  on(eventName: EventName, listener: Listener) {
    const listeners = this.listenersByEvent.get(eventName) ?? [];
    listeners.push(listener);
    this.listenersByEvent.set(eventName, listeners);
    return this;
  }

  once(eventName: EventName, listener: Listener) {
    const wrapped: Listener = (...args) => {
      this.removeListener(eventName, wrapped);
      listener(...args);
    };
    return this.on(eventName, wrapped);
  }

  removeListener(eventName: EventName, listener: Listener) {
    const listeners = this.listenersByEvent.get(eventName);
    if (!listeners) return this;
    const next = listeners.filter((item) => item !== listener);
    if (next.length) this.listenersByEvent.set(eventName, next);
    else this.listenersByEvent.delete(eventName);
    return this;
  }

  off(eventName: EventName, listener: Listener) {
    return this.removeListener(eventName, listener);
  }

  removeAllListeners(eventName?: EventName) {
    if (typeof eventName === 'undefined') this.listenersByEvent.clear();
    else this.listenersByEvent.delete(eventName);
    return this;
  }

  emit(eventName: EventName, ...args: any[]) {
    const listeners = this.listenersByEvent.get(eventName);
    if (!listeners?.length) return false;
    for (const listener of [...listeners]) listener(...args);
    return true;
  }

  listenerCount(eventName: EventName) {
    return this.listenersByEvent.get(eventName)?.length ?? 0;
  }

  listeners(eventName: EventName) {
    return [...(this.listenersByEvent.get(eventName) ?? [])];
  }

  setMaxListeners() {
    return this;
  }

  getMaxListeners() {
    return EventEmitter.defaultMaxListeners;
  }
}

EventEmitter.EventEmitter = EventEmitter;

export function once(emitter: EventEmitter, eventName: EventName) {
  return new Promise<any[]>((resolve) => {
    emitter.once(eventName, (...args) => resolve(args));
  });
}

(EventEmitter as any).once = once;

export default EventEmitter;