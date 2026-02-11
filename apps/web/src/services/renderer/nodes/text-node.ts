import type { CanvasRenderer } from "../canvas-renderer";
import { BaseNode } from "./base-node";
import type { TextElement } from "@/types/timeline";

export type TextNodeParams = TextElement & {
	canvasCenter: { x: number; y: number };
	canvasHeight: number;
	textBaseline?: CanvasTextBaseline;
};

function isCaptionTextElement(params: TextNodeParams): boolean {
	if (params.metadata?.kind === "caption") {
		return true;
	}
	return params.name.trim().toLowerCase().startsWith("caption");
}

function splitLineByWidth({
	context,
	line,
	maxWidth,
}: {
	context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
	line: string;
	maxWidth: number;
}): string[] {
	const trimmed = line.replace(/\s+/g, " ").trim();
	if (!trimmed) return [""];
	if (context.measureText(trimmed).width <= maxWidth) {
		return [trimmed];
	}

	const output: string[] = [];
	const hasWhitespace = /\s/.test(trimmed);

	if (hasWhitespace) {
		const tokens = trimmed.split(/\s+/).filter(Boolean);
		let current = "";
		for (const token of tokens) {
			const nextCandidate = current ? `${current} ${token}` : token;
			if (context.measureText(nextCandidate).width <= maxWidth) {
				current = nextCandidate;
				continue;
			}
			if (current) {
				output.push(current);
			}
			if (context.measureText(token).width <= maxWidth) {
				current = token;
				continue;
			}
			const chars = Array.from(token);
			let charLine = "";
			for (const char of chars) {
				const nextCharLine = `${charLine}${char}`;
				if (context.measureText(nextCharLine).width <= maxWidth) {
					charLine = nextCharLine;
					continue;
				}
				if (charLine) {
					output.push(charLine);
				}
				charLine = char;
			}
			current = charLine;
		}
		if (current) {
			output.push(current);
		}
		return output.length > 0 ? output : [trimmed];
	}

	const chars = Array.from(trimmed);
	let current = "";
	for (const char of chars) {
		const nextCandidate = `${current}${char}`;
		if (context.measureText(nextCandidate).width <= maxWidth) {
			current = nextCandidate;
			continue;
		}
		if (current) {
			output.push(current);
		}
		current = char;
	}
	if (current) {
		output.push(current);
	}
	return output.length > 0 ? output : [trimmed];
}

function buildTextLines({
	context,
	content,
	maxWidth,
	autoWrap,
}: {
	context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
	content: string;
	maxWidth: number;
	autoWrap: boolean;
}): string[] {
	const normalizedContent = content.replace(/\r\n/g, "\n");
	const rawLines = normalizedContent.split("\n");
	if (!autoWrap) {
		return rawLines;
	}

	const wrappedLines: string[] = [];
	for (const line of rawLines) {
		const nextLines = splitLineByWidth({ context, line, maxWidth });
		wrappedLines.push(...nextLines);
	}
	return wrappedLines.length > 0 ? wrappedLines : [""];
}

export class TextNode extends BaseNode<TextNodeParams> {
	isInRange({ time }: { time: number }) {
		return (
			time >= this.params.startTime &&
			time < this.params.startTime + this.params.duration
		);
	}

	async render({ renderer, time }: { renderer: CanvasRenderer; time: number }) {
		if (!this.isInRange({ time })) {
			return;
		}

		renderer.context.save();

		const x = this.params.transform.position.x + this.params.canvasCenter.x;
		const y = this.params.transform.position.y + this.params.canvasCenter.y;

		renderer.context.translate(x, y);
		if (this.params.transform.rotate) {
			renderer.context.rotate((this.params.transform.rotate * Math.PI) / 180);
		}

		const fontWeight = this.params.fontWeight === "bold" ? "bold" : "normal";
		const fontStyle = this.params.fontStyle === "italic" ? "italic" : "normal";
		const scaledFontSize = Math.max(1, this.params.fontSize);
		renderer.context.font = `${fontStyle} ${fontWeight} ${scaledFontSize}px ${this.params.fontFamily}`;
		renderer.context.textAlign = this.params.textAlign;
		renderer.context.textBaseline = this.params.textBaseline || "middle";
		renderer.context.fillStyle = this.params.color;

		const prevAlpha = renderer.context.globalAlpha;
		renderer.context.globalAlpha = this.params.opacity;

		const isCaption = isCaptionTextElement(this.params);
		const safeHorizontalPadding = Math.max(24, renderer.width * 0.08);
		const maxCaptionWidth = Math.max(
			80,
			renderer.width - safeHorizontalPadding * 2,
		);
		const textLines = buildTextLines({
			context: renderer.context,
			content: this.params.content,
			maxWidth: isCaption ? maxCaptionWidth : Number.MAX_SAFE_INTEGER,
			autoWrap: isCaption,
		});
		const lineHeight = Math.max(scaledFontSize * 1.2, scaledFontSize + 4);
		const blockHeight = textLines.length * lineHeight;
		const firstLineCenterY = -blockHeight / 2 + lineHeight / 2;
		const padX = 8;
		const padY = 4;

		if (this.params.backgroundColor) {
			renderer.context.fillStyle = this.params.backgroundColor;
			for (let index = 0; index < textLines.length; index += 1) {
				const line = textLines[index] ?? "";
				const lineCenterY = firstLineCenterY + index * lineHeight;
				const metrics = renderer.context.measureText(line);
				const ascent =
					metrics.actualBoundingBoxAscent ?? scaledFontSize * 0.8;
				const descent =
					metrics.actualBoundingBoxDescent ?? scaledFontSize * 0.2;
				const textW = metrics.width;
				const textH = ascent + descent;

				let bgLeft = -textW / 2;
				if (renderer.context.textAlign === "left") bgLeft = 0;
				if (renderer.context.textAlign === "right") bgLeft = -textW;

				renderer.context.fillRect(
					bgLeft - padX,
					lineCenterY - textH / 2 - padY,
					textW + padX * 2,
					textH + padY * 2,
				);
			}
			renderer.context.fillStyle = this.params.color;
		}

		for (let index = 0; index < textLines.length; index += 1) {
			const line = textLines[index] ?? "";
			const lineCenterY = firstLineCenterY + index * lineHeight;
			renderer.context.fillText(line, 0, lineCenterY);
		}

		renderer.context.globalAlpha = prevAlpha;
		renderer.context.restore();
	}
}
