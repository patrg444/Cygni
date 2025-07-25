# SAML Single Sign-On (SSO) Setup Guide

This guide explains how to configure SAML SSO for your Cygni enterprise team.

## Overview

SAML (Security Assertion Markup Language) enables enterprise teams to use their existing identity provider (IdP) for authentication. Cygni supports SAML 2.0 with the following providers:

- Okta
- Azure Active Directory
- Google Workspace
- OneLogin
- PingIdentity
- Any SAML 2.0 compliant provider

## Prerequisites

- Enterprise plan subscription
- Admin access to your Cygni team
- Admin access to your identity provider

## Setup Steps

### 1. Generate SAML Metadata

First, get your team's SAML metadata URL:

```bash
# Get your team ID
cygni team info

# View SAML metadata
curl https://api.cygni.dev/api/v2/auth/saml/{team-id}/metadata
```

### 2. Configure Your Identity Provider

#### Okta Setup

1. In Okta Admin, create a new SAML 2.0 application
2. Configure SAML settings:
   - **Single Sign-On URL**: `https://api.cygni.dev/api/v2/auth/saml/{team-id}/callback`
   - **Audience URI (SP Entity ID)**: `https://api.cygni.dev/api/v2/auth/saml/{team-id}/metadata`
   - **Name ID format**: EmailAddress
   - **Application username**: Email

3. Configure attribute statements:
   - `email` → `user.email`
   - `name` → `user.displayName`
   - `groups` → `user.groups` (optional)

#### Azure AD Setup

1. In Azure Portal, create a new Enterprise Application
2. Choose "Create your own application" → "Non-gallery"
3. Configure SAML:
   - **Identifier (Entity ID)**: `https://api.cygni.dev/api/v2/auth/saml/{team-id}/metadata`
   - **Reply URL**: `https://api.cygni.dev/api/v2/auth/saml/{team-id}/callback`
   - **Sign on URL**: `https://api.cygni.dev/api/v2/auth/saml/{team-id}/login`

4. Configure claims:
   - `emailaddress` → `user.mail`
   - `name` → `user.displayname`
   - `groups` → `user.groups` (optional)

### 3. Configure Cygni

Using the CLI:

```bash
# Configure SAML for your team
cygni team saml configure \
  --entry-point "https://your-idp.com/sso/saml" \
  --issuer "http://www.okta.com/YOUR_ID" \
  --cert-file ./idp-certificate.pem
```

Using the API:

```bash
curl -X POST https://api.cygni.dev/api/v2/teams/{team-id}/saml \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "entryPoint": "https://your-idp.com/sso/saml",
    "issuer": "http://www.okta.com/YOUR_ID",
    "certificate": "-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----"
  }'
```

### 4. Test Configuration

```bash
# Test SAML connection
cygni team saml test

# Get login URL
cygni team saml login-url
```

## User Management

### Automatic User Provisioning

When a user logs in via SAML for the first time:
1. A Cygni account is automatically created
2. User details are populated from SAML attributes
3. Role is assigned based on group mappings

### Group-to-Role Mapping

SAML groups are automatically mapped to Cygni roles:

| SAML Group | Cygni Role |
|------------|------------|
| `admins`, `administrators`, `owners` | `admin` |
| `developers`, `engineers`, `dev` | `developer` |
| All others | `member` |

### Custom Role Mapping

Configure custom group mappings:

```bash
cygni team saml groups \
  --map "engineering-leads=admin" \
  --map "contractors=viewer"
```

## Security Considerations

### Certificate Management

- SAML certificates should be rotated annually
- Store certificates securely
- Monitor certificate expiration

### Best Practices

1. **Enable SAML-only authentication** to disable password login:
   ```bash
   cygni team security --saml-only
   ```

2. **Configure session timeout**:
   ```bash
   cygni team security --session-timeout 8h
   ```

3. **Enable MFA at IdP level** for additional security

4. **Audit SAML logins** regularly:
   ```bash
   cygni audit logs --filter "action=auth.saml_login"
   ```

## Troubleshooting

### Common Issues

#### "Invalid SAML Response"
- Verify certificate is correctly configured
- Check time synchronization between IdP and Cygni
- Ensure response is signed

#### "User Not Authorized"
- Verify user is assigned to the application in IdP
- Check group memberships
- Ensure email attribute is being sent

#### "Redirect Loop"
- Clear browser cookies
- Verify callback URL matches exactly
- Check for trailing slashes in URLs

### Debug Mode

Enable SAML debug logging:

```bash
cygni team saml debug --enable
```

View debug logs:

```bash
cygni logs --filter "saml" --since 1h
```

## API Reference

### Configure SAML
```
POST /api/v2/teams/{teamId}/saml
```

### Get SAML Configuration
```
GET /api/v2/teams/{teamId}/saml
```

### Get Metadata
```
GET /api/v2/auth/saml/{teamId}/metadata
```

### Initiate Login
```
GET /api/v2/auth/saml/{teamId}/login
```

### Remove SAML
```
DELETE /api/v2/teams/{teamId}/saml
```

## Support

For SAML configuration assistance:
- Email: enterprise@cygni.dev
- Documentation: https://docs.cygni.dev/security/saml
- Enterprise Support Portal: https://support.cygni.dev