"use client";

import { useState, useRef } from "react";
// import emailjs from "@emailjs/browser"; // We'll lazy load this

export default function Contact() {
  const form = useRef<HTMLFormElement>(null);
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    projectType: "",
    budget: "",
    message: "",
    newsletter: false,
  });

  const [status, setStatus] = useState<{
    type: "success" | "error" | null;
    message: string;
  }>({ type: null, message: "" });

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;

    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setStatus({ type: null, message: "" });

    if (!form.current) return;

    // Replace these with your EmailJS service ID, template ID, and public key
    const serviceID = "YOUR_SERVICE_ID";
    const templateID = "YOUR_TEMPLATE_ID";
    const publicKey = "YOUR_PUBLIC_KEY";

    import("@emailjs/browser")
      .then((module) => {
        const emailjs = module.default;
        return emailjs.sendForm(serviceID, templateID, form.current!, {
          publicKey: publicKey,
        });
      })
      .then(
        () => {
          setStatus({
            type: "success",
            message: "Thank you! We will contact you within 24 hours.",
          });
          setFormData({
            firstName: "",
            lastName: "",
            email: "",
            phone: "",
            projectType: "",
            budget: "",
            message: "",
            newsletter: false,
          });
        }
      )
      .catch((error) => {
        setStatus({
          type: "error",
          message: "Something went wrong. Please try again.",
        });
        console.error("FAILED...", error);
        alert("EmailJS Error: " + JSON.stringify(error));
      })
      .finally(() => {
        setIsSubmitting(false);
      });
  };

  return (
    <section className="contact-section" id="contact">
      <div className="section-header text-center">
        <span className="section-tag">Contact Us</span>
        <h2>Let&apos;s Start Your Project</h2>
        <p>
          Get in touch with our team and let&apos;s bring your vision to life
        </p>
      </div>
      <div className="contact-container">
        <div className="contact-info">
          <div className="contact-intro">
            <h3>Get in Touch</h3>
            <p>
              Ready to transform your space? Fill out the form and our design
              team will reach out within 24 hours to schedule your free
              consultation.
            </p>
          </div>

          <div className="contact-details">
            <div className="contact-item">
              <div className="contact-icon">
                <i className="bi bi-geo-alt"></i>
              </div>
              <div className="contact-text">
                <h4>Visit Our Studio</h4>
                <p>
                  123 Design Street<br />
                  New York, NY 10001
                </p>
              </div>
            </div>
            <div className="contact-item">
              <div className="contact-icon">
                <i className="bi bi-telephone"></i>
              </div>
              <div className="contact-text">
                <h4>Call Us</h4>
                <p>
                  +1 (555) 123-4567<br />
                  Mon-Fri, 9AM-6PM EST
                </p>
              </div>
            </div>
            <div className="contact-item">
              <div className="contact-icon">
                <i className="bi bi-envelope"></i>
              </div>
              <div className="contact-text">
                <h4>Email Us</h4>
                <p>
                  hello@Oakwell.design<br />
                  We reply within 24 hours
                </p>
              </div>
            </div>
            <div className="contact-item">
              <div className="contact-icon">
                <i className="bi bi-clock"></i>
              </div>
              <div className="contact-text">
                <h4>Office Hours</h4>
                <p>
                  Monday - Friday: 9AM - 6PM<br />
                  Saturday: 10AM - 4PM
                </p>
              </div>
            </div>
          </div>
          <div className="contact-social">
            <h4>Follow Us</h4>
            <div className="social-links-contact">
              <a href="#" aria-label="Facebook">
                <i className="bi bi-facebook"></i>
              </a>
              <a href="#" aria-label="Instagram">
                <i className="bi bi-instagram"></i>
              </a>
              <a href="#" aria-label="Twitter">
                <i className="bi bi-twitter-x"></i>
              </a>
              <a href="#" aria-label="Pinterest">
                <i className="bi bi-pinterest"></i>
              </a>
              <a href="#" aria-label="LinkedIn">
                <i className="bi bi-linkedin"></i>
              </a>
            </div>
          </div>
        </div>
        <div className="contact-form-wrapper">
          <form className="contact-form" ref={form} onSubmit={handleSubmit}>
            {status.message && (
              <div
                className="form-notif"
                style={{
                  display: "block",
                  opacity: 1,
                  background:
                    status.type === "success" ? "#d1fae5" : "#fee2e2",
                  color: status.type === "success" ? "#065f46" : "#991b1b",
                  border:
                    status.type === "success"
                      ? "1px solid #6ee7b7"
                      : "1px solid #fca5a5",
                  marginTop: "14px",
                  padding: "12px 16px",
                  borderRadius: "6px",
                  fontSize: "0.92rem",
                  fontWeight: 500,
                  transition: "opacity 0.3s ease",
                }}
              >
                {status.message}
              </div>
            )}
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="firstName">First Name *</label>
                <input
                  type="text"
                  id="firstName"
                  name="firstName"
                  required
                  placeholder="John"
                  value={formData.firstName}
                  onChange={handleChange}
                />
              </div>
              <div className="form-group">
                <label htmlFor="lastName">Last Name *</label>
                <input
                  type="text"
                  id="lastName"
                  name="lastName"
                  required
                  placeholder="Doe"
                  value={formData.lastName}
                  onChange={handleChange}
                />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="email">Email *</label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  required
                  placeholder="john@example.com"
                  value={formData.email}
                  onChange={handleChange}
                />
              </div>
              <div className="form-group">
                <label htmlFor="phone">Phone Number</label>
                <input
                  type="tel"
                  id="phone"
                  name="phone"
                  placeholder="+1 (555) 000-0000"
                  value={formData.phone}
                  onChange={handleChange}
                />
              </div>
            </div>
            <div className="form-group">
              <label htmlFor="projectType">Project Type *</label>
              <select
                id="projectType"
                name="projectType"
                required
                value={formData.projectType}
                onChange={handleChange}
              >
                <option value="">Select a project type</option>
                <option value="residential">Residential Design</option>
                <option value="commercial">Commercial Space</option>
                <option value="renovation">Renovation</option>
                <option value="consultation">Consultation Only</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="budget">Budget Range</label>
              <select
                id="budget"
                name="budget"
                value={formData.budget}
                onChange={handleChange}
              >
                <option value="">Select your budget</option>
                <option value="5-10k">$5,000 - $10,000</option>
                <option value="10-25k">$10,000 - $25,000</option>
                <option value="25-50k">$25,000 - $50,000</option>
                <option value="50-100k">$50,000 - $100,000</option>
                <option value="100k+">$100,000+</option>
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="message">Tell us about your project *</label>
              <textarea
                id="message"
                name="message"
                rows={5}
                required
                placeholder="Describe your vision, timeline, and any specific requirements..."
                value={formData.message}
                onChange={handleChange}
              ></textarea>
            </div>
            <div className="form-group checkbox-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  name="newsletter"
                  checked={formData.newsletter}
                  onChange={handleChange}
                />
                <span>Send me design tips and project inspiration</span>
              </label>
            </div>
            <button
              type="submit"
              className="btn-submit"
              disabled={isSubmitting}
              style={{
                background: status.type === "success" ? "#4CAF50" : undefined,
              }}
            >
              <span>
                {isSubmitting
                  ? "Sending..."
                  : status.type === "success"
                    ? "✓ Message Sent"
                    : "Send Message"}
              </span>
              {!isSubmitting && status.type !== "success" && (
                <span className="submit-icon">
                  <i className="bi bi-chevron-right"></i>
                </span>
              )}
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}
