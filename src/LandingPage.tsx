import {
  ArrowRight,
  BadgeCheck,
  Check,
  Command,
  Download,
  Image as ImageIcon,
  Lock,
  MousePointer2,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  TerminalSquare,
} from "lucide-react";
import type { ReactNode } from "react";

const checkoutUrl =
  import.meta.env.VITE_CLIPFLOW_CHECKOUT_URL ||
  "https://buy.paddle.com/checkout/replace-with-clipflow-lifetime";
const downloadUrl =
  import.meta.env.VITE_CLIPFLOW_DOWNLOAD_URL ||
  "https://github.com/GustavoNoll/clipflow/releases/latest/download/ClipFlow_0.1.1_aarch64.dmg";

const recentClips = [
  {
    app: "Arc",
    type: "Link",
    title: "figma.com/file/clipflow-launch-board",
    meta: "Just now",
  },
  {
    app: "Shottr",
    type: "Image",
    title: "Screenshot · 1280×720",
    meta: "2m ago",
    visual: "screenshot",
  },
  {
    app: "Cursor",
    type: "Code",
    title: "const cleanUrl = (url: string) => {",
    meta: "4m ago",
  },
  {
    app: "ChatGPT",
    type: "Text",
    title: "Write a concise launch post for ClipFlow",
    meta: "8m ago",
  },
];

const features = [
  {
    icon: MousePointer2,
    title: "Notch access",
    body: "Hover the notch to bring back recent clips without opening a full window.",
  },
  {
    icon: Search,
    title: "Fast recall",
    body: "Search text, links, code, screenshots, apps, and file names from one compact library.",
  },
  {
    icon: ImageIcon,
    title: "Screenshots with OCR",
    body: "Captured images can become searchable text, locally on your Mac.",
  },
  {
    icon: ShieldCheck,
    title: "Privacy controls",
    body: "Pause capture, ignore apps, hide sensitive content, and reveal private clips deliberately.",
  },
];

const comparisons = [
  "No subscription",
  "No cloud clipboard sync",
  "No Dock icon required",
  "Built around the Mac notch",
];

const faqs = [
  {
    question: "Is this a subscription?",
    answer:
      "No. ClipFlow is sold as a one-time lifetime license. The launch price is $10, then it moves to $15.",
  },
  {
    question: "What does lifetime mean?",
    answer:
      "You can keep using the app version you bought. Updates in the current major version are included.",
  },
  {
    question: "Does ClipFlow upload my clipboard?",
    answer:
      "No by default. The product is designed around local clipboard history and local OCR.",
  },
  {
    question: "Can I try it first?",
    answer:
      "Yes. The landing keeps a download trial CTA next to the lifetime checkout.",
  },
];

