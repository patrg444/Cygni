# GitHub OAuth Integration

This document describes the GitHub OAuth integration feature that enables users to authenticate using their GitHub accounts and manage team members through GitHub.

## Overview

The GitHub OAuth integration provides:
- Single Sign-On (SSO) via GitHub
- Team invitation by GitHub username
- GitHub organization sync
- Account linking for existing users
- Secure token storage with encryption

## Setup

### 1. Create GitHub OAuth App

1. Go to GitHub Settings > Developer settings > OAuth Apps
2. Click "New OAuth App"
3. Fill in the application details:
   - **Application name**: Your app name
   - **Homepage URL**: `https://your-domain.com`
   - **Authorization callback URL**: `https://your-domain.com/api/auth/github/callback`
4. Save the Client ID and Client Secret

### 2. Configure Environment Variables

```bash
# GitHub OAuth Configuration
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
GITHUB_CALLBACK_URL=https://your-domain.com/api/auth/github/callback

# Encryption key for storing OAuth tokens
ENCRYPTION_KEY=your-32-character-encryption-key
```

## API Endpoints

### Authentication

#### Initiate GitHub OAuth Flow
```
GET /api/auth/github?redirect=/dashboard
```

Initiates the GitHub OAuth flow. Users will be redirected to GitHub to authorize the application.

Query Parameters:
- `redirect` (optional): URL to redirect after successful authentication (default: `/dashboard`)

#### OAuth Callback
```
GET /api/auth/github/callback
```

Handles the GitHub OAuth callback. This endpoint is called by GitHub after user authorization.

#### Link GitHub Account
```
POST /api/auth/link/github
Authorization: Bearer <jwt-token>
```

Links a GitHub account to an existing user account.

Response:
```json
{
  "authUrl": "https://github.com/login/oauth/authorize?..."
}
```

#### Unlink GitHub Account
```
DELETE /api/auth/link/github
Authorization: Bearer <jwt-token>
```

Unlinks a GitHub account from the user.

#### Get Linked Providers
```
GET /api/auth/providers
Authorization: Bearer <jwt-token>
```

Returns a list of linked OAuth providers for the user.

Response:
```json
{
  "providers": [
    {
      "provider": "github",
      "username": "johndoe",
      "avatarUrl": "https://avatars.githubusercontent.com/u/123456",
      "linkedAt": "2024-01-15T10:30:00Z"
    }
  ]
}
```

### GitHub Integration

#### Get User's GitHub Organizations
```
GET /api/github/orgs
Authorization: Bearer <jwt-token>
```

Returns the user's GitHub organizations.

Response:
```json
{
  "organizations": [
    {
      "id": 123456,
      "login": "acme-corp",
      "name": "ACME Corporation",
      "avatarUrl": "https://avatars.githubusercontent.com/u/123456"
    }
  ]
}
```

#### Check Repository Access
```
POST /api/github/check-repo
Authorization: Bearer <jwt-token>
Content-Type: application/json

{
  "repo": "owner/repository"
}
```

Checks if the user has access to a specific GitHub repository.

Response:
```json
{
  "hasAccess": true,
  "permissions": {
    "admin": false,
    "push": true,
    "pull": true
  }
}
```

### Team Management

#### Invite Team Members by GitHub
```
POST /api/teams/invite/github
Authorization: Bearer <jwt-token>
Content-Type: application/json

{
  "members": [
    {
      "githubUsername": "johndoe",
      "role": "member"
    },
    {
      "githubUsername": "janedoe",
      "role": "admin"
    }
  ]
}
```

Invites team members by their GitHub username. Only team owners and admins can invite members.

Response:
```json
{
  "invited": ["johndoe", "janedoe"],
  "failed": []
}
```

#### Get Team Invitations
```
GET /api/teams/invitations
Authorization: Bearer <jwt-token>
```

Returns pending team invitations.

Response:
```json
{
  "invitations": [
    {
      "id": "inv_123",
      "email": "johndoe@github.local",
      "githubUsername": "johndoe",
      "role": "member",
      "invitedBy": "user_456",
      "expiresAt": "2024-01-22T10:30:00Z",
      "createdAt": "2024-01-15T10:30:00Z"
    }
  ]
}
```

#### Cancel Invitation
```
DELETE /api/teams/invitations/:id
Authorization: Bearer <jwt-token>
```

Cancels a pending team invitation. Only team owners and admins can cancel invitations.

#### Get Team Members with GitHub Info
```
GET /api/teams/members
Authorization: Bearer <jwt-token>
```

Returns team members with their GitHub information.

