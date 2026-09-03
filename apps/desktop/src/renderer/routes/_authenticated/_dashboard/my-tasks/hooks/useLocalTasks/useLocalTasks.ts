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
export function useLocalTasks(
	hostUrl: string | null,
	projectId: string | null,
) {
	const queryClient = useQueryClient();
	const tasksKey = [...LOCAL_TASKS_QUERY_KEY, hostUrl, projectId] as const;

	const tasks = useQuery({
		queryKey: tasksKey,
		enabled: !!hostUrl,
		queryFn: () => {
			if (!hostUrl) return [] as LocalTask[];
			return getHostServiceClientByUrl(hostUrl).localTasks.list.query({
				projectId,
			});
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

	return { tasks, projects, create, update, remove };
}
