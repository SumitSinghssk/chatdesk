import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  Bot,
  Check,
  CheckCheck,
  Inbox,
  Megaphone,
  PlugZap,
  ShoppingBag,
  Sparkles,
  Star,
} from "lucide-react";

import { absoluteUrl, siteConfig } from "@/config/site";
import { getBlogs, getSettings, getTestimonials } from "@/app/(website)/_lib/websiteApi";

import { JsonLd, PageSeo } from "./PageSeo";
import { BlogCardView, Container, SectionHeading } from "./ui";

import { CUSTOMER_ROUTES, WEBSITE_ROUTES } from "@/config/routes";

const FEATURES = [
  {
    icon: Inbox,
    title: "Shared team inbox",
    text: "Every WhatsApp chat in one place. Assign chats, add notes, use quick replies and never miss the 24-hour window.",
  },
  {
    icon: Megaphone,
    title: "Broadcasts & retargeting",
    text: "Send approved templates to segments, schedule campaigns and follow up with people who read, clicked or replied.",
  },
  {
    icon: Bot,
    title: "No-code chatbots",
    text: "Keyword replies, menus and drag-and-drop flows that qualify leads and hand over to your team when needed.",
  },
  {
    icon: Sparkles,
    title: "AI agent",
    text: "Answers questions from your website and documents 24/7, in your customer's language, and escalates when unsure.",
  },
  {
    icon: ShoppingBag,
    title: "WhatsApp commerce",
    text: "Share your catalog, collect orders, send payment links and recover abandoned carts from Shopify or WooCommerce.",
  },
  {
    icon: BarChart3,
    title: "Analytics that matter",
    text: "Delivery, read and reply rates, agent response times, campaign ROI and click-to-WhatsApp ad attribution.",
  },
];

const STEPS = [
  {
    title: "Create your account",
    text: "Sign up in a minute. No setup fee and no credit card to start.",
  },
  {
    title: "Connect your WhatsApp number",
    text: "Link your WhatsApp Business number through the official Meta Cloud API.",
  },
  {
    title: "Start talking to customers",
    text: "Reply from the team inbox, launch your first broadcast and switch on a chatbot.",
  },
];

// Edit plans and prices here.
const PLANS = [
  {
    name: "Starter",
    price: "Free",
    period: "",
    text: "For trying things out",
    features: ["1 WhatsApp number", "Team inbox for 2 agents", "Template messages", "Basic reports"],
    highlight: false,
  },
  {
    name: "Growth",
    price: "Contact us",
    period: "",
    text: "For growing teams",
    features: [
      "Unlimited broadcasts",
      "Chatbot flows",
      "Retargeting & segments",
      "Shopify & payment links",
      "Up to 10 agents",
    ],
    highlight: true,
  },
  {
    name: "Business",
    price: "Custom",
    period: "",
    text: "For high volume and AI",
    features: ["AI agent & knowledge base", "API & webhooks", "Multiple numbers", "Priority support"],
    highlight: false,
  },
];

