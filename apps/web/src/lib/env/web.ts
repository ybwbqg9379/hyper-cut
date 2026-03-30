import { z } from "zod";

const webEnvSchema = z.object({
	// Node
	NODE_ENV: z.enum(["development", "production", "test"]),
	ANALYZE: z.string().optional(),
	NEXT_RUNTIME: z.enum(["nodejs", "edge"]).optional(),

	// Public
	NEXT_PUBLIC_SITE_URL: z.url().default("http://localhost:3000"),

	// --- Commented out: not used by HyperCut (client-side iframe editor) ---
	// Restore these if upstream server-side features are needed in the future.

	// NEXT_PUBLIC_MARBLE_API_URL: z.url(),               // Dead code: declared but never read
	// DATABASE_URL: z.string(),                           // Upstream auth/db (HyperCut uses browser storage)
	// BETTER_AUTH_SECRET: z.string(),                     // Upstream auth (HyperCut auth is on HyperCreator side)
	// UPSTASH_REDIS_REST_URL: z.url(),                    // Upstream rate-limit + auth
	// UPSTASH_REDIS_REST_TOKEN: z.string(),               // Upstream rate-limit + auth
	// MARBLE_WORKSPACE_KEY: z.string(),                   // Dead code: declared but never read
	// FREESOUND_CLIENT_ID: z.string(),                    // Upstream sounds search API (optional feature)
	// FREESOUND_API_KEY: z.string(),                      // Upstream sounds search API (optional feature)
	// CLOUDFLARE_ACCOUNT_ID: z.string(),                  // Dead code: declared but never read
	// R2_ACCESS_KEY_ID: z.string(),                       // Dead code: declared but never read
	// R2_SECRET_ACCESS_KEY: z.string(),                   // Dead code: declared but never read
	// R2_BUCKET_NAME: z.string(),                         // Dead code: declared but never read
	// MODAL_TRANSCRIPTION_URL: z.url(),                   // Dead code: declared but never read
});

export type WebEnv = z.infer<typeof webEnvSchema>;

const parsed = webEnvSchema.safeParse(process.env);

if (!parsed.success) {
	if (process.env.NODE_ENV === "production") {
		throw parsed.error;
	}
	// In development, log the missing vars but don't crash.
	// This allows the client-side editor to run without server-side env vars.
	console.warn(
		"[env] Missing environment variables (server-side features will be unavailable):",
		parsed.error.issues.map((i) => i.path.join(".")).join(", "),
	);
}

export const webEnv = (parsed.success ? parsed.data : {}) as WebEnv;
