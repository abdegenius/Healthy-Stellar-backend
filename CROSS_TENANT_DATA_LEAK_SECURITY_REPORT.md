# Cross-Tenant Data Leak Security Report

**Status**: CRITICAL VULNERABILITY  
**Date**: 2026-04-27  
**Risk Level**: CRITICAL  
**Impact**: PHI/PII data exposure across tenant boundaries

---

## Executive Summary

The application uses a shared-schema multi-tenant architecture with inconsistent tenant filtering. Multiple data access paths **do not enforce tenant isolation**, allowing potential cross-tenant data leaks. An authenticated user from one tenant could access sensitive healthcare data from other tenants.

### Risk Categories
- **Authentication Bypass**: Tenant isolation not enforced at data layer
- **Data Confidentiality**: Medical records, timelines, version histories accessible across tenants
- **Compliance Violation**: HIPAA/GDPR violations
- **Business Impact**: Loss of trust, regulatory fines, legal liability

---

## Vulnerability Details

### 1. CRITICAL: Medical Records Timeline Access (getTimeline)

**File**: `src/medical-records/controllers/medical-records.controller.ts:58`

```typescript
async getTimeline(@Param('patientId') patientId: string, @Query('limit') limit?: number) {
  // ❌ NO TENANT FILTER - tenantId parameter missing
  return this.medicalRecordsService.getTimeline(patientId, limit || 50);
}
```

**Service Implementation** - `src/medical-records/services/medical-records.service.ts:272`

```typescript
async getTimeline(patientId: string, limit: number = 50): Promise<MedicalHistory[]> {
  // ❌ NO TENANT FILTERING
  return this.historyRepository.find({
    where: { patientId },  // only filters by patient, NOT by organization
    order: { eventDate: 'DESC' },
    take: limit,
  });
}
```

**Attack Scenario**: 
- Attacker authenticated as User from Tenant A
- Calls `GET /medical-records/timeline/{victim-patient-id}`
- Returns all medical history events for that patient, regardless of tenant
- If IDs are guessable, attacker can enumerate patients across organizations

**Data Exposed**: Complete medical event history

---

### 2. CRITICAL: Medical Record Version History (getVersions)

**File**: `src/medical-records/controllers/medical-records.controller.ts:89`

```typescript
async getVersions(@Param('id') id: string) {
  // ❌ NO TENANT FILTER - tenantId parameter missing
  return this.medicalRecordsService.getVersions(id);
}
```

**Service Implementation** - `src/medical-records/services/medical-records.service.ts:282`

```typescript
async getVersions(recordId: string): Promise<MedicalRecordVersion[]> {
  // ❌ NO TENANT FILTERING
  return this.versionRepository.find({
    where: { medicalRecordId: recordId },  // only filters by record, NOT by organization
    order: { versionNumber: 'DESC' },
  });
}
```

**Attack Scenario**:
- Attacker discovers a medical record ID from another tenant
- Calls `GET /medical-records/{record-id}/versions`
- Receives complete version history with encrypted medical details
- May allow differential analysis of encrypted data

**Data Exposed**: Encrypted medical record versions, timestamps of changes, creator information

---

### 3. CRITICAL: Medical Record Update Without Tenant Validation

**File**: `src/medical-records/controllers/medical-records.controller.ts:97`

```typescript
async update(
  @Param('id') id: string,
  @Body() updateDto: UpdateMedicalRecordDto,
  @CurrentUser() user: any,
  @Query('changeReason') changeReason?: string,
) {
  // ❌ NO TENANT EXTRACTION OR VALIDATION
  return this.medicalRecordsService.update(id, updateDto, userId, userName, changeReason);
}
```

**Service Implementation** - `src/medical-records/services/medical-records.service.ts:[update method]`

```typescript
async update(id: string, ...): Promise<MedicalRecord> {
  const record = await this.findOne(id);  // ❌ No organizationId passed to findOne
  // Update proceeds without tenant verification
}
```

**Attack Vector**: Update a patient's medical record from a different tenant

**Data Modified**: Any field in medical records

---

### 4. CRITICAL: Medical Record Deletion Without Tenant Check

**File**: `src/medical-records/controllers/medical-records.controller.ts:124`

```typescript
async delete(@Param('id') id: string, @CurrentUser() user: any) {
  // ❌ NO TENANT EXTRACTION OR VALIDATION
  await this.medicalRecordsService.delete(id, userId, user?.email);
}
```

**Attack Vector**: Soft-delete/destroy medical records from other tenants

---

### 5. HIGH: MedicalHistory Timeline Query

**File**: `src/medical-records/services/medical-records.service.ts`

```typescript
async getTimeline(patientId: string, limit: number = 50): Promise<MedicalHistory[]> {
  return this.historyRepository.find({
    where: { patientId },  // ❌ Missing organizationId filter
    order: { eventDate: 'DESC' },
    take: limit,
  });
}
```

---

### 6. HIGH: Patient Service Lack of Tenant Filtering