Response:
```json
{
  "members": [
    {
      "id": "user_123",
      "email": "john@example.com",
      "name": "John Doe",
      "role": "owner",
      "github": {
        "username": "johndoe",
        "avatarUrl": "https://avatars.githubusercontent.com/u/123456",
        "profileUrl": "https://github.com/johndoe"
      },
      "joinedAt": "2024-01-10T10:30:00Z"
    }
  ]
}
```

#### Sync Team from GitHub Organization
```
POST /api/teams/sync/github-org
Authorization: Bearer <jwt-token>
Content-Type: application/json

{
  "organization": "acme-corp"
}
```

Syncs team members from a GitHub organization. Only team owners can perform this action.

Response:
```json
{
  "synced": 5,
  "errors": []
}
```

#### Update Team Member Role
```
PUT /api/teams/members/:userId/role
Authorization: Bearer <jwt-token>
Content-Type: application/json

{
  "role": "admin"
}
```

Updates a team member's role. Only team owners can change roles.

#### Remove Team Member
```
DELETE /api/teams/members/:userId
Authorization: Bearer <jwt-token>
```

Removes a team member. Team owners and admins can remove members.

## Security Considerations

### Token Storage
- OAuth access tokens are encrypted using AES-256 before storage
- Refresh tokens are similarly encrypted
- Encryption keys should be rotated periodically

### State Parameter
- CSRF protection using state parameter
- State parameters expire after 10 minutes
- Each state can only be used once

### Permission Checks
- All team management endpoints verify user permissions
- Role-based access control (owner, admin, member)
- Cannot remove the last team owner
- Cannot change your own role

### Audit Logging
All OAuth and team management actions are logged:
- OAuth account linking/unlinking
- Team invitations sent
- Team members added/removed
- Role changes

## User Flow Examples

### New User Registration via GitHub

1. User clicks "Sign in with GitHub"
2. User authorizes the application on GitHub
3. Application creates new user account
4. User is assigned to a new team as owner
5. JWT token is issued

### Existing User Linking GitHub

1. User navigates to Settings > Integrations
2. Clicks "Link GitHub Account"
3. Authorizes the application on GitHub
4. GitHub account is linked to existing user

### Team Owner Inviting Members

1. Team owner goes to Team Settings
2. Enters GitHub usernames to invite
3. System checks if users exist
4. Invitations are created with 7-day expiry
5. Invited users can join via GitHub login

## Error Handling

Common error responses:

```json
{
  "error": "GitHub account already linked"
}
```

```json
{
  "error": "User belongs to another team"
}
```

```json
{
  "error": "Invalid or expired invitation"
}
```

```json
{
  "error": "Insufficient permissions"
}
```

## Best Practices

1. **Token Rotation**: Implement token refresh logic for long-lived sessions
2. **Rate Limiting**: GitHub API has rate limits; implement caching where possible
3. **Error Recovery**: Handle GitHub API failures gracefully
4. **Invitation Expiry**: Clean up expired invitations regularly
5. **Audit Trail**: Monitor OAuth activities for security

## Troubleshooting

### Common Issues

1. **"Invalid OAuth state"**
   - State parameter expired (10-minute timeout)
   - User used back button after authorization
   - Solution: Restart OAuth flow

2. **"GitHub account not linked"**
   - User trying to use GitHub features without linking
   - Solution: Link GitHub account first

3. **"Failed to get GitHub organizations"**
   - Insufficient GitHub permissions
   - Solution: Re-authorize with correct scopes

4. **"User belongs to another team"**
   - User already exists in different team
   - Solution: User must leave current team first

## Database Schema

The integration adds the following models:

```prisma
model OAuthAccount {
  id                String    @id @default(cuid())
  userId            String
  user              User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  provider          String    // github, google, etc.
  providerAccountId String    // GitHub user ID
  accessToken       String?   // Encrypted
  refreshToken      String?   // Encrypted
  expiresAt         DateTime?
  tokenType         String?
  scope             String?
  username          String?   // GitHub username
  avatarUrl         String?
  profileUrl        String?
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt
  
  @@unique([provider, providerAccountId])
  @@index([userId])
}

model TeamInvitation {
  id             String    @id @default(cuid())
  teamId         String
  team           Team      @relation(fields: [teamId], references: [id])
  email          String
  role           String    @default("member")
  invitedBy      String
  githubUsername String?
  githubUserId   String?
  acceptedAt     DateTime?
  expiresAt      DateTime
  createdAt      DateTime  @default(now())
  
  @@index([teamId])
  @@index([email])
  @@index([githubUserId])
}
```

## Metrics

The integration tracks:
- OAuth authentication attempts (success/failure)
- Account linking/unlinking events
- Team invitation metrics
- GitHub API usage

Access metrics at `/metrics` endpoint or through monitoring dashboard.