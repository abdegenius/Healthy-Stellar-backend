# Requirements Document

## Introduction

The Healthy-Stellar-backend repository ships a `.env.example` file and a README Configuration section to help developers configure the application. A code audit identified approximately 12 environment variables that are actively read by source files but are absent from `.env.example`, and the README Configuration section lists only 10 variables with no grouping or context.

This feature closes that gap by:
1. Appending the missing variables (with comments and placeholder values) to `.env.example` without deleting or rewriting any existing content.
2. Replacing the thin README Configuration section with a grouped reference table that covers all variable groups and points readers to `.env.example` for the canonical list.

No application code is changed; this is purely a configuration and documentation update.

## Glossary

- **Env_File**: The `.env.example` file at the repository root that serves as the canonical template for environment configuration.
- **Readme_Config_Section**: The "Configuration" section inside `README.md` that summarises environment variables for developers.
- **Missing_Variable**: An environment variable read by source code (`process.env.*` or `configService.get(...)`) that is absent from the current Env_File.
- **Placeholder_Value**: A non-secret example value (e.g. `your_value_here`, `http://localhost:3000`) that communicates the expected format without exposing real credentials.
- **Variable_Group**: A logical category of related variables (e.g. Application, Database, OIDC) used to organise both the Env_File and the Readme_Config_Section.
- **Comment**: An inline `#`-prefixed line in the Env_File that explains a variable's purpose and whether it is required or optional.

## Requirements

### Requirement 1: Append Missing CORS and Frontend Variables

**User Story:** As a developer setting up the application for the first time, I want all CORS and frontend-redirect variables documented in `.env.example`, so that I can configure cross-origin behaviour without hunting through source code.

#### Acceptance Criteria

1. THE Env_File SHALL contain an entry for `CORS_CREDENTIALS` with a Comment stating it controls whether the CORS layer sends credentials headers and that it is optional (defaults to `false`), and a Placeholder_Value of `false`.
2. THE Env_File SHALL contain an entry for `FRONTEND_URL` with a Comment stating it is the post-login redirect base URL used by the OIDC callback and that it is optional (defaults to `/`), and a Placeholder_Value of `http://localhost:4200`.
3. WHEN `CORS_CREDENTIALS` or `FRONTEND_URL` already exist anywhere in the Env_File, THE Env_File SHALL NOT contain a duplicate entry for that variable.

### Requirement 2: Append Missing Application URL Variable

**User Story:** As a developer configuring email notifications and tenant provisioning, I want `APP_URL` documented in `.env.example`, so that I know what base URL the application uses when constructing links in emails and tenant welcome messages.

#### Acceptance Criteria

1. THE Env_File SHALL contain an entry for `APP_URL` with a Comment stating it is the public base URL of the application used in email links and tenant provisioning, that it is required in production, and a Placeholder_Value of `http://localhost:3000`.
2. THE Env_File SHALL contain an entry for `APP_DOMAIN` with a Comment stating it is the base URL used when generating QR-code share links for records, that it is optional (defaults to `https://app.domain.com`), and a Placeholder_Value of `https://app.yourdomain.com`.
3. WHEN `APP_URL` or `APP_DOMAIN` already exist anywhere in the Env_File, THE Env_File SHALL NOT contain a duplicate entry for that variable.

### Requirement 3: Append Missing Swagger Basic-Auth Variables

**User Story:** As a developer deploying to a staging environment, I want `SWAGGER_USER` and `SWAGGER_PASS` documented in `.env.example`, so that I can protect the Swagger UI with basic authentication without reading the source code.

#### Acceptance Criteria

