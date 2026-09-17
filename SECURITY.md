# Security Policy

Scammeter treats every analyzed page as hostile: it assumes the page
knows the extension exists and may try to spoof or attack it. See the threat
model in the project scope doc for the full list of mitigations already built
in (Shadow DOM banner, no `innerHTML` on untrusted data, SSRF-safe proxy,
timeouts + circuit breaking, minimal permissions).

## Reporting a vulnerability

Please open a private report via GitHub's "Report a vulnerability" button on
this repository's Security tab, instead of a public issue. We'll acknowledge
within a few days.
