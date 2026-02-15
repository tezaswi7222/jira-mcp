# Security Policy

## Supported Versions

We release patches for security vulnerabilities in the following versions:

| Version | Supported          |
| ------- | ------------------ |
| 2.x.x   | :white_check_mark: |
| 1.x.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

We take the security of `jira-mcp` seriously. If you discover a security vulnerability, please report it responsibly.

### How to Report

**Please do NOT report security vulnerabilities through public GitHub issues.**

Instead, please report them via one of the following methods:

1. **Email**: Send a detailed report to [t.raj@maxxton.com](mailto:t.raj@maxxton.com)
2. **GitHub Security Advisories**: [Create a private security advisory](https://github.com/tezaswi7222/jira-mcp/security/advisories/new)

### What to Include

Please include as much of the following information as possible:

- **Type of vulnerability** (e.g., credential exposure, injection, authentication bypass)
- **Location** of the affected source code (file path, function, line number)
- **Step-by-step instructions** to reproduce the issue
- **Proof-of-concept** or exploit code (if available)
- **Impact assessment** of the vulnerability
- **Suggested remediation** (if any)

### Response Timeline

- **Initial Response**: Within 48 hours of report submission
- **Status Update**: Within 7 days with assessment and remediation plan
- **Resolution**: Within 30 days for critical vulnerabilities

### What to Expect

1. **Acknowledgement**: We will acknowledge receipt of your report
2. **Communication**: We will keep you informed of our progress
3. **Credit**: We will credit you in our release notes (unless you prefer to remain anonymous)
4. **Notification**: We will notify you when the vulnerability is fixed

## Security Best Practices

When using `jira-mcp`, please follow these security best practices:

### Credential Management

- ✅ **DO**: Use environment variables for credentials
- ✅ **DO**: Use API tokens instead of passwords
- ✅ **DO**: Rotate your API tokens regularly
- ✅ **DO**: Use OAuth 2.0 for production environments
- ❌ **DON'T**: Hardcode credentials in configuration files
- ❌ **DON'T**: Commit `.env` files or credentials to version control
- ❌ **DON'T**: Share API tokens or OAuth secrets

### Environment Variables

```bash
# Good: Using environment variables
export JIRA_API_TOKEN="your-token-here"

# Bad: Hardcoding in configuration (don't do this!)
# "JIRA_API_TOKEN": "your-token-here"  <- Never commit this!
```

### API Token Scopes

When creating Jira API tokens or OAuth apps, follow the principle of least privilege:

- Only request necessary OAuth scopes
- Use read-only tokens when possible
- Regularly audit token usage

### Network Security

- Use HTTPS URLs only (`https://your-domain.atlassian.net`)
- Verify you're connecting to legitimate Atlassian endpoints
- Be cautious on untrusted networks

## Security Features

`jira-mcp` includes the following security features:

### Secure Credential Storage

- Credentials are stored securely using the system keychain via [Keytar](https://github.com/atom/node-keytar)
- Windows: Windows Credential Manager
- macOS: Keychain
- Linux: libsecret

### OAuth 2.0 Support

- Automatic token refresh before expiration
- Secure token exchange flow
- Support for refresh tokens

### No Credential Logging

- Credentials are never logged to console or files
- Error messages do not expose sensitive information
- API tokens are masked in debug output

## Known Security Considerations

### Keytar Dependency

This package uses `keytar` for secure credential storage, which requires native bindings. If `keytar` is not available:

- Credentials are stored in memory only
- Credentials must be re-entered each session
- Consider using environment variables as an alternative

### OAuth Token Storage

When using OAuth 2.0:

- Access tokens are stored in the system keychain
- Refresh tokens are stored alongside access tokens
- Tokens can be cleared using `jira_clear_auth`

## Audit Trail

### Version 2.0.0

- Security review for bulk operations
- Validated file upload security (attachment uploads)
- Ensured dashboard access respects Jira permissions
- JQL validation prevents injection attacks
- Bulk operation limits enforced (max 1000 issues)
- All new endpoints use authenticated requests only

### Version 1.0.0

- Initial security review completed
- Implemented secure credential storage
- Added OAuth 2.0 support with auto-refresh
- Configured `.npmignore` to exclude sensitive files

---

Thank you for helping keep `jira-mcp` and its users safe!
