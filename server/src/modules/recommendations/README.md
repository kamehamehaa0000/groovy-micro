# Groovy Recommendations Module

Fastify module responsible for computing and serving personalized recommendations, sonic taste profiles, playlist-assisted discoveries, artist radar updates, and harmonic track radio.

For the complete technical specification, mathematical scoring models, and operational SLAs, see [RECOMMENDATION_ENGINE_MODULE.md](../../../../docs/RECOMMENDATION_ENGINE_MODULE.md).

## Quick Route Summary

Mounted at `/api/v1/recommendations`:

| Method | Endpoint | Auth | Purpose |
| :--- | :--- | :--- | :--- |
| `GET` | `/home` | Required | Consolidated personalized feed (all shelves in 1 call) |
| `GET` | `/taste-profile` | Required | User's computed sonic affinity vector (genres, moods, BPM, energy) |
| `GET` | `/new-releases` | Required | New releases matching user's taste profile |
| `GET` | `/radar` | Required | Fresh releases from followed artists (last 6 months) |
| `GET` | `/global-hits` | Required | High-velocity hits matching user's top genres |
| `GET` | `/more-like-artist` | Required | Discoveries inspired by user's top-played artist |
| `GET` | `/more-like-song` | Required | Sonic continuity queue inspired by top favorite song |
| `GET` | `/user-playlists` | Required | Compact shelf summary of created and saved playlists |
| `GET` | `/radio-mixes` | Required | Dynamic radio mixes seeded from 5 diverse top songs |
| `GET` | `/heavy-rotation` | Required | Repeat favorites with high completion rate |
| `GET` | `/for-you` | Required | Content-based discoveries matching taste profile |
| `GET` | `/playlist-assisted` | Required | Unheard tracks from saved playlists + co-occurrences |
| `GET` | `/forgotten` | Required | Rediscover past favorites (plays >= 3, unspun in 30+ days) |
| `GET` | `/radio/:songId` | Optional | Continuous harmonious queue matching seed song |


## Architecture Files

- `recommendations.service.ts`: Core analytical Drizzle SQL queries, scoring algorithms, and Redis caching.
- `recommendations.routes.ts`: Fastify route declarations, auth guards, and response serializations.
- `recommendations.schemas.ts`: Zod schema validation for path and query parameters.
- `recommendations.types.ts`: TypeScript DTOs and return signatures.
- `index.ts`: Barrel export.
