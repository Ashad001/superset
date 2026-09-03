import { randomUUID } from "node:crypto";
import { and, asc, eq, max } from "drizzle-orm";
import { z } from "zod";
import { localTasks } from "../../../db/schema";
import { protectedProcedure, router } from "../../index";

const statusSchema = z.enum(["todo", "in_progress", "done"]);

/** Position increment. Sparse so a drop between two cards needs no rewrite. */
const POSITION_STEP = 1000;

export const localTasksRouter = router({
	/** Every task on this host, oldest column position first. */
	list: protectedProcedure
		.input(z.object({ projectId: z.string().nullish() }).optional())
		.query(({ ctx, input }) => {
			const projectId = input?.projectId;
			const rows = ctx.db
				.select()
				.from(localTasks)
				.where(projectId ? eq(localTasks.projectId, projectId) : undefined)
				.orderBy(asc(localTasks.position), asc(localTasks.createdAt))
				.all();
			return rows;
		}),

	create: protectedProcedure
		.input(
			z.object({
				title: z.string().trim().min(1).max(500),
				projectId: z.string().nullish(),
				status: statusSchema.default("todo"),
			}),
		)
		.mutation(({ ctx, input }) => {
			// Append to the end of its column.
			const [{ value: highest } = { value: null }] = ctx.db
				.select({ value: max(localTasks.position) })
				.from(localTasks)
				.where(eq(localTasks.status, input.status))
				.all();

			const row = {
				id: randomUUID(),
				title: input.title,
				projectId: input.projectId ?? null,
				status: input.status,
				position: (highest ?? 0) + POSITION_STEP,
			};
			ctx.db.insert(localTasks).values(row).run();
			return ctx.db
				.select()
				.from(localTasks)
				.where(eq(localTasks.id, row.id))
				.get();
		}),

	update: protectedProcedure
		.input(
			z.object({
				id: z.string(),
				title: z.string().trim().min(1).max(500).optional(),
				status: statusSchema.optional(),
				projectId: z.string().nullish(),
				position: z.number().optional(),
			}),
		)
		.mutation(({ ctx, input }) => {
			const { id, ...changes } = input;
			ctx.db
				.update(localTasks)
				.set({ ...changes, updatedAt: Date.now() })
				.where(eq(localTasks.id, id))
				.run();
			return ctx.db
				.select()
				.from(localTasks)
				.where(eq(localTasks.id, id))
				.get();
		}),

	remove: protectedProcedure
		.input(z.object({ id: z.string() }))
		.mutation(({ ctx, input }) => {
			ctx.db.delete(localTasks).where(eq(localTasks.id, input.id)).run();
			return { id: input.id };
		}),

	/** Clear a column — used by the board's "clear done" action. */
	clearStatus: protectedProcedure
		.input(z.object({ status: statusSchema, projectId: z.string().nullish() }))
		.mutation(({ ctx, input }) => {
			ctx.db
				.delete(localTasks)
				.where(
					input.projectId
						? and(
								eq(localTasks.status, input.status),
								eq(localTasks.projectId, input.projectId),
							)
						: eq(localTasks.status, input.status),
				)
				.run();
			return { status: input.status };
		}),
});
