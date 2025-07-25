-- Add authProvider column to User table
ALTER TABLE "User" ADD COLUMN "authProvider" TEXT NOT NULL DEFAULT 'local';

-- Create SAMLConfig table
CREATE TABLE "SAMLConfig" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "entryPoint" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "certificate" TEXT NOT NULL,
    "logoutUrl" TEXT,
    "identifierFormat" TEXT,
    "signatureAlgorithm" TEXT,
    "digestAlgorithm" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SAMLConfig_pkey" PRIMARY KEY ("id")
);

-- Create unique index on teamId
CREATE UNIQUE INDEX "SAMLConfig_teamId_key" ON "SAMLConfig"("teamId");

-- Create index for queries
CREATE INDEX "SAMLConfig_teamId_idx" ON "SAMLConfig"("teamId");