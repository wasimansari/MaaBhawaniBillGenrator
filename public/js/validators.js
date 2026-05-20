const Validators = {
  email(value) {
    const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    return pattern.test(String(value).trim());
  },

  mobile(value) {
    const digits = String(value).replace(/\D/g, "");
    return /^[6-9]\d{9}$/.test(digits);
  },

  normalizeMobile(value) {
    return String(value).replace(/\D/g, "");
  },

  password(value) {
    return String(value).length >= 6;
  },

  required(value, minLength = 2) {
    return String(value).trim().length >= minLength;
  }
};
