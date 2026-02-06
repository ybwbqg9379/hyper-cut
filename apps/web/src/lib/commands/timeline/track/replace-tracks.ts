import { Command } from "@/lib/commands/base-command";
import type { TimelineTrack } from "@/types/timeline";
import { EditorCore } from "@/core";

interface ReplaceTracksCommandOptions {
	selection?: Array<{ trackId: string; elementId: string }> | null;
}

export class ReplaceTracksCommand extends Command {
	private savedTracks: TimelineTrack[] | null = null;
	private savedSelection: Array<{ trackId: string; elementId: string }> = [];

	constructor(
		private nextTracks: TimelineTrack[],
		private options: ReplaceTracksCommandOptions = {},
	) {
		super();
	}

	execute(): void {
		const editor = EditorCore.getInstance();
		this.savedTracks = editor.timeline.getTracks();
		this.savedSelection = editor.selection.getSelectedElements();

		editor.timeline.updateTracks(this.nextTracks);
		if (this.options.selection === null) {
			editor.selection.clearSelection();
			return;
		}
		if (this.options.selection) {
			editor.selection.setSelectedElements({ elements: this.options.selection });
		}
	}

	undo(): void {
		if (!this.savedTracks) {
			return;
		}
		const editor = EditorCore.getInstance();
		editor.timeline.updateTracks(this.savedTracks);
		editor.selection.setSelectedElements({ elements: this.savedSelection });
	}
}
