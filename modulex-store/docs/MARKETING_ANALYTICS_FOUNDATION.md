# Oakwell Store Marketing & Analytics Foundation

## Purpose

The Store uses a single consent-aware event layer instead of hard-coding multiple advertising pixels throughout the application.

The preferred architecture is:

1. Oakwell Store emits normalized `dataLayer` events.
2. Google Tag Manager (GTM) is the primary tag orchestration layer.
3. GA4, Google Ads, Meta, TikTok, Pinterest, and similar marketing tags can be mapped in GTM.
4. Direct GA4 loading is available only as a fallback when no GTM container is configured.

This keeps application code independent from individual advertising vendors and makes consent behavior easier to audit.

## Default State

Marketing tracking is disabled by default.

A production Store does not load GTM or GA4 until all of the following are true:

- `tracking_enabled = true`
- a GTM Container ID or GA4 Measurement ID is configured
- the built-in consent banner remains enabled
- the visitor grants the relevant optional consent category
- browser Do Not Track is not active when `respect_do_not_track = true`

Database constraints prevent tracking from being enabled without a provider or with the consent banner disabled.

## Admin Configuration

Modulex Admin exposes the settings under:

`Store -> Marketing & Analytics`

Admin / Super Admin can configure:

- GTM Container ID (`GTM-...`)
- GA4 Measurement ID (`G-...`) as a fallback
- tracking master switch
- consent banner behavior
- browser Do Not Track handling
- consent copy and button labels
- optional privacy-policy link

The GTM and GA4 identifiers are public identifiers, not application secrets.

## Consent Model

The Store has two optional categories:

- **Analytics** — site usage, page views, catalog usage, and conversion measurement.
- **Marketing** — configured advertising and campaign measurement tags managed through GTM.

Visitors can:

- accept all optional tracking
- reject optional tracking
- manage Analytics and Marketing independently
- reopen their choices later

The browser choice is stored locally under `oakwell_privacy_consent_v1`.

Google Consent Mode is initialized with optional storage denied and updated only when the visitor changes their choice.

## Standard Event Dictionary

The application currently defines these normalized events:

- `page_view`
- `product_view`
- `search`
- `catalog_download`
- `contact_form_start`
- `contact_form_submit`
- `dealer_application_start`
- `dealer_application_submit`
- `contact_click`
- `phone_click`
- `email_click`
- `login`
- `portal_view`

`login` and `portal_view` are reserved for the future customer portal and are not emitted by the public Store yet.

## Product Events

Product analytics never include public price data.

`product_view` may include:

- product base code
- public display name
- category
- brand

`catalog_download` may include:

- product base code
- document title

## Lead and Dealer Events

The analytics event layer does **not** send form field values such as:

- first or last name
- email address
- phone number
- company form details
- lead reference code
- free-text message

Lead submission events currently contain only the form type.

The actual lead record remains in the protected Supabase lead workflow.

## Campaign Attribution

Campaign attribution is stored on a best-effort session basis in `sessionStorage` under:

`oakwell_session_attribution_v1`

The Store preserves:

- `utm_source`
- `utm_medium`
- `utm_campaign`
- `utm_content`
- `utm_term`
- landing page
- referrer

This allows a visitor to enter on one Store page, browse the site, and submit a Contact or Dealer form later in the same browser session without losing the campaign context.

The lead record stores attribution independently of whether analytics consent was granted. This is part of the website request context sent with the form, not a third-party analytics event.

## Search Events

Search terms sent to the optional analytics layer are intentionally constrained.

Only a short, simple catalog search string is emitted. Unexpected characters cause the analytics search term to be replaced with `redacted` rather than sending arbitrary user-entered text to third-party analytics.

## Public Data Boundary

`store_marketing_settings` is protected by RLS and is not directly readable by `anon`.

The public Store reads only the safe runtime configuration through:

`get_store_marketing_settings()`

The public RPC intentionally uses a narrow `SECURITY DEFINER` projection, matching the Store's existing public-data architecture. Supabase Advisor therefore reports the expected public SECURITY DEFINER warning for this RPC.

## Tag Manager Guidance

When GTM is configured, vendor-specific tags should normally be created in GTM rather than added directly to the Next.js codebase.

For example:

- map `product_view` to GA4 and selected advertising product-view events
- map `contact_form_submit` to lead conversions
- map `dealer_application_submit` to a dealer-application conversion
- map `catalog_download` to resource-download conversions

Consent conditions should be configured for each tag so marketing tags do not fire on Analytics-only consent.

## Privacy and Legal Review

The technical layer is designed to support consent-aware operation, but final privacy-policy text, consent wording, retention rules, and jurisdiction-specific requirements remain business/legal decisions and should be reviewed before marketing tracking is activated.

## Deployment Rule

Changing GTM/GA4 IDs or the tracking master switch is an Admin CMS/database change and does not require source-code changes. Store server caching can take several minutes to refresh after a settings update.
