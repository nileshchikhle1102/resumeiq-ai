# Security Specification: ATS Resume Studio Firestore Rules

## 1. Data Invariants
1. **Strict Ownership**: Every document in `/users/{userId}` and its subcollections (`/drafts`, `/jobs`, `/reports`, `/settings`) belongs exclusively to `userId` (`request.auth.uid == userId`), and every subcollection document stores an immutable `ownerId == request.auth.uid`.
2. **Verified Email Mandate**: Only authenticated users with `request.auth.token.email_verified == true` may read or write any document.
3. **Master Gate Parent Link**: No draft, job target, report, or settings document may be created or updated unless the parent `/users/{userId}` document exists.
4. **Temporal & Identity Integrity**: `ownerId`/`uid` and `createdAt` are immutable after creation; `createdAt` (on create) and `updatedAt` (on create & update) must equal `request.time`.
5. **Bounded Payloads**: Every string, array, and ID has strict `.size()` and regex (`^[a-zA-Z0-9_-]+$`) limits; no shadow fields are allowed (`keys().hasOnly(...)` on create and `affectedKeys().hasOnly(...)` on update).

## 2. Adversarial "Dirty Dozen" Payloads (Expected: PERMISSION_DENIED)
1. Unauthenticated read or write on `/users/{uid}/drafts/{draftId}`.
2. Unverified email token (`email_verified: false`) attempting create/update/read.
3. Cross-user read (`uidA` reading `/users/{uidB}` or `/users/{uidB}/drafts/{id}`).
4. Identity spoofing on create (`ownerId: "other_uid"` under `/users/{myUid}/drafts/{id}`).
5. Shadow field injection (`isAdmin: true` or `role: "superuser"` added to `/users/{uid}` or draft payload).
6. ID poisoning (path parameter `draftId` exceeding 128 chars or containing invalid chars like `$` or spaces).
7. Timestamp spoofing (`createdAt` or `updatedAt` passed as client-controlled timestamp instead of `request.time`).
8. Immutable field mutation (`ownerId` or `createdAt` modified on update).
9. Oversized payload / Denial of Wallet (`summary` > 4000 chars or `experiences` array > 30 items or `description` > 20000 chars).
10. Invalid enum injection (`templateId: "hacker"` or `engine: "unknown-model"` or `overallScore: 150`).
11. Orphaned subcollection write (creating `/users/{uid}/drafts/{id}` when `/users/{uid}` does not exist).
12. Broad collection listing without owner filter (`list` on `/users/{otherUid}/drafts`).
