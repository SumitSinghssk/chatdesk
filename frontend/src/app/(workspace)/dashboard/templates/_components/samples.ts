import type { TemplateButton, TemplateInput } from "../../_lib/templatesApi";

export interface SampleTemplate {
  key: string;
  title: string;
  description: string;
  template: Omit<TemplateInput, "submit">;
}

const button = (b: Partial<TemplateButton> & Pick<TemplateButton, "type">): TemplateButton => ({
  text: "",
  url: null,
  phone_number: null,
  example: null,
  ...b,
});

const base = {
  language: "en",
  parameter_format: "positional" as const,
  header: { format: "none" as const, text: null, example: null },
  footer: null,
  buttons: [] as TemplateButton[],
  add_security_recommendation: true,
  code_expiration_minutes: null,
};

// Ready-made starting points. Every one follows Meta's rules, so it can be submitted as is
// (after uploading a sample file for templates with an image or document header).
export const SAMPLES: SampleTemplate[] = [
  {
    key: "festive_offer",
    title: "Festive sale",
    description: "Image, discount and a shop button",
    template: {
      ...base,
      name: "festive_sale_offer",
      category: "marketing",
      header: { format: "image", text: null, example: null },
      body: "Hi {{1}} 🎉\n\nOur *Festive Sale* is live! Get *{{2}} off* on everything until {{3}}.\n\nHurry, the best picks sell out fast.",
      examples: { "1": "Asha", "2": "20%", "3": "Sunday" },
      footer: "Reply STOP to stop offers",
      buttons: [
        button({ type: "url", text: "Shop now", url: "https://www.example.com/sale" }),
        button({ type: "quick_reply", text: "Stop promotions" }),
      ],
    },
  },
  {
    key: "abandoned_cart",
    title: "Abandoned cart",
    description: "Bring shoppers back to their cart",
    template: {
      ...base,
      name: "cart_reminder",
      category: "marketing",
      header: { format: "text", text: "You left something behind", example: null },
      body: "Hi {{1}}, the items in your cart are still waiting for you. Complete your order today and get *free delivery*.",
      examples: { "1": "Rahul" },
      buttons: [
        button({
          type: "url",
          text: "Complete order",
          url: "https://www.example.com/cart/{{1}}",
          example: "a1b2c3",
        }),
      ],
    },
  },
  {
    key: "coupon",
    title: "Welcome coupon",
    description: "A code customers copy with one tap",
    template: {
      ...base,
      name: "welcome_coupon",
      category: "marketing",
      body: "Welcome to the family, {{1}}! 💚\n\nHere's *10% off* your first order. Tap below to copy your code and use it at checkout.",
      examples: { "1": "Neha" },
      footer: "Valid for 7 days",
      buttons: [
        button({ type: "copy_code", text: "Copy offer code", example: "WELCOME10" }),
        button({ type: "url", text: "Start shopping", url: "https://www.example.com" }),
      ],
    },
  },
  {
    key: "feedback",
    title: "Feedback request",
    description: "One-tap reply buttons",
    template: {
      ...base,
      name: "feedback_request",
      category: "marketing",
      body: "Hi {{1}}, how was your recent experience with us? Your feedback helps us serve you better.",
      examples: { "1": "Priya" },
      buttons: [
        button({ type: "quick_reply", text: "Loved it" }),
        button({ type: "quick_reply", text: "It was okay" }),
        button({ type: "quick_reply", text: "Not happy" }),
      ],
    },
  },
  {
    key: "order_confirmed",
    title: "Order confirmation",
    description: "Order details with a tracking link",
    template: {
      ...base,
      name: "order_confirmation",
      category: "utility",
      header: { format: "text", text: "Order confirmed", example: null },
      body: "Hi {{1}}, thanks for your order *#{{2}}* of {{3}}. We'll message you as soon as it ships.",
      examples: { "1": "Asha", "2": "1042", "3": "₹1,499" },
      buttons: [
        button({
          type: "url",
          text: "View order",
          url: "https://www.example.com/orders/{{1}}",
          example: "1042",
        }),
      ],
    },
  },
  {
    key: "shipped",
    title: "Order shipped",
    description: "Shipping update with tracking",
    template: {
      ...base,
      name: "order_shipped",
      category: "utility",
      body: "Good news, {{1}}! Your order *#{{2}}* has shipped and should reach you by {{3}}.",
      examples: { "1": "Asha", "2": "1042", "3": "Friday" },
      buttons: [
        button({
          type: "url",
          text: "Track order",
          url: "https://www.example.com/track/{{1}}",
          example: "1042",
        }),
      ],
    },
  },
  {
    key: "out_for_delivery",
    title: "Out for delivery",
    description: "Shows the delivery location",
    template: {
      ...base,
      name: "out_for_delivery",
      category: "utility",
      header: { format: "location", text: null, example: null },
      body: "Hi {{1}}, your order *#{{2}}* is out for delivery today. Please keep your phone handy for our delivery partner.",
      examples: { "1": "Asha", "2": "1042" },
    },
  },
  {
    key: "payment_due",
    title: "Payment reminder",
    description: "Due amount with pay and call buttons",
    template: {
      ...base,
      name: "payment_reminder",
      category: "utility",
      body: "Hi {{1}}, this is a reminder that {{2}} for invoice {{3}} is due on {{4}}. Please ignore this if you've already paid.",
      examples: { "1": "Rahul", "2": "₹2,500", "3": "INV-208", "4": "30 Oct" },
      buttons: [
        button({ type: "url", text: "Pay now", url: "https://www.example.com/pay" }),
        button({ type: "phone_number", text: "Call us", phone_number: "+919876543210" }),
      ],
    },
  },
  {
    key: "invoice",
    title: "Invoice PDF",
    description: "Send a document with the message",
    template: {
      ...base,
      name: "invoice_ready",
      category: "utility",
      header: { format: "document", text: null, example: null },
      body: "Hi {{1}}, your invoice {{2}} is attached. Thank you for your business!",
      examples: { "1": "Rahul", "2": "INV-208" },
    },
  },
  {
    key: "appointment",
    title: "Appointment reminder",
    description: "Confirm or reschedule in one tap",
    template: {
      ...base,
      name: "appointment_reminder",
      category: "utility",
      body: "Hi {{1}}, this is a reminder of your appointment on *{{2}}* at {{3}}. Please confirm if you can make it.",
      examples: { "1": "Priya", "2": "Monday, 28 Oct", "3": "4:30 PM" },
      buttons: [
        button({ type: "quick_reply", text: "Confirm" }),
        button({ type: "quick_reply", text: "Reschedule" }),
      ],
    },
  },
  {
    key: "otp",
    title: "Login code (OTP)",
    description: "Verification code with a copy button",
    template: {
      ...base,
      name: "login_code",
      category: "authentication",
      body: "",
      examples: {},
      code_expiration_minutes: 10,
    },
  },
];
