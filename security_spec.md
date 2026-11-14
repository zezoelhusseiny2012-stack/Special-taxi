# Special Taxi — Firestore Security Specification

## 1. Data Invariants
1. **Booking Ownership & Creation**: A booking document under `/bookings/{bookingId}` can only be created by an authenticated, email-verified user (`request.auth.token.email_verified == true`), with `customerId == request.auth.uid`, initial `status == 'pending'`, and server-enforced timestamps (`createdAt == request.time`, `updatedAt == request.time`).
2. **Terminal State Locking**: Once a booking reaches `'completed'`, `'declined'`, or `'cancelled'`, neither the customer nor the driver may mutate its status or fields (only a verified Admin may intervene if needed).
3. **Immortal Identity & Fare Fields**: After creation, `code`, `customerId`, `pickup_lat`, `pickup_lng`, `destination_lat`, `destination_lng`, `distance_km`, `fare`, and `createdAt` cannot be altered by customers or drivers.
4. **PII Isolation**: `/users/{userId}` and `/drivers/{driverId}` contain personal contact info (`email`, `phone`, `whatsapp`) and are never exposed via blanket `isSignedIn()` reads. Users read only their own `/users/{userId}` document; `/drivers/primary` is readable only by verified Admin or the assigned Driver.
5. **Admin & Driver Privilege Integrity**: Users cannot self-assign admin or driver privileges in `/users/{userId}` or write to `/settings/pricing` or `/drivers/primary`. Only verified Admin (`admins/{uid}` or bootstrapped owner email with `email_verified == true`) can mutate pricing settings and driver profiles.

## 2. The "Dirty Dozen" Adversarial Payloads
All 12 payloads below MUST fail with `PERMISSION_DENIED`:
1. **Unauthenticated Booking Create**: Create `/bookings/ST-9001` with `request.auth == null`.
2. **Unverified Email Spoof**: Create `/bookings/ST-9001` or read `/drivers/primary` with `email: "zezoelhusseiny2012@gmail.com"` and `email_verified: false`.
3. **Identity Spoofing on Create**: Signed-in user `uid: "userA"` tries to create `/bookings/ST-9002` with `customerId: "userB"`.
4. **State Shortcutting on Create**: Signed-in user tries to create `/bookings/ST-9003` with `status: "accepted"` or `status: "completed"`.
5. **Shadow / Ghost Field Injection**: Signed-in user includes `"isAdmin": true` or `"discountOverride": 100` in `/bookings/ST-9004` create or update.
6. **Client Timestamp Forgery**: Create `/bookings/ST-9005` with `createdAt` set to a past client timestamp instead of `request.time`.
7. **ID Poisoning**: Create `/bookings/invalid$id!with*spaces` or a 500-character document ID.
8. **Value Poisoning (Oversized String)**: Update/create booking with `notes` of 5,000 characters (exceeds 500 char limit) or `fare: -50`.
9. **Customer Tampering with Fare/Status**: Customer tries to update their own pending booking's `fare` or set `status: "accepted"`.
10. **Terminal State Resurrection**: Driver or customer tries to update a `'completed'` or `'cancelled'` booking back to `'pending'` or `'accepted'`.
11. **PII Blanket Read**: Non-owner signed-in user tries to `get` `/users/otherUserId` or `/drivers/primary` or `list` `/bookings` without filtering by `customerId == request.auth.uid`.
12. **Privilege Escalation on Settings**: Non-admin signed-in user tries to update `/settings/pricing` (`base_fare: 0`) or `/admins/{myUid}`.
