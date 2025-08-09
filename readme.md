# Groovy Streaming - A Microservices-Based Music Platform

Welcome to Groovy Streaming! This project is a modern, scalable music streaming platform built with a backend-for-frontend (BFF) and microservices architecture. It leverages an event-driven approach to ensure services are decoupled and can scale independently.

## Architecture Overview

The system is composed of several independent services that communicate with each other through a central API Gateway and an event bus. This design ensures a clean separation of concerns.

### Architectural Diagram

```mermaid
graph TD
    subgraph "User Interaction"
        A[Client/Browser]
    end

    subgraph "Backend Services"
        B[API Gateway]
        C[Auth Service]
        D[Songs Service]
        E[Comments Service]
        F[Preferences Service]
        G[Query Service]
        K[HLS Worker]
    end

    subgraph "Infrastructure"
        H[Event Bus (Pub/Sub)]
        L[Cloud Storage (S3)]
        M[Database (MongoDB)]
    end

    A -- API Calls --> B;
    B --> C;
    B --> D;
    B --> E;
    B --> F;
    B --> G;

    D -- Generates Pre-signed URL --> A;
    A -- Uploads File Directly --> L;

    L -- Triggers Processing --> K;
    K -- Downloads from --> L;
    K -- Uploads HLS segments to --> L;

    K -- Publishes 'SONG_PROCESSED' --> H;
    D -- Consumes 'SONG_PROCESSED' --> H;
    D -- Publishes 'SONG_UPDATED' --> H;

    E -- Consumes Events --> H;
    G -- Consumes Events --> H;
    F -- Consumes Events --> H;

    C & D & E & F & G --- M;
```

### Services

- **API Gateway (`gateway`):** The single entry point for all client requests. It uses Fastify to efficiently proxy requests to the appropriate downstream service.
- **Authentication Service (`auth-service`):** Manages user registration, login, and authentication using JWT, local (email/password), and Google OAuth strategies.
- **Songs Service (`songs-service`):** The authoritative source for all song and album metadata. Handles song uploads (via pre-signed URLs) and manages all core song information.
- **Comments Service (`comments-service`):** Manages comments and replies on songs, albums, and playlists.
- **Preferences Service (`preferences-service`):** Handles user-specific data like listening history, likes, and real-time features like the collaborative "Jam" sessions via Socket.IO.
- **Query Service (`query-service`):** Provides optimized, denormalized data for complex client-side queries, such as search results. It builds its data by consuming events from other services.
- **HLS Worker (`workers/hls-worker`):** A background worker responsible for processing uploaded media. It converts original audio files into the HTTP Live Streaming (HLS) format for adaptive bitrate streaming.
- **Common Library (`common`):** An internal NPM package containing shared code for event definitions, types, error handling, and other utilities used across all services.

## Technology Stack

### Backend

- **Language:** TypeScript
- **Frameworks:** Node.js with Express.js (most services) and Fastify (API Gateway)
- **Database:** MongoDB with Mongoose ODM
- **Communication:**
  - Event-Driven: Google Cloud Pub/Sub for asynchronous messaging between services.
  - Real-time: Socket.IO for WebSocket communication.

### Frontend

- **Framework:** React (with Vite)
- **Language:** TypeScript (TSX)
- **Styling:** Tailwind CSS with Radix UI components.
- **State Management:** Zustand for global state and TanStack Query (React Query) for server state.

## Core Workflows

### Song Upload & Processing

To illustrate how the services interact, here is the flow for uploading a new song:

1.  **Request Upload:** The client makes an API call to the `songs-service` requesting to upload a file.
2.  **Generate Pre-signed URL:** The `songs-service` generates a secure, temporary pre-signed URL for uploading directly to cloud storage (S3) and sends it back to the client.
3.  **Direct Upload:** The client uploads the MP3 file directly to S3 using the pre-signed URL. The file's data does not pass through the backend servers.
4.  **Trigger Processing:** Once the upload is complete, an event (e.g., an S3 event notification) triggers the `hls-worker`.
5.  **Media Conversion:** The `hls-worker` downloads the original file from S3, converts it into HLS format, and uploads the new segments back to S3.
6.  **Publish Results:** The worker then uses webhook (secured through secrets) containing the song's ID and the URL for the HLS manifest.
7.  **Update Authoritative Record:** The `songs-service` listens to the webhook and updates the song's record in the database with the HLS URL.
8.  **Fan-out:** The `songs-service` then publishes a `SONG_UPDATED` event, which is consumed by the `query-service`, `comments-service`, etc., so they can update their own local copies of the song data.
