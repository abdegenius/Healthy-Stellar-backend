# KEY_ROTATION_RUNBOOK.md
## AES-256-GCM / KMS KEK Rotation Runbook

**Applies to:** Healthy-Stellar backend – medical attachment encryption  
**HIPAA reference:** §164.312(a)(2)(iv) – Encryption and Decryption  
**Last reviewed:** 2024-01-01  
**Review cadence:** Quarterly

---

## 1. Background

Each uploaded file is encrypted with a unique 256-bit **Data Encryption Key (DEK)**.  
The DEK is immediately wrapped (encrypted) by a tenant-specific **Key Encryption Key (KEK)** stored in AWS KMS.  
Only the _wrapped_ DEK is persisted in the database; the plaintext DEK is discarded after the upload.

```
File bytes  ──AES-256-GCM──►  Ciphertext  (stored in S3 / local storage)
Plaintext DEK  ──KMS Encrypt──►  encryptedDek  (stored in medical_attachments)
```

**On KEK rotation**, only the `encryptedDek` column is updated. The ciphertext in S3 is _never_ touched.

---

## 2. Pre-rotation Checklist

- [ ] Confirm the new KMS CMK exists **or** confirm AWS automatic rotation is enabled on the existing CMK.  
- [ ] Verify IAM role `hs-backend-role` has `kms:Decrypt` on the _old_ CMK and `kms:Encrypt` / `kms:GenerateDataKey` on the _new_ CMK.  
- [ ] Notify the security team and log the planned rotation window in the change management system.  
- [ ] Confirm no active uploads are in flight (check application logs / CloudWatch metrics).  
- [ ] Take a snapshot / point-in-time backup of the `medical_attachments` table.

---

## 3. Rotation Steps

### Step 1 – Verify the current state

```bash
curl -s -X GET \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://api.healthy-stellar.io/admin/tenants/$TENANT_ID/kek-status | jq
```

Expected (all rows on current version, e.g. `v1717000000000`):

```json
[{ "kekVersion": "v1717000000000", "count": 1842 }]
```

### Step 2 – Trigger rotation

**Option A – Same CMK ARN (AWS automatic key rotation)**

```bash
curl -s -X POST \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  https://api.healthy-stellar.io/admin/tenants/$TENANT_ID/rotate-kek
```

**Option B – New CMK ARN**

```bash
curl -s -X POST \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"newKekArn": "arn:aws:kms:us-east-1:123456789012:key/new-cmk-id"}' \
  https://api.healthy-stellar.io/admin/tenants/$TENANT_ID/rotate-kek
```

Expected response:

```json
{
  "tenantId": "...",
  "newKekVersion": "v1717001000000",
  "totalAttachments": 1842,
  "rewrapped": 1842,
  "failed": 0,
  "skipped": 0,
  "durationMs": 12400
}
```

### Step 3 – Verify completion

```bash
curl -s -X GET \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://api.healthy-stellar.io/admin/tenants/$TENANT_ID/kek-status | jq
```

**Success:** Only one `kekVersion` entry matching the value in the rotation response.

**Partial failure:** Multiple `kekVersion` values – rows that failed were not updated.  
In that case, re-run Step 2. The operation is idempotent; already-rotated rows are skipped.

### Step 4 – Post-rotation verification

- [ ] Confirm all rows show the new `kek_version` via the status endpoint.
- [ ] Download a sample attachment and verify it decrypts correctly.
- [ ] Check CloudWatch / Datadog for `KMS Decrypt` error metrics in the 30 minutes following rotation.
- [ ] If `failed > 0` after two retries, escalate to the security team.

### Step 5 – Schedule the old key for deletion (only for Option B)

Retain the old CMK for a minimum of **7 days** after successful rotation in case a rollback is needed.

```bash
# Schedule deletion (minimum 7-day waiting period enforced by KMS)
aws kms schedule-key-deletion \
  --key-id arn:aws:kms:us-east-1:123456789012:key/old-cmk-id \
  --pending-window-in-days 7
```

---

## 4. Rollback Procedure

If the new KMS CMK must be abandoned _before_ the old CMK is deleted:

1. Re-run rotation with the old CMK ARN passed as `newKekArn`.
2. Once all rows are back on the old version, cancel the new CMK deletion:

```bash
aws kms cancel-key-deletion --key-id arn:aws:kms:us-east-1:...:key/new-cmk-id
```

---

## 5. Rotation Frequency (HIPAA Guidance)

| Trigger                         | Action                          |
|---------------------------------|---------------------------------|
| Routine (annually)              | Enable AWS automatic CMK rotation; run re-wrap |
| Suspected key compromise        | Immediate rotation; notify HIPAA Security Officer |
| Staff termination (key custodian) | Rotate within 24 h            |
| Vendor / integration change     | Rotate before decommissioning old integration |

---

## 6. Audit Trail

Every rotation is logged to:

- **Application logs** – `KekRotationService` prefixed lines in CloudWatch
- **AWS CloudTrail** – `kms:Decrypt`, `kms:Encrypt` events with `RequestID` linkable to the rotation job
- **Database** – `tenants.kek_rotated_at` updated on each successful rotation

---

## 7. Contacts

| Role                  | Contact                          |
|-----------------------|----------------------------------|
| HIPAA Security Officer | security@healthy-stellar.io     |
| Platform On-call       | #platform-oncall (Slack)        |
| AWS Account Owner      | devops@healthy-stellar.io       |