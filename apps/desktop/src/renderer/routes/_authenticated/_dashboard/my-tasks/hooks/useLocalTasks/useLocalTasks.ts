import type { AppRouter } from "@superset/host-service";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";

type RouterOutputs = inferRouterOutputs<AppRouter>;
type RouterInputs = inferRouterInputs<AppRouter>;

export type LocalTask = RouterOutputs["localTasks"]["list"][number];
export type LocalProject = RouterOutputs["project"]["list"][number];

export const LOCAL_TASKS_QUERY_KEY = ["local-tasks"] as const;
const LOCAL_PROJECTS_QUERY_KEY = ["local-tasks-projects"] as const;

/**
 * Tasks and projects for the board. Dashboard routes sit outside
 * WorkspaceTrpcProvider, so the host is addressed by URL the same way the
 * Usage screen does it.
 */
export function useLocalTasks(hostUrl: string | null) {
	const queryClient = useQueryClient();
	const tasksKey = [...LOCAL_TASKS_QUERY_KEY, hostUrl] as const;

	// Always the whole table, filtered for display in the board.
	//
	// `position` is unique per status across every project, so a reorder has to
	// send the column's complete order — renumbering only the rows one project
	// filter happens to show would collide with the rows it hid. The table is a
	// few dozen rows on one machine, so fetching all of it is cheaper than
	// teaching the server to splice a partial order.
	const tasks = useQuery({
		queryKey: tasksKey,
		enabled: !!hostUrl,
		queryFn: () => {
			if (!hostUrl) return [] as LocalTask[];
			return getHostServiceClientByUrl(hostUrl).localTasks.list.query({});
		},
	});

	const projects = useQuery({
		queryKey: [...LOCAL_PROJECTS_QUERY_KEY, hostUrl] as const,
		enabled: !!hostUrl,
		queryFn: () => {
			if (!hostUrl) return [] as LocalProject[];
			return getHostServiceClientByUrl(hostUrl).project.list.query();
		},
	});

	// Every mutation re-reads the board; the table is tiny and local.
	const invalidate = () =>
		queryClient.invalidateQueries({ queryKey: LOCAL_TASKS_QUERY_KEY });

	const create = useMutation({
		mutationFn: (input: RouterInputs["localTasks"]["create"]) => {
			if (!hostUrl) throw new Error("No host service available");
			return getHostServiceClientByUrl(hostUrl).localTasks.create.mutate(input);
		},
		onSuccess: invalidate,
	});

	const update = useMutation({
		mutationFn: (input: RouterInputs["localTasks"]["update"]) => {
			if (!hostUrl) throw new Error("No host service available");
			return getHostServiceClientByUrl(hostUrl).localTasks.update.mutate(input);
		},
		onSuccess: invalidate,
	});

	const remove = useMutation({
		mutationFn: (input: RouterInputs["localTasks"]["remove"]) => {
			if (!hostUrl) throw new Error("No host service available");
			return getHostServiceClientByUrl(hostUrl).localTasks.remove.mutate(input);
		},
		onSuccess: invalidate,
	});

	const reorder = useMutation({
		mutationFn: (input: RouterInputs["localTasks"]["reorder"]) => {
			if (!hostUrl) throw new Error("No host service available");
			return getHostServiceClientByUrl(hostUrl).localTasks.reorder.mutate(
				input,
			);
		},
		// A drop that waits for the round trip snaps the card back to where it
		// started first, so apply the new order to the cache immediately. The
		// refetch on settle is what reconciles it.
		onMutate: async ({ status, ids }) => {
			// A list refetch already in flight would land on top of the optimistic
			// order and snap the card back until the invalidate below catches up.
			await queryClient.cancelQueries({ queryKey: tasksKey });
			const moving = new Set(ids);
			queryClient.setQueryData(tasksKey, (current?: LocalTask[]) => {
				if (!current) return current;
				const byId = new Map(current.map((task) => [task.id, task]));
				const column = ids.flatMap((id) => {
					const task = byId.get(id);
					return task ? [{ ...task, status }] : [];
				});
				// The board groups by status before rendering, so only the order
				// within this column matters; everything else keeps its own.
				return [...current.filter((t) => !moving.has(t.id)), ...column];
			});
		},
		onSettled: invalidate,
	});

	const clearStatus = useMutation({
		mutationFn: (input: RouterInputs["localTasks"]["clearStatus"]) => {
			if (!hostUrl) throw new Error("No host service available");
			return getHostServiceClientByUrl(hostUrl).localTasks.clearStatus.mutate(
				input,
			);
		},
		onSuccess: invalidate,
	});

	return { tasks, projects, create, update, remove, reorder, clearStatus };
}