function ChatPreview() {
  const bubbles = [
    { me: false, text: "Hi! Is the blue kurta available in size M?" },
    { me: true, text: "Yes 🙂 It's in stock. Shall I send you the payment link?" },
    { me: false, text: "Yes please" },
    { me: true, text: "Here you go: pay.example.com/ord-1042 — delivery in 2 days." },
  ];
  return (
    <div className="border-line bg-surface mx-auto w-full max-w-sm overflow-hidden rounded-3xl border shadow-xl">
      <div className="bg-primary flex items-center gap-3 px-4 py-3 text-white">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-sm font-bold">
          A
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1 text-sm font-semibold">
            Aanya Fashion <BadgeCheck className="h-4 w-4" aria-hidden />
          </p>
          <p className="text-xs text-white/80">Online · replies instantly</p>
        </div>
      </div>
      <div className="space-y-2 bg-[#efeae2] px-3 py-4">
        {bubbles.map((b, i) => (
          <div key={i} className={b.me ? "flex justify-end" : "flex justify-start"}>
            <p
              className={
                b.me
                  ? "max-w-[80%] rounded-xl rounded-tr-sm bg-[#d9fdd3] px-3 py-2 text-sm text-slate-800 shadow-xs"
                  : "max-w-[80%] rounded-xl rounded-tl-sm bg-white px-3 py-2 text-sm text-slate-800 shadow-xs"
              }
            >
              {b.text}
              {b.me && <CheckCheck className="ml-1 inline h-3.5 w-3.5 text-sky-500" aria-hidden />}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default async function HomePage() {
  const [settings, posts, testimonials] = await Promise.all([
    getSettings(),
    getBlogs({ per_page: 3 }),
    getTestimonials(),
  ]);
  const name = settings?.general.app_name ?? siteConfig.name;

  return (
    <>
      <PageSeo path="/" />
      <JsonLd
        data={{
          "@type": "Organization",
          name,
          url: siteConfig.url,
          logo: absoluteUrl(settings?.general.logo_light),
          email: settings?.general.emails[0],
          telephone: settings?.general.phones[0],
          sameAs: settings?.general.social_links.map((s) => s.url),
        }}
      />
      <JsonLd
        data={{
          "@type": "SoftwareApplication",
          name,
          url: siteConfig.url,
          applicationCategory: "BusinessApplication",
        }}
      />

      <section className="border-line bg-page relative overflow-hidden border-b">
        <div className="pointer-events-none absolute -top-40 left-1/2 h-[480px] w-[900px] -translate-x-1/2 rounded-full bg-emerald-200/40 blur-3xl" />
        <Container className="relative grid items-center gap-12 py-16 sm:py-24 lg:grid-cols-2">
          <div className="text-center lg:text-left">
            <p className="border-line bg-surface text-fg-muted inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold shadow-xs">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Built on the official WhatsApp Business API
            </p>
            <h1 className="text-fg mt-6 text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
              Sell, support and grow on <span className="text-primary">WhatsApp</span>
            </h1>
            <p className="text-fg-subtle mx-auto mt-6 max-w-xl text-lg lg:mx-0">
              {settings?.general.tagline ||
                "One workspace for your team inbox, broadcasts, chatbots and AI agent."}{" "}
              {name} helps your team answer faster and turn chats into sales.
            </p>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-3 lg:justify-start">
              <Link
                href={CUSTOMER_ROUTES.REGISTER()}
                className="bg-primary hover:bg-primary-hover inline-flex h-11 items-center gap-2 rounded-lg px-5 text-sm font-semibold text-white shadow-sm"
              >
                Start free <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <Link
                href={WEBSITE_ROUTES.CONTACT()}
                className="border-line bg-surface text-fg hover:bg-page inline-flex h-11 items-center rounded-lg border px-5 text-sm font-semibold shadow-xs"
              >
                Book a demo
              </Link>
            </div>
            <ul className="text-fg-subtle mt-8 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm lg:justify-start">
              {["No setup fee", "Meta's official API", "Cancel any time"].map((item) => (
                <li key={item} className="flex items-center gap-1.5">
                  <Check className="text-primary h-4 w-4" aria-hidden /> {item}
                </li>
              ))}
            </ul>
          </div>
          <ChatPreview />
        </Container>
      </section>

      <section id="features" className="scroll-mt-20">
        <Container className="py-20">
          <SectionHeading eyebrow="Features" title="Everything your team needs on WhatsApp" />
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <div key={title} className="border-line bg-surface rounded-2xl border p-6 shadow-xs">
                <span className="bg-primary-soft text-primary flex h-10 w-10 items-center justify-center rounded-xl">
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <h3 className="text-fg mt-4 text-base font-semibold">{title}</h3>
                <p className="text-fg-subtle mt-1.5 text-sm">{text}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      <section className="border-line bg-page border-y">
        <Container className="py-20">
          <SectionHeading eyebrow="How it works" title="Live in three steps" />
          <ol className="grid gap-6 md:grid-cols-3">
            {STEPS.map((step, i) => (
              <li key={step.title} className="border-line bg-surface rounded-2xl border p-6 shadow-xs">
                <span className="bg-primary flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold text-white">
                  {i + 1}
                </span>
                <h3 className="text-fg mt-4 font-semibold">{step.title}</h3>
                <p className="text-fg-subtle mt-1.5 text-sm">{step.text}</p>
              </li>
            ))}
          </ol>
          <p className="text-fg-subtle mt-8 flex items-center justify-center gap-2 text-center text-sm">
            <PlugZap className="text-primary h-4 w-4" aria-hidden />
            Works with Shopify, WooCommerce, Razorpay, Google Sheets and your own systems through our API.
          </p>
        </Container>
      </section>

      <section id="pricing" className="scroll-mt-20">
        <Container className="py-20">
          <SectionHeading eyebrow="Pricing" title="Simple plans. Meta message charges at cost." />
          <div className="grid gap-6 md:grid-cols-3">
            {PLANS.map((plan) => (
              <div
                key={plan.name}
                className={
                  plan.highlight
                    ? "border-primary bg-surface ring-primary/15 relative flex flex-col rounded-2xl border-2 p-6 shadow-md ring-4"
                    : "border-line bg-surface flex flex-col rounded-2xl border p-6 shadow-xs"
                }
              >
                {plan.highlight && (
                  <span className="bg-primary absolute -top-3 left-6 rounded-full px-2.5 py-0.5 text-xs font-semibold text-white">
                    Most popular
                  </span>
                )}
                <h3 className="text-fg font-semibold">{plan.name}</h3>
                <p className="text-fg-subtle text-sm">{plan.text}</p>
                <p className="text-fg mt-4 text-3xl font-bold">
                  {plan.price}
                  {plan.period && <span className="text-fg-subtle text-sm font-medium">{plan.period}</span>}
                </p>
                <ul className="mt-6 flex-1 space-y-2.5">
                  {plan.features.map((f) => (
                    <li key={f} className="text-fg-muted flex items-start gap-2 text-sm">
                      <Check className="text-primary mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href={plan.highlight ? CUSTOMER_ROUTES.REGISTER() : WEBSITE_ROUTES.CONTACT()}
                  className={
                    plan.highlight
                      ? "bg-primary hover:bg-primary-hover mt-8 inline-flex h-10 items-center justify-center rounded-lg text-sm font-semibold text-white"
                      : "border-line text-fg hover:bg-page mt-8 inline-flex h-10 items-center justify-center rounded-lg border text-sm font-semibold"
                  }
                >
                  {plan.highlight ? "Start free" : "Talk to us"}
                </Link>
              </div>
            ))}
          </div>
        </Container>
      </section>

      {testimonials.length > 0 && (
        <section className="border-line bg-page border-t">
          <Container className="py-20">
            <SectionHeading eyebrow="Testimonials" title="Loved by teams like yours" />
            <div className="grid gap-6 md:grid-cols-3">
              {testimonials.slice(0, 6).map((t) => (
                <figure
                  key={t.id}
                  className="border-line bg-surface flex flex-col rounded-2xl border p-6 shadow-xs"
                >
                  {t.rating && (
                    <div className="flex gap-0.5 text-amber-400" aria-label={`${t.rating} out of 5 stars`}>
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star
                          key={i}
                          className={i < t.rating! ? "h-4 w-4 fill-current" : "text-line-strong h-4 w-4"}
                        />
                      ))}
                    </div>
                  )}
                  <blockquote className="text-fg-muted mt-4 flex-1 text-base">“{t.quote}”</blockquote>
                  <figcaption className="mt-6 flex items-center gap-3">
                    {t.photo ? (
                      <img
                        src={t.photo}
                        alt={t.name}
                        className="h-10 w-10 rounded-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <span className="bg-primary-soft text-primary flex h-10 w-10 items-center justify-center rounded-full font-semibold">
                        {t.name.charAt(0)}
                      </span>
                    )}
                    <span>
                      <span className="text-fg block text-sm font-semibold">{t.name}</span>
                      <span className="text-fg-subtle block text-xs">
                        {[t.designation, t.company].filter(Boolean).join(", ")}
                      </span>
                    </span>
                  </figcaption>
                </figure>
              ))}
            </div>
          </Container>
        </section>
      )}

      {!!posts?.data.length && (
        <section className="border-line border-t">
          <Container className="py-20">
            <SectionHeading
              eyebrow="From the blog"
              title="WhatsApp marketing guides"
              action={
                <Link
                  href={WEBSITE_ROUTES.BLOG()}
                  className="text-primary inline-flex items-center gap-1 text-sm font-semibold"
                >
                  View all posts <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              }
            />
            <div className="grid gap-6 md:grid-cols-3">
              {posts.data.map((post) => (
                <BlogCardView key={post.id} post={post} />
              ))}
            </div>
          </Container>
        </section>
      )}

      <section className="pb-20">
        <Container>
          <div className="relative overflow-hidden rounded-3xl bg-slate-900 px-6 py-14 text-center sm:px-16">
            <div className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-emerald-500/30 blur-3xl" />
            <h2 className="relative text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Ready to grow on WhatsApp?
            </h2>
            <p className="relative mx-auto mt-3 max-w-xl text-slate-300">
              Create your free account, connect your number and send your first message today.
            </p>
            <Link
              href={CUSTOMER_ROUTES.REGISTER()}
              className="relative mt-8 inline-flex h-11 items-center gap-2 rounded-lg bg-white px-5 text-sm font-semibold text-slate-900 hover:bg-slate-100"
            >
              Start free <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </Container>
      </section>
    </>
  );
}
