import { useCallback, useState } from "react";

export function useControllableState<T>({
	value,
	defaultValue,
	onChange,
}: {
	value?: T;
	defaultValue: T;
	onChange?: (value: T) => void;
}): [T, (next: T) => void, boolean] {
	const [internal, setInternal] = useState<T>(defaultValue);
	const isControlled = value !== undefined;
	const current = isControlled ? (value as T) : internal;

	const setValue = useCallback(
		(next: T) => {
			if (isControlled) {
				onChange?.(next);
			} else {
				setInternal(next);
			}
		},
		[isControlled, onChange]
	);

	return [current, setValue, isControlled];
}
