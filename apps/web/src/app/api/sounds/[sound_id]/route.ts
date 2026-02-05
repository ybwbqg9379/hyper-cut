import { webEnv } from "@hypercut/env/web";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit } from "@/lib/rate-limit";

const soundIdSchema = z.coerce.number().int().positive();

const freesoundSoundSchema = z.object({
	id: z.number(),
	name: z.string(),
	description: z.string(),
	url: z.string().url(),
	previews: z
		.object({
			"preview-hq-mp3": z.string().url(),
			"preview-lq-mp3": z.string().url(),
			"preview-hq-ogg": z.string().url(),
			"preview-lq-ogg": z.string().url(),
		})
		.optional(),
	download: z.string().url().optional(),
	duration: z.number(),
	filesize: z.number(),
	type: z.string(),
	channels: z.number(),
	bitrate: z.number(),
	bitdepth: z.number(),
	samplerate: z.number(),
	username: z.string(),
	tags: z.array(z.string()),
	license: z.string(),
	created: z.string(),
	num_downloads: z.number().optional(),
	avg_rating: z.number().optional(),
	num_ratings: z.number().optional(),
});

function transformFreesoundResult(
	result: z.infer<typeof freesoundSoundSchema>,
) {
	return {
		id: result.id,
		name: result.name,
		description: result.description,
		url: result.url,
		previewUrl:
			result.previews?.["preview-hq-mp3"] ||
			result.previews?.["preview-lq-mp3"],
		downloadUrl: result.download,
		duration: result.duration,
		filesize: result.filesize,
		type: result.type,
		channels: result.channels,
		bitrate: result.bitrate,
		bitdepth: result.bitdepth,
		samplerate: result.samplerate,
		username: result.username,
		tags: result.tags,
		license: result.license,
		created: result.created,
		downloads: result.num_downloads || 0,
		rating: result.avg_rating || 0,
		ratingCount: result.num_ratings || 0,
	};
}

export async function GET(request: NextRequest) {
	try {
		const { limited } = await checkRateLimit({ request });
		if (limited) {
			return NextResponse.json({ error: "Too many requests" }, { status: 429 });
		}

		const pathSegments = request.nextUrl.pathname.split("/").filter(Boolean);
		const rawSoundId = pathSegments[pathSegments.length - 1] || "";
		const validation = soundIdSchema.safeParse(rawSoundId);
		if (!validation.success) {
			return NextResponse.json(
				{ error: "Invalid sound_id parameter" },
				{ status: 400 },
			);
		}

		const soundId = validation.data;
		const params = new URLSearchParams({
			token: webEnv.FREESOUND_API_KEY,
			fields:
				"id,name,description,url,previews,download,duration,filesize,type,channels,bitrate,bitdepth,samplerate,username,tags,license,created,num_downloads,avg_rating,num_ratings",
		});
		const response = await fetch(
			`https://freesound.org/apiv2/sounds/${soundId}/?${params.toString()}`,
		);

		if (!response.ok) {
			const errorText = await response.text();
			console.error("Freesound detail API error:", response.status, errorText);
			return NextResponse.json(
				{ error: "Failed to fetch sound details" },
				{ status: response.status },
			);
		}

		const rawData = await response.json();
		const parsed = freesoundSoundSchema.safeParse(rawData);
		if (!parsed.success) {
			console.error("Invalid Freesound detail response:", parsed.error);
			return NextResponse.json(
				{ error: "Invalid response from Freesound API" },
				{ status: 502 },
			);
		}

		return NextResponse.json({
			result: transformFreesoundResult(parsed.data),
		});
	} catch (error) {
		console.error("Sound detail API error:", error);
		return NextResponse.json(
			{
				error: "Internal server error",
			},
			{ status: 500 },
		);
	}
}
