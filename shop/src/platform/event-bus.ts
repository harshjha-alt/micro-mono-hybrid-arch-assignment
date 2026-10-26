/**
 * An in-process event bus. THIS IS A STUB - you finish it.
 *
 * Requirements:
 *   - a handler that throws must not stop the other handlers
 *   - publish returns the number of handlers it reached
 *   - subscribing the same function twice registers it twice (do not dedupe)
 *   - publishing a name nobody listens to is fine and returns 0
 */

/** The events this system publishes. Add to it as you need to. */
export interface DomainEvents {
  "order.placed": { orderId: string; email: string; amountPaise: number };
}

export type EventName = keyof DomainEvents;
export type Handler<K extends EventName> = (payload: DomainEvents[K]) => void;
export type Unsubscribe = () => void;

export interface EventBus {
  publish<K extends EventName>(name: K, payload: DomainEvents[K]): number;
  subscribe<K extends EventName>(name: K, fn: Handler<K>): Unsubscribe;
}

type Subscription = {
  handler: Handler<EventName>;
};

export function createEventBus(): EventBus {
  const subscriptions = new Map<EventName, Subscription[]>();

  return {
    publish(name, payload) {
      const listeners = [...(subscriptions.get(name) ?? [])];

      for (const subscription of listeners) {
        try {
          subscription.handler(payload);
        } catch {
          // A failing listener must not prevent the remaining listeners.
        }
      }

      return listeners.length;
    },

    subscribe(name, fn) {
      const subscription: Subscription = {
        handler: fn as Handler<EventName>,
      };
      const listeners = subscriptions.get(name) ?? [];
      listeners.push(subscription);
      subscriptions.set(name, listeners);

      return () => {
        const currentListeners = subscriptions.get(name);
        if (!currentListeners) return;

        const index = currentListeners.indexOf(subscription);
        if (index !== -1) currentListeners.splice(index, 1);
      };
    },
  };
}

export const eventBus = createEventBus();
