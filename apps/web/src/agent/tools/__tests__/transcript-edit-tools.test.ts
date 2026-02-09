import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
	TextElement,
	TextTrack,
	VideoElement,
	VideoTrack,
} from "@/types/timeline";
import { transcriptionService } from "@/services/transcription/service";
import {
	__resetTranscriptEditToolStateForTests,
	getTranscriptEditTools,
} from "../transcript-edit-tools";

const { mockGetInstance, mockProviderChat } = vi.hoisted(() => ({
	mockGetInstance: vi.fn(),
	mockProviderChat: vi.fn(),
}));

vi.mock("@/core", () => ({
	EditorCore: {
		getInstance: mockGetInstance,
	},
}));

vi.mock("../../providers", () => ({
	createRoutedProvider: vi.fn(() => ({
		name: "mock-provider",
		chat: mockProviderChat,
		isAvailable: async () => true,
	})),
}));

function makeVideoElement({
	id,
	startTime,
	duration,
}: {
	id: string;
	startTime: number;
	duration: number;
}): VideoElement {
	return {
		id,
		name: `video-${id}`,
		type: "video",
		startTime,
		duration,
		trimStart: 0,
		trimEnd: 0,
		mediaId: `media-${id}`,
		muted: false,
		hidden: false,
		transform: {
			scale: 1,
			position: { x: 0, y: 0 },
			rotate: 0,
		},
		opacity: 1,
	};
}

function makeCaptionElement({
	id,
	startTime,
	duration,
	content,
}: {
	id: string;
	startTime: number;
	duration: number;
	content: string;
}): TextElement {
	return {
		id,
		name: `Caption ${id}`,
		type: "text",
		startTime,
		duration,
		trimStart: 0,
		trimEnd: 0,
		content,
		fontSize: 32,
		fontFamily: "sans-serif",
		color: "#fff",
		backgroundColor: "transparent",
		textAlign: "center",
		fontWeight: "normal",
		fontStyle: "normal",
		textDecoration: "none",
		transform: {
			scale: 1,
			position: { x: 0, y: 0 },
			rotate: 0,
		},
		opacity: 1,
	};
}

function createEditorMock() {
	const videoTrack: VideoTrack = {
		id: "video-track-1",
		name: "Main",
		type: "video",
		isMain: true,
		muted: false,
		hidden: false,
		elements: [
			makeVideoElement({ id: "v1", startTime: 0, duration: 6 }),
			makeVideoElement({ id: "v2", startTime: 6, duration: 6 }),
			makeVideoElement({ id: "v3", startTime: 12, duration: 6 }),
		],
	};
	const textTrack: TextTrack = {
		id: "text-track-1",
		name: "Captions",
		type: "text",
		hidden: false,
		elements: [
			makeCaptionElement({
				id: "c1",
				startTime: 0,
				duration: 6,
				content: "hello hello this part is repetitive and slow",
			}),
			makeCaptionElement({
				id: "c2",
				startTime: 6,
				duration: 6,
				content: "this section goes on and has filler words um uh",
			}),
			makeCaptionElement({
				id: "c3",
				startTime: 12,
				duration: 6,
				content: "important key message is finally here",
			}),
		],
	};

	return {
		timeline: {
			getTracks: vi.fn(() => [videoTrack, textTrack]),
			getTotalDuration: vi.fn(() => 18),
		},
		command: {
			canUndo: vi.fn(() => false),
			execute: vi.fn(),
		},
		selection: {
			getSelectedElements: vi.fn(() => []),
			clearSelection: vi.fn(),
			setSelectedElements: vi.fn(),
		},
		playback: {
			getCurrentTime: vi.fn(() => 0),
			seek: vi.fn(),
		},
	};
}

function findTool(name: string) {
	const tool = getTranscriptEditTools().find(
		(candidate) => candidate.name === name,
	);
	if (!tool) {
		throw new Error(`Tool not found: ${name}`);
	}
	return tool;
}

describe("transcript edit tools", () => {
	beforeEach(() => {
		__resetTranscriptEditToolStateForTests();
		mockProviderChat.mockReset();
		mockProviderChat.mockRejectedValue(new Error("provider unavailable"));
		mockGetInstance.mockReturnValue(createEditorMock());
		vi.spyOn(transcriptionService, "getLastResult").mockReturnValue(null);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("should expose transcript edit tools", () => {
		const names = getTranscriptEditTools().map((tool) => tool.name);
		expect(names).toEqual(["suggest_transcript_cuts", "transcript_smart_trim"]);
	});

	it("suggest_transcript_cuts dryRun should return suggestions and diff", async () => {
		const result = await findTool("suggest_transcript_cuts").execute({
			goal: "tighten",
			dryRun: true,
			maxSuggestions: 3,
		});
		expect(result.success).toBe(true);
		const data = result.data as {
			dryRun: boolean;
			suggestions: Array<{ startWordIndex: number; endWordIndex: number }>;
			diff?: unknown;
		};
		expect(data.dryRun).toBe(true);
		expect(data.suggestions.length).toBeGreaterThan(0);
		expect(data.diff).toBeDefined();
	});

	it("transcript_smart_trim dryRun should generate smart trim suggestions", async () => {
		const result = await findTool("transcript_smart_trim").execute({
			targetDurationSeconds: 8,
			strategy: "balanced",
			dryRun: true,
		});
		expect(result.success).toBe(true);
		const data = result.data as {
			dryRun: boolean;
			suggestions: Array<{ reason: string }>;
		};
		expect(data.dryRun).toBe(true);
		expect(data.suggestions.length).toBeGreaterThan(0);
		expect(data.suggestions[0]?.reason).toBeTruthy();
	});
});
