import type {
	CapabilityDefinition,
	CapabilityDomain,
	CapabilityRisk,
} from "./types";

interface ManagerMethodDescriptor {
	manager:
		| "playback"
		| "timeline"
		| "scenes"
		| "project"
		| "media"
		| "renderer"
		| "command"
		| "save"
		| "audio"
		| "selection";
	method: string;
	description: string;
	sourceRef: string;
}

const MANAGER_DOMAIN_MAP: Record<
	ManagerMethodDescriptor["manager"],
	CapabilityDomain
> = {
	playback: "playback",
	timeline: "timeline",
	scenes: "scene",
	project: "project",
	media: "media",
	renderer: "renderer",
	command: "history",
	save: "controls",
	audio: "audio",
	selection: "selection",
};

const MANAGER_METHODS: ManagerMethodDescriptor[] = [
	// playback-manager
	{
		manager: "playback",
		method: "play",
		description: "Start timeline playback",
		sourceRef: "@/core/managers/playback-manager.ts",
	},
	{
		manager: "playback",
		method: "pause",
		description: "Pause timeline playback",
		sourceRef: "@/core/managers/playback-manager.ts",
	},
	{
		manager: "playback",
		method: "toggle",
		description: "Toggle playback state",
		sourceRef: "@/core/managers/playback-manager.ts",
	},
	{
		manager: "playback",
		method: "seek",
		description: "Seek playback to target time",
		sourceRef: "@/core/managers/playback-manager.ts",
	},
	{
		manager: "playback",
		method: "setVolume",
		description: "Set playback volume",
		sourceRef: "@/core/managers/playback-manager.ts",
	},
	{
		manager: "playback",
		method: "mute",
		description: "Mute playback",
		sourceRef: "@/core/managers/playback-manager.ts",
	},
	{
		manager: "playback",
		method: "unmute",
		description: "Unmute playback",
		sourceRef: "@/core/managers/playback-manager.ts",
	},
	{
		manager: "playback",
		method: "toggleMute",
		description: "Toggle playback mute state",
		sourceRef: "@/core/managers/playback-manager.ts",
	},
	{
		manager: "playback",
		method: "getIsPlaying",
		description: "Read playback status",
		sourceRef: "@/core/managers/playback-manager.ts",
	},
	{
		manager: "playback",
		method: "getCurrentTime",
		description: "Read current playback time",
		sourceRef: "@/core/managers/playback-manager.ts",
	},
	{
		manager: "playback",
		method: "getVolume",
		description: "Read playback volume",
		sourceRef: "@/core/managers/playback-manager.ts",
	},
	{
		manager: "playback",
		method: "isMuted",
		description: "Read playback mute status",
		sourceRef: "@/core/managers/playback-manager.ts",
	},
	{
		manager: "playback",
		method: "subscribe",
		description: "Subscribe playback state changes",
		sourceRef: "@/core/managers/playback-manager.ts",
	},

	// timeline-manager
	{
		manager: "timeline",
		method: "addTrack",
		description: "Add timeline track",
		sourceRef: "@/core/managers/timeline-manager.ts",
	},
	{
		manager: "timeline",
		method: "removeTrack",
		description: "Remove timeline track",
		sourceRef: "@/core/managers/timeline-manager.ts",
	},
	{
		manager: "timeline",
		method: "insertElement",
		description: "Insert element into timeline",
		sourceRef: "@/core/managers/timeline-manager.ts",
	},
	{
		manager: "timeline",
		method: "updateElementTrim",
		description: "Trim timeline element",
		sourceRef: "@/core/managers/timeline-manager.ts",
	},
	{
		manager: "timeline",
		method: "updateElementDuration",
		description: "Resize timeline element duration",
		sourceRef: "@/core/managers/timeline-manager.ts",
	},
	{
		manager: "timeline",
		method: "updateElementStartTime",
		description: "Move element start time",
		sourceRef: "@/core/managers/timeline-manager.ts",
	},
	{
		manager: "timeline",
		method: "moveElement",
		description: "Move element across track/time",
		sourceRef: "@/core/managers/timeline-manager.ts",
	},
	{
		manager: "timeline",
		method: "toggleTrackMute",
		description: "Toggle track mute",
		sourceRef: "@/core/managers/timeline-manager.ts",
	},
	{
		manager: "timeline",
		method: "toggleTrackVisibility",
		description: "Toggle track visibility",
		sourceRef: "@/core/managers/timeline-manager.ts",
	},
	{
		manager: "timeline",
		method: "splitElements",
		description: "Split timeline elements",
		sourceRef: "@/core/managers/timeline-manager.ts",
	},
	{
		manager: "timeline",
		method: "getTotalDuration",
		description: "Read timeline total duration",
		sourceRef: "@/core/managers/timeline-manager.ts",
	},
	{
		manager: "timeline",
		method: "getTrackById",
		description: "Read timeline track detail",
		sourceRef: "@/core/managers/timeline-manager.ts",
	},
	{
		manager: "timeline",
		method: "getElementsWithTracks",
		description: "Read timeline elements with track context",
		sourceRef: "@/core/managers/timeline-manager.ts",
	},
	{
		manager: "timeline",
		method: "pasteAtTime",
		description: "Paste clipboard items into timeline",
		sourceRef: "@/core/managers/timeline-manager.ts",
	},
	{
		manager: "timeline",
		method: "deleteElements",
		description: "Delete timeline elements",
		sourceRef: "@/core/managers/timeline-manager.ts",
	},
	{
		manager: "timeline",
		method: "updateElements",
		description: "Update element properties (batch)",
		sourceRef: "@/core/managers/timeline-manager.ts",
	},
	{
		manager: "timeline",
		method: "duplicateElements",
		description: "Duplicate timeline elements",
		sourceRef: "@/core/managers/timeline-manager.ts",
	},
	{
		manager: "timeline",
		method: "toggleElementsVisibility",
		description: "Toggle visibility for elements",
		sourceRef: "@/core/managers/timeline-manager.ts",
	},
	{
		manager: "timeline",
		method: "toggleElementsMuted",
		description: "Toggle mute for elements",
		sourceRef: "@/core/managers/timeline-manager.ts",
	},
	{
		manager: "timeline",
		method: "getTracks",
		description: "Read timeline tracks",
		sourceRef: "@/core/managers/timeline-manager.ts",
	},
	{
		manager: "timeline",
		method: "subscribe",
		description: "Subscribe timeline state changes",
		sourceRef: "@/core/managers/timeline-manager.ts",
	},
	{
		manager: "timeline",
		method: "updateTracks",
		description: "Replace track state (unsafe direct update)",
		sourceRef: "@/core/managers/timeline-manager.ts",
	},
	{
		manager: "timeline",
		method: "replaceTracks",
		description: "Replace tracks while preserving selection",
		sourceRef: "@/core/managers/timeline-manager.ts",
	},

	// scenes-manager
	{
		manager: "scenes",
		method: "createScene",
		description: "Create new scene",
		sourceRef: "@/core/managers/scenes-manager.ts",
	},
	{
		manager: "scenes",
		method: "deleteScene",
		description: "Delete scene",
		sourceRef: "@/core/managers/scenes-manager.ts",
	},
	{
		manager: "scenes",
		method: "renameScene",
		description: "Rename scene",
		sourceRef: "@/core/managers/scenes-manager.ts",
	},
	{
		manager: "scenes",
		method: "switchToScene",
		description: "Switch active scene",
		sourceRef: "@/core/managers/scenes-manager.ts",
	},
	{
		manager: "scenes",
		method: "toggleBookmark",
		description: "Toggle bookmark at time",
		sourceRef: "@/core/managers/scenes-manager.ts",
	},
	{
		manager: "scenes",
		method: "isBookmarked",
		description: "Check bookmark at time",
		sourceRef: "@/core/managers/scenes-manager.ts",
	},
	{
		manager: "scenes",
		method: "removeBookmark",
		description: "Remove bookmark at time",
		sourceRef: "@/core/managers/scenes-manager.ts",
	},
	{
		manager: "scenes",
		method: "loadProjectScenes",
		description: "Load scenes for project",
		sourceRef: "@/core/managers/scenes-manager.ts",
	},
	{
		manager: "scenes",
		method: "initializeScenes",
		description: "Initialize scenes snapshot",
		sourceRef: "@/core/managers/scenes-manager.ts",
	},
	{
		manager: "scenes",
		method: "clearScenes",
		description: "Clear all scenes",
		sourceRef: "@/core/managers/scenes-manager.ts",
	},
	{
		manager: "scenes",
		method: "getActiveScene",
		description: "Read active scene",
		sourceRef: "@/core/managers/scenes-manager.ts",
	},
	{
		manager: "scenes",
		method: "getScenes",
		description: "Read scene list",
		sourceRef: "@/core/managers/scenes-manager.ts",
	},
	{
		manager: "scenes",
		method: "setScenes",
		description: "Set scene list",
		sourceRef: "@/core/managers/scenes-manager.ts",
	},
	{
		manager: "scenes",
		method: "subscribe",
		description: "Subscribe scene state changes",
		sourceRef: "@/core/managers/scenes-manager.ts",
	},
	{
		manager: "scenes",
		method: "updateSceneTracks",
		description: "Update tracks inside active scene",
		sourceRef: "@/core/managers/scenes-manager.ts",
	},

	// project-manager
	{
		manager: "project",
		method: "createNewProject",
		description: "Create new project",
		sourceRef: "@/core/managers/project-manager.ts",
	},
	{
		manager: "project",
		method: "loadProject",
		description: "Load project by id",
		sourceRef: "@/core/managers/project-manager.ts",
	},
	{
		manager: "project",
		method: "saveCurrentProject",
		description: "Persist active project",
		sourceRef: "@/core/managers/project-manager.ts",
	},
	{
		manager: "project",
		method: "export",
		description: "Export active project to media",
		sourceRef: "@/core/managers/project-manager.ts",
	},
	{
		manager: "project",
		method: "loadAllProjects",
		description: "Load project metadata list",
		sourceRef: "@/core/managers/project-manager.ts",
	},
	{
		manager: "project",
		method: "deleteProjects",
		description: "Delete projects",
		sourceRef: "@/core/managers/project-manager.ts",
	},
	{
		manager: "project",
		method: "closeProject",
		description: "Close active project",
		sourceRef: "@/core/managers/project-manager.ts",
	},
	{
		manager: "project",
		method: "renameProject",
		description: "Rename project",
		sourceRef: "@/core/managers/project-manager.ts",
	},
	{
		manager: "project",
		method: "duplicateProjects",
		description: "Duplicate project(s)",
		sourceRef: "@/core/managers/project-manager.ts",
	},
	{
		manager: "project",
		method: "updateSettings",
		description: "Update project settings",
		sourceRef: "@/core/managers/project-manager.ts",
	},
	{
		manager: "project",
		method: "updateThumbnail",
		description: "Update project thumbnail",
		sourceRef: "@/core/managers/project-manager.ts",
	},
	{
		manager: "project",
		method: "prepareExit",
		description: "Prepare project before exit",
		sourceRef: "@/core/managers/project-manager.ts",
	},
	{
		manager: "project",
		method: "getFilteredAndSortedProjects",
		description: "Read filtered/sorted project list",
		sourceRef: "@/core/managers/project-manager.ts",
	},
	{
		manager: "project",
		method: "isInvalidProjectId",
		description: "Check invalid project id marker",
		sourceRef: "@/core/managers/project-manager.ts",
	},
	{
		manager: "project",
		method: "markProjectIdAsInvalid",
		description: "Mark project id as invalid",
		sourceRef: "@/core/managers/project-manager.ts",
	},
	{
		manager: "project",
		method: "clearInvalidProjectIds",
		description: "Clear invalid project id markers",
		sourceRef: "@/core/managers/project-manager.ts",
	},
	{
		manager: "project",
		method: "getActive",
		description: "Get active project (throws if none)",
		sourceRef: "@/core/managers/project-manager.ts",
	},
	{
		manager: "project",
		method: "getActiveOrNull",
		description: "Get active project if exists",
		sourceRef: "@/core/managers/project-manager.ts",
	},
	{
		manager: "project",
		method: "getTimelineViewState",
		description: "Get timeline view state",
		sourceRef: "@/core/managers/project-manager.ts",
	},
	{
		manager: "project",
		method: "setTimelineViewState",
		description: "Set timeline view state",
		sourceRef: "@/core/managers/project-manager.ts",
	},
	{
		manager: "project",
		method: "getSavedProjects",
		description: "Get cached project metadata list",
		sourceRef: "@/core/managers/project-manager.ts",
	},
	{
		manager: "project",
		method: "getIsLoading",
		description: "Read loading state",
		sourceRef: "@/core/managers/project-manager.ts",
	},
	{
		manager: "project",
		method: "getIsInitialized",
		description: "Read initialization state",
		sourceRef: "@/core/managers/project-manager.ts",
	},
	{
		manager: "project",
		method: "getMigrationState",
		description: "Read storage migration state",
		sourceRef: "@/core/managers/project-manager.ts",
	},
	{
		manager: "project",
		method: "setActiveProject",
		description: "Set active project snapshot",
		sourceRef: "@/core/managers/project-manager.ts",
	},
	{
		manager: "project",
		method: "subscribe",
		description: "Subscribe project state changes",
		sourceRef: "@/core/managers/project-manager.ts",
	},

	// media-manager
	{
		manager: "media",
		method: "addMediaAsset",
		description: "Add media asset",
		sourceRef: "@/core/managers/media-manager.ts",
	},
	{
		manager: "media",
		method: "removeMediaAsset",
		description: "Remove media asset",
		sourceRef: "@/core/managers/media-manager.ts",
	},
	{
		manager: "media",
		method: "loadProjectMedia",
		description: "Load project media assets",
		sourceRef: "@/core/managers/media-manager.ts",
	},
	{
		manager: "media",
		method: "clearProjectMedia",
		description: "Clear project media assets",
		sourceRef: "@/core/managers/media-manager.ts",
	},
	{
		manager: "media",
		method: "clearAllAssets",
		description: "Clear in-memory assets",
		sourceRef: "@/core/managers/media-manager.ts",
	},
	{
		manager: "media",
		method: "getAssets",
		description: "Read media asset list",
		sourceRef: "@/core/managers/media-manager.ts",
	},
	{
		manager: "media",
		method: "setAssets",
		description: "Replace media asset list",
		sourceRef: "@/core/managers/media-manager.ts",
	},
	{
		manager: "media",
		method: "isLoadingMedia",
		description: "Read media loading state",
		sourceRef: "@/core/managers/media-manager.ts",
	},
	{
		manager: "media",
		method: "subscribe",
		description: "Subscribe media state changes",
		sourceRef: "@/core/managers/media-manager.ts",
	},

	// renderer-manager
	{
		manager: "renderer",
		method: "setRenderTree",
		description: "Set render tree snapshot",
		sourceRef: "@/core/managers/renderer-manager.ts",
	},
	{
		manager: "renderer",
		method: "getRenderTree",
		description: "Read render tree snapshot",
		sourceRef: "@/core/managers/renderer-manager.ts",
	},
	{
		manager: "renderer",
		method: "exportProject",
		description: "Render/export project media",
		sourceRef: "@/core/managers/renderer-manager.ts",
	},
	{
		manager: "renderer",
		method: "subscribe",
		description: "Subscribe renderer state changes",
		sourceRef: "@/core/managers/renderer-manager.ts",
	},

	// commands manager
	{
		manager: "command",
		method: "execute",
		description: "Execute command (push history)",
		sourceRef: "@/core/managers/commands.ts",
	},
	{
		manager: "command",
		method: "undo",
		description: "Undo last command",
		sourceRef: "@/core/managers/commands.ts",
	},
	{
		manager: "command",
		method: "redo",
		description: "Redo last command",
		sourceRef: "@/core/managers/commands.ts",
	},
	{
		manager: "command",
		method: "canUndo",
		description: "Check undo availability",
		sourceRef: "@/core/managers/commands.ts",
	},
	{
		manager: "command",
		method: "canRedo",
		description: "Check redo availability",
		sourceRef: "@/core/managers/commands.ts",
	},
	{
		manager: "command",
		method: "clear",
		description: "Clear command history",
		sourceRef: "@/core/managers/commands.ts",
	},

	// save manager
	{
		manager: "save",
		method: "start",
		description: "Start auto-save listeners",
		sourceRef: "@/core/managers/save-manager.ts",
	},
	{
		manager: "save",
		method: "stop",
		description: "Stop auto-save listeners",
		sourceRef: "@/core/managers/save-manager.ts",
	},
	{
		manager: "save",
		method: "pause",
		description: "Pause auto-save",
		sourceRef: "@/core/managers/save-manager.ts",
	},
	{
		manager: "save",
		method: "resume",
		description: "Resume auto-save",
		sourceRef: "@/core/managers/save-manager.ts",
	},
	{
		manager: "save",
		method: "markDirty",
		description: "Mark project dirty",
		sourceRef: "@/core/managers/save-manager.ts",
	},
	{
		manager: "save",
		method: "discardPending",
		description: "Discard pending save",
		sourceRef: "@/core/managers/save-manager.ts",
	},
	{
		manager: "save",
		method: "flush",
		description: "Force save immediately",
		sourceRef: "@/core/managers/save-manager.ts",
	},
	{
		manager: "save",
		method: "getIsDirty",
		description: "Read save dirty state",
		sourceRef: "@/core/managers/save-manager.ts",
	},

	// audio manager
	{
		manager: "audio",
		method: "dispose",
		description: "Dispose audio manager resources",
		sourceRef: "@/core/managers/audio-manager.ts",
	},

	// selection manager
	{
		manager: "selection",
		method: "getSelectedElements",
		description: "Read selected elements",
		sourceRef: "@/core/managers/selection-manager.ts",
	},
	{
		manager: "selection",
		method: "setSelectedElements",
		description: "Set selected elements",
		sourceRef: "@/core/managers/selection-manager.ts",
	},
	{
		manager: "selection",
		method: "clearSelection",
		description: "Clear selected elements",
		sourceRef: "@/core/managers/selection-manager.ts",
	},
	{
		manager: "selection",
		method: "subscribe",
		description: "Subscribe selection changes",
		sourceRef: "@/core/managers/selection-manager.ts",
	},
];

