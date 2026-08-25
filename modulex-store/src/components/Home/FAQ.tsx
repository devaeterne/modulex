"use client";

import { useState } from "react";

const FAQ_ITEMS = [
  {
    question: "How long does a typical interior design project take?",
    answer:
      "Project timelines vary depending on scope and complexity. A single room redesign typically takes 4-6 weeks, while a full home renovation can take 3-6 months. We provide a detailed timeline during our initial consultation and keep you updated throughout the process.",
  },
  {
    question: "What is your design process?",
    answer:
      "Our process begins with a consultation to understand your vision, needs, and budget. We then create mood boards and 3D renderings for your approval. Once approved, we handle everything from furniture sourcing to installation, ensuring a seamless experience from concept to completion.",
  },
  {
    question: "Do you work within specific budgets?",
    answer:
      "Absolutely! We work with a range of budgets and are transparent about costs from the start. During our consultation, we'll discuss your budget and create a plan that maximizes value while achieving your design goals. We provide detailed quotes with no hidden fees.",
  },
  {
    question: "Can you work with my existing furniture?",
    answer:
      "Yes! We're happy to incorporate your existing pieces into the new design. We can refresh them with new arrangements, accessories, or minor updates. This approach often saves money while maintaining sentimental pieces you love.",
  },
  {
    question: "Do you offer virtual design consultations?",
    answer:
      "Yes, we offer both in-person and virtual consultations to accommodate clients anywhere. Virtual consultations are conducted via video call and include the same comprehensive service as in-person meetings, including mood boards, 3D renderings, and detailed design plans.",
  },
  {
    question: "What makes Oakwell different from other design firms?",
    answer:
      "Our commitment to personalized service, attention to detail, and innovative design solutions sets us apart. We don't believe in one-size-fits-all approaches. Every project receives our full creative attention, and we maintain close communication throughout to ensure your vision becomes reality.",
  },
];

export default function FAQ() {
  const [activeIndex, setActiveIndex] = useState<number | null>(0);

  const toggleAccordion = (index: number) => {
    setActiveIndex(activeIndex === index ? null : index);
  };

  return (
    <section className="faq" id="faq">
      <div className="container">
        <div className="row">
          <div className="col-lg-4">
            <div className="section-header">
              <span className="section-tag">FAQ</span>
              <h2>Frequently Asked Questions</h2>
              <p>
                Everything you need to know about working with us. We combine
                strategic thinking, refined design, and seamless execution.
              </p>
            </div>
          </div>
          <div className="col-lg-8">
            <div className="faq-container">
              {FAQ_ITEMS.map((item, index) => (
                <div
                  key={index}
                  className={`faq-item ${activeIndex === index ? "active" : ""}`}
                >
                  <div
                    className="faq-question"
                    onClick={() => toggleAccordion(index)}
                  >
                    <h3>{item.question}</h3>
                    <span className="faq-icon">+</span>
                  </div>
                  <div
                    className="faq-answer"
                    style={{
                      maxHeight: activeIndex === index ? "200px" : "0",
                      overflow: "hidden",
                      transition: "max-height 0.3s ease",
                    }}
                  >
                    <p>{item.answer}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
