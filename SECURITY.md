# Security Policy

## Supported Versions

Only the latest version of Calculator Suite is supported with security updates.

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

1. **Do not** create a public issue
2. Send an email to the maintainers (contact info to be added)
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if known)

## Security Principles

- **No eval/new Function**: We never use `eval()` or `new Function()` for user input
- **Restricted Parser**: Math expressions are evaluated with a restricted scope
- **Input Validation**: All user input and OCR output is validated before processing
- **No Secret Keys in Client**: API keys (if used) are server-side only
- **No Data Collection**: No analytics or telemetry by default
- **Local Storage Only**: Calculation history is stored locally in IndexedDB
- **Image Privacy**: Uploaded images are not persisted by default

## Dependency Management

- Dependencies are reviewed for security before each release
- We use npm audit to check for known vulnerabilities
- Transitive dependencies are audited before release

## Disclosure Policy

- Security issues are addressed promptly
- Security updates are released as soon as fixes are available
- Credits for responsible disclosure are included in release notes
