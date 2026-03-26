export const NAME_REGEX = /^[A-Za-z][A-Za-z\s'-]{1,49}$/;
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PHONE_REGEX = /^[0-9]{10,}$/;
export const PLATE_REGEX = /^[A-Z0-9\-]{2,15}$/;
export const ALPHANUMERIC_REGEX = /^[A-Za-z0-9]{3,20}$/;
export const VEHICLE_MODEL_REGEX = /^[A-Za-z0-9\s\-]{2,50}$/;
export const NUMERIC_DECIMAL_REGEX = /^[0-9]+(\.[0-9]{1,2})?$/;
export const ZIP_CODE_REGEX = /^[0-9]{4,10}$/;
export const TRACKING_ID_REGEX = /^[A-Z0-9\-]{4,20}$/;
export const WEBSITE_REGEX =
  /^(https?:\/\/)?(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&/=]*)$/;

// ============================================================================
// SANITIZATION FUNCTIONS - No longer removing invalid chars, validation handles it
// ============================================================================

export const sanitizeNameInput = (value) => {
  // Only trim, don't remove characters - validation will reject invalid input
  return String(value || "").trimStart();
};

export const sanitizeEmailInput = (value) => {
  return String(value || "")
    .trim()
    .toLowerCase();
};

export const sanitizePhoneInput = (value) => {
  // Remove non-numeric chars for user convenience, but validation will check
  return String(value || "").replace(/[^0-9]/g, "");
};

// ============================================================================
// VALIDATION FUNCTIONS - All use strict pattern matching with clear error messages
// ============================================================================

export const validateName = (value, label = "Name") => {
  const original = String(value || "").trim();
  if (!original) return `${label} is required`;

  // Check for numbers - reject if any digits found
  if (/\d/.test(original)) {
    return `${label} cannot contain numbers`;
  }

  // Check full pattern
  if (!NAME_REGEX.test(original)) {
    return `${label} must contain letters only (spaces, apostrophes, and hyphens are allowed)`;
  }
  return "";
};

export const validateEmail = (value) => {
  const cleaned = String(value || "")
    .trim()
    .toLowerCase();
  if (!cleaned) return "Email is required";
  if (!EMAIL_REGEX.test(cleaned)) return "Invalid email format";
  return "";
};

export const validateStrongPassword = (value) => {
  const password = String(value || "");
  if (!password) return "Password is required";
  if (password.length < 8) return "Password must be at least 8 characters";
  if (!/[A-Z]/.test(password)) {
    return "Password must include at least one uppercase letter";
  }
  if (!/[a-z]/.test(password)) {
    return "Password must include at least one lowercase letter";
  }
  if (!/[0-9]/.test(password))
    return "Password must include at least one number";
  return "";
};

export const validatePhone = (value) => {
  const cleaned = String(value || "").replace(/[^0-9]/g, "");
  if (!cleaned) return "Phone number is required";
  if (cleaned.length < 10) return "Phone number must be at least 10 digits";
  if (!/^[0-9]{10,}$/.test(cleaned))
    return "Phone number can only contain digits";
  return "";
};

export const validatePlateNumber = (value) => {
  const cleaned = String(value || "")
    .toUpperCase()
    .trim();
  if (!cleaned) return "Plate number is required";
  if (!PLATE_REGEX.test(cleaned)) {
    return "Plate number must be 2-15 characters (letters, numbers, hyphens only)";
  }
  return "";
};

export const validateJoinCode = (value) => {
  const cleaned = String(value || "")
    .toUpperCase()
    .trim();
  if (!cleaned) return "Join code is required";
  if (!/^[A-Z0-9]{3,20}$/.test(cleaned)) {
    return "Join code must be 3-20 characters (letters and numbers only)";
  }
  return "";
};

export const validateVehicleModel = (value) => {
  const cleaned = String(value || "").trim();
  if (!cleaned) return "Vehicle model is required";
  if (!VEHICLE_MODEL_REGEX.test(cleaned)) {
    return "Vehicle model must be 2-50 characters (letters, numbers, spaces, hyphens only)";
  }
  return "";
};

export const validateNumericField = (
  value,
  fieldName = "Value",
  minValue = 0,
) => {
  const cleaned = String(value || "").trim();
  if (!cleaned) return `${fieldName} is required`;
  if (!NUMERIC_DECIMAL_REGEX.test(cleaned)) {
    return `${fieldName} must be a number (decimals allowed)`;
  }
  const num = parseFloat(cleaned);
  if (num < minValue) return `${fieldName} must be at least ${minValue}`;
  return "";
};

export const validateZipCode = (value) => {
  const cleaned = String(value || "").trim();
  if (!cleaned) return "Zip code is required";
  if (!ZIP_CODE_REGEX.test(cleaned)) {
    return "Zip code must be 4-10 digits";
  }
  return "";
};

export const validateTrackingId = (value) => {
  const cleaned = String(value || "")
    .toUpperCase()
    .trim();
  if (!cleaned) return "Tracking ID is required";
  if (!TRACKING_ID_REGEX.test(cleaned)) {
    return "Tracking ID must be 4-20 characters (letters, numbers, hyphens only)";
  }
  return "";
};

export const validateAddress = (value) => {
  const cleaned = String(value || "").trim();
  if (!cleaned) return "Address is required";
  if (cleaned.length < 5) return "Address must be at least 5 characters";
  if (cleaned.length > 200) return "Address is too long (max 200 characters)";
  // Allow letters, numbers, spaces, common punctuation for addresses
  if (!/^[A-Za-z0-9\s\.,#\-\/()]{5,200}$/.test(cleaned)) {
    return "Address contains invalid characters";
  }
  return "";
};

export const validateWebsite = (value) => {
  const cleaned = String(value || "").trim();
  if (!cleaned) return "Website is required";
  if (!WEBSITE_REGEX.test(cleaned)) {
    return "Please enter a valid website URL";
  }
  return "";
};

export const validateTrackingIdOptional = (value) => {
  const cleaned = String(value || "").trim();
  if (!cleaned) return ""; // Optional field
  if (!TRACKING_ID_REGEX.test(cleaned.toUpperCase())) {
    return "Tracking ID must be 4-20 characters (letters, numbers, hyphens only)";
  }
  return "";
};

export const validateRecipientName = (value) => {
  const cleaned = String(value || "").trim();
  if (!cleaned) return "Recipient name is required";
  if (/\d/.test(cleaned)) {
    return "Recipient name cannot contain numbers";
  }
  if (!NAME_REGEX.test(cleaned)) {
    return "Recipient name must contain letters only (spaces, apostrophes, and hyphens are allowed)";
  }
  return "";
};
