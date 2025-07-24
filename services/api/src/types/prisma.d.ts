// Type augmentations for Prisma Client

declare module "@prisma/client" {
  // Add any custom type augmentations here if needed

  // Re-export commonly used types
  export type {
    Build,
    Project,
    Organization,
    User,
    ApiKey,
  } from "@prisma/client";
}