**File**: `src/patients/patients.service.ts`

Multiple methods lack tenant isolation:

| Method | Issue | Risk |
|--------|-------|------|
| `findById(id)` | No tenantId check | Direct patient data access |
| `findByMRN(mrn)` | No tenantId check | Patient lookup by identifier |
| `findAll(filters)` | User-supplied filters only | Scans all patients |
| `search(search)` | No tenantId check | Patient search across tenants |
| `detectDuplicate(dto)` | No tenantId check | Can find duplicates across tenants |
| `updateProfile(stellarAddress)` | Searches by blockchain address only | No tenant boundary |

---

## Root Cause Analysis

### 1. Inconsistent Tenant Context Usage

**Finding**: The application has `TenantContext` and `RequestContextMiddleware` infrastructure, but it's not consistently applied.

- ✅ `TenantContext.getTenantId()` available
- ✅ `RequestContextMiddleware` extracts tenant ID
- ✅ `@CurrentTenant()` decorator available
- ❌ Not ALL controller endpoints use it
- ❌ Services assume tenant is passed as parameter
- ❌ Some methods don't accept tenant parameter at all

### 2. Missing Automatic Tenant Scoping

The application lacks automatic scope filtering at the ORM level:
- No custom repository base class to auto-filter queries
- No hooks to enforce tenant context
- Manual tenant parameter passing is error-prone

### 3. Incomplete Parameter Propagation

When `@CurrentTenant()` is used, it's not consistently passed through the call chain:

```
Controller (@CurrentTenant) 
  → Service (tenantId parameter?) 
    → Repository (uses tenantId?)
```

Some methods are missing intermediate parameters.

---

## Attack Scenarios

### Scenario 1: Cross-Tenant Patient Data Theft

```
1. Attacker at Hospital A authenticates
2. Discovers Hospital B's patient ID (enumeration or inference)
3. Calls GET /medical-records/timeline/{patient-id}
4. Receives complete medical timeline without authorization
5. Exfiltrates sensitive medical history
```

### Scenario 2: Medical Record Manipulation

```
1. Attacker identifies medical record ID from another tenant
2. Calls PUT /medical-records/{id} with falsified data
3. Successfully corrupts medical record integrity
4. Patient safety and data integrity compromised
```

### Scenario 3: Version History Analysis

```
1. Attacker obtains medical record IDs (via enumeration, inference, or leak)
2. Calls GET /medical-records/{id}/versions
3. Sees encrypted fields with timing metadata
4. Performs timing/pattern analysis attack on encrypted data
```

---

## Affected Entities & Schemas

| Entity | Tenant Field | Risk |
|--------|--------------|------|
| MedicalRecord | `organizationId` | CRITICAL - No filter in timeline/versions |
| MedicalHistory | `patientId` (NO organizationId) | CRITICAL - Missing tenant column |
| MedicalRecordVersion | `medicalRecordId` (NO organizationId) | CRITICAL - Missing tenant column |
| Patient | `?(need verification)` | HIGH - No tenant filtering |
| MedicalAttachment | `?(need verification)` | HIGH |
| MedicalRecordConsent | `sharedWithOrganizationId` | HIGH - Only for consent, not main record |

---

## 7. HIGH: Read Model Rebuilds Cause Database Overload & Inconsistent Data

**Risk Level**: HIGH  
**Category**: Operational Security & Data Integrity

### Problem Statement

Rebuilds of read models (projections, caches, materialized views) can cause several critical issues:

1. **Database Overload**: Full table scans and bulk writes during rebuild operations consume excessive database resources
2. **Inconsistent Read Models**: During rebuild operations, some clients receive stale or partially-rebuilt data
3. **Amplified Tenant Isolation Bypass**: If rebuild logic doesn't respect tenant boundaries, can inadvertently expose data across tenants
4. **Extended Vulnerability Window**: Rebuilds requiring long-running transactions increase the window for exploitation

### Specific Concerns

**Concurrent Read Access During Rebuild**:
```
Timeline:
T0: Rebuild starts, acquires read lock
T1: Client A queries read model (gets old/partial data)
T2: Rebuild writes new data
T3: Client B queries read model (might see inconsistent mix of old/new)
Tn: Rebuild completes, new state stabilized
```

**Database Connection Exhaustion**:
- Long-running rebuild transactions hold connections
- Connection pool exhausted → new requests queued or timeout
- Service becomes non-responsive during high-load rebuilds
- Cascading failures if multiple tenants trigger rebuilds simultaneously

**Tenant Data Leakage Risk**:
- If rebuild logic doesn't filter by tenant ID, could inadvertently load/expose data from other tenants
- Partial rebuilds stopping mid-operation may leave inconsistent state visible to unauthorized tenants

### Current Implementation Gaps

- ⚠️ No analysis of rebuild operations in codebase for tenant filtering
- ⚠️ No rate limiting or throttling on rebuild triggers
- ⚠️ No isolation between tenant rebuilds (shared database)
- ⚠️ No monitoring for rebuild duration or database impact
- ⚠️ No consistent read model versioning/staging during rebuilds