function inferRisk(method: string): CapabilityRisk {
	if (
		method.includes("delete") ||
		method.includes("remove") ||
		method.includes("clear")
	) {
		return "destructive";
	}
	if (
		method.includes("add") ||
		method.includes("insert") ||
		method.includes("move") ||
		method.includes("split") ||
		method.includes("update") ||
		method.includes("set") ||
		method.includes("toggle") ||
		method.includes("rename") ||
		method.includes("duplicate") ||
		method.includes("create")
	) {
		return "caution";
	}
	return "safe";
}

function inferPreconditions({
	manager,
	method,
}: {
	manager: ManagerMethodDescriptor["manager"];
	method: string;
}): string[] {
	if (
		manager === "timeline" ||
		manager === "scenes" ||
		manager === "save" ||
		manager === "renderer"
	) {
		if (method.startsWith("get") || method === "subscribe") {
			return ["project_or_scene_initialized"];
		}
		return ["active_project_required"];
	}

	if (manager === "project" && method.startsWith("get")) {
		return [];
	}

	if (manager === "media") {
		return method.startsWith("get")
			? ["media_state_initialized"]
			: ["active_project_required"];
	}

	return [];
}

export function collectManagerCapabilities(): CapabilityDefinition[] {
	return MANAGER_METHODS.map((methodDef) => ({
		id: `manager.${methodDef.manager}.${methodDef.method}`,
		name: `${methodDef.manager}.${methodDef.method}`,
		description: methodDef.description,
		source: "manager",
		sourceRef: methodDef.sourceRef,
		domain: MANAGER_DOMAIN_MAP[methodDef.manager],
		risk: inferRisk(methodDef.method),
		parameters: [],
		preconditions: inferPreconditions({
			manager: methodDef.manager,
			method: methodDef.method,
		}),
	}));
}
