import { createFileRoute } from "@tanstack/react-router";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider/LocalHostServiceProvider";
import { MyTasksBoard } from "./components/MyTasksBoard";

export const Route = createFileRoute("/_authenticated/_dashboard/my-tasks/")({
	component: MyTasksPage,
});

function MyTasksPage() {
	const { activeHostUrl } = useLocalHostService();
	return <MyTasksBoard hostUrl={activeHostUrl} />;
}
