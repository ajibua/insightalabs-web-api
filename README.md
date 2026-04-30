# Insighta Labs+ — Web Portal

A single-page web application for the Insighta Labs+ demographic intelligence platform. Built with plain HTML, CSS, and JavaScript — no framework, no build step.

## Pages

| Page | Description |
|---|---|
| Login | GitHub OAuth login via PKCE |
| Dashboard | Stats overview (total, male, female, Nigeria) + recent profiles |
| Profiles | Full profiles list with filters, sorting, pagination, CSV export |
| Search | Natural language search (e.g. "young males from nigeria") |
| Account | User info, role badge, logout |

## Authentication

- Login via GitHub OAuth (PKCE generated server-side by the backend)
- Tokens stored in **HTTP-only cookies** set by the backend — **never** accessible via JavaScript
- CSRF protection: a non-HTTP-only `csrf_token` cookie is read by JavaScript and sent as `X-CSRF-Token` header on all non-GET requests (double-submit cookie pattern)
- Auto-refresh: on any 401 response, the app silently calls `POST /auth/refresh` (using the refresh token cookie) and retries the request once
- If refresh fails, the user is redirected to the login page

## Token Handling

| Token | Storage | Accessible to JS |
|---|---|---|
| `access_token` | HTTP-only cookie | No |
| `refresh_token` | HTTP-only cookie | No |
| `csrf_token` | Regular cookie | Yes (needed for CSRF header) |

All cookies use `SameSite=None; Secure` for cross-origin compatibility between the Vercel-hosted portal and Railway-hosted backend.


## File Structure

```
insighta-web/
├── index.html          # Main SPA shell (all pages)
├── callback.html       # OAuth callback landing page
├── static/
│   ├── css/style.css   # Design system (dark theme, glassmorphism)
│   └── js/app.js       # All logic (auth, routing, API, rendering)
└── README.md
```

## Role Enforcement

The web portal respects backend RBAC:
- **analyst**: Can view, filter, search, and export profiles
- **admin**: All analyst permissions + can create new profiles

Admin-only features are hidden from analysts in the UI.
