"use client";

import { useParams } from "next/navigation";
import { EditorHeader } from "@/components/editor/editor-header";
import { EditorProvider } from "@/components/providers/editor-provider";
import { Onboarding } from "@/components/editor/onboarding";
import { MigrationDialog } from "@/components/editor/dialogs/migration-dialog";
// HyperCut: Agent integration via wrapper (controlled by NEXT_PUBLIC_AGENT_ENABLED)
import { EditorLayoutWithAgent } from "@/components/editor/editor-layout-with-agent";

export default function Editor() {
	const params = useParams();
	const projectId = params.project_id as string;

	return (
		<EditorProvider projectId={projectId}>
			<div className="bg-background flex h-screen w-screen flex-col overflow-hidden">
				<EditorHeader />
				<div className="min-h-0 min-w-0 flex-1">
					{/* HyperCut: Uses wrapper that conditionally adds Agent panel */}
					<EditorLayoutWithAgent />
				</div>
				<Onboarding />
				<MigrationDialog />
			</div>
		</EditorProvider>
	);
}