1. THE Env_File SHALL contain an entry for `SWAGGER_USER` with a Comment stating it is the basic-auth username for the Swagger UI when `NODE_ENV=staging`, that it is optional (defaults to `admin`), and a Placeholder_Value of `devteam`.
2. THE Env_File SHALL contain an entry for `SWAGGER_PASS` with a Comment stating it is the basic-auth password for the Swagger UI when `NODE_ENV=staging`, that it is optional (defaults to `secret`), and a Placeholder_Value of `change_me_in_staging`.
3. WHEN `SWAGGER_USER` already exists anywhere in the Env_File, THE Env_File SHALL NOT add a duplicate `SWAGGER_USER` entry, but SHALL still add `SWAGGER_PASS` if it does not already exist.
4. WHEN `SWAGGER_PASS` already exists anywhere in the Env_File, THE Env_File SHALL NOT add a duplicate `SWAGGER_PASS` entry, but SHALL still add `SWAGGER_USER` if it does not already exist.

### Requirement 4: Append Missing OIDC Provider Variables

**User Story:** As a developer integrating an external identity provider, I want the OIDC provider convention fully documented in `.env.example`, so that I can configure one or more providers without reading `oidc.config.ts`.

#### Acceptance Criteria

1. THE Env_File SHALL contain an entry for `OIDC_PROVIDERS` with a Comment stating it is a comma-separated list of provider names (e.g. `azure,okta`) and that it is optional (empty disables OIDC), and a Placeholder_Value of `azure,okta`.
2. THE Env_File SHALL contain example per-provider entries using the `azure` provider name as the example prefix, covering: `OIDC_AZURE_ISSUER`, `OIDC_AZURE_CLIENT_ID`, `OIDC_AZURE_CLIENT_SECRET`, `OIDC_AZURE_REDIRECT_URI`, `OIDC_AZURE_SCOPE`, `OIDC_AZURE_AUTHORIZATION_URL`, `OIDC_AZURE_TOKEN_URL`, `OIDC_AZURE_JWKS_URI`.
3. THE Comment for `OIDC_AZURE_CLIENT_SECRET` SHALL state that it is a secret and that the Placeholder_Value must be replaced before deployment.
4. THE Comment for `OIDC_AZURE_AUTHORIZATION_URL`, `OIDC_AZURE_TOKEN_URL`, and `OIDC_AZURE_JWKS_URI` SHALL state that these are optional and used only when skipping OIDC discovery.
5. WHEN any of the OIDC variables already exist anywhere in the Env_File, THE Env_File SHALL NOT contain a duplicate entry for that variable.

### Requirement 5: Append Missing Telemedicine Base URL Variable

**User Story:** As a developer enabling the telemedicine module, I want `TELEMEDICINE_BASE_URL` documented in `.env.example`, so that I know what value to set for the telemedicine service endpoint.

#### Acceptance Criteria

1. THE Env_File SHALL contain an entry for `TELEMEDICINE_BASE_URL` with a Comment stating it is the base URL for the external telemedicine service, that it is required when `TELEMEDICINE_ENABLED=true`, and a Placeholder_Value of `https://telemedicine.example.com`.
2. WHEN `TELEMEDICINE_BASE_URL` already exists anywhere in the Env_File, THE Env_File SHALL NOT contain a duplicate entry for that variable.

### Requirement 6: Append Missing Test Database Variables

**User Story:** As a developer running end-to-end tests, I want the test database variables documented in `.env.example`, so that I can configure the isolated test database without reading the test setup code.

#### Acceptance Criteria

1. THE Env_File SHALL contain entries for `TEST_DB_HOST`, `TEST_DB_PORT`, `TEST_DB_USERNAME`, `TEST_DB_PASSWORD`, and `TEST_DB_NAME` grouped together under a Testing section.
2. EACH of the five test database entries SHALL have a Comment stating the variable is used by the E2E test suite and is optional (safe defaults are provided in code).
3. THE Placeholder_Value for `TEST_DB_HOST` SHALL be `localhost`, for `TEST_DB_PORT` SHALL be `5433`, for `TEST_DB_USERNAME` SHALL be `test_user`, for `TEST_DB_PASSWORD` SHALL be `test_password`, and for `TEST_DB_NAME` SHALL be `healthy_stellar_test`.
4. WHEN any of the five test database variables already exist anywhere in the Env_File, THE Env_File SHALL NOT contain a duplicate entry for that variable.