export default function LandingPage() {
  return (
    <main className="landing-page min-h-screen bg-[#08080a] text-white">
      <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-5 sm:px-8">
        <a href="#top" className="flex items-center gap-3" aria-label="ClipFlow home">
          <LandingLogo />
          <span className="text-[15px] font-semibold tracking-tight">
            ClipFlow
          </span>
        </a>
        <nav className="hidden items-center gap-7 text-[13px] font-medium text-white/62 md:flex">
          <a className="transition-colors hover:text-white" href="#features">
            Features
          </a>
          <a className="transition-colors hover:text-white" href="#privacy">
            Privacy
          </a>
          <a className="transition-colors hover:text-white" href="/pricing">
            Pricing
          </a>
          <a className="transition-colors hover:text-white" href="#faq">
            FAQ
          </a>
        </nav>
        <a
          href={checkoutUrl}
          className="rounded-full bg-white px-4 py-2 text-[13px] font-semibold text-black transition-transform hover:-translate-y-0.5"
        >
          Buy for $10
        </a>
      </header>

      <section
        id="top"
        className="mx-auto grid w-full max-w-7xl gap-10 px-5 pb-20 pt-10 sm:px-8 lg:grid-cols-[0.92fr_1.08fr] lg:items-center lg:pb-28 lg:pt-16"
      >
        <div>
          <div className="mb-6 flex items-center gap-4">
            <div className="relative h-20 w-20 overflow-hidden rounded-[22px] bg-black ring-1 ring-white/12">
              <img
                src="/assets/clipflow-icon.png"
                alt="ClipFlow app icon"
                className="h-full w-full object-cover"
                draggable={false}
              />
            </div>
            <div className="text-[13px] font-semibold text-white/48">
              <p className="text-white/80">ClipFlow for macOS</p>
              <p>Notch clipboard history</p>
            </div>
          </div>
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-[13px] font-medium text-white/72">
            <Sparkles size={14} className="text-[#7d82ff]" />
            Launch price, $10 lifetime
          </div>
          <h1 className="max-w-4xl text-balance text-[clamp(3rem,8vw,5.9rem)] font-semibold leading-[0.94] tracking-[-0.035em]">
            Clipboard history built into your Mac notch.
          </h1>
          <p className="mt-6 max-w-2xl text-pretty text-[18px] leading-8 text-white/68">
            ClipFlow keeps copied text, links, code, screenshots, files, and
            colors close to your cursor. Hover the notch, search what you need,
            copy it back, and stay inside the task.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a
              href={checkoutUrl}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[#6d71ff] px-6 text-[15px] font-semibold text-white transition-transform hover:-translate-y-0.5"
            >
              Buy lifetime for $10
              <ArrowRight size={17} />
            </a>
            <a
              href={downloadUrl}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-white/12 bg-white/[0.06] px-6 text-[15px] font-semibold text-white transition-colors hover:bg-white/[0.10]"
            >
              <Download size={17} />
              Download trial
            </a>
          </div>
          <p className="mt-4 text-[13px] text-white/42">
            Price becomes $15 after launch. One-time purchase, no subscription.
          </p>
        </div>

        <div className="landing-demo relative min-h-[440px] overflow-hidden rounded-[22px] bg-[#101014] p-4 ring-1 ring-white/10">
          <div className="absolute left-1/2 top-0 h-[58px] w-[210px] -translate-x-1/2 rounded-b-[30px] bg-black" />
          <div className="relative mt-7 overflow-hidden rounded-b-[24px] bg-black p-5 pt-12">
            <div className="absolute left-4 top-3 flex items-center gap-2 text-[12px] font-medium text-white/66">
              <Command size={14} />
              Last copy
            </div>
            <div className="absolute right-4 top-3 flex items-center gap-2">
              <span className="h-7 w-7 rounded-full bg-white/[0.10]" />
              <span className="h-7 w-7 rounded-full bg-white/[0.10]" />
              <span className="h-7 w-7 rounded-full bg-[#6d71ff]" />
            </div>
            <div className="flex items-center gap-3 rounded-full bg-white/[0.08] px-4 py-3 text-white/48">
              <Search size={17} />
              <span>Search clipboard...</span>
            </div>
            <div className="mt-4 flex gap-2 overflow-hidden">
              {["History 88", "Prompts", "Assets", "Code 8", "Screenshots"].map(
                (chip, chipIndex) => (
                  <span
                    key={chip}
                    className={
                      chipIndex === 0
                        ? "shrink-0 rounded-full bg-white px-4 py-2 text-[13px] font-semibold text-black"
                        : "shrink-0 rounded-full bg-white/[0.09] px-4 py-2 text-[13px] font-semibold text-white/58"
                    }
                  >
                    {chip}
                  </span>
                ),
              )}
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {recentClips.map((clip) => (
                <article
                  key={`${clip.app}-${clip.title}`}
                  className="min-h-[132px] rounded-[14px] bg-[#1d1d22] p-4 ring-1 ring-white/[0.07]"
                >
                  <div className="mb-6 flex items-center gap-2">
                    <AppBadge app={clip.app} />
                    <span className="text-[12px] font-medium text-white/48">
                      {clip.app} · {clip.type}
                    </span>
                  </div>
                  {clip.visual === "screenshot" ? (
                    <div className="-mt-2 grid grid-cols-[72px_1fr] items-center gap-3">
                      <ScreenshotPreview />
                      <div>
                        <p className="line-clamp-2 text-[15px] font-medium leading-6 text-white/82">
                          {clip.title}
                        </p>
                        <p className="mt-2 text-[12px] text-white/40">
                          {clip.meta}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="line-clamp-2 text-[15px] font-medium leading-6 text-white/82">
                        {clip.title}
                      </p>
                      <p className="mt-3 text-[12px] text-white/40">
                        {clip.meta}
                      </p>
                    </>
                  )}
                </article>
              ))}
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3">
            {["Copy", "Paste", "Find"].map((action) => (
              <div
                key={action}
                className="rounded-[14px] bg-white/[0.06] px-4 py-3 text-center text-[13px] font-semibold text-white/62 ring-1 ring-white/[0.07]"
              >
                {action}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-5 py-16 sm:px-8">
        <div className="grid gap-8 rounded-[22px] bg-[#111116] p-5 ring-1 ring-white/[0.08] lg:grid-cols-[0.92fr_1.08fr] lg:p-8">
          <div className="flex flex-col justify-between">
            <div>
              <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-white/[0.07] px-3 py-1.5 text-[13px] font-semibold text-white/62">
                <MousePointer2 size={14} className="text-[#8f93ff]" />
                12 second workflow
              </div>
              <h2 className="max-w-xl text-balance text-[clamp(2rem,4vw,3.7rem)] font-semibold leading-tight tracking-[-0.035em]">
                Copy, hover, search, reuse.
              </h2>
              <p className="mt-4 max-w-xl text-[17px] leading-8 text-white/60">
                This is the clip to put on the landing: a short loop that shows
                the product in context instead of another static screenshot.
              </p>
            </div>
            <div className="mt-8 grid gap-3 text-[14px] font-semibold text-white/62 sm:grid-cols-3">
              <span className="rounded-full bg-white/[0.06] px-4 py-2">
                1. Copy
              </span>
              <span className="rounded-full bg-white/[0.06] px-4 py-2">
                2. Hover notch
              </span>
              <span className="rounded-full bg-white/[0.06] px-4 py-2">
                3. Copy back
              </span>
            </div>
          </div>
          <UsageClip />
        </div>
      </section>

      <section
        id="features"
        className="mx-auto w-full max-w-7xl px-5 py-16 sm:px-8"
      >
        <div className="max-w-2xl">
          <h2 className="text-balance text-[clamp(2rem,4vw,3.5rem)] font-semibold leading-tight tracking-[-0.03em]">
            The clipboard app that behaves like part of macOS.
          </h2>
          <p className="mt-4 text-[17px] leading-8 text-white/60">
            The main window is there when you need a library. The notch is there
            when you need one thing back immediately.
          </p>
        </div>
        <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {features.map((feature) => (
            <article
              key={feature.title}
              className="rounded-[16px] bg-white/[0.055] p-5 ring-1 ring-white/[0.08]"
            >
              <feature.icon size={20} className="text-[#8f93ff]" />
              <h3 className="mt-5 text-[18px] font-semibold tracking-tight">
                {feature.title}
              </h3>
              <p className="mt-3 text-[14px] leading-6 text-white/58">
                {feature.body}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section
        id="privacy"
        className="mx-auto grid w-full max-w-7xl gap-8 px-5 py-16 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center"
      >
        <div className="rounded-[20px] bg-[#dfe1ff] p-6 text-[#111114]">
          <div className="mb-10 flex items-center gap-3">
            <Lock size={20} />
            <span className="text-[14px] font-semibold">Local-first controls</span>
          </div>
          <div className="space-y-3">
            {[
              "Pause capture for sensitive work",
              "Ignore specific apps",
              "Hide sensitive previews",
              "Reveal private clips deliberately",
            ].map((item) => (
              <div key={item} className="flex items-center gap-3 rounded-[12px] bg-white/70 p-3">
                <Check size={17} />
                <span className="text-[14px] font-semibold">{item}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h2 className="text-balance text-[clamp(2rem,4vw,3.5rem)] font-semibold leading-tight tracking-[-0.03em]">
            Clipboard history is useful only if it stays under your control.
          </h2>
          <p className="mt-5 max-w-2xl text-[17px] leading-8 text-white/62">
            ClipFlow is designed for people who copy real work: credentials,
            customer links, code, screenshots, notes, and temporary files. The
            product gives you direct controls instead of hiding capture behavior
            in a settings page.
          </p>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-5 py-16 sm:px-8">
        <div className="grid overflow-hidden rounded-[22px] bg-white text-[#111114] lg:grid-cols-[1fr_0.95fr]">
          <div className="p-6 sm:p-10">
            <BadgeCheck size={24} className="text-[#5b5fc7]" />
            <h2 className="mt-6 max-w-2xl text-balance text-[clamp(2rem,4vw,3.8rem)] font-semibold leading-tight tracking-[-0.035em]">
              One purchase. A faster Mac clipboard.
            </h2>
            <p className="mt-5 max-w-xl text-[17px] leading-8 text-[#555560]">
              Keep the price simple. ClipFlow is not trying to become a large
              subscription suite. It solves one daily workflow and stays light.
            </p>
          </div>
          <div className="bg-[#f0f0f7] p-6 sm:p-10">
            <ul className="space-y-3">
              {comparisons.map((item) => (
                <li key={item} className="flex items-center gap-3 text-[15px] font-semibold text-[#282832]">
                  <Check size={17} className="text-[#5b5fc7]" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section
        id="pricing"
        className="mx-auto grid w-full max-w-7xl gap-8 px-5 py-16 sm:px-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-center"
      >
        <div>
          <h2 className="text-balance text-[clamp(2.2rem,5vw,4.6rem)] font-semibold leading-[0.98] tracking-[-0.035em]">
            $5 now. $10 after launch. Still lifetime.
          </h2>
          <p className="mt-5 max-w-xl text-[17px] leading-8 text-white/62">
            The low price is intentional. ClipFlow should feel like an obvious
            upgrade for Mac users who copy all day.
          </p>
        </div>
        <div className="rounded-[20px] bg-white p-6 text-[#111114] sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[14px] font-semibold text-[#5b5fc7]">
                Launch lifetime license
              </p>
              <div className="mt-3 flex items-end gap-3">
                <span className="text-6xl font-semibold tracking-[-0.05em]">
                  $5
                </span>
                <span className="pb-2 text-[15px] font-medium text-[#6f6f78]">
                  one-time
                </span>
              </div>
            </div>
            <div className="rounded-full bg-[#111114] px-3 py-1.5 text-[12px] font-semibold text-white">
              Later $15
            </div>
          </div>
          <ul className="mt-8 space-y-3">
            {[
              "Lifetime app license",
              "Current major version updates",
              "Notch shelf and quick paste",
              "Local OCR for screenshots",
              "Privacy controls and ignored apps",
            ].map((item) => (
              <li key={item} className="flex items-center gap-3 text-[15px] text-[#34343d]">
                <Check size={17} className="text-[#5b5fc7]" />
                {item}
              </li>
            ))}
          </ul>
          <a
            href={checkoutUrl}
            className="mt-8 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#5b5fc7] px-6 text-[15px] font-semibold text-white transition-transform hover:-translate-y-0.5"
          >
            Buy lifetime for $10
            <ArrowRight size={17} />
          </a>
          <p className="mt-4 text-center text-[13px] text-[#74747d]">
            Checkout link is ready to point at Paddle once the product is live.
          </p>
        </div>
      </section>

      <section id="faq" className="mx-auto w-full max-w-4xl px-5 py-16 sm:px-8">
        <h2 className="text-center text-[clamp(2rem,4vw,3.3rem)] font-semibold tracking-[-0.03em]">
          Questions before buying
        </h2>
        <div className="mt-8 divide-y divide-white/10 rounded-[18px] bg-white/[0.055] ring-1 ring-white/[0.08]">
          {faqs.map((faq) => (
            <details key={faq.question} className="group p-5 open:bg-white/[0.03]">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[16px] font-semibold">
                {faq.question}
                <Star size={15} className="text-white/35 transition-transform group-open:rotate-45" />
              </summary>
              <p className="mt-3 max-w-2xl text-[14px] leading-7 text-white/58">
                {faq.answer}
              </p>
            </details>
          ))}
        </div>
      </section>

      <footer className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-5 py-8 text-[13px] text-white/42 sm:px-8 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <LandingLogo compact />
          <span>ClipFlow for macOS</span>
        </div>
        <div className="flex flex-wrap gap-4">
          <a href={downloadUrl} className="hover:text-white">
            Download
          </a>
          <a href={checkoutUrl} className="hover:text-white">
            Buy lifetime
          </a>
          <a href="/pricing" className="hover:text-white">
            Pricing
          </a>
          <a href="/terms" className="hover:text-white">
            Terms
          </a>
          <a href="/privacy" className="hover:text-white">
            Privacy
          </a>
          <a href="/refund" className="hover:text-white">
            Refund
          </a>
          <a href="mailto:hello@clipflow.app" className="hover:text-white">
            Contact
          </a>
        </div>
      </footer>
    </main>
  );
}

export function PricingPage() {
  return (
    <PolicyLayout
      title="Pricing"
      description="ClipFlow is sold as a one-time lifetime license for macOS."
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_0.8fr]">
        <section className="rounded-[18px] bg-white p-6 text-[#111114]">
          <p className="text-[14px] font-semibold text-[#5b5fc7]">
            Launch lifetime license
          </p>
          <div className="mt-4 flex items-end gap-3">
            <span className="text-6xl font-semibold tracking-[-0.05em]">
              $5
            </span>
            <span className="pb-2 text-[15px] font-medium text-[#6f6f78]">
              one-time
            </span>
          </div>
          <p className="mt-4 text-[15px] leading-7 text-[#555560]">
            After launch, ClipFlow moves to a $15 lifetime license. There is no
            subscription.
          </p>
          <a
            href={checkoutUrl}
            className="mt-6 inline-flex h-12 items-center justify-center gap-2 rounded-full bg-[#5b5fc7] px-6 text-[15px] font-semibold text-white"
          >
            Buy lifetime for $10
            <ArrowRight size={17} />
          </a>
        </section>
        <section className="rounded-[18px] bg-white/[0.06] p-6 ring-1 ring-white/[0.08]">
          <h2 className="text-xl font-semibold">Included</h2>
          <ul className="mt-5 space-y-3 text-[15px] text-white/64">
            {[
              "Lifetime app license",
              "Current major version updates",
              "Notch shelf and quick paste",
              "Local OCR for screenshots",
              "Privacy controls and ignored apps",
            ].map((item) => (
              <li key={item} className="flex items-center gap-3">
                <Check size={16} className="text-[#8f93ff]" />
                {item}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </PolicyLayout>
  );
}

export function TermsPage() {
  return (
    <PolicyLayout
      title="Terms of service"
      description="These terms explain how you can use ClipFlow."
    >
      <PolicySection title="Product">
        ClipFlow is a macOS clipboard history app. The app captures clipboard
        items locally and provides ways to search, copy, paste, organize, and
        control saved clipboard history.
      </PolicySection>
      <PolicySection title="License">
        A paid purchase grants you a personal, non-transferable license to use
        ClipFlow. The launch lifetime license lets you keep using the app version
        you bought and includes updates in the current major version.
      </PolicySection>
      <PolicySection title="Acceptable use">
        You may not redistribute, resell, reverse engineer, or use ClipFlow in a
        way that violates applicable law. You are responsible for the clipboard
        content you choose to copy, store, paste, or share.
      </PolicySection>
      <PolicySection title="Availability">
        We may improve, change, or discontinue parts of ClipFlow over time.
        Paid users keep access to the app version they purchased according to
        the license terms.
      </PolicySection>
      <PolicySection title="Contact">
        Questions about these terms can be sent to hello@clipflow.app.
      </PolicySection>
    </PolicyLayout>
  );
}

export function PrivacyPage() {
  return (
    <PolicyLayout
      title="Privacy policy"
      description="ClipFlow is designed as a local-first clipboard utility."
    >
      <PolicySection title="Clipboard data">
        ClipFlow is designed to store clipboard history locally on your Mac.
        Clipboard items are not uploaded to ClipFlow servers by default.
      </PolicySection>
      <PolicySection title="Screenshots and OCR">
        When screenshot or image OCR is used, the app is designed to process text
        extraction locally on macOS. OCR output may be saved locally to make
        image clips searchable.
      </PolicySection>
      <PolicySection title="Payments">
        Purchases are processed by Paddle. Paddle may collect payment, billing,
        tax, fraud prevention, and transaction information according to its own
        privacy practices.
      </PolicySection>
      <PolicySection title="Support">
        If you email support, we receive the information you choose to send,
        such as your email address, message, and diagnostic details you attach.
      </PolicySection>
      <PolicySection title="Controls">
        ClipFlow includes controls to pause capture, ignore specific apps, hide
        sensitive previews, and manage saved history.
      </PolicySection>
      <PolicySection title="Contact">
        Privacy questions can be sent to hello@clipflow.app.
      </PolicySection>
    </PolicyLayout>
  );
}

export function RefundPage() {
  return (
    <PolicyLayout
      title="Refund policy"
      description="ClipFlow aims to keep refunds simple and fair."
    >
      <PolicySection title="Refund window">
        If ClipFlow does not work for you, contact hello@clipflow.app within 14
        days of purchase and include the email used for checkout.
      </PolicySection>
      <PolicySection title="Eligibility">
        Refunds may be approved for accidental purchases, duplicate purchases,
        technical issues that prevent reasonable use, or cases where the app was
        materially different from the public description.
      </PolicySection>
      <PolicySection title="Exclusions">
        Refunds may be declined for abuse, repeated refund requests, or cases
        where the license has been resold, transferred, or used in violation of
        the terms.
      </PolicySection>
      <PolicySection title="Processor">
        Payments and refunds are handled through Paddle. Approved refunds may
        take several business days to appear depending on the payment method.
      </PolicySection>
    </PolicyLayout>
  );
}

function PolicyLayout({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <main className="landing-page min-h-screen bg-[#08080a] text-white">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-5 sm:px-8">
        <a href="/" className="flex items-center gap-3" aria-label="ClipFlow home">
          <LandingLogo />
          <span className="text-[15px] font-semibold tracking-tight">
            ClipFlow
          </span>
        </a>
        <a
          href={checkoutUrl}
          className="rounded-full bg-white px-4 py-2 text-[13px] font-semibold text-black"
        >
          Buy for $10
        </a>
      </header>
      <article className="mx-auto w-full max-w-5xl px-5 py-14 sm:px-8">
        <p className="text-[13px] font-semibold text-[#8f93ff]">
          ClipFlow for macOS
        </p>
        <h1 className="mt-4 text-balance text-[clamp(2.8rem,7vw,5.2rem)] font-semibold leading-[0.98] tracking-[-0.035em]">
          {title}
        </h1>
        <p className="mt-5 max-w-2xl text-[18px] leading-8 text-white/62">
          {description}
        </p>
        <div className="mt-10 space-y-6">{children}</div>
      </article>
      <footer className="mx-auto flex w-full max-w-5xl flex-wrap gap-4 px-5 py-8 text-[13px] text-white/42 sm:px-8">
        <a href="/" className="hover:text-white">
          Home
        </a>
        <a href="/pricing" className="hover:text-white">
          Pricing
        </a>
        <a href="/terms" className="hover:text-white">
          Terms
        </a>
        <a href="/privacy" className="hover:text-white">
          Privacy
        </a>
        <a href="/refund" className="hover:text-white">
          Refund
        </a>
        <a href="mailto:hello@clipflow.app" className="hover:text-white">
          Contact
        </a>
      </footer>
    </main>
  );
}

function PolicySection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[16px] bg-white/[0.055] p-5 ring-1 ring-white/[0.08]">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      <p className="mt-3 max-w-3xl text-[15px] leading-7 text-white/62">
        {children}
      </p>
    </section>
  );
}

function LandingLogo({ compact = false }: { compact?: boolean }) {
  return (
    <span
      className={
        compact
          ? "flex h-8 w-8 shrink-0 overflow-hidden rounded-[10px] bg-black"
          : "flex h-11 w-11 shrink-0 overflow-hidden rounded-[14px] bg-black"
      }
    >
      <img
        src="/assets/clipflow-icon.png"
        alt=""
        className="h-full w-full object-cover"
        draggable={false}
      />
    </span>
  );
}

function AppBadge({ app }: { app: string }) {
  if (app === "Cursor") {
    return (
      <span className="flex h-7 w-7 items-center justify-center rounded-[8px] bg-white text-black">
        <TerminalSquare size={15} />
      </span>
    );
  }

  if (app === "Shottr") {
    return (
      <span className="flex h-7 w-7 items-center justify-center rounded-[8px] bg-[#ff5a3d] text-white">
        S
      </span>
    );
  }

  if (app === "ChatGPT") {
    return (
      <span className="flex h-7 w-7 items-center justify-center rounded-[8px] bg-[#f2f2f2] text-black">
        ✺
      </span>
    );
  }

  return (
    <span className="flex h-7 w-7 items-center justify-center rounded-[8px] bg-[#5b5fc7] text-white">
      A
    </span>
  );
}

function ScreenshotPreview() {
  return (
    <div className="relative h-16 overflow-hidden rounded-[10px] bg-[#ececf2] ring-1 ring-white/10">
      <div className="flex h-4 items-center gap-1 bg-[#d9d9e3] px-2">
        <span className="h-1.5 w-1.5 rounded-full bg-[#ff5f57]" />
        <span className="h-1.5 w-1.5 rounded-full bg-[#ffbd2e]" />
        <span className="h-1.5 w-1.5 rounded-full bg-[#28c840]" />
      </div>
      <div className="grid grid-cols-[18px_1fr] gap-2 p-2">
        <div className="space-y-1">
          <span className="block h-2 rounded-sm bg-[#111114]" />
          <span className="block h-2 rounded-sm bg-[#5b5fc7]" />
          <span className="block h-2 rounded-sm bg-[#111114]" />
        </div>
        <div className="space-y-1.5">
          <span className="block h-2 w-11/12 rounded-full bg-[#b8b8c6]" />
          <span className="block h-2 w-7/12 rounded-full bg-[#c8c8d3]" />
          <span className="block h-5 w-10/12 rounded-md bg-white" />
        </div>
      </div>
    </div>
  );
}

function UsageClip() {
  return (
    <div className="usage-clip relative min-h-[360px] overflow-hidden rounded-[18px] bg-[#ececf4] p-4 text-[#111114]">
      <div className="flex items-center justify-between rounded-t-[12px] bg-white px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
        </div>
        <span className="text-[12px] font-semibold text-[#7a7a84]">
          Working in Arc
        </span>
      </div>
      <div className="grid min-h-[300px] grid-cols-[170px_1fr] overflow-hidden rounded-b-[12px] bg-white">
        <aside className="space-y-3 border-r border-[#ececf1] p-4">
          <span className="block h-8 rounded-[9px] bg-[#111114]" />
          <span className="block h-8 rounded-[9px] bg-[#f0f0f4]" />
          <span className="block h-8 rounded-[9px] bg-[#f0f0f4]" />
          <span className="block h-8 rounded-[9px] bg-[#f0f0f4]" />
        </aside>
        <div className="relative p-5">
          <div className="mb-4 h-10 rounded-full bg-[#f2f2f5]" />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="h-28 rounded-[14px] bg-[#dfe1ff]" />
            <div className="h-28 rounded-[14px] bg-[#111114]" />
            <div className="h-28 rounded-[14px] bg-[#f0f0f4]" />
            <div className="h-28 rounded-[14px] bg-[#f0f0f4]" />
          </div>
          <div className="usage-copy-badge absolute left-10 top-24 rounded-full bg-[#5b5fc7] px-4 py-2 text-[13px] font-semibold text-white">
            Copied screenshot
          </div>
        </div>
      </div>
      <div className="usage-notch absolute left-1/2 top-3 w-[72%] -translate-x-1/2 rounded-b-[22px] bg-black p-4 pt-10 text-white">
        <div className="absolute left-1/2 top-0 h-9 w-36 -translate-x-1/2 rounded-b-[22px] bg-black" />
        <div className="mb-3 flex items-center gap-2 text-[12px] text-white/55">
          <Search size={14} />
          <span>Search screenshots</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-[12px] bg-white/[0.10] p-3">
            <ScreenshotPreview />
            <p className="mt-2 text-[12px] font-semibold">Shottr image</p>
          </div>
          <div className="rounded-[12px] bg-white/[0.10] p-3">
            <p className="line-clamp-4 text-[12px] leading-5 text-white/70">
              const cleanUrl = removeTrackingParams(url)
            </p>
          </div>
          <div className="rounded-[12px] bg-white/[0.10] p-3">
            <p className="line-clamp-4 text-[12px] leading-5 text-white/70">
              Launch post draft for ClipFlow
            </p>
          </div>
        </div>
      </div>
      <div className="usage-cursor absolute left-[62%] top-[54%] h-10 w-10 rotate-[-18deg] bg-white shadow-[0_10px_24px_rgb(0_0_0_/_0.22)] [clip-path:polygon(0_0,0_100%,28%_74%,45%_100%,58%_92%,42%_66%,78%_66%)]" />
    </div>
  );
}
