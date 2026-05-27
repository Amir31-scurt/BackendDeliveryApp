const validateEmail = (email) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

const validateDelivererInput = (input) => {
  const errors = {};

  if (input.zone && typeof input.zone !== "string") {
    errors.zone = "Zone must be a string";
  }

  if (input.currentLocation && typeof input.currentLocation !== "string") {
    errors.currentLocation = "Current location must be a string";
  }

  if (
    input.isAvailable !== undefined &&
    typeof input.isAvailable !== "boolean"
  ) {
    errors.isAvailable = "Availability must be a boolean";
  }

  if (Object.keys(errors).length > 0) {
    throw new Error(JSON.stringify(errors));
  }
};

module.exports = {validateEmail, validateDelivererInput};
module.exports.validateEmail = validateEmail;
module.exports.validateDelivererInput = validateDelivererInput;
