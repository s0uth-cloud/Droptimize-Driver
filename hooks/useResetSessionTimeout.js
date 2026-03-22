import { useFocusEffect } from "expo-router";
import { useCallback } from "react";
import { useSessionTimeout } from "../provider/SessionTimeoutProvider";

/**
 * Hook to automatically reset session timeout when screen comes into focus
 *
 * Usage:
 * ```jsx
 * import { useResetSessionTimeout } from "../hooks/useResetSessionTimeout";
 *
 * export default function MyScreen() {
 *   useResetSessionTimeout(); // Resets timeout when screen is focused
 *   // ...
 * }
 * ```
 *
 * This ensures that:
 * - When a user navigates to a screen, the timeout is reset
 * - Activity is tracked across screen changes
 * - The 30-minute inactivity timer starts from the last interaction
 */
export function useResetSessionTimeout() {
  const { resetSessionTimeout } = useSessionTimeout();

  // Reset timeout whenever the screen comes into focus
  useFocusEffect(
    useCallback(() => {
      resetSessionTimeout();
    }, [resetSessionTimeout]),
  );
}
