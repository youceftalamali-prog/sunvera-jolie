# Sales reports and order email notifications

## Sales reports
The admin page `/admin/reports` reads real orders and line items from the existing database. It provides day, week, month, 30-day, and custom-date-range summaries. The export is UTF-8 CSV with a BOM and semicolon separators so it opens in Excel in common French/Algerian regional settings. It includes order/customer fields and one row per order line; it is not a profit report.

The summary distinguishes all recorded order value from delivered-order value. Cancelled and pending orders remain visible in the all-orders amount; use the delivered metric for completed deliveries.

## New-order email
After an order is committed to the database, the order API attempts to send an immediate notification through Resend. A mail delivery failure does not roll back or hide a successfully saved order; the API response includes `notificationEmailSent` and logs the provider error.

Configure these values in Cloudflare Worker secrets/vars (do not commit real credentials):
- `RESEND_API_KEY` — Resend API key stored as a secret.
- `ORDER_NOTIFICATION_FROM` — sender identity verified in Resend.
- `ORDER_NOTIFICATION_EMAIL` — recipient, defaulting to `youceftalamali@gmail.com`.

The sender domain/address must be verified in Resend before production email can be delivered. Verify with a real test order after the variables are configured. No email delivery is claimed until that test succeeds.
