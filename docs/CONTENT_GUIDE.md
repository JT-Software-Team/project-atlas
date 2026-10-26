# Content guide

Everything below is done in the browser by an administrator. No code changes are needed, except replacing the logo file.

## Replace the Janyutech logo

The official logo lives at `client/public/brand/janyutech-logo.jpg` and is used unchanged on the login page and in the sidebar of every page. To update it, replace that file with the new version, keeping the same name, and rebuild (`npm run build`). A PNG or SVG works too; change `LOGO_SRC` in `client/src/lib/brand.ts` if the file name changes. The logo sits on a light "plate" so a logo with a white background remains legible on the dark theme; its aspect ratio is always preserved.

## Replace the demo projects with real data

1. Sign in as a Super Admin and open **Project Management**.
2. Edit each demo project:
   - **A. Basic information**: write the approved summary and description, set the real status, and turn **Demo data** off.
   - **B. Client company**: JSW and Vedanta clients exist already. For the Aluminium Skimming project, click **New client company** once the client name is confirmed (or edit "Client To Be Added" on the **Clients** page, rename it and untick *Name not yet confirmed*).
   - **C. Images & media**: upload the cover image, plant and equipment photos, gallery images and an optional PDF.
   - **D. Dashboards**: click **Add dashboard**, enter the name and the `https://` link supplied by the dashboard owner, choose the type and whether it opens in a new tab. Mark one as **Primary** (used by the card's Open Dashboard button). Save, then use **Verify link** to record the check date.
   - **F. Ownership & access**: choose who may see the project (see below).
3. Save. The card preview on the right shows how it will appear in the directory.

## Add a new client and project

1. **Clients → Add client**: enter the company name, industry, website, location, and upload the logo. The system prevents duplicate client names.
2. **Project Management → Add project**: fill in sections A–G. Only the project name is mandatory; anything left empty is simply not shown.

## Images

- Accepted: JPG, PNG, WebP, GIF, AVIF up to 8 MB. Images are automatically optimised.
- Recommended cover size: 1600 × 900 px (16:9). Logos: transparent or white background PNG.
- When a project has no cover image, a category-matched industrial illustration labelled *placeholder* is shown.
- Only use photographs that you have permission to publish, and avoid images that reveal confidential plant layouts.

## Dashboard links

- Use the dashboard's normal `https://` address. Never paste links that contain passwords, API keys or tokens.
- If the dashboard has its own login, keep **Requires separate sign-in** on so users know to expect it.
- Project Atlas does not embed or monitor dashboards. "Verify link" only confirms the address answers.

## Giving people access

- **User Management → Invite user**: enter name, email and role. An invitation link is emailed (and shown once to you).
  - **Super Admin**: everything.
  - **Project Admin**: manages only the projects assigned to them.
  - **Viewer**: sees permitted projects and opens their dashboards.
- Grant project access per user (**Access** button) or per project (section F). Levels: *Viewer*, *Technical* (also technical & maintenance details), *Manager* (Project Admins only).
- For client users, set their **Organisation** to the client company and enable **Client-specific access** on that client's projects.
- To remove access: revoke the grant, or edit the user and turn **Account active** off (signs them out immediately).

## Categories

**Settings → Categories**: add, rename, reorder or delete (only when unused) categories.
