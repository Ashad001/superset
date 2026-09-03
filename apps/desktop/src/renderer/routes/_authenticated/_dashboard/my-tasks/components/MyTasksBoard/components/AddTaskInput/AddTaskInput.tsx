import { useState } from "react";
import { LuPlus } from "react-icons/lu";

interface AddTaskInputProps {
	onAdd: (title: string) => void;
	disabled?: boolean;
}

export function AddTaskInput({ onAdd, disabled }: AddTaskInputProps) {
	const [value, setValue] = useState("");

	const submit = () => {
		const title = value.trim();
		if (!title || disabled) return;
		onAdd(title);
		setValue("");
	};

	return (
		<div className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5">
			<LuPlus className="size-3.5 shrink-0 text-muted-foreground" />
			<input
				value={value}
				onChange={(e) => setValue(e.target.value)}
				onKeyDown={(e) => e.key === "Enter" && submit()}
				disabled={disabled}
				placeholder="Add a task, press Enter"
				className="w-full bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
			/>
		</div>
	);
}
