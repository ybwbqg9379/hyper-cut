import type { TAction, TArgOfAction } from '@/lib/actions';
import { hasActionHandlers, invokeAction } from '@/lib/actions';

export function invokeActionWithCheck<A extends TAction>(
  action: A,
  args?: TArgOfAction<A>
): void {
  if (!hasActionHandlers(action)) {
    throw new Error(`Action "${action}" is not available`);
  }

  // Type assertion needed due to complex overloaded signature of invokeAction
  (invokeAction as (action: TAction, args?: unknown) => void)(action, args);
}
