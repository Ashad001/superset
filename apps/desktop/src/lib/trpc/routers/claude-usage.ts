import { collectClaudeUsage } from "main/lib/claude-usage/claude-usage";
import { publicProcedure, router } from "..";

export const createClaudeUsageRouter = () => {
	return router({
		getSnapshot: publicProcedure.query(() => collectClaudeUsage()),
	});
};
