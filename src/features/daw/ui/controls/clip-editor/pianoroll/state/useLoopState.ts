// Hook: useLoopState
// Manages local loop state with a ref plus throttled emission to parent.
// Ensures stable object identity and avoids undefined propagation.
import { useState, useRef, useEffect, useCallback } from "react";
import { useThrottle } from "../hooks/useThrottle";

/**
 * useLoopState
 * - Stocke un état local de loop pour le drag.
 * - Synchronise la ref + état quand la prop `initial` change.
 * - Évite setState synchrone dans l'effet précédent.
 */
export function useLoopState(
	initial: { start: number; end: number } | null | undefined,
	onLoopChange: ((loop: { start: number; end: number } | null) => void) | undefined,
	active: boolean,
	throttleMs: number = 80
) {
	const [loopState, setLoopState] = useState<{ start: number; end: number } | null>(initial ?? null);
	const loopStateRef = useRef<{ start: number; end: number } | null>(initial ?? null);

	// Sync ref + state quand la prop change (sans ré-émission)
	useEffect(() => {
		const next = initial ?? null;
		loopStateRef.current = next;
		setLoopState(next);
	}, [initial]);

	const emitLoopChangeThrottled = useThrottle(() => {
		if (!onLoopChange) return;
		onLoopChange(loopStateRef.current ? { ...loopStateRef.current } : null);
	}, throttleMs, active);

	const updateLoop = useCallback(
		(next: { start: number; end: number } | null) => {
			loopStateRef.current = next;
			setLoopState(next);
		},
		[]
	);

	return {
		loopState,
		setLoopState: updateLoop,
		loopStateRef,
		emitLoopChangeThrottled,
	} as const;
}
