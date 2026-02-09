import { Command } from "@/lib/commands/base-command";
import type { TimelineTrack, Transform } from "@/types/timeline";
import { EditorCore } from "@/core";

export class UpdateElementTransformCommand extends Command {
	private savedState: TimelineTrack[] | null = null;

	constructor(
		private trackId: string,
		private elementId: string,
		private updates: {
			transform?: Transform;
			opacity?: number;
			color?: string;
		},
	) {
		super();
	}

	execute(): void {
		const editor = EditorCore.getInstance();
		this.savedState = editor.timeline.getTracks();

		const updatedTracks = this.savedState.map((track) => {
			if (track.id !== this.trackId) return track;

			const newElements = track.elements.map((element) => {
				if (element.id !== this.elementId) return element;

				if (!("transform" in element) && !("opacity" in element)) {
					return element;
				}

				return {
					...element,
					...(this.updates.transform
						? { transform: this.updates.transform }
						: {}),
					...(this.updates.opacity !== undefined
						? { opacity: this.updates.opacity }
						: {}),
					...(element.type === "sticker" && this.updates.color !== undefined
						? { color: this.updates.color }
						: {}),
				};
			});

			return { ...track, elements: newElements } as typeof track;
		});

		editor.timeline.updateTracks(updatedTracks);
	}

	undo(): void {
		if (this.savedState) {
			const editor = EditorCore.getInstance();
			editor.timeline.updateTracks(this.savedState);
		}
	}
}