### Recommendations

1. **Implement Rebuild Governance**:
   - Add tenant ID filtering to all rebuild queries
   - Per-tenant rebuild throttling (one active rebuild per tenant)
   - Rebuild queue with backoff strategy

2. **Improve Read Model Consistency**:
   - Use staging tables: rebuild in parallel table, atomic swap on completion
   - Add rebuild version tracking to identify stale data
   - Implement eventual consistency protocol with version vectors

3. **Monitor & Alert**:
   - Track rebuild duration and database load impact
   - Alert if rebuild exceeds SLA (e.g., > 5 minutes)
   - Monitor connection pool exhaustion during rebuilds

4. **Database-Level Safeguards**:
   - Add statement timeouts for rebuild operations
   - Implement rebuild query budget limits
   - Use read-only replicas for rebuild source data if possible

---

## Compliance Violations

### HIPAA
- **Standard 164.312(a)(2)(i) - Access Controls**: Not implemented
- **Standard 164.312(a)(2)(ii) - Audit Controls**: Audit not tenant-aware
- **Enforcement Rule 45 CFR 164.412**: Access logs may cross tenants

### GDPR
- **Article 5(1)(a) - Lawful Basis**: Data breach due to inadequate controls
- **Article 32 - Security**: Proper isolation not implemented
- **Article 33 - Breach Notification**: May require notification

### Regional Health Data Laws
- Most jurisdictions require explicit tenant/organization boundaries
- Data residency laws may be violated

---

## Fix Priority & Roadmap

### Phase 1: IMMEDIATE (Critical Data Access Paths)
1. ✋ Add organizationId filter to `getTimeline()` service
2. ✋ Add organizationId filter to `getVersions()` service  
3. ✋ Add organizationId extraction to update/delete/archive controllers
4. ✋ Add organizationId validation to service methods

### Phase 2: SHORT-TERM (Medical Records Service)
5. Add organizationId parameter to all public service methods
6. Modify entity schema to add organizationId where missing
7. Add database indexes on (organizationId, patientId)
8. Create base repository class with auto-scoping

### Phase 3: MEDIUM-TERM (Audit & Testing)
9. Create integration tests for tenant isolation
10. Add security regression tests
11. Implement audit trail for cross-tenant requests
12. Security audit of Patient service
13. Review all data access patterns

### Phase 4: LONG-TERM (Architecture)
14. Implement mandatory TenantContext enforcement
15. Create automatic query filtering at ORM level
16. Move to separate-schema isolation for high-security tenants
17. Implement row-level security (RLS) at database layer

---

## Immediate Actions Required

### Step 1: Stop the Bleeding
1. Add `@CurrentTenant()` to all data-access endpoints
2. Validate tenant ID before executing service methods
3. Add runtime tenant checks

### Step 2: Add Database-Level Safeguards
1. Add NOT NULL constraints on organizationId columns
2. Add unique constraints like `(organizationId, patientId, mrn)`
3. Verify existing data for null organizationIds

### Step 3: Comprehensive Testing
1. Add security tests for tenant isolation
2. Test with multiple authenticated users from different orgs
3. Verify no cross-tenant data leaks

---

## Verification Checklist

- [ ] All query methods have `organizationId` filter
- [ ] All controllers extract and validate tenantId
- [ ] All service methods accept organizationId parameter
- [ ] Database constraints prevent null organizationId
- [ ] Security tests verify tenant isolation
- [ ] Audit logs track cross-tenant attempts
- [ ] Documentation updated

---

## Related Files for Review

**High Priority**:
- `src/medical-records/controllers/medical-records.controller.ts`
- `src/medical-records/services/medical-records.service.ts`
- `src/patients/patients.service.ts`
- `src/patients/controllers/patients.controller.ts`

**Medium Priority**:
- `src/common/middleware/request-context.middleware.ts`
- `src/tenant/context/tenant.context.ts`
- `src/tenant/decorators/current-tenant.decorator.ts`
- `src/tenant/guards/tenant.guard.ts`

**Database**:
- Migration: Add organizationId to MedicalHistory
- Migration: Add organizationId to MedicalRecordVersion
- Migration: Add NOT NULL constraints
- Indexes: Verify covering indexes exist

---

## References

1. OWASP: Broken Access Control
2. OWASP Top 10 2021 - A01:2021 – Broken Access Control
3. CWE-639: Authorization Bypass Through User-Controlled Key
4. HIPAA Security Rule § 164.312(a)(2)(i)
5. GDPR Article 32 - Security of Processing

---

## Sign-Off

**Report Generated**: 2026-04-27  
**Severity**: 🔴 CRITICAL  
**Remediation Required**: IMMEDIATELY  
**Estimated Fix Time**: 4-8 hours  

This vulnerability requires immediate remediation. Do not deploy new features until tenant isolation is properly enforced across all data access paths.
