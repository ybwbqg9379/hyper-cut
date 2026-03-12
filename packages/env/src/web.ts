import { z } from "zod";

const webEnvSchema = z.object({
	// Node
	NODE_ENV: z.enum(["development", "production", "test"]),
	ANALYZE: z.string().optional(),
	NEXT_RUNTIME: z.enum(["nodejs", "edge"]).optional(),

	// Public
	NEXT_PUBLIC_SITE_URL: z.url().default("http://localhost:3000"),

	// Server (defaults allow build without env vars; runtime guards in each service)
	DATABASE_URL: z.string().default(""),
	BETTER_AUTH_SECRET: z.string().default(""),
	UPSTASH_REDIS_REST_URL: z.string().default(""),
	UPSTASH_REDIS_REST_TOKEN: z.string().default(""),
	FREESOUND_CLIENT_ID: z.string().default(""),
	FREESOUND_API_KEY: z.string().default(""),
	CLOUDFLARE_ACCOUNT_ID: z.string().default(""),
	R2_ACCESS_KEY_ID: z.string().default(""),
	R2_SECRET_ACCESS_KEY: z.string().default(""),
	R2_BUCKET_NAME: z.string().default(""),
	MODAL_TRANSCRIPTION_URL: z.string().default(""),
});

export type WebEnv = z.infer<typeof webEnvSchema>;

export const webEnv = webEnvSchema.parse(process.env);
