# Photo storage and transfer

New photo uploads use two browser-generated files from the current edit canvas:
- Board image: WebP, longest edge at most 1000 px, target 300 KB. The encoder stops reducing quality at 0.72 and resolution at 800 px (smaller source images are never enlarged). The target is soft: a larger result is allowed up to the existing 1.6 MB API limit to preserve detail.
- List thumbnail: WebP, longest edge at most 320 px, target 40 KB, hard limit 120 KB. PNG is accepted as a transparent fallback when a browser cannot encode WebP.
- Saved look previews: JPEG, longest edge at most 760 px, target 150 KB. Downloaded board images retain the existing 900 × 1140 output.

The browser starts every attempt from the canvas pixels, not the previous lossy encoded result. No paid image processing API or new production dependency is added. Background removal, crop, erase and restoration continue to operate on the existing edit canvas.

## Database and API

Apply `pnpm db:migrate` before deploying. Migration `202610240002_thumbnails.sql` adds nullable `thumbnail_key` / `thumbnail_mime` columns and ownership/consistency checks. Existing rows and original photo objects are not rewritten.

`PUT /api/garments/:id` accepts an optional `thumbnail` data URL. Main and thumbnail are linked in one database transaction; the existing Storage compensation layer cleans up new objects on failure. Garment deletion removes both objects after commit. Existing clients that omit thumbnails still work.

`GET /api/garments/:id/thumbnail` serves the thumbnail, falling back to the original for legacy records. `PUT` on that route adds a missing thumbnail only, under the same per-user transaction lock. Repeated and concurrent backfills reuse the first stored thumbnail. A request cannot replace another account's data.

The library response includes `thumbnail` (URL) and `hasThumbnail` (boolean). Lists, recommendation cards and small selection previews use the thumbnail; the board, photo edit preview and board export use the full image.

## Existing photos

The closet's “기존 사진 목록 최적화” action processes missing thumbnails sequentially, including hidden garments. It downloads each original once, creates a thumbnail in the browser and uploads it. The user can stop after the current photo and resume later. Completed work survives reloads. Errors stop the batch; originals and saved looks are not changed. This adds a small file per existing photo and therefore slightly increases existing storage while reducing future list transfers.

## Private caching

Image and saved-look-preview GETs return `Cache-Control: private, no-cache`, `Vary: Cookie`, and an ETag derived from the immutable object key and MIME. Authentication and ownership checks precede conditional handling. A matching `If-None-Match` returns 304 without downloading the object from Supabase. Other accounts, logged-out visitors and deleted records never receive a successful conditional response for an unauthorized image.

The runtime preserves these headers only for 200/304 responses explicitly marked as revalidating images. JSON, auth and errors retain `private, no-store`. Images are not made public or cached on a shared CDN. Revalidation still invokes the Node API and authentication; it reduces bytes, not all request counts. Browser cache eviction, account-cookie changes and hard refreshes can require another full transfer.

## Verification

53 automated tests passed, including ownership, conditional GET without Storage reads, duplicate/concurrent backfills, rollback cleanup, legacy clients, size limits and encoding quality floors. Next.js build and syntax checks passed. DOM flow checks with a native canvas adapter covered new uploads, backfill, list/board source selection and saved-preview dimensions. No physical mobile-browser test was performed in this environment.

On the three bundled sample images, using a native canvas encoder as a local benchmark (browser encoders can differ):

| Sample | Previous WebP q90 | New board image | List thumbnail |
| --- | ---: | ---: | ---: |
| tee | 70,300 B | 54,846 B | 10,462 B |
| jeans | 180,010 B | 131,740 B | 16,886 B |
| sneakers | 162,544 B | 120,054 B | 20,230 B |

Transparent and opaque pixels were verified after decoding the thumbnails. These samples are not a guarantee for user photos or free-tier capacity. Track actual Storage bytes and egress after deployment.
