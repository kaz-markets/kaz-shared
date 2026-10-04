# @kaz/shared

Dependency-light Node utilities shared by the KAZ services. Small and generic: nothing here
knows about a venue, a tenant or a domain — that belongs in the service that owns it.

| Module | What |
| --- | --- |
| `request` / `sleep` | a fetch wrapper with a bounded retry, a timeout, and a non-2xx returned as data (with `retryAfterSec`) rather than thrown |
| `connectWs` | a reconnecting WebSocket client: exponential backoff, optional ping, and a subscribe/auth hook |
| `TokenBucket` | a rate limiter sized to a provider's published shape (rate + burst) |

## Use it

Consumed as TypeScript source (no build step), pinned by git tag:

```json
{ "dependencies": { "@kaz/shared": "github:kaz-markets/kaz-shared#v0.1.0" } }
```

```ts
import { request, connectWs, TokenBucket } from "@kaz/shared";
```

`ws` is a peer dependency (the two services that use `connectWs` already depend on it).

## Develop

```bash
npm install
npm run typecheck
npm test
```

## Versioning

Tag a release (`git tag v0.1.0 && git push --tags`) and bump the tag in each consumer. A
breaking change is a new major tag; consumers move when they choose.
