# API Versioning Guide

## Overview

The API uses **URI-based versioning** via NestJS `VersioningType.URI`.  
All routes are prefixed with `/v{n}/`, e.g. `/v1/records`.

Versioning is configured in `src/main.ts`:

```typescript
app.enableVersioning({
  type: VersioningType.URI,
  defaultVersion: ['1', VERSION_NEUTRAL],
});
```

The `defaultVersion` means:

- Unversioned legacy controllers are governed by the v1 lifecycle policy
- Controllers or handlers decorated with `@Version('1')` are served at `/v1/...`
- `VERSION_NEUTRAL` controllers (e.g. `GET /api`, health checks) respond without any prefix

---

## Available Versions

| Version | Status  | Base URL | Sunset Date |
| ------- | ------- | -------- | ----------- |
| v1      | Current | `/v1`    | —           |

Discover versions programmatically:

```http
GET /api
```

Response:

```json
{
  "versions": [
    {
      "version": "1",
      "status": "current",
      "releaseDate": "2024-01-01",
      "baseUrl": "/v1"
    }
  ]
}
```

---

## v1

All existing controllers are on v1. Controllers are decorated with `@Version('1')`:

```typescript
@Version('1')
@Controller('records')
export class RecordsController { ... }
```

### Deprecated endpoints in v1

Deprecated endpoints return the following response headers:

| Header        | Value                                      |
| ------------- | ------------------------------------------ |
| `Deprecation` | `true`                                     |
| `Sunset`      | RFC 7231 date when the endpoint is removed |
| `Link`        | Alternative route (`rel="alternate"`)      |

All versioned API responses also include lifecycle metadata:

| Header               | Value                                |
| -------------------- | ------------------------------------ |
| `API-Version`        | Effective API version, e.g. `v1`     |
| `API-Version-Status` | `current`, `deprecated`, or `sunset` |

After the sunset date, deprecated endpoints return:

| Status Code | Meaning                                                  |
| ----------- | -------------------------------------------------------- |
| `410 Gone`  | Endpoint has reached end-of-life and is no longer served |

Example:

```http
GET /v1/records
Deprecation: true
Sunset: Wed, 01 Jan 2026 00:00:00 GMT
Link: </v1/records/search>; rel="alternate"
```

Use `@DeprecatedRoute()` to mark an endpoint as deprecated:

```typescript
@Get()
@DeprecatedRoute({
  sunsetDate: 'Wed, 01 Jan 2026 00:00:00 GMT',
  alternativeRoute: '/v1/records/search',
  reason: 'Use /v1/records/search for richer filtering.',
})
async findAll() { ... }
```

---

## Adding a New Version (v2)

### 1. Create a v2 controller

```typescript
@Version('2')
@Controller('records')
export class RecordsV2Controller {
  @Get()
  findAll() {
    // new v2 response shape
  }
}
```

### 2. Register it in the module

```typescript
@Module({
  controllers: [RecordsController, RecordsV2Controller],
})
export class RecordsModule {}
```

### 3. Mark the v1 endpoint as deprecated

```typescript
@Get()
@DeprecatedRoute({
  sunsetDate: 'Wed, 01 Jan 2026 00:00:00 GMT',
  alternativeRoute: '/v2/records',
})
async findAllV1() { ... }
```

### 4. Update the versions registry

Add the new version to `src/versioning/api-version-lifecycle.policy.ts`:

```typescript
{
  version: '2',
  status: 'current',
  releaseDate: '2025-01-01',
  baseUrl: '/v2',
}
```

Every routable API version must have a lifecycle policy. If a request reaches a
versioned controller that is not listed in this registry, the request fails with
`500 Internal Server Error` so missing lifecycle policy is caught during release
testing instead of silently bypassing deprecation and removal rules.

### 5. Deprecate and remove old versions

When a version is superseded, update its policy:

```typescript
{
  version: '1',
  status: 'deprecated',
  releaseDate: '2024-01-01',
  baseUrl: '/v1',
  sunsetDate: 'Wed, 01 Jan 2027 00:00:00 GMT',
  replacementVersion: '2',
}
```

Deprecated versions return `Deprecation`, `Sunset`, and replacement `Link`
headers until the sunset date. After that date, or when status is changed to
`sunset`, the whole version returns `410 Gone`.

---

## Client Migration Checklist

- [ ] Update base URL from unversioned routes to `/v1/...` for explicitly versioned APIs
- [ ] Watch for `Deprecation: true` response headers — these signal upcoming breaking changes
- [ ] Check `Sunset` header for the removal date
- [ ] Follow the `Link` header to find the replacement endpoint
- [ ] Test against `/v2/` before the v1 sunset date

---

## Breaking vs Non-Breaking Changes

| Change type                 | Requires new version? |
| --------------------------- | --------------------- |
| Adding a new optional field | No                    |
| Adding a new endpoint       | No                    |
| Removing a field            | Yes                   |
| Changing a field type       | Yes                   |
| Changing HTTP status codes  | Yes                   |
| Removing an endpoint        | Yes (deprecate first) |
| Renaming a query parameter  | Yes                   |

---

## Architecture Notes

- `VERSION_NEUTRAL` is used for infrastructure endpoints: `GET /api`, `GET /health`, `GET /metrics`
- The global `DeprecationInterceptor` automatically injects deprecation headers and enforces `410 Gone` when route-level sunset dates are reached
- The global `ApiVersionLifecycleInterceptor` enforces version lifecycle policy (current/deprecated/sunset) for URI-prefixed versions and default-version requests without a `/v{n}` prefix
- `defaultVersion: ['1', VERSION_NEUTRAL]` keeps unversioned legacy controllers under the v1 lifecycle policy while allowing explicitly neutral infrastructure endpoints
