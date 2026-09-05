1. move completely to google pub/sub, even for hls events
2. remove temporal coupling and use fully event driven appoach using event histories.- For bootstrap/cold starts, use event store replays, or implement a lazy-loading cache pattern instead of scheduled full-table synchronization.
3. split or remove the @groovy-streaming/common
