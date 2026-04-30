---
name: carfluent
description: Use for Carfluent dealer management — view dealers, manage inventory, staff, CTAs, coupons, social links, media gallery, branding. Triggers: "list carfluent dealers", "add staff to dealer", "update logo", "get vehicles". Runs inline — can ask for confirmation.
---

# Carfluent Partner API Skill

Interact with Carfluent dealer management platform using the Partner API. You have full conversation context and can ask Matt for confirmation or clarification as needed.

---

## Auth

Read from env:
- `CARFLUENT_API_KEY` — bearer token for partner access

Required headers:
- `Authorization: Bearer $CARFLUENT_API_KEY`
- `Content-Type: application/json` on writes

Base URL: `https://admin.stage.carfluent.io/api/partner/v1`

## Safety rules

1. **Every `DELETE` must be explicitly confirmed by Matt.** Never delete without clear intent.
2. **Never log or echo `CARFLUENT_API_KEY`.**
3. **CRITICAL: If any API endpoint fails (non-2xx response), STOP immediately and report the failure.** Include the endpoint, method, status code, and error response.
4. **Always report back what you updated.** After every successful write, tell Matt in one line what changed and on which resource — include the dealer name/id and the resource id.
5. **Image uploads use URL-ingest.** All image endpoints accept `{source_url: "https://..."}`. Server fetches, validates (JPEG/PNG/WebP/GIF, max 25MB), and re-hosts. If upload fails, report the 502 error.

## Error shape

```json
{ "error": "human-readable message", "statusCode": 400 }
```
Common codes: `401` (invalid token), `403` (no access to dealer), `404` (not found), `400` (validation error), `502` (URL-ingest failure).

## Response structure

**Success:**
```json
{
  "data": { ... },
  "meta": {
    "count": 10,
    "limit": 1000,
    "truncated": false
  }
}
```

**List cap:** 1000 rows per request. `truncated: true` indicates clipping.

---

## Endpoints

### Health & Dealers

**GET /health**
No auth required. Returns `{status, timestamp}`.

**GET /dealers**
Lists all dealers Matt has access to.
Response: `{data: [{dealer_id, name, address, ...}], meta}`

**GET /dealers/{dealerId}**
Full dealer profile with name, address, phone, SEO meta, logo/og-image URLs, etc.

**PUT /dealers/{dealerId}**
Update dealer scalar fields.
Body: `{name?, address?, phone?, disclosures?, meta_title?, meta_description?}`

---

### Vehicles (Read-Only)

**GET /dealers/{dealerId}/vehicles/en**
Active inventory with English translation.

**GET /dealers/{dealerId}/vehicles/es**
Active inventory with Spanish translation.

Both return full denormalized graph: features, images, incentives, colors, callout, CTA.

---

### Staff Cards

**GET /dealers/{dealerId}/staff**
List all staff members for the dealer.

**POST /dealers/{dealerId}/staff**
Create a new staff member.
Body: `{name, title, position, phone_number}` (all required)

**PUT /dealers/{dealerId}/staff/{staffId}**
Update staff text fields.
Body: `{name?, title?, position?, phone_number?}`

**DELETE /dealers/{dealerId}/staff/{staffId}**
Remove staff member (confirm with Matt first).

**PUT /dealers/{dealerId}/staff/{staffId}/image**
Replace staff photo via URL-ingest.
Body: `{source_url: "https://..."}`

---

### CTAs (Call-to-Action)

**GET /dealers/{dealerId}/ctas**
List all CTAs.

**POST /dealers/{dealerId}/ctas**
Create CTA with image URL-ingest.
Body: `{title, description, link, source_url}` (source_url for image)

**PUT /dealers/{dealerId}/ctas/{ctaId}**
Update CTA text fields.
Body: `{title?, description?, link?}`

**DELETE /dealers/{dealerId}/ctas/{ctaId}**
Remove CTA (confirm first).

**PUT /dealers/{dealerId}/ctas/{ctaId}/image**
Replace CTA image.
Body: `{source_url: "https://..."}`

---

### Coupons

**GET /dealers/{dealerId}/coupons**
List all coupons.

**POST /dealers/{dealerId}/coupons**
Create coupon with image URL-ingest.
Body: `{title, description, expiration_date, source_url}` (source_url for image)

**PUT /dealers/{dealerId}/coupons/{couponId}**
Update coupon text fields.
Body: `{title?, description?, expiration_date?}`

**DELETE /dealers/{dealerId}/coupons/{couponId}**
Remove coupon (confirm first).

