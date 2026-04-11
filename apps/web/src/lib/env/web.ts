import { z } from "zod";

const webEnvSchema = z.object({
	// Node
	NODE_ENV: z.enum(["development", "production", "test"]),
	ANALYZE: z.string().optional(),
	NEXT_RUNTIME: z.enum(["nodejs", "edge"]).optional(),

	// Public
	NEXT_PUBLIC_SITE_URL: z.url().default("http://localhost:3000"),
	NEXT_PUBLIC_MARBLE_API_URL: z.url().default("https://api.marblecms.com"),

	// Server — default to placeholders so the build succeeds even when
	// credentials are not yet configured. Runtime code that depends on
	// these services will fail at request time, not at build time.
	DATABASE_URL: z
		.string()
		.default("postgresql://placeholder:placeholder@localhost:5432/placeholder"),
	BETTER_AUTH_SECRET: z.string().default("placeholder"),
	UPSTASH_REDIS_REST_URL: z.url().default("https://placeholder.upstash.io"),
	UPSTASH_REDIS_REST_TOKEN: z.string().default("placeholder"),
	MARBLE_WORKSPACE_KEY: z.string().default("placeholder"),
	FREESOUND_CLIENT_ID: z.string().default("placeholder"),
	FREESOUND_API_KEY: z.string().default("placeholder"),
});

export type WebEnv = z.infer<typeof webEnvSchema>;

export const webEnv = webEnvSchema.parse(process.env);
