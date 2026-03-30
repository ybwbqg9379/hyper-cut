import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Redis-backed rate limiting is only active in production.
// In development, checkRateLimit returns success immediately.
const redis =
	process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
		? new Redis({
				url: process.env.UPSTASH_REDIS_REST_URL,
				token: process.env.UPSTASH_REDIS_REST_TOKEN,
			})
		: null;

const baseRateLimit = redis
	? new Ratelimit({
			redis,
			limiter: Ratelimit.slidingWindow(100, "1 m"), // 100 requests per minute
			analytics: true,
			prefix: "rate-limit",
		})
	: null;

export async function checkRateLimit({ request }: { request: Request }) {
	// Skip rate limiting when Redis is not configured (local dev).
	if (!baseRateLimit) {
		return { success: true, limited: false };
	}

	const ip = request.headers.get("x-forwarded-for") ?? "anonymous";
	const { success } = await baseRateLimit.limit(ip);
	return { success, limited: !success };
}