### Requirement 7: Append Missing Stellar Integration Test Flag

**User Story:** As a developer running live Stellar integration tests, I want `STELLAR_INTEGRATION` documented in `.env.example`, so that I understand how to opt in to the live test suite without reading the test file header.

#### Acceptance Criteria

1. THE Env_File SHALL contain an entry for `STELLAR_INTEGRATION` with a Comment stating it gates the live Stellar integration test suite, that setting it to `true` requires a funded Testnet account and a deployed contract, and that it is optional (defaults to `false` / tests are skipped).
2. THE Placeholder_Value for `STELLAR_INTEGRATION` SHALL be `false`.
3. WHEN `STELLAR_INTEGRATION` already exists anywhere in the Env_File, THE Env_File SHALL NOT contain a duplicate entry for that variable.

### Requirement 8: Append Missing OpenTelemetry OTLP Variables

**User Story:** As a developer configuring distributed tracing, I want `OTEL_EXPORTER_OTLP_HEADERS` and `OTEL_EXPORTER_OTLP_TIMEOUT` documented in `.env.example`, so that I can configure authenticated OTLP exporters without reading `src/tracing.ts`.

#### Acceptance Criteria

1. THE Env_File SHALL contain an entry for `OTEL_EXPORTER_OTLP_HEADERS` with a Comment stating it is an optional JSON object of HTTP headers sent to the OTLP collector (e.g. for API-key authentication), and a Placeholder_Value of `{}`.
2. THE Env_File SHALL contain an entry for `OTEL_EXPORTER_OTLP_TIMEOUT` with a Comment stating it is the OTLP exporter timeout in milliseconds, that it is optional (defaults to `10000`), and a Placeholder_Value of `10000`.
3. WHEN `OTEL_EXPORTER_OTLP_HEADERS` or `OTEL_EXPORTER_OTLP_TIMEOUT` already exist anywhere in the Env_File, THE Env_File SHALL NOT contain a duplicate entry for that variable.

### Requirement 9: Comment and Placeholder Quality

**User Story:** As a developer reading `.env.example`, I want every variable entry to have a clear comment and a safe placeholder value, so that I can understand what each variable does and safely copy the file without accidentally using real secrets.

#### Acceptance Criteria

1. THE Env_File SHALL NOT contain any real secret values; all secret-type variables (passwords, keys, tokens) SHALL use Placeholder_Values that contain the word `change_me`, `your_`, or `example` to signal they must be replaced.
2. WHEN a variable is required in production, THE Comment for that variable SHALL include the word `REQUIRED`.
3. WHEN a variable is optional, THE Comment for that variable SHALL include the word `optional` and SHALL state the default value.
4. THE Env_File SHALL use `#`-prefixed lines exclusively for Comments; no other comment syntax SHALL be used.

### Requirement 10: README Configuration Section Expansion

**User Story:** As a developer reading the README, I want the Configuration section to provide a grouped summary of all variable categories with a reference to `.env.example`, so that I can quickly understand the configuration surface without opening the env file.

#### Acceptance Criteria

1. THE Readme_Config_Section SHALL begin with a sentence directing readers to copy `.env.example` as the canonical configuration reference.
2. THE Readme_Config_Section SHALL contain a grouped summary table with at minimum the following Variable_Groups as rows: Application, Database, Redis, Stellar, IPFS, Auth/JWT, OIDC, CORS, Logging/Tracing, Backup, Feature Flags, Testing.
3. EACH row in the summary table SHALL include the Variable_Group name, the key variables in that group, and a brief description of the group's purpose.
4. THE Readme_Config_Section SHALL replace the existing thin 10-variable list without removing any other section of the README.
5. WHEN the README uses markdown heading levels, THE Readme_Config_Section SHALL maintain the same heading level (`##`) as the existing Configuration section.
6. THE Readme_Config_Section SHALL NOT break any existing markdown anchor links referenced in the README Table of Contents.
