# ScrollSense PocketBase Schema

When you run PocketBase (either locally or on Northflank), you need to manually create these collections in the Admin UI.

Go to your PocketBase Admin UI (`/_/`) -> Settings -> Sync -> Import collections and paste the following JSON, or manually create them:

## Collections Setup

### 1. `users` collection

Create a new collection named `users` (Type: **Base**).
Add the following fields:
- `phone` (Text, Required, Unique constraint)
- `name` (Text)
- `city` (Text)
- `age` (Number)
- `profession` (Text)
- `onboarding_step` (Number)
- `points` (Number)

*Under API Rules, click the unlock icon to make them green ("" is fine for now, or tighten if needed later).*

---

### 2. `reels` collection

Create a new collection named `reels` (Type: **Base**).
Add the following fields:
- `user` (Relation -> points to `users` collection, Single value)
- `raw_message` (Text)
- `reel_url` (URL)
- `platform` (Text)
- `creator_handle` (Text)
- `caption` (Text)
- `hashtags` (JSON)
- `niche` (Text)

*Under API Rules, click the unlock icon to make them green.*

---

### 3. `reports` collection

Create a new collection named `reports` (Type: **Base**).
Add the following fields:
- `demographic_filter` (JSON)
- `summary` (JSON)
- `sent_to` (JSON)

*Under API Rules, click the unlock icon to make them green.*
