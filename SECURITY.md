# Security policy

This plugin grants every successfully authorized Feishu application user full shared DSH owner access. It does not provide separate user accounts, tenant restrictions, or per-user session revocation. Restrict the application's availability to trusted people.

Use native HTTPS and protect local profile configuration and backups: the App Secret is stored there in plaintext. Feishu revocation and disabling this plugin do not invalidate existing native DSH sessions. Native token login remains a recovery mechanism.

OAuth state is held in a bounded, single-process store and provider exchanges have a concurrency limit. These limits are not denial-of-service protection or per-client rate limiting. Restrict network access; do not expose a shared-owner DSH instance to an untrusted network.

## Reporting a vulnerability

Use [GitHub private vulnerability reporting](https://github.com/lloydzhou/dsh-feishu-oauth/security/advisories/new). Do not include credentials, session cookies, authorization codes, private configuration, or personal addresses in public issues. Provide a minimal reproduction with dummy values and the affected plugin and DSH versions.

Security fixes target the latest release. Compatibility with DSH prerelease authentication and settings APIs must be rechecked when upgrading DSH.
