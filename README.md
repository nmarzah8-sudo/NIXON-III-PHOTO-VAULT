# Nixon III Photo Vault

Private family photo archive frontend. Supabase Auth is used for the existing administrator account; protected pages verify the signed-in UUID against `public.admins`.

## Administrator photo upload

The dashboard upload area accepts image files and uploads their original browser `File` objects to the existing private `photos` Storage bucket. It then creates an idempotent metadata record in the existing `public.photos` table. The signed-in user's UUID supplies both the Storage path's first directory and `user_id`; Supabase Auth and existing RLS/Storage policies remain the security boundary.

If Storage upload succeeds but metadata creation fails, the dashboard reports that distinction and retains the operation's record ID and Storage path. Retrying saves metadata without uploading another copy. This phase does not implement gallery loading, deletion, sharing, downloads, or image derivatives.

The approved interface portrait at `assets/images/identity/BackgroundEraser_20261001_212350469.png` is intentionally included for public website display. Do not add uploaded or other private original photos to Git or public deployments; they belong in the private Supabase Storage bucket.
