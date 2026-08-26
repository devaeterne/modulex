"use client";

import { useEffect } from "react";
import {
  isValidCountryCode,
  isValidCurrencyCode,
  isValidEmail,
  isValidHttpUrl,
  isValidPhone,
  normalizeCountryCode,
  normalizeCurrencyCode,
  sanitizePhoneInput,
} from "@/lib/validation";

function descriptor(input: HTMLInputElement) {
  const labels = input.labels
    ? Array.from(input.labels)
        .map((label) => label.textContent ?? "")
        .join(" ")
    : "";

  return [
    input.name,
    input.id,
    input.getAttribute("aria-label"),
    input.placeholder,
    labels,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function isPhoneInput(input: HTMLInputElement, text = descriptor(input)) {
  return (
    input.type === "tel" ||
    /(^|[\s_-])(phone|mobile|telephone|tel)([\s_-]|$)/.test(text)
  );
}

function isEmailListInput(text: string) {
  return /(recipients?|notifications?|alerts?)/.test(text);
}

function isEmailInput(input: HTMLInputElement, text = descriptor(input)) {
  return (
    !isEmailListInput(text) &&
    (input.type === "email" || /(^|[\s_-])e?-?mail([\s_-]|$)/.test(text))
  );
}

function isCountryCodeInput(text: string) {
  return text.includes("country code") || text.includes("country_code");
}

function isCurrencyCodeInput(text: string) {
  return (
    text.includes("currency code") ||
    text.includes("currency_code") ||
    text.includes("default currency")
  );
}

function isWebsiteInput(input: HTMLInputElement, text: string) {
  return input.type === "url" || text.includes("website") || text.includes("url");
}

function useUsPlaceholder(input: HTMLInputElement, text: string) {
  const placeholder = input.placeholder.trim();
  const lower = placeholder.toLowerCase();

  if (isPhoneInput(input, text)) {
    if (!placeholder || /\+382|\+90|montenegro|turkey|türkiye/.test(lower)) {
      input.placeholder = "+1 (202) 555-0123";
    }
    return;
  }

  if (isCountryCodeInput(text)) {
    if (!placeholder || /^(me|tr)$/i.test(placeholder)) input.placeholder = "US";
    return;
  }

  if (isCurrencyCodeInput(text)) {
    if (!placeholder || /^eur$/i.test(placeholder)) input.placeholder = "USD";
    return;
  }

  if (text.includes("timezone") && /europe\/(podgorica|istanbul)/i.test(placeholder)) {
    input.placeholder = "America/New_York";
    return;
  }

  if (text.includes("postal") || text.includes("zip")) {
    if (!placeholder || /81000|34000/.test(placeholder)) input.placeholder = "10001";
  }
}

function applyInputAttributes(input: HTMLInputElement) {
  const text = descriptor(input);

  useUsPlaceholder(input, text);

  if (isPhoneInput(input, text)) {
    input.type = "tel";
    input.inputMode = "tel";
    input.autocomplete = input.autocomplete || "tel";
    input.maxLength = input.maxLength > 0 ? Math.min(input.maxLength, 24) : 24;
  }

  if (isEmailInput(input, text)) {
    input.type = "email";
    input.inputMode = "email";
    input.autocomplete = input.autocomplete || "email";
  }

  if (isCountryCodeInput(text)) {
    input.maxLength = 2;
    input.setAttribute("autocapitalize", "characters");
    input.setAttribute("spellcheck", "false");
  }

  if (isCurrencyCodeInput(text)) {
    input.maxLength = 3;
    input.setAttribute("autocapitalize", "characters");
    input.setAttribute("spellcheck", "false");
  }

  if (text.includes("postal") || text.includes("zip")) {
    input.autocomplete = input.autocomplete || "postal-code";
  }

  if (isWebsiteInput(input, text)) {
    input.inputMode = "url";
  }
}

function validateInput(input: HTMLInputElement) {
  const text = descriptor(input);
  const value = input.value.trim();

  input.setCustomValidity("");

  if (!value) return true;

  if (isEmailInput(input, text) && !isValidEmail(value)) {
    input.setCustomValidity("Enter a valid email address, for example name@example.com.");
  } else if (isPhoneInput(input, text) && !isValidPhone(value)) {
    input.setCustomValidity("Enter a valid phone number using 7 to 15 digits. Letters are not allowed.");
  } else if (isCountryCodeInput(text) && !isValidCountryCode(value)) {
    input.setCustomValidity("Enter a 2-letter ISO country code, for example US.");
  } else if (isCurrencyCodeInput(text) && !isValidCurrencyCode(value)) {
    input.setCustomValidity("Enter a 3-letter ISO currency code, for example USD.");
  } else if (isWebsiteInput(input, text) && !isValidHttpUrl(value)) {
    input.setCustomValidity("Enter a valid URL beginning with http:// or https://.");
  }

  return input.checkValidity();
}

export default function GlobalInputValidation() {
  useEffect(() => {
    const applyAll = (root: ParentNode = document) => {
      root.querySelectorAll<HTMLInputElement>("input").forEach(applyInputAttributes);
    };

    applyAll();

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => {
          if (!(node instanceof Element)) return;
          if (node instanceof HTMLInputElement) applyInputAttributes(node);
          applyAll(node);
        });
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    const handleInput = (event: Event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement)) return;

      const text = descriptor(input);

      if (isPhoneInput(input, text)) {
        const sanitized = sanitizePhoneInput(input.value);
        if (sanitized !== input.value) input.value = sanitized;
      } else if (isCountryCodeInput(text)) {
        const normalized = normalizeCountryCode(input.value);
        if (normalized !== input.value) input.value = normalized;
      } else if (isCurrencyCodeInput(text)) {
        const normalized = normalizeCurrencyCode(input.value);
        if (normalized !== input.value) input.value = normalized;
      }

      input.setCustomValidity("");
    };

    const handleBlur = (event: FocusEvent) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement)) return;
      validateInput(input);
    };

    const handleSubmit = (event: Event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;

      let valid = true;
      form.querySelectorAll<HTMLInputElement>("input").forEach((input) => {
        applyInputAttributes(input);
        if (!validateInput(input)) valid = false;
      });

      if (!valid) {
        event.preventDefault();
        form.reportValidity();
      }
    };

    document.addEventListener("input", handleInput, true);
    document.addEventListener("blur", handleBlur, true);
    document.addEventListener("submit", handleSubmit, true);

    return () => {
      observer.disconnect();
      document.removeEventListener("input", handleInput, true);
      document.removeEventListener("blur", handleBlur, true);
      document.removeEventListener("submit", handleSubmit, true);
    };
  }, []);

  return null;
}
