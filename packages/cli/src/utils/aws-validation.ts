/**
 * AWS Resource Name Validation Utilities
 * Provides strict validation for AWS resource naming conventions
 */

/**
 * Validates an AWS resource name according to AWS naming rules
 * @param name - The resource name to validate
 * @returns Object containing isValid boolean and array of error messages
 */
export function validateAwsResourceName(name: string): {
  isValid: boolean;
  errors: string[];
  sanitized: string;
} {
  const sanitized = name.toLowerCase().trim();
  const errors: string[] = [];

  // Length validation (3-63 characters)
  if (sanitized.length < 3 || sanitized.length > 63) {
    errors.push("must be between 3 and 63 characters long");
  }

  // Must start with lowercase letter or number
  if (sanitized.length > 0 && !/^[a-z0-9]/.test(sanitized)) {
    errors.push("must start with a lowercase letter or number");
  }

  // Can only contain lowercase letters, numbers, and hyphens
  if (!/^[a-z0-9-]*$/.test(sanitized)) {
    errors.push("can only contain lowercase letters, numbers, and hyphens");
  }

  // Cannot end with a hyphen
  if (sanitized.endsWith("-")) {
    errors.push("cannot end with a hyphen");
  }

  // Cannot contain consecutive hyphens
  if (sanitized.includes("--")) {
    errors.push("cannot contain consecutive hyphens");
  }

  // Cannot be formatted as an IP address
  if (/^\d+\.\d+\.\d+\.\d+$/.test(sanitized)) {
    errors.push("cannot be formatted as an IP address");
  }

  // Check against AWS reserved prefixes
  const reservedPrefixes = [
    "aws",
    "amazon",
    "cloudfront",
    "s3",
    "ec2",
    "lambda",
    "rds",
    "elasticache",
    "redshift",
    "dynamodb",
    "kinesis",
    "sqs",
    "sns",
    "cloudwatch",
    "iam",
    "vpc",
  ];

  if (reservedPrefixes.some((prefix) => sanitized.startsWith(prefix))) {
    errors.push("cannot start with AWS reserved prefixes");
  }

  // Additional security patterns
  const suspiciousPatterns = [
    /\badmin\b/i,
    /\broot\b/i,
    /\bsudo\b/i,
    /\bexec\b/i,
    /\beval\b/i,
    /\bscript\b/i,
    /<|>|&|\||\$|\{|\}/,
    /\.\./,
    /\/\//,
  ];

  for (const pattern of suspiciousPatterns) {
    if (pattern.test(name)) {
      errors.push("contains potentially unsafe patterns");
      break;
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    sanitized,
  };
}

/**
 * Validates an AWS region identifier
 * @param region - The AWS region to validate
 * @returns boolean indicating if the region is valid
 */
export function validateAwsRegion(region: string): boolean {
  const validRegions = [
    "us-east-1",
    "us-east-2",
    "us-west-1",
    "us-west-2",
    "af-south-1",
    "ap-east-1",
    "ap-south-1",
    "ap-northeast-1",
    "ap-northeast-2",
    "ap-northeast-3",
    "ap-southeast-1",
    "ap-southeast-2",
    "ap-southeast-3",
    "ca-central-1",
    "eu-central-1",
    "eu-west-1",
    "eu-west-2",
    "eu-west-3",
    "eu-south-1",
    "eu-north-1",
    "me-south-1",
    "me-central-1",
    "sa-east-1",
    "us-gov-east-1",
    "us-gov-west-1",
  ];

  return validRegions.includes(region);
}

/**
 * Sanitizes a string to be safe for use in AWS resource names
 * @param input - The input string to sanitize
 * @returns A sanitized string safe for AWS resource naming
 */
export function sanitizeForAwsResourceName(input: string): string {
  return (
    input
      .toLowerCase()
      .trim()
      // Replace spaces and underscores with hyphens
      .replace(/[\s_]+/g, "-")
      // Remove all non-alphanumeric characters except hyphens
      .replace(/[^a-z0-9-]/g, "")
      // Replace multiple consecutive hyphens with single hyphen
      .replace(/-+/g, "-")
      // Remove leading and trailing hyphens
      .replace(/^-+|-+$/g, "")
      // Ensure minimum length
      .padEnd(3, "0")
      // Truncate to maximum length
      .substring(0, 63)
  );
}