**PUT /dealers/{dealerId}/coupons/{couponId}/image**
Replace coupon image.
Body: `{source_url: "https://..."}`

---

### Social Media

**GET /dealers/{dealerId}/social**
List all social media links.

**POST /dealers/{dealerId}/social**
Add social link.
Body: `{social_id, link}` (social_id: "facebook", "instagram", "twitter", etc.)

**PUT /dealers/{dealerId}/social/{linkId}**
Update social link.
Body: `{link}`

**DELETE /dealers/{dealerId}/social/{linkId}**
Remove social link (confirm first).

---

### Media Gallery & Branding

**GET /dealers/{dealerId}/media**
List gallery images.

**POST /dealers/{dealerId}/media**
Add image to gallery via URL-ingest.
Body: `{source_url: "https://..."}`

**DELETE /dealers/{dealerId}/media/{mediaId}**
Remove gallery image (confirm first).

**PUT /dealers/{dealerId}/logo**
Replace dealer logo.
Body: `{source_url: "https://..."}`

**PUT /dealers/{dealerId}/map-pin**
Replace map-pin image.
Body: `{source_url: "https://..."}`

**PUT /dealers/{dealerId}/og-image**
Replace OpenGraph image (for social sharing).
Body: `{source_url: "https://..."}`

---

### Metadata

**GET /dealers/{dealerId}/hostnames**
List owned hostnames (domains) for the dealer.

**GET /dealers/{dealerId}/feed**
Feed debug snapshot (Carfluent admin only; returns `403` for partner tokens).

---

## Common workflows

### List dealers Matt has access to

```bash
curl -s "https://admin.stage.carfluent.io/api/partner/v1/dealers" \
  -H "Authorization: Bearer $CARFLUENT_API_KEY"
```

Response: `{data: [{dealer_id: "123", name: "ABC Motors", ...}], meta}`

Report: *"You have access to 3 dealers: ABC Motors (#123), XYZ Auto (#456), Best Cars (#789)."*

---

### Get dealer profile

```bash
curl -s "https://admin.stage.carfluent.io/api/partner/v1/dealers/123" \
  -H "Authorization: Bearer $CARFLUENT_API_KEY"
```

Response includes full profile: name, address, phone, logo URL, meta tags, etc.

---

### Add a staff member

Matt: "Add John Smith as Sales Manager to ABC Motors"

1. Resolve dealer id (123 for ABC Motors)
2. Confirm phone number if not provided
3. POST:

```bash
curl -s -X POST "https://admin.stage.carfluent.io/api/partner/v1/dealers/123/staff" \
  -H "Authorization: Bearer $CARFLUENT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Smith",
    "title": "Sales Manager",
    "position": 1,
    "phone_number": "555-1234"
  }'
```

Report: *"Added John Smith as Sales Manager (#456) to ABC Motors."*

---

### Update dealer logo

Matt: "Update ABC Motors logo to https://example.com/new-logo.png"

```bash
curl -s -X PUT "https://admin.stage.carfluent.io/api/partner/v1/dealers/123/logo" \
  -H "Authorization: Bearer $CARFLUENT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "source_url": "https://example.com/new-logo.png"
  }'
```

If successful (200), report: *"Updated logo for ABC Motors."*
If 502, report: *"Failed to upload logo - server couldn't fetch from the URL or encountered an error."*

---

### Get vehicles (inventory)

```bash
curl -s "https://admin.stage.carfluent.io/api/partner/v1/dealers/123/vehicles/en" \
  -H "Authorization: Bearer $CARFLUENT_API_KEY"
```

Returns full denormalized inventory with features, images, incentives, colors, etc.

Report summary: *"ABC Motors has 47 vehicles in inventory. [Top 3: 2024 Ford F-150, 2023 Honda Civic, 2024 Toyota Camry]"*

---

## Image URL-Ingest Notes

All image endpoints accept: `{source_url: "https://..."}`

**Supported formats:** JPEG, PNG, WebP, GIF
**Max size:** 25 MB
**Process:** Server fetches URL, validates format/size, re-hosts on Carfluent infrastructure

**If upload fails (502):** Report to Matt that the server couldn't fetch the image or upload failed. Common causes: URL unreachable, wrong format, file too large.

---

## Tips

- **Dealer resolution:** When Matt refers to a dealer by name, first `GET /dealers` to find the dealer_id, then use that id in subsequent calls.
- **Confirm destructive operations:** Always confirm before DELETE.
- **Image URLs:** Matt may provide image URLs from Telegram or other sources. Use them directly in `source_url` fields.
- **List limits:** API caps at 1000 rows. If `meta.truncated: true`, mention that the list was capped.
