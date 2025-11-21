import { useEffect, useState } from "react";

/**
 * Hook léger pour suivre le devicePixelRatio sans recréer la logique dans chaque composant.
 * Utilise un listener resize (suffisant car les changements de DPR sont souvent associés à des resizes / zoom OS).
 * Aucun throttle ici: fréquence de changement très faible.
 */
export function useDevicePixelRatio(): number {
	const [dpr, setDpr] = useState<number>(
		typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1
	);

	useEffect(() => {
		if (typeof window === "undefined") return;
		const handler = () => {
			const next = window.devicePixelRatio || 1;
			if (next !== dpr) setDpr(next);
		};
		window.addEventListener("resize", handler);
		return () => window.removeEventListener("resize", handler);
	}, [dpr]);

	return dpr;
}
