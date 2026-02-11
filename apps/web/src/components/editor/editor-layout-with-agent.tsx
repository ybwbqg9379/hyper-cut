"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import {
	ResizablePanelGroup,
	ResizablePanel,
	ResizableHandle,
} from "@/components/ui/resizable";
import { AssetsPanel } from "@/components/editor/panels/assets";
import { PropertiesPanel } from "@/components/editor/panels/properties";
import { Timeline } from "@/components/editor/panels/timeline";
import { PreviewPanel } from "@/components/editor/panels/preview";
import { usePanelStore } from "@/stores/panel-store";

// Lazy load AgentChatbox only when feature is enabled
const AgentChatbox = dynamic(
	() =>
		import("@/components/agent/AgentChatbox").then((mod) => mod.AgentChatbox),
	{ ssr: false },
);

// Feature flag: controlled via environment variable
const AGENT_ENABLED = process.env.NEXT_PUBLIC_AGENT_ENABLED === "true";
const AGENT_PANEL_DEFAULT_SIZE = 18;
const AGENT_PANEL_MIN_SIZE = 12;
const AGENT_PANEL_MAX_SIZE = 30;

type MainPanelSizes = {
	tools: number;
	preview: number;
	properties: number;
};

function normalizeMainPanelsForAgent(panels: MainPanelSizes): MainPanelSizes {
	const available = 100 - AGENT_PANEL_DEFAULT_SIZE;
	const total = panels.tools + panels.preview + panels.properties;

	if (total <= 0) {
		return { tools: 20.5, preview: 41, properties: 20.5 };
	}

	const tools = (panels.tools / total) * available;
	const preview = (panels.preview / total) * available;
	const properties = available - tools - preview;

	return { tools, preview, properties };
}

/**
 * EditorLayoutWithAgent
 *
 * Wrapper around the standard editor layout that optionally adds
 * the AI Agent chatbox panel. This is designed for minimal upstream
 * merge conflicts:
 *
 * - All agent-related code is in this file
 * - Original EditorLayout can be kept as-is
 * - Feature is controlled by NEXT_PUBLIC_AGENT_ENABLED env var
 */
export function EditorLayoutWithAgent() {
	const { panels, setPanel, setPanels } = usePanelStore();
	const normalizedMainPanels = useMemo(
		() =>
			normalizeMainPanelsForAgent({
				tools: panels.tools,
				preview: panels.preview,
				properties: panels.properties,
			}),
		[panels.tools, panels.preview, panels.properties],
	);

	// When agent is disabled, render the original layout exactly
	if (!AGENT_ENABLED) {
		return <OriginalEditorLayout />;
	}

	// When agent is enabled, add the chatbox as a fourth panel
	return (
		<ResizablePanelGroup
			direction="vertical"
			className="size-full gap-[0.18rem]"
			onLayout={(sizes) => {
				setPanel("mainContent", sizes[0] ?? panels.mainContent);
				setPanel("timeline", sizes[1] ?? panels.timeline);
			}}
		>
			<ResizablePanel
				defaultSize={panels.mainContent}
				minSize={30}
				maxSize={85}
				className="min-h-0"
			>
				<ResizablePanelGroup
					direction="horizontal"
					className="size-full gap-[0.19rem] px-3"
					onLayout={(sizes) => {
						const next = normalizeMainPanelsForAgent({
							tools: sizes[0] ?? normalizedMainPanels.tools,
							preview: sizes[1] ?? normalizedMainPanels.preview,
							properties: sizes[2] ?? normalizedMainPanels.properties,
						});
						setPanels(next);
					}}
				>
					<ResizablePanel
						defaultSize={normalizedMainPanels.tools}
						minSize={15}
						maxSize={40}
						className="min-w-0 rounded-sm"
					>
						<AssetsPanel />
					</ResizablePanel>

					<ResizableHandle withHandle />

					<ResizablePanel
						defaultSize={normalizedMainPanels.preview}
						minSize={30}
						className="min-h-0 min-w-0 flex-1"
					>
						<PreviewPanel />
					</ResizablePanel>

					<ResizableHandle withHandle />

					<ResizablePanel
						defaultSize={normalizedMainPanels.properties}
						minSize={15}
						maxSize={40}
						className="min-w-0 rounded-sm"
					>
						<PropertiesPanel />
					</ResizablePanel>

					{/* Agent Chatbox Panel - only when enabled */}
					<ResizableHandle withHandle />

					<ResizablePanel
						defaultSize={AGENT_PANEL_DEFAULT_SIZE}
						minSize={AGENT_PANEL_MIN_SIZE}
						maxSize={AGENT_PANEL_MAX_SIZE}
						className="min-w-0 rounded-sm"
					>
						<AgentChatbox />
					</ResizablePanel>
				</ResizablePanelGroup>
			</ResizablePanel>

			<ResizableHandle withHandle />

			<ResizablePanel
				defaultSize={panels.timeline}
				minSize={15}
				maxSize={70}
				className="min-h-0 px-3 pb-3"
			>
				<Timeline />
			</ResizablePanel>
		</ResizablePanelGroup>
	);
}

/**
 * Original EditorLayout - exact copy from page.tsx
 * This ensures 100% compatibility when agent is disabled
 */
function OriginalEditorLayout() {
	const { panels, setPanel } = usePanelStore();

	return (
		<ResizablePanelGroup
			direction="vertical"
			className="size-full gap-[0.18rem]"
			onLayout={(sizes) => {
				setPanel("mainContent", sizes[0] ?? panels.mainContent);
				setPanel("timeline", sizes[1] ?? panels.timeline);
			}}
		>
			<ResizablePanel
				defaultSize={panels.mainContent}
				minSize={30}
				maxSize={85}
				className="min-h-0"
			>
				<ResizablePanelGroup
					direction="horizontal"
					className="size-full gap-[0.19rem] px-3"
					onLayout={(sizes) => {
						setPanel("tools", sizes[0] ?? panels.tools);
						setPanel("preview", sizes[1] ?? panels.preview);
						setPanel("properties", sizes[2] ?? panels.properties);
					}}
				>
					<ResizablePanel
						defaultSize={panels.tools}
						minSize={15}
						maxSize={40}
						className="min-w-0 rounded-sm"
					>
						<AssetsPanel />
					</ResizablePanel>

					<ResizableHandle withHandle />

					<ResizablePanel
						defaultSize={panels.preview}
						minSize={30}
						className="min-h-0 min-w-0 flex-1"
					>
						<PreviewPanel />
					</ResizablePanel>

					<ResizableHandle withHandle />

					<ResizablePanel
						defaultSize={panels.properties}
						minSize={15}
						maxSize={40}
						className="min-w-0 rounded-sm"
					>
						<PropertiesPanel />
					</ResizablePanel>
				</ResizablePanelGroup>
			</ResizablePanel>

			<ResizableHandle withHandle />

			<ResizablePanel
				defaultSize={panels.timeline}
				minSize={15}
				maxSize={70}
				className="min-h-0 px-3 pb-3"
			>
				<Timeline />
			</ResizablePanel>
		</ResizablePanelGroup>
	);
}

export default EditorLayoutWithAgent;
