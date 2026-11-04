import React, { useCallback, useEffect, useRef, useState } from 'react';
import { jsPDF } from 'jspdf';
import { ArrowRight, Bell, Camera, FileText, MessageCircle, Palette, ScanLine, Send, ShieldCheck, Smartphone, X } from 'lucide-react';

const API = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');
const PROFILE_KEY = 'qrshield-demo-profile';
const THEME_KEY = 'qrshield-accent-theme';
const COOKIE_CONSENT_KEY = 'qrshield-cookie-consent';

function riskTone(score, hasFlags = false) {
  if (score >= 60) return 'border-rose-800 bg-rose-950/40 text-rose-300';
  if (score >= 25 || hasFlags) return 'border-amber-800 bg-amber-950/30 text-amber-200';
  return 'border-emerald-800 bg-emerald-950/30 text-emerald-300';
}

function checkTone(status) {
  if (status === 'flagged') return 'border-amber-800/70 bg-amber-950/20 text-amber-200';
  if (status === 'unavailable') return 'border-slate-700 bg-slate-900/70 text-slate-400';
  if (status === 'info') return 'border-cyan-900/70 bg-cyan-950/20 text-cyan-200';
  return 'border-emerald-900/70 bg-emerald-950/20 text-emerald-200';
}

const INFO_PAGES = {
  scanner: {
    label: 'QR Scanner',
    title: 'Inspect a QR code before you open it',
    summary: 'Decode a QR image and review its destination and available URL risk indicators without automatically visiting the link.',
    details: [
      ['Supported images', 'Upload, paste, or capture PNG, JPEG, WEBP, or BMP images up to 8 MB.'],
      ['What the result means', 'The verdict and score are based on the available baseline URL checks. A low score is not proof that a destination is safe.'],
      ['Before you continue', 'Compare the displayed hostname with the business or service you expected. QR Shield never opens the destination for you.']
    ],
    action: 'Open QR scanner'
  },
  tampering: {
    label: 'Tampering Check',
    title: 'Look closely for replaced QR stickers',
    summary: 'A QR code can be physically covered with a second sticker that points somewhere else. Image decoding alone cannot confirm whether a sticker is genuine.',
    details: [
      ['Check the edges', 'Look for lifted corners, bubbles, fresh adhesive, or a sticker that is not flush with the original surface.'],
      ['Compare the print', 'Notice different paper, gloss, print quality, alignment, or a label that covers existing instructions.'],
      ['Confirm the destination', 'Ask the venue or organization to verify the URL before making a payment or entering credentials.']
    ],
    action: 'Inspect a QR image'
  },
  threats: {
    label: 'Threat checks',
    title: 'Understand the limits of threat checks',
    summary: 'This starter does not use a live threat map or reputation feed. Its URL analysis is a transparent, baseline heuristic check.',
    details: [
      ['No live reputation lookup', 'The service does not query external blocklists, DNS, WHOIS, or redirect chains.'],
      ['Risk is not a guarantee', 'A suspicious signal deserves caution; an absence of signals does not mean a link is safe.'],
      ['Stay in control', 'Review the decoded URL and verify it with the organization through a trusted channel.']
    ],
    action: 'Check a QR code'
  },
  features: {
    label: 'Features',
    title: 'Tools for safer QR decisions',
    summary: 'QR Shield combines local QR-image submission with destination checks and clear explanations of what the current prototype can and cannot do.',
    details: [
      ['Decode without opening', 'Read the QR payload before deciding whether to visit it.'],
      ['Compare a hostname', 'Optionally compare the decoded hostname with the domain you expected.'],
      ['Save a report', 'Download a PDF summary of the latest QR inspection for your records.']
    ],
    action: 'Try the QR scanner'
  },
  pricing: {
    label: 'Available features',
    title: 'Tools available in this prototype',
    summary: 'This prototype has no paid plans, account subscriptions, or payment processing.',
    details: [
      ['No payment processing', 'This website does not collect payment information or create subscriptions.'],
      ['Available features', 'QR inspection, browser-generated PDF reports, and published safety references are available in this prototype.'],
      ['Saathi chat', 'AI replies require the site operator to configure an OpenAI-compatible provider in the backend.']
    ],
    action: 'Explore the scanner'
  },
  download: {
    label: 'Download',
    title: 'Take the scanner with you',
    summary: 'Open QR-Shield in your phone browser to inspect a QR image, capture one with the device camera, and review its destination without opening the link.',
    details: [
      ['Use your phone camera', 'Choose the camera capture option in the mobile QR scanner or select an existing image.'],
      ['Review before opening', 'QR-Shield decodes the image and shows baseline URL risk indicators without visiting the destination.'],
      ['Save an inspection report', 'Generate a PDF in your browser after a QR image has been analyzed.']
    ],
    action: 'Open the mobile QR scanner'
  },
  faq: {
    label: 'FAQ',
    title: 'Questions about QR safety',
    summary: 'Use these practical checks alongside the result shown by QR Shield.',
    details: [
      ['Does a low risk score prove the link is safe?', 'No. It only means the configured baseline checks did not identify many risk signals.'],
      ['Does QR Shield detect sticker overlays?', 'No trained image-tampering detector is configured. Inspect the sticker and surrounding surface yourself.'],
      ['Does it follow redirects?', 'No. It does not visit a decoded URL or follow its redirects.'],
      ['Is registration a real account?', 'No. This demo stores only your display name and email in this browser. It has no server-backed authentication.']
    ],
    action: 'Go to the QR scanner'
  },
  research: {
    label: 'Research & sources',
    title: 'Evidence-led QR safety guidance',
    summary: 'The guidance here is grounded in public advisories. These sources describe real QR-code risks; they are not QR Shield test results or thesis findings.',
    details: [
      ['FBI / IC3 public service announcement', 'The FBI describes criminals replacing physical or digital QR codes to redirect people to malicious sites, steal credentials, or divert payments. Published January 18, 2022.'],
      ['CISA phishing guidance', 'CISA explains how phishing and social engineering imitate trusted organizations to solicit personal information.'],
      ['What QR Shield actually measures', 'This prototype decodes QR images and applies baseline URL heuristics. It does not query threat feeds, follow links, or detect physical sticker overlays.']
    ],
    references: [
      { label: 'FBI Internet Crime Complaint Center (IC3). “Cybercriminals Tampering with QR Codes to Steal Victim Funds.” Public Service Announcement, January 18, 2022.', url: 'https://www.ic3.gov/PSA/2022/PSA220118' },
      { label: 'Cybersecurity and Infrastructure Security Agency (CISA). “Avoiding Social Engineering and Phishing Attacks.”', url: 'https://www.cisa.gov/news-events/news/avoiding-social-engineering-and-phishing-attacks' }
    ],
    action: 'Try a QR inspection'
  },
  thesis: {
    label: 'Thesis alignment',
    title: 'What the research describes and what this app runs',
    summary: 'The supplied thesis and project report describe a broader dual-branch system. This page separates those research goals from verified functionality in the current starter so the UI does not overstate what it can detect.',
    details: [
      ['QR decoding — implemented', 'The current backend uses OpenCV to decode uploaded QR images and records a local scan result.'],
      ['URL model — different input contract', 'The thesis describes a 27-feature XGBoost URL branch using lexical, WHOIS, DNS, and HTTP indicators. The currently bundled API model requires 30 precomputed features and cannot infer from a raw URL; image and manual URL scans use explainable lexical heuristics instead.'],
      ['Visual tamper model — not configured', 'The thesis describes a ResNet-18 QR image tampering model. This starter has no such model artifact; it reports basic image quality and QR decoding information only.'],
      ['SHAP and decision fusion — not configured', 'The thesis discusses SHAP explanations and combining URL and image-model outputs. This app displays heuristic reasons but does not run SHAP or fuse trained-model predictions.'],
      ['Accounts and administration — demo only', 'Registration stores a display name and email in this browser. The report discusses OTP, administrator features, and scan management, but this starter has no real authentication, email verification, or admin console.'],
      ['Unverified report claims', 'The supplied report includes test cases marked “Passed” and unrelated course/payment-management requirements. Those statements are not treated as verified QR-Shield capabilities.'],
      ['Future work — not shipped', 'The documents describe webcam scanning and live threat-intelligence feeds as future directions. Neither is enabled in this app.']
    ],
    action: 'Inspect a QR image'
  },
  'article-qr-check': {
    label: 'QR safety guide',
    title: 'Before you scan: check the destination first',
    summary: 'A QR code hides its destination until it is decoded. Take a moment to read the address and confirm that it belongs to the organization you expect before opening it.',
    details: [
      ['Preview the complete hostname', 'Pay attention to misspellings, extra words, unexpected subdomains, and unfamiliar domain endings. A familiar logo or HTTPS connection alone does not prove that the page is genuine.'],
      ['Treat shortened links cautiously', 'A short URL can hide its final destination. If you cannot verify where it leads, use the organization’s official app or type its known website address yourself.'],
      ['Pause before sharing information', 'Be especially cautious if an unexpected QR destination asks for a password, payment details, a one-time code, or an urgent account update. Verify the request through a separate trusted channel.']
    ],
    references: [
      { label: 'CISA. “Avoiding Social Engineering and Phishing Attacks.”', url: 'https://www.cisa.gov/news-events/news/avoiding-social-engineering-and-phishing-attacks' }
    ],
    action: 'Inspect a QR image'
  },
  'article-sticker-tampering': {
    label: 'QR safety guide',
    title: 'How to spot a replaced QR-code sticker',
    summary: 'A malicious QR sticker can be placed over a legitimate code on a menu, parking meter, poster, or payment sign. Check the physical code as well as the web address it opens.',
    details: [
      ['Look for a second layer', 'Check for lifted corners, bubbles, uneven edges, fresh adhesive, misalignment, or differences in paper and print quality. Do not peel a suspicious sticker if that could damage evidence or property.'],
      ['Compare the destination', 'A QR code that opens an unrelated domain is a reason to stop. Do not rely on a brand logo, page design, or padlock icon as proof that the destination is official.'],
      ['Verify with the venue', 'Use contact details from a trusted source or ask staff to confirm the correct payment method. Avoid using contact information printed on a suspicious page or sticker.']
    ],
    references: [
      { label: 'FBI/IC3. “Cybercriminals Tampering with QR Codes to Steal Victim Funds.”', url: 'https://www.ic3.gov/PSA/2022/PSA220118' }
    ],
    action: 'Inspect a QR image'
  },
  'article-quishing': {
    label: 'QR safety guide',
    title: 'Quishing: recognize phishing attempts behind QR codes',
    summary: 'Quishing uses QR codes to send people to phishing pages. Because the destination is hidden in the printed pattern, the same careful checks used for email and text links apply.',
    details: [
      ['Question unexpected requests', 'Be wary of QR codes in unsolicited messages or notices that pressure you to act quickly, claim an account problem, or promise a prize.'],
      ['Check the sign-in page', 'A page reached through a QR code should not be trusted just because it looks familiar. Confirm the hostname and navigate to the service independently when in doubt.'],
      ['Use a separate verification route', 'Contact the organization using a number or website you already trust. Never share passwords, payment details, or one-time verification codes on an unexpected page.']
    ],
    references: [
      { label: 'CISA. “Avoiding Social Engineering and Phishing Attacks.”', url: 'https://www.cisa.gov/news-events/news/avoiding-social-engineering-and-phishing-attacks' },
      { label: 'FBI/IC3. “Cybercriminals Tampering with QR Codes to Steal Victim Funds.”', url: 'https://www.ic3.gov/PSA/2022/PSA220118' }
    ],
    action: 'Inspect a QR image'
  },
  'parking-case': {
    label: 'Parking QR scenario',
    title: 'A replaced parking sticker: what to check',
    summary: 'Illustrative safety scenario based on the FBI/IC3 public advisory about QR-code tampering. This is not a claim about a verified incident at Downtown Parking Zone #402.',
    details: [
      ['1. Notice the physical clue', 'A payment QR sticker appears slightly misaligned, with a second edge visible underneath it. Do not scan again or enter payment details.'],
      ['2. Inspect the destination', 'The decoded hostname is not the parking operator’s known domain. A convincing logo or HTTPS padlock does not prove the page belongs to the city.'],
      ['3. Verify independently', 'Use the official parking app or the city’s published website, typed directly or found through a trusted source. Ask the operator to inspect the sign.'],
      ['4. Report and preserve evidence', 'Follow the local operator’s reporting process. If money or credentials were lost, contact the bank or service promptly and report the incident to the appropriate authority.']
    ],
    references: [
      { label: 'FBI Internet Crime Complaint Center (IC3). “Cybercriminals Tampering with QR Codes to Steal Victim Funds.”', url: 'https://www.ic3.gov/PSA/2022/PSA220118' }
    ],
    action: 'Open QR scanner'
  }
};

const NAV_GROUPS = [
  { label: 'Product', items: [['scanner', 'QR Scanner'], ['features', 'Features'], ['pricing', 'Available features'], ['download', 'Download']] },
  { label: 'QR Safety', items: [['tampering', 'Tampering checks'], ['threats', 'Threat checks'], ['parking-case', 'Parking QR scenario']] },
  { label: 'Resources', items: [['research', 'Research & sources'], ['thesis', 'Thesis alignment'], ['faq', 'Help center'], ['article-qr-check', 'Before you scan'], ['article-sticker-tampering', 'Sticker tampering'], ['article-quishing', 'QR phishing']] }
];

const RELATED_ARTICLES = [
  { page: 'article-qr-check', category: 'Safe scanning', readTime: '3 min read', icon: '🔎', description: 'A quick routine for checking a QR destination before you open it.' },
  { page: 'article-sticker-tampering', category: 'Physical tampering', readTime: '4 min read', icon: '🏷️', description: 'Clues that a replacement sticker may have been placed over a real code.' },
  { page: 'article-quishing', category: 'Phishing awareness', readTime: '3 min read', icon: '🛡️', description: 'Recognize suspicious QR links and verify unexpected sign-in requests.' }
];

function BrandMark({ className = 'h-12 w-12' }) {
  return (
    <svg className={className} viewBox="0 0 52 52" fill="none" aria-hidden="true">
      <path d="M26 3.5 45 10v14.4c0 11.2-7.5 19.1-19 24.1C14.5 43.5 7 35.6 7 24.4V10l19-6.5Z" fill="#22D3EE" />
      <path d="M26 8.5 40 13v11.2c0 8.6-5.2 14.8-14 19-8.8-4.2-14-10.4-14-19V13l14-4.5Z" fill="#082F49" />
      <path d="M16 17h8v8h-8zM28 17h8v8h-8zM16 29h8v8h-8z" fill="#CFFAFE" />
      <path d="M18.5 19.5h3v3h-3zM30.5 19.5h3v3h-3zM18.5 31.5h3v3h-3z" fill="#0E7490" />
      <path d="M28 29h3v3h-3zM33 29h3v3h-3zM28 34h3v3h-3zM33 34h3v3h-3z" fill="#67E8F9" />
    </svg>
  );
}

function InfoPage({ page, onBack, onOpenScanner }) {
  const content = INFO_PAGES[page];
  if (!content) return null;
  if (page === 'download') return <DownloadPage onBack={onBack} onOpenScanner={onOpenScanner} />;

  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
      <button type="button" onClick={onBack} className="mb-8 inline-flex items-center gap-2 text-sm font-semibold text-cyan-400 hover:text-cyan-300">
        <span aria-hidden="true">←</span> Back to QR-Shield
      </button>
      <div className="rounded-3xl border border-slate-800 bg-slate-900 p-7 sm:p-12">
        <span className="inline-flex rounded-full border border-cyan-800 bg-cyan-950 px-3 py-1 text-xs font-bold uppercase tracking-wider text-cyan-400">
          {content.label}
        </span>
        <h1 className="mt-5 max-w-3xl text-3xl font-extrabold tracking-tight sm:text-5xl">{content.title}</h1>
        <p className="mt-5 max-w-3xl text-base leading-relaxed text-slate-300">{content.summary}</p>
        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {content.details.map(([title, text]) => (
            <article key={title} className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5">
              <h2 className="font-bold text-slate-100">{title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{text}</p>
            </article>
          ))}
        </div>
        {content.references?.length > 0 && (
          <section className="mt-9 border-t border-slate-800 pt-6" aria-label="Sources">
            <h2 className="font-bold text-slate-100">Sources</h2>
            <p className="mt-2 text-xs leading-relaxed text-slate-400">Official reference links open in a new tab. If a source does not load, check your internet connection or open its address directly.</p>
            <ul className="mt-3 space-y-3">
              {content.references.map(reference => (
                <li key={reference.url}>
                  <a href={reference.url} target="_blank" rel="noopener noreferrer" className="group flex items-start justify-between gap-4 rounded-xl border border-slate-800 bg-slate-950/70 p-4 text-sm leading-relaxed text-cyan-300 transition hover:border-cyan-800 hover:bg-slate-950">
                    <span>{reference.label}<span className="mt-1 block break-all text-[11px] text-slate-500">{reference.url}</span></span>
                    <span className="shrink-0 font-semibold text-cyan-400 group-hover:text-cyan-300">Open source ↗</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}
        <button type="button" onClick={onOpenScanner} className="mt-9 rounded-xl bg-cyan-500 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-400">
          {content.action}
        </button>
      </div>
    </main>
  );
}

function DownloadPage({ onBack, onOpenScanner }) {
  return (
    <main className="overflow-hidden">
      <section className="relative mx-auto max-w-7xl px-4 pb-16 pt-10 sm:px-6 sm:pb-24 lg:px-8 lg:pt-16">
        <div className="absolute -right-32 top-16 h-96 w-96 rounded-full bg-cyan-500/10 blur-3xl" aria-hidden="true" />
        <button type="button" onClick={onBack} className="relative mb-12 inline-flex items-center gap-2 text-sm font-semibold text-cyan-400 transition hover:text-cyan-300">
          <span aria-hidden="true">←</span> Back to QR-Shield
        </button>

        <div className="relative grid items-center gap-12 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-cyan-800 bg-cyan-950/80 px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider text-cyan-300">
              <span className="h-2 w-2 rounded-full bg-cyan-400" aria-hidden="true" />
              QR-Shield · mobile web scanner
            </span>
            <h1 className="mt-7 text-4xl font-black leading-tight tracking-tight text-slate-50 sm:text-6xl">
              Take the scanner <span className="text-cyan-400">with you.</span>
            </h1>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-slate-300 sm:text-lg">
              Scan a QR image from the phone already in your hand. Capture it with your camera, preview its destination, and check the available risk signals before you decide what to do.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <button type="button" onClick={onOpenScanner} className="inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-5 py-3.5 text-sm font-bold text-slate-950 shadow-lg shadow-cyan-950/40 transition hover:bg-cyan-400">
                <ScanLine size={18} aria-hidden="true" /> Scan on this device <ArrowRight size={16} aria-hidden="true" />
              </button>
              <span className="inline-flex items-center rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-3 text-sm font-semibold text-slate-300">
                Free to use in your browser
              </span>
            </div>
            <p className="mt-5 max-w-xl text-xs leading-relaxed text-slate-500">
              QR-Shield does not currently have published iOS or Android apps. This page opens the mobile-friendly website, not an app-store listing.
            </p>
          </div>

          <div className="relative mx-auto w-full max-w-sm">
            <div className="absolute -inset-5 rounded-[3rem] bg-cyan-500/10 blur-2xl" aria-hidden="true" />
            <div className="relative rounded-[2.5rem] border border-slate-700 bg-slate-900 p-3 shadow-2xl shadow-black/40">
              <div className="overflow-hidden rounded-[2rem] border border-slate-800 bg-slate-950 p-5 sm:p-7">
                <div className="mx-auto mb-7 h-1.5 w-16 rounded-full bg-slate-700" />
                <div className="flex items-center gap-3">
                  <span className="grid h-11 w-11 place-items-center rounded-xl border border-cyan-800 bg-cyan-950 text-cyan-300"><ShieldCheck size={22} aria-hidden="true" /></span>
                  <div><p className="font-bold text-slate-100">QR-Shield</p><p className="text-xs text-slate-400">Mobile QR inspection</p></div>
                </div>
                <div className="mt-7 rounded-2xl border border-dashed border-cyan-800 bg-cyan-950/30 p-7 text-center">
                  <ScanLine className="mx-auto h-14 w-14 text-cyan-300" strokeWidth={1.5} aria-hidden="true" />
                  <p className="mt-4 font-bold text-slate-100">Capture or choose a QR</p>
                  <p className="mt-2 text-xs leading-relaxed text-slate-400">Review the decoded destination before you open it.</p>
                </div>
                <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900 p-4">
                  <div className="flex items-center gap-2 text-xs font-bold text-cyan-300"><ShieldCheck size={15} aria-hidden="true" /> Inspection result</div>
                  <p className="mt-2 break-all font-mono text-xs text-slate-300">example.com</p>
                  <p className="mt-2 text-[11px] leading-relaxed text-slate-500">Example display only. A low-risk result does not guarantee a link is safe.</p>
                </div>
                <div className="mt-4 flex items-center justify-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  <Camera size={14} aria-hidden="true" /> Camera capture · image upload · PDF report
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-slate-800 bg-slate-900/40">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <div className="mx-auto mb-10 max-w-2xl text-center">
            <span className="text-xs font-bold uppercase tracking-wider text-cyan-400">Use your phone's browser</span>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-slate-50">iPhone, iPad, Android phone, or tablet</h2>
            <p className="mt-4 text-sm leading-relaxed text-slate-400">Open this QR-Shield site on your device, then use its QR scanner to capture or upload an image.</p>
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            {[
              {
                title: 'iPhone & iPad',
                browser: 'Safari on iOS',
                steps: ['Open QR-Shield in Safari on your device.', 'Choose the QR image scanner and tap the camera option to take a photo, or select an image from Photos.', 'Review the decoded address and its risk notes before leaving the page.'],
                icon: 'iOS'
              },
              {
                title: 'Android phone & tablet',
                browser: 'Chrome on Android',
                steps: ['Open QR-Shield in Chrome on your device.', 'Choose the QR image scanner and use camera capture or select an image from your device.', 'Review the decoded address and its risk notes before leaving the page.'],
                icon: 'Android'
              }
            ].map(platform => (
              <article key={platform.title} className="rounded-2xl border border-slate-800 bg-slate-950/80 p-6 sm:p-8">
                <div className="flex items-center gap-4">
                  <span className="grid h-12 w-12 place-items-center rounded-xl border border-cyan-800 bg-cyan-950 text-xs font-black text-cyan-300">{platform.icon}</span>
                  <div><h3 className="text-xl font-bold text-slate-100">{platform.title}</h3><p className="mt-1 text-xs text-slate-400">{platform.browser} · mobile website</p></div>
                </div>
                <ol className="mt-6 space-y-3">
                  {platform.steps.map((step, index) => (
                    <li key={step} className="flex gap-3 text-sm leading-relaxed text-slate-300">
                      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-slate-800 text-xs font-bold text-cyan-300">{index + 1}</span>
                      {step}
                    </li>
                  ))}
                </ol>
                <button type="button" onClick={onOpenScanner} className="mt-7 inline-flex items-center gap-2 text-sm font-bold text-cyan-400 transition hover:text-cyan-300">
                  Open the QR scanner <ArrowRight size={15} aria-hidden="true" />
                </button>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-cyan-400">What happens when you scan</span>
            <h2 className="mt-3 text-3xl font-extrabold leading-tight tracking-tight text-slate-50">See the destination before deciding to open it.</h2>
            <button type="button" onClick={onOpenScanner} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-400">
              Try the mobile scanner <ArrowRight size={16} aria-hidden="true" />
            </button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              { title: 'Decode a QR image', text: 'Capture or select PNG, JPEG, WEBP, or BMP images up to 8 MB.', icon: Camera },
              { title: 'Review the URL', text: 'See the decoded destination and explainable baseline URL risk indicators.', icon: ShieldCheck },
              { title: 'Compare a domain', text: 'Check whether the hostname matches the organization you expected.', icon: Smartphone },
              { title: 'Save a PDF report', text: 'Download an inspection summary from the browser after the scan.', icon: FileText }
            ].map(feature => (
              <article key={feature.title} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
                <feature.icon className="h-5 w-5 text-cyan-300" aria-hidden="true" />
                <h3 className="mt-4 font-bold text-slate-100">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{feature.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-amber-800/60 bg-amber-950/20 p-6 sm:p-8">
          <h2 className="font-bold text-amber-100">Important: current protection limits</h2>
          <p className="mt-3 max-w-4xl text-sm leading-relaxed text-amber-100/75">
            This QR-Shield prototype uses baseline URL heuristics. It does not query VirusTotal or other live reputation services, follow redirect chains, queue concurrent scans, or provide a native iOS/Android application. The result is not a guarantee that a destination is safe.
          </p>
        </div>
        <div className="mt-8 flex flex-col items-start justify-between gap-4 border-t border-slate-800 pt-6 text-xs text-slate-500 sm:flex-row sm:items-center">
          <span>© {new Date().getFullYear()} QR-Shield · Mobile-friendly web scanner</span>
          <button type="button" onClick={onBack} className="font-semibold text-cyan-400 transition hover:text-cyan-300">Back to QR-Shield</button>
        </div>
      </section>
    </main>
  );
}

function CookieNotice({ consent, preferencesOpen, error, onOpenPreferences, onClosePreferences, onSave }) {
  if (consent && !preferencesOpen && !error) return null;

  return (
    <>
      {!consent && !preferencesOpen && (
        <aside className="fixed inset-x-3 bottom-3 z-80 mx-auto max-w-5xl rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl shadow-black/50 sm:bottom-5 sm:p-6" aria-labelledby="cookie-notice-title">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="max-w-2xl">
              <h2 id="cookie-notice-title" className="text-lg font-bold text-slate-100">Your privacy matters</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-300">
                QR-Shield uses essential browser storage for this demo profile, your theme choice, and remembering this notice. This prototype does not use analytics or advertising cookies.
              </p>
              <button type="button" onClick={onOpenPreferences} className="mt-2 text-sm font-semibold text-cyan-400 underline underline-offset-4 hover:text-cyan-300">
                Customize
              </button>
            </div>
            <div className="flex shrink-0 flex-col-reverse gap-2 sm:flex-row">
              <button type="button" onClick={() => onSave('essential')} className="rounded-xl border border-slate-600 px-4 py-3 text-sm font-semibold text-slate-200 transition hover:border-cyan-600 hover:text-white">
                Reject optional
              </button>
              <button type="button" onClick={() => onSave('essential')} className="rounded-xl bg-cyan-500 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-400">
                Got it
              </button>
            </div>
          </div>
          {error && <p role="alert" className="mt-3 text-sm text-amber-300">{error}</p>}
        </aside>
      )}
      {preferencesOpen && (
        <div className="fixed inset-0 z-90 grid place-items-center overflow-y-auto bg-black/70 p-4" onMouseDown={event => {
          if (event.target === event.currentTarget) onClosePreferences();
        }}>
          <section role="dialog" aria-modal="true" aria-labelledby="cookie-preferences-title" className="my-auto w-full max-w-xl rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="cookie-preferences-title" className="text-xl font-bold text-slate-100">Cookie settings</h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-300">This prototype does not currently set analytics or advertising cookies. These settings explain the browser storage used by the app.</p>
              </div>
              <button type="button" onClick={onClosePreferences} aria-label="Close cookie settings" className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white">×</button>
            </div>
            <div className="mt-6 space-y-3">
              <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-700 bg-slate-950/60 p-4">
                <div><h3 className="text-sm font-semibold text-slate-100">Essential browser storage</h3><p className="mt-1 text-xs leading-relaxed text-slate-400">Stores the demo profile and theme, and remembers your choice here. Required for those features.</p></div>
                <span className="shrink-0 text-xs font-bold text-emerald-300">Always on</span>
              </div>
              <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-700 bg-slate-950/60 p-4">
                <div><h3 className="text-sm font-semibold text-slate-100">Analytics and advertising</h3><p className="mt-1 text-xs leading-relaxed text-slate-400">Not configured or used by this prototype.</p></div>
                <span className="shrink-0 text-xs font-bold text-slate-500">Not in use</span>
              </div>
            </div>
            {error && <p role="alert" className="mt-4 text-sm text-amber-300">{error}</p>}
            <div className="mt-6 flex flex-col-reverse justify-end gap-2 sm:flex-row">
              <button type="button" onClick={() => onSave('essential')} className="rounded-xl border border-slate-600 px-4 py-3 text-sm font-semibold text-slate-200 transition hover:border-cyan-600 hover:text-white">Reject optional</button>
              <button type="button" onClick={() => onSave('essential')} className="rounded-xl bg-cyan-500 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-400">Save settings</button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

function loadDemoProfile() {
  try {
    const value = JSON.parse(window.localStorage.getItem(PROFILE_KEY) || 'null');
    return value && typeof value.name === 'string' && typeof value.email === 'string' ? value : null;
  } catch {
    return null;
  }
}

function loadCookieConsent() {
  try {
    const value = window.localStorage.getItem(COOKIE_CONSENT_KEY);
    return value === 'essential' ? value : null;
  } catch {
    return null;
  }
}

function loadAccentTheme() {
  try {
    const value = window.localStorage.getItem(THEME_KEY);
    return ['cyan', 'violet', 'emerald', 'rose'].includes(value) ? value : 'cyan';
  } catch {
    return 'cyan';
  }
}

function destinationHost(value) {
  if (!value) return '';
  try {
    return new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : `https://${value}`).hostname
      .toLowerCase()
      .replace(/^www\./, '');
  } catch {
    return '';
  }
}

function formatTimestamp(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Time unavailable' : date.toLocaleString();
}

export default function App() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openNavMenu, setOpenNavMenu] = useState(null);
  const [profile, setProfile] = useState(loadDemoProfile);
  const [registrationError, setRegistrationError] = useState('');
  const [activePage, setActivePage] = useState(null);
  const [accentTheme, setAccentTheme] = useState(loadAccentTheme);
  const [cookieConsent, setCookieConsent] = useState(loadCookieConsent);
  const [cookiePreferencesOpen, setCookiePreferencesOpen] = useState(false);
  const [cookieError, setCookieError] = useState('');
  const [themeOpen, setThemeOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState([
    { role: 'assistant', content: 'Namaste! I’m Saathi, your AI assistant. Ask me about QR safety or any other topic.' }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const [chatError, setChatError] = useState('');
  const [notifications, setNotifications] = useState([
    { id: 1, title: 'Welcome to QR-Shield', message: 'Inspect a QR code before opening its destination.', tone: 'success', read: false, time: new Date() }
  ]);
  const [scanInput, setScanInput] = useState('');
  const [scanResult, setScanResult] = useState(null);
  const [qrFile, setQrFile] = useState(null);
  const [qrPreview, setQrPreview] = useState('');
  const [qrResult, setQrResult] = useState(null);
  const [qrBusy, setQrBusy] = useState(false);
  const [qrError, setQrError] = useState('');
  const [expectedDomain, setExpectedDomain] = useState('');
  const [scanStats, setScanStats] = useState(null);
  const [statsError, setStatsError] = useState('');
  const [apiHealth, setApiHealth] = useState(null);
  const fileInput = useRef(null);
  const decodedHost = destinationHost(qrResult?.payload);
  const expectedHost = destinationHost(expectedDomain);
  const unreadNotifications = notifications.filter(notification => !notification.read).length;

  function addNotification(title, message, tone = 'success') {
    setNotifications(previous => [
      { id: Date.now(), title, message, tone, read: false, time: new Date() },
      ...previous
    ].slice(0, 8));
  }

  function navigateToPage(page) {
    setActivePage(page);
    setMobileMenuOpen(false);
    setOpenNavMenu(null);
    setThemeOpen(false);
    setNotificationsOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function openScanner() {
    setActivePage(null);
    setMobileMenuOpen(false);
    setOpenNavMenu(null);
    window.setTimeout(() => document.getElementById('inspect')?.scrollIntoView({ behavior: 'smooth' }), 0);
  }

  function saveCookiePreferences() {
    try {
      window.localStorage.setItem(COOKIE_CONSENT_KEY, 'essential');
      setCookieConsent('essential');
      setCookiePreferencesOpen(false);
      setCookieError('');
    } catch {
      setCookieError('Your choice could not be saved in this browser. Check storage settings and try again.');
    }
  }

  function openCookiePreferences() {
    setCookieError('');
    setCookiePreferencesOpen(true);
  }

  function registerDemoProfile(event) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const nextProfile = {
      name: String(values.get('name') || '').trim(),
      email: String(values.get('email') || '').trim()
    };
    try {
      window.localStorage.setItem(PROFILE_KEY, JSON.stringify(nextProfile));
      setProfile(nextProfile);
      setRegistrationError('');
    } catch {
      setRegistrationError('Could not save your demo profile in this browser. Check browser storage settings and try again.');
    }
  }

  function signOutDemoProfile() {
    try {
      window.localStorage.removeItem(PROFILE_KEY);
      setProfile(null);
      setActivePage(null);
    } catch {
      addNotification('Could not sign out', 'Browser storage did not allow the demo profile to be removed.', 'warning');
    }
  }

  useEffect(() => {
    document.documentElement.dataset.accentTheme = accentTheme;
    try {
      window.localStorage.setItem(THEME_KEY, accentTheme);
    } catch {
      addNotification('Theme not saved', 'Your selected color will reset when you reload this page.', 'warning');
    }
  }, [accentTheme]);

  useEffect(() => {
    function closeOpenMenus(event) {
      if (event.key === 'Escape') {
        setOpenNavMenu(null);
        setMobileMenuOpen(false);
        setThemeOpen(false);
        setNotificationsOpen(false);
        setCookiePreferencesOpen(false);
      }
    }
    window.addEventListener('keydown', closeOpenMenus);
    return () => window.removeEventListener('keydown', closeOpenMenus);
  }, []);

  const loadScanStats = useCallback(async () => {
    try {
      const [statsResponse, healthResponse] = await Promise.all([
        fetch(`${API}/api/stats`),
        fetch(`${API}/api/health`)
      ]);
      const [statsData, healthData] = await Promise.all([
        statsResponse.json(),
        healthResponse.json()
      ]);
      if (!statsResponse.ok) throw new Error(statsData.detail || 'Could not load scan activity.');
      if (!healthResponse.ok) throw new Error(healthData.detail || 'Could not check the analysis service.');
      setScanStats(statsData);
      setApiHealth(healthData);
      setStatsError('');
    } catch (error) {
      setStatsError(error.message || 'Could not load scan activity.');
    }
  }, []);

  useEffect(() => {
    loadScanStats();
    const timer = window.setInterval(loadScanStats, 20000);
    return () => window.clearInterval(timer);
  }, [loadScanStats]);

  useEffect(() => {
    return () => {
      if (qrPreview) URL.revokeObjectURL(qrPreview);
    };
  }, [qrPreview]);

  function chooseQrFile(file) {
    if (!file) return;
    const allowedTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/bmp'];
    if (!allowedTypes.includes(file.type)) {
      setQrFile(null);
      setQrPreview('');
      setQrResult(null);
      setQrError('Choose a PNG, JPEG, WEBP, or BMP image.');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setQrFile(null);
      setQrPreview('');
      setQrResult(null);
      setQrError('The image must be smaller than 8 MB.');
      return;
    }
    setQrFile(file);
    setQrPreview(URL.createObjectURL(file));
    setQrResult(null);
    setQrError('');
  }

  async function handleScanCheck(e) {
    e.preventDefault();
    const url = scanInput.trim();
    if (!url) return;
    setScanResult({ checking: true });
    try {
      const response = await fetch(`${API}/api/analyze-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'URL analysis failed. Please try again.');
      const checks = data.url_analysis?.checks || [];
      const hasFlags = checks.some(check => check.status === 'flagged');
      setScanResult({
        checking: false,
        safe: data.risk_score < 25 && !hasFlags,
        hasFlags,
        url,
        verdict: data.verdict,
        reasons: data.reasons,
        checks,
        riskScore: data.risk_score,
        enginesPassed: `Local URL risk ${data.risk_score}/100`,
        warning: hasFlags
          ? 'One or more URL-pattern indicators need review. These clues are not proof that a site is malicious.'
          : 'No strong URL-pattern indicators were found. This does not guarantee the destination is safe.'
      });
      addNotification('URL analysis complete', `${data.verdict} · risk ${data.risk_score}/100`, hasFlags ? 'warning' : 'success');
      loadScanStats();
    } catch (error) {
      addNotification('URL analysis failed', error.message || 'Could not connect to the analysis service.', 'danger');
      setScanResult({
        checking: false,
        error: error.message || 'Could not connect to the QR Shield analysis service.'
      });
    }
  }

  async function inspectQrCode() {
    if (!qrFile || qrBusy) return;
    setQrBusy(true);
    setQrError('');
    setQrResult(null);
    try {
      const formData = new FormData();
      formData.append('file', qrFile);
      const response = await fetch(`${API}/api/scan`, { method: 'POST', body: formData });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'QR image inspection failed. Please try again.');
      setQrResult(data);
      addNotification('QR inspection complete', `${data.verdict} · risk ${data.risk_score}/100`, data.risk_score >= 60 ? 'danger' : data.risk_score >= 25 ? 'warning' : 'success');
      loadScanStats();
    } catch (error) {
      addNotification('QR inspection failed', error.message || 'Could not connect to the inspection service.', 'danger');
      setQrError(error.message || 'Could not connect to the QR Shield inspection service.');
    } finally {
      setQrBusy(false);
    }
  }

  function handleQrPaste(event) {
    const imageItem = Array.from(event.clipboardData?.items || [])
      .find(item => item.type.startsWith('image/'));
    if (!imageItem) return;
    event.preventDefault();
    chooseQrFile(imageItem.getAsFile());
  }

  async function sendSaathiMessage(event) {
    event.preventDefault();
    const content = chatInput.trim();
    if (!content || chatBusy) return;
    if (content.length > 2000) {
      setChatError('Keep each message to 2,000 characters or fewer.');
      return;
    }
    const nextMessages = [...chatMessages, { role: 'user', content }];
    setChatMessages(nextMessages);
    setChatInput('');
    setChatBusy(true);
    setChatError('');
    try {
      const response = await fetch(`${API}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: nextMessages.filter((_, index) => index > 0).slice(-12) })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Saathi could not respond. Please try again.');
      if (typeof data.reply !== 'string' || !data.reply.trim()) throw new Error('Saathi returned an empty reply.');
      setChatMessages(previous => [...previous, { role: 'assistant', content: data.reply }]);
    } catch (error) {
      const chatStatus = apiHealth?.chat_status;
      setChatError(
        !chatStatus?.available && chatStatus?.reason
          ? chatStatus.reason
          : error.message || 'Could not connect to Saathi. Check that the backend and AI provider are available.'
      );
    } finally {
      setChatBusy(false);
    }
  }

  function downloadQrReport() {
    if (!qrResult) return;
    try {
      const pdf = new jsPDF();
      const margin = 18;
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const usableWidth = pageWidth - margin * 2;
      const safeText = value => String(value || 'Not available').replace(/[^\x20-\x7E]/g, '?');
      let y = 20;

      const writeParagraph = (label, value) => {
        const lines = pdf.splitTextToSize(safeText(value), usableWidth);
        if (y + 7 > pageHeight - margin) {
          pdf.addPage();
          y = margin;
        }
        pdf.setFont('helvetica', 'bold');
        pdf.text(safeText(label), margin, y);
        y += 6;
        pdf.setFont('helvetica', 'normal');
        lines.forEach(line => {
          if (y > pageHeight - margin) {
            pdf.addPage();
            y = margin;
          }
          pdf.text(line, margin, y);
          y += 5;
        });
        y += 6;
      };

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(18);
      pdf.text('QR-Shield - QR Inspection Report', margin, y);
      y += 10;
      pdf.setFontSize(10);
      writeParagraph('Generated', new Date().toLocaleString());
      writeParagraph('Image file', qrFile?.name || 'Not available');
      writeParagraph('Verdict', qrResult.verdict);
      writeParagraph('Risk score', `${qrResult.risk_score ?? 'Not available'}/100`);
      writeParagraph('Analysis method', 'Baseline URL heuristics and basic image-quality checks only. No live reputation lookup or trained QR-image tampering classifier is configured.');
      writeParagraph('Decoded destination', qrResult.payload || 'No QR destination could be decoded.');
      writeParagraph('Expected domain', expectedDomain.trim() || 'Not provided');
      if (expectedDomain.trim()) {
        writeParagraph('Hostname comparison', decodedHost && expectedHost
          ? decodedHost === expectedHost
            ? `The decoded hostname matches ${expectedHost}.`
            : `The decoded hostname (${decodedHost}) does not match the expected domain (${expectedHost}).`
          : 'The hostname comparison could not be completed.');
      }
      writeParagraph('Risk indicators', (qrResult.reasons || []).length ? qrResult.reasons.join('\n') : 'No risk indicators were returned.');
      if (qrResult.image_note) writeParagraph('Image note', qrResult.image_note);
      if (qrResult.url_analysis?.checks?.length) {
        writeParagraph('URL analysis checks', qrResult.url_analysis.checks
          .map(check => `${check.category} / ${check.title} [${check.status}]: ${check.detail}`)
          .join('\n'));
        if (qrResult.url_analysis.analysis_scope) {
          writeParagraph('URL analysis scope', qrResult.url_analysis.analysis_scope);
        }
      }
      if (qrResult.url_analysis?.features) {
        const checks = Object.entries(qrResult.url_analysis.features)
          .map(([name, value]) => `${name}: ${Array.isArray(value) ? (value.length ? value.join(', ') : 'none') : value}`)
          .join('\n');
        writeParagraph('URL heuristic features', checks);
      }
      if (qrResult.image_analysis) {
        const { width, height, blur_score: blurScore } = qrResult.image_analysis;
        writeParagraph('Image quality checks', [
          Number.isFinite(width) && Number.isFinite(height) ? `Dimensions: ${width} x ${height} pixels` : '',
          Number.isFinite(blurScore) ? `Blur score: ${blurScore}` : '',
          'No trained visual-tampering model was run.'
        ].filter(Boolean).join('\n'));
      }
      writeParagraph('Safety note', qrResult.safety_note || 'This report contains baseline heuristic results, not a guarantee that the destination is safe.');
      pdf.save('qrsafer-inspection-report.pdf');
      addNotification('PDF report downloaded', 'The QR inspection report was generated in your browser.', 'success');
    } catch (error) {
      addNotification('PDF report failed', error.message || 'The report could not be generated.', 'danger');
    }
  }

  if (!profile) {
    return (
      <>
      <main data-accent-theme={accentTheme} className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100">
        <div className="mx-auto flex min-h-[80vh] max-w-lg flex-col justify-center">
          <div className="rounded-3xl border border-slate-800 bg-slate-900 p-7 shadow-2xl sm:p-10">
            <div className="mb-7 flex items-center gap-3">
              <BrandMark className="h-14 w-14 shrink-0" />
              <div><p className="text-xl font-black tracking-tight text-slate-50">QR-<span className="text-cyan-400">Shield</span></p><p className="text-xs text-slate-400">QR Safety &amp; Tampering Checks</p></div>
            </div>
            <span className="text-xs font-bold uppercase tracking-widest text-cyan-400">Welcome</span>
            <h1 className="mt-2 text-3xl font-extrabold">Create your demo profile</h1>
            <p className="mt-3 text-sm leading-relaxed text-slate-400">Register to continue to the QR safety checker. This demo keeps your name and email in this browser only; it does not create a server account.</p>
            <form onSubmit={registerDemoProfile} className="mt-7 space-y-4">
              <label className="block text-sm font-semibold" htmlFor="registration-name">Full name</label>
              <input id="registration-name" name="name" autoComplete="name" required maxLength={80} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm" placeholder="Your name" />
              <label className="block text-sm font-semibold" htmlFor="registration-email">Email address</label>
              <input id="registration-email" name="email" type="email" autoComplete="email" required maxLength={254} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm" placeholder="you@example.com" />
              {registrationError && <p role="alert" className="text-sm text-rose-300">{registrationError}</p>}
              <button type="submit" className="w-full rounded-xl bg-cyan-500 py-3 font-bold text-slate-950 transition hover:bg-cyan-400">Register and continue</button>
            </form>
            <p className="mt-5 text-xs leading-relaxed text-slate-500">Demo registration only: no password is requested or stored, and this is not real authentication.</p>
          </div>
        </div>
      </main>
      <CookieNotice consent={cookieConsent} preferencesOpen={cookiePreferencesOpen} error={cookieError} onOpenPreferences={openCookiePreferences} onClosePreferences={() => setCookiePreferencesOpen(false)} onSave={saveCookiePreferences} />
      </>
    );
  }

  return (
    <div data-accent-theme={accentTheme} className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-cyan-500 selection:text-black relative">
      
      {/* ================= NAVIGATION BAR ================= */}
      <header className="sticky top-0 z-40 backdrop-blur-md bg-slate-950/80 border-b border-slate-800/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <button type="button" aria-label="QR-Shield home" className="flex min-w-0 items-center gap-3 text-left" onClick={() => navigateToPage(null)}>
            <BrandMark className="h-12 w-12 shrink-0 drop-shadow-[0_0_14px_rgba(34,211,238,0.2)]" />
            <div className="flex min-w-0 flex-col">
              <span className="flex items-center gap-2 whitespace-nowrap text-xl font-black tracking-tight sm:text-2xl">
                <span>QR-<span className="text-cyan-400">Shield</span></span> <span className="text-[9px] bg-cyan-950 border border-cyan-800 text-cyan-400 px-1.5 py-0.5 rounded uppercase font-semibold">Prototype</span>
              </span>
              <span className="hidden text-xs text-slate-400 sm:block">QR Safety &amp; Tampering Checks</span>
            </div>
          </button>

          <nav className="hidden xl:flex items-center gap-2 text-sm font-medium text-slate-300" aria-label="Main navigation">
            {NAV_GROUPS.map(group => (
              <div key={group.label} className="relative">
                <button
                  type="button"
                  aria-expanded={openNavMenu === group.label}
                  onClick={() => { setOpenNavMenu(openNavMenu === group.label ? null : group.label); setThemeOpen(false); setNotificationsOpen(false); }}
                  className={`inline-flex items-center gap-1 rounded-lg px-3 py-2 transition hover:bg-slate-900 hover:text-cyan-400 ${group.items.some(([page]) => page === activePage) ? 'text-cyan-400' : ''}`}
                >
                  {group.label}<span aria-hidden="true" className="text-xs">⌄</span>
                </button>
                {openNavMenu === group.label && (
                  <div className="absolute left-0 top-full z-50 mt-2 min-w-56 rounded-xl border border-slate-700 bg-slate-900 p-2 shadow-2xl" role="group" aria-label={`${group.label} links`}>
                    {group.items.map(([page, label]) => (
                      <button key={page} type="button" onClick={() => navigateToPage(page)} className="block w-full rounded-lg px-3 py-2.5 text-left text-sm text-slate-300 transition hover:bg-slate-800 hover:text-cyan-300">
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
            <button type="button" onClick={openScanner} className="ml-2 rounded-xl bg-cyan-500 px-4 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-cyan-400">Scan a QR</button>
          </nav>

          <div className="flex items-center gap-1 sm:gap-3">
            <div className="relative">
              <button
                type="button"
                aria-label="Choose accent color"
                aria-expanded={themeOpen}
                onClick={() => { setThemeOpen(open => !open); setNotificationsOpen(false); setOpenNavMenu(null); }}
                className="relative rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-lg text-slate-200 transition hover:border-cyan-700"
              >
                <Palette className="h-4 w-4" aria-hidden="true" />
              </button>
              {themeOpen && (
                <div className="absolute right-0 top-full z-50 mt-2 w-48 rounded-xl border border-slate-700 bg-slate-900 p-2 shadow-2xl" role="group" aria-label="Accent color">
                  <p className="px-2 py-1 text-xs font-semibold text-slate-400">Accent color</p>
                  {[['cyan', 'Cyan', 'bg-cyan-400'], ['violet', 'Violet', 'bg-violet-400'], ['emerald', 'Emerald', 'bg-emerald-400'], ['rose', 'Rose', 'bg-rose-400']].map(([theme, label, swatch]) => (
                    <button key={theme} type="button" onClick={() => { setAccentTheme(theme); setThemeOpen(false); }} className={`flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm hover:bg-slate-800 ${accentTheme === theme ? 'text-white' : 'text-slate-300'}`} aria-pressed={accentTheme === theme}>
                      <span className={`h-3 w-3 rounded-full ${swatch}`} aria-hidden="true" />{label}{accentTheme === theme && <span className="ml-auto" aria-hidden="true">✓</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="relative">
              <button
                type="button"
                aria-label={`Notifications${unreadNotifications ? `, ${unreadNotifications} unread` : ''}`}
                aria-expanded={notificationsOpen}
                onClick={() => {
                  setNotificationsOpen(open => !open);
                  setThemeOpen(false);
                  setOpenNavMenu(null);
                  setNotifications(previous => previous.map(notification => ({ ...notification, read: true })));
                }}
                className="relative rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-lg text-slate-200 transition hover:border-cyan-700"
              >
                <Bell className="h-4 w-4" aria-hidden="true" />
                {unreadNotifications > 0 && <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white">{unreadNotifications}</span>}
              </button>
              {notificationsOpen && (
                <section className="absolute right-0 top-full z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-2xl" aria-label="Notifications">
                  <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
                    <div><h2 className="text-sm font-bold">Notifications</h2><p className="text-xs text-slate-400">Recent activity from this session</p></div>
                    <button type="button" onClick={() => setNotifications([])} className="text-xs text-cyan-400 hover:text-cyan-300">Clear</button>
                  </div>
                  <div className="max-h-80 overflow-y-auto">
                    {notifications.length ? notifications.map(notification => (
                      <article key={notification.id} className="flex gap-3 border-b border-slate-800 px-4 py-3 last:border-0">
                        <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${notification.tone === 'danger' ? 'bg-rose-400' : notification.tone === 'warning' ? 'bg-amber-400' : 'bg-emerald-400'}`} aria-hidden="true" />
                        <div className="min-w-0"><p className="text-xs font-semibold text-slate-100">{notification.title}</p><p className="mt-1 wrap-break-word text-xs leading-relaxed text-slate-400">{notification.message}</p><time className="mt-1 block text-[10px] text-slate-500">{notification.time.toLocaleTimeString()}</time></div>
                      </article>
                    )) : <p className="px-4 py-7 text-center text-xs text-slate-400">No notifications yet.</p>}
                  </div>
                </section>
              )}
            </div>
            <div className="hidden items-center gap-2 md:flex">
              <span className="max-w-28 truncate text-xs text-slate-300" title={profile.name}>{profile.name}</span>
              <button type="button" onClick={signOutDemoProfile} className="rounded-lg px-2 py-2 text-xs font-semibold text-slate-400 transition hover:text-white">Sign out</button>
            </div>
          </div>

          {/* Mobile menu button */}
          <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} aria-label="Toggle navigation menu" aria-expanded={mobileMenuOpen} className="xl:hidden rounded-lg p-2 text-slate-300 hover:bg-slate-900 hover:text-white">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path></svg>
          </button>
        </div>

        {/* Mobile Dropdown */}
        {mobileMenuOpen && (
          <div className="xl:hidden max-h-[75vh] space-y-4 overflow-y-auto border-b border-slate-800 bg-slate-900 px-4 pb-5 pt-4">
            {NAV_GROUPS.map(group => (
              <section key={group.label} aria-label={group.label}>
                <h2 className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-500">{group.label}</h2>
                <div className="grid grid-cols-2 gap-x-4">
                  {group.items.map(([page, label]) => (
                    <button key={page} type="button" onClick={() => navigateToPage(page)} className="block w-full py-2 text-left text-sm text-slate-300 hover:text-cyan-400">{label}</button>
                  ))}
                </div>
              </section>
            ))}
            <button type="button" onClick={openScanner} className="w-full rounded-xl bg-cyan-500 px-4 py-3 text-sm font-bold text-slate-950">Scan a QR</button>
            <div className="flex items-center justify-between border-t border-slate-800 pt-3 text-xs text-slate-400">
              <span>{profile.name}</span><button type="button" onClick={signOutDemoProfile} className="font-semibold hover:text-white">Sign out</button>
            </div>
          </div>
        )}
      </header>

      {activePage ? (
        <InfoPage page={activePage} onBack={() => navigateToPage(null)} onOpenScanner={openScanner} />
      ) : (
        <>
      {/* ================= LANDING SECTION 1: HERO & SCANNER ================= */}
      <section className="relative pt-24 pb-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto text-center overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-150 h-150 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none"></div>
        
        <div className="relative z-10 max-w-3xl mx-auto space-y-6">
          <img src="/images/qr-shield-scan.svg" alt="Illustration of a QR code being safely inspected on a phone" className="mx-auto mb-8 w-full max-w-xl rounded-3xl border border-cyan-900/60 shadow-2xl shadow-cyan-950/30" />
          <div className="inline-flex items-center gap-2 bg-cyan-950/80 border border-cyan-800 text-cyan-400 text-xs px-3.5 py-1.5 rounded-full uppercase tracking-wider font-semibold shadow-inner">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
            QR Code Scam & Sticker Tampering Checks
          </div>
          
          <h1 className="text-4xl sm:text-7xl font-black tracking-tight leading-none">
            Scan QR Codes Without <span className="text-transparent bg-clip-text bg-linear-to-r from-cyan-400 to-blue-500">Guesswork</span>
          </h1>
          
          <p className="text-slate-400 text-lg sm:text-xl">
            Decode QR images, review explainable URL risk signals, and learn how to spot replaced stickers before opening a link.
          </p>

          {/* Interactive URL/QR Live Simulation Box */}
          <div className="bg-slate-900/90 border border-slate-800 p-4 sm:p-6 rounded-2xl shadow-2xl max-w-xl mx-auto mt-8 text-left space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase text-slate-400 tracking-wider">URL Risk Checker</span>
              <span className="text-xs text-cyan-400 bg-cyan-950 px-2 py-0.5 rounded border border-cyan-800/50">URL Risk Checks</span>
            </div>
            
            <form onSubmit={handleScanCheck} className="flex gap-2">
              <input 
                type="text" 
                placeholder="Paste URL or test destination (e.g., https://safe-menu.com or fake-bank-login)"
                maxLength={2048}
                required
                value={scanInput}
                onChange={(e) => setScanInput(e.target.value)}
                className="grow bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-cyan-500 transition"
              />
              <button type="submit" disabled={scanResult?.checking} className="bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 font-bold px-6 py-3 rounded-xl transition text-sm shrink-0">
                {scanResult?.checking ? 'Checking…' : 'Check Code'}
              </button>
            </form>

            {scanResult && (
              <div className={`p-4 rounded-xl border text-sm ${scanResult.checking ? 'bg-slate-950 border-slate-800 text-slate-400' : scanResult.error ? 'bg-rose-950/40 border-rose-800 text-rose-300' : riskTone(scanResult.riskScore ?? 0, scanResult.hasFlags)}`}>
                {scanResult.checking ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin"></div>
                    Analyzing the URL with baseline risk checks...
                  </div>
                ) : (
                  <div className="space-y-1">
                    {scanResult.error ? (
                      <p role="alert" className="text-rose-300">{scanResult.error}</p>
                    ) : <div className="space-y-2">
                    <div className="font-bold flex items-center justify-between gap-3">
                      <span>{scanResult.safe ? '✓ No Strong URL-Pattern Indicators' : `⚠ ${scanResult.hasFlags ? 'Signals to review' : scanResult.verdict}`}</span>
                      <span className="text-xs px-2 py-0.5 rounded bg-slate-900 text-slate-300 border border-slate-700">{scanResult.enginesPassed}</span>
                    </div>
                    <p className="text-xs text-slate-300">{scanResult.warning}</p>
                    <div className="text-[11px] text-slate-400 truncate pt-1">Target: {scanResult.url}</div>
                    {scanResult.reasons?.length > 0 && (
                      <ul className="list-disc pl-5 text-xs text-slate-300 space-y-1">
                        {scanResult.reasons.map((reason, index) => <li key={index}>{reason}</li>)}
                      </ul>
                    )}
                    {scanResult.checks?.length > 0 && (
                      <div className="border-t border-slate-700/70 pt-3 mt-3">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">Analysis breakdown</h3>
                        <div className="grid gap-2 sm:grid-cols-2 mt-2">
                          {scanResult.checks.map(check => (
                            <div key={`${check.category}-${check.title}`} className={`rounded-lg border p-3 ${checkTone(check.status)}`}>
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[10px] uppercase tracking-wide opacity-75">{check.category}</span>
                                <span className="text-[9px] uppercase font-bold">{check.status}</span>
                              </div>
                              <h4 className="mt-1 text-xs font-bold">{check.title}</h4>
                              <p className="mt-1 text-[11px] leading-relaxed text-slate-300">{check.detail}</p>
                            </div>
                          ))}
                        </div>
                        <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
                          These are local URL-pattern checks, not a live malware scan. QR-Shield does not visit the link or query reputation, DNS, domain-age, or redirect services.
                        </p>
                      </div>
                    )}
                    </div>}
                  </div>
                )}
              </div>
            )}
            <p className="text-[11px] leading-relaxed text-slate-500">
              This raw-URL check uses explainable heuristics. The bundled XGBoost model needs all 30 precomputed website features; it cannot classify a URL by itself. No live reputation or redirect checks are performed.
            </p>
            <div className="text-[11px] border-t border-slate-800 pt-3 text-slate-400" role="status">
              {statsError
                ? `Analysis service: ${statsError}`
                : apiHealth?.model_status?.url_model?.available
                  ? 'API online · trained XGBoost feature model loaded (precomputed-feature API only)'
                  : 'API online · trained XGBoost feature model unavailable'}
            </div>
          </div>
        </div>
      </section>

      {/* ================= QR CODE IMAGE INSPECTION ================= */}
      <section id="inspect" className="py-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto border-t border-slate-800/60 scroll-mt-20">
        <div className="text-center max-w-3xl mx-auto space-y-4 mb-12">
          <span className="text-cyan-400 text-xs font-bold uppercase tracking-wider bg-cyan-950 px-3 py-1 rounded border border-cyan-800">
            QR Code Safety Checker
          </span>
          <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight">Inspect a QR Code Before You Open It</h2>
          <p className="text-slate-400 text-sm sm:text-base">
            Upload an image, paste a screenshot, or take a photo on your phone. We decode its destination and show the URL risk signals before you visit it.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-6 items-start">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-lg">Upload or capture a QR image</h3>
                <p className="text-slate-400 text-xs mt-1">PNG, JPG, WEBP, or BMP · up to 8 MB</p>
              </div>
              <span className="text-xs text-cyan-400 bg-cyan-950 px-2.5 py-1 rounded-lg border border-cyan-800">Image analysis</span>
            </div>

            <div
              onDragOver={event => event.preventDefault()}
              onDrop={event => { event.preventDefault(); chooseQrFile(event.dataTransfer.files?.[0]); }}
              onPaste={handleQrPaste}
              tabIndex={0}
              className="min-h-64 border-2 border-dashed border-slate-700 hover:border-cyan-500 focus:border-cyan-500 rounded-2xl bg-slate-950/70 p-5 flex flex-col items-center justify-center text-center gap-3 transition outline-none"
              aria-label="QR image upload and paste area"
            >
              {qrPreview ? (
                <>
                  <img src={qrPreview} alt="Selected QR code" className="max-h-48 max-w-full rounded-xl object-contain" />
                  <span className="text-xs text-slate-300 break-all">{qrFile?.name}</span>
                </>
              ) : (
                <>
                  <div className="w-14 h-14 rounded-2xl bg-cyan-950 border border-cyan-800 text-cyan-400 grid place-items-center text-2xl" aria-hidden="true">▦</div>
                  <strong>Drop a QR image here</strong>
                  <span className="text-xs text-slate-400">or choose a file, paste an image, or take a photo</span>
                </>
              )}
              <input
                ref={fileInput}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/bmp"
                capture="environment"
                className="hidden"
                onChange={event => {
                  chooseQrFile(event.target.files?.[0]);
                  event.target.value = '';
                }}
              />
              <button type="button" onClick={() => fileInput.current?.click()} className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 font-bold px-5 py-2.5 rounded-xl text-sm transition">
                {qrFile ? 'Choose another image' : 'Choose image / take photo'}
              </button>
            </div>

            {qrError && <p role="alert" className="text-rose-300 text-sm">{qrError}</p>}
            <button
              type="button"
              onClick={inspectQrCode}
              disabled={!qrFile || qrBusy}
              className="w-full bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 font-bold py-3 rounded-xl transition"
            >
              {qrBusy ? 'Inspecting QR code…' : 'Decode and inspect QR code'}
            </button>
            <p className="text-[11px] leading-relaxed text-slate-500">
              Images are used for this inspection request. The checker performs QR decoding and basic image-quality checks; it does not identify physical sticker overlays.
            </p>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 min-h-96">
            {!qrResult ? (
              <div className="h-full min-h-80 flex flex-col items-center justify-center text-center">
                <div className="w-16 h-16 rounded-2xl bg-slate-800 border border-slate-700 text-cyan-400 grid place-items-center text-2xl mb-5" aria-hidden="true">⌕</div>
                <h3 className="font-bold text-lg">Your inspection report appears here</h3>
                <p className="text-sm text-slate-400 mt-2 max-w-sm">Decode the code, verify its final displayed destination, and review each risk indicator before deciding whether to continue.</p>
              </div>
            ) : (
              <div className="space-y-5">
                <div className={`p-4 rounded-2xl border ${qrResult.verdict === 'Unable to decode' ? 'bg-amber-950/30 border-amber-800' : riskTone(qrResult.risk_score, qrResult.url_analysis?.checks?.some(check => check.status === 'flagged'))}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className="text-xs uppercase tracking-wider text-slate-400">Inspection verdict</span>
                      <h3 className="font-extrabold text-xl mt-1">{qrResult.verdict}</h3>
                    </div>
                    <span className="shrink-0 text-sm font-bold bg-slate-950/70 border border-slate-700 rounded-lg px-3 py-2">Risk {qrResult.risk_score}/100</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="font-bold text-sm">Decoded destination</h4>
                  <p className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-slate-200 break-all">
                    {qrResult.payload || 'No QR destination could be decoded from this image.'}
                  </p>
                </div>

                {qrResult.payload && (
                  <div className="space-y-2">
                    <label htmlFor="expected-domain" className="block text-sm font-bold">Expected organization or domain <span className="text-slate-500 font-normal">(optional)</span></label>
                    <input
                      id="expected-domain"
                      value={expectedDomain}
                      onChange={event => setExpectedDomain(event.target.value)}
                      placeholder="e.g. your-parking-provider.com"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-cyan-500"
                    />
                    {expectedDomain.trim() && (
                      <p className={`text-xs font-semibold ${decodedHost && expectedHost && decodedHost === expectedHost ? 'text-emerald-300' : 'text-amber-300'}`}>
                        {decodedHost && expectedHost && decodedHost === expectedHost
                          ? `The decoded hostname matches ${expectedHost}.`
                          : decodedHost && expectedHost
                            ? `The decoded hostname (${decodedHost}) does not match the expected domain.`
                            : 'Enter a valid web hostname to compare it with the decoded destination.'}
                      </p>
                    )}
                  </div>
                )}

                <div className="space-y-2">
                  <h4 className="font-bold text-sm">Risk indicators</h4>
                  <ul className="space-y-2 text-sm text-slate-300">
                    {(qrResult.reasons || []).map((reason, index) => <li key={index} className="flex gap-2"><span className="text-cyan-400">•</span><span>{reason}</span></li>)}
                  </ul>
                </div>

                {(qrResult.url_analysis || qrResult.image_analysis) && (
                  <details className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
                    <summary className="cursor-pointer text-sm font-bold text-slate-200">View analysis breakdown</summary>
                    <div className="mt-4 space-y-4">
                      {qrResult.url_analysis && (
                        <section>
                          <h4 className="text-xs font-bold uppercase tracking-wider text-cyan-400">URL checks · local analysis</h4>
                          <p className="mt-2 text-xs text-slate-300">Risk score: {qrResult.url_analysis.score ?? qrResult.url_score ?? 'Not available'}/100 · {qrResult.url_analysis.verdict || 'Result unavailable'}</p>
                          {qrResult.url_analysis.checks?.length > 0 && (
                            <div className="mt-3 grid gap-2 sm:grid-cols-2">
                              {qrResult.url_analysis.checks.map(check => (
                                <div key={`${check.category}-${check.title}`} className={`rounded-lg border p-3 ${checkTone(check.status)}`}>
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-[10px] uppercase tracking-wide opacity-75">{check.category}</span>
                                    <span className="text-[9px] uppercase font-bold">{check.status}</span>
                                  </div>
                                  <h5 className="mt-1 text-xs font-bold">{check.title}</h5>
                                  <p className="mt-1 text-[11px] leading-relaxed text-slate-300">{check.detail}</p>
                                </div>
                              ))}
                            </div>
                          )}
                          {qrResult.url_analysis.analysis_scope && <p className="mt-3 text-[11px] text-slate-400">{qrResult.url_analysis.analysis_scope}</p>}
                          {qrResult.url_analysis.features && (
                            <dl className="mt-3 grid gap-2 sm:grid-cols-2">
                              {Object.entries(qrResult.url_analysis.features).map(([name, value]) => (
                                <div key={name} className="rounded-lg border border-slate-800 px-3 py-2">
                                  <dt className="text-[10px] text-slate-500">{name.replaceAll('_', ' ')}</dt>
                                  <dd className="mt-1 wrap-break-word text-xs text-slate-200">{Array.isArray(value) ? (value.length ? value.join(', ') : 'None') : String(value)}</dd>
                                </div>
                              ))}
                            </dl>
                          )}
                        </section>
                      )}
                      {qrResult.image_analysis && (
                        <section className="border-t border-slate-800 pt-4">
                          <h4 className="text-xs font-bold uppercase tracking-wider text-cyan-400">Image checks · quality only</h4>
                          <p className="mt-2 text-xs leading-relaxed text-slate-300">{qrResult.image_analysis.note || qrResult.image_note || 'No image quality notes are available.'}</p>
                          <p className="mt-2 text-xs text-slate-400">
                            {Number.isFinite(qrResult.image_analysis.width) && Number.isFinite(qrResult.image_analysis.height)
                              ? `Image size: ${qrResult.image_analysis.width} × ${qrResult.image_analysis.height} pixels`
                              : 'Image size: unavailable'}
                            {Number.isFinite(qrResult.image_analysis.blur_score) ? ` · Blur score: ${qrResult.image_analysis.blur_score}` : ''}
                          </p>
                          <p className="mt-2 text-[11px] text-amber-200/80">No trained sticker-overlay or visual-tampering model was run.</p>
                        </section>
                      )}
                    </div>
                  </details>
                )}

                {qrResult.image_note && <p className="text-xs leading-relaxed text-slate-400 border-t border-slate-800 pt-4">{qrResult.image_note}</p>}
                <p className="text-[11px] leading-relaxed text-amber-200/80">{qrResult.safety_note || 'This prototype uses baseline URL heuristics, not live reputation services. A low risk score does not guarantee safety.'}</p>
                <button type="button" onClick={downloadQrReport} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-700 bg-cyan-950/60 px-4 py-3 text-sm font-bold text-cyan-300 transition hover:bg-cyan-900/60">
                  <span aria-hidden="true">↓</span> Download inspection report as PDF
                </button>
                <p className="text-center text-[11px] text-slate-500">The PDF is generated in your browser and includes this inspection result.</p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ================= LANDING SECTION 2: QR TAMPERING & OVERLAY FRAUD ================= */}
      <section id="tampering" className="py-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto border-t border-slate-800/60">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div className="space-y-6">
            <span className="text-cyan-400 text-xs font-bold uppercase tracking-wider bg-cyan-950 px-3 py-1 rounded border border-cyan-800">
              Physical Security Risk
            </span>
            <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight">
              Check Replaced QR Stickers & Overlay Fraud
            </h2>
            <p className="text-slate-400 text-base sm:text-lg">
              Scammers frequently paste malicious sticker overlays on parking meters, restaurant tables, and payment terminals. The original code looks normal, but the physical sticker diverts funds or steals credentials.
            </p>
            <div className="space-y-4 pt-2">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold text-sm mt-0.5">✓</div>
                <div>
                  <h4 className="font-bold text-slate-200">Physical Sticker Review</h4>
                  <p className="text-xs text-slate-400">Use the inspection guide to spot lifted edges, mismatched print, or a suspicious sticker placed over the original.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold text-sm mt-0.5">✓</div>
                <div>
                  <h4 className="font-bold text-slate-200">Expected-Domain Comparison</h4>
                  <p className="text-xs text-slate-400">Compare the decoded hostname with the organization you expected before following the link.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl relative">
            <img src="/images/parking-qr-scenario.svg" alt="Illustration showing an overlay QR sticker on a parking sign" className="mb-6 w-full rounded-2xl border border-slate-800" />
            <div className="absolute -top-4 -right-4 bg-rose-500 text-slate-950 text-xs font-black uppercase px-3 py-1 rounded-full shadow-lg">
              Illustrative Scenario
            </div>
            <div className="space-y-6">
              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 flex items-center justify-between">
                <div>
                  <div className="text-xs text-slate-500 font-semibold uppercase">Example location</div>
                  <div className="font-bold text-slate-200">Downtown Parking Zone #402</div>
                </div>
                <button type="button" onClick={() => navigateToPage('parking-case')} className="text-xs bg-amber-950 text-amber-300 border border-amber-800 px-3 py-2 rounded-lg font-bold transition hover:bg-amber-900 focus-visible:outline-2 focus-visible:outline-amber-300">Review scenario</button>
              </div>

              <div className="grid grid-cols-2 gap-4 text-center">
                <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800">
                  <div className="text-xs text-slate-500 mb-1">Original Entity</div>
                  <div className="font-bold text-cyan-400 text-sm">City Municipal Parking</div>
                </div>
                <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800">
                  <div className="text-xs text-slate-500 mb-1">Redirected To</div>
                  <div className="font-bold text-rose-400 text-sm">pay-city.example.invalid</div>
                </div>
              </div>

              <div className="p-4 bg-rose-950/30 border border-rose-900/50 rounded-xl text-xs text-rose-300 space-y-1">
                <span className="font-bold block">⚠️ Fraud Warning:</span>
                Illustrative only, not a verified local incident. Inspect the sticker and verify the hostname; physical overlays are not automatically detected.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ================= QR TAMPERING EDUCATION ================= */}
      <section id="tampering-guide" className="py-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto border-t border-slate-800/60 scroll-mt-20">
        <div className="grid lg:grid-cols-[0.8fr_1.2fr] gap-12 items-start">
          <div className="space-y-5 lg:sticky lg:top-28">
            <span className="text-cyan-400 text-xs font-bold uppercase tracking-wider bg-cyan-950 px-3 py-1 rounded border border-cyan-800">
              A practical safety guide
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">A trusted sign does not guarantee a trusted QR code</h2>
            <p className="text-slate-400 leading-relaxed">
              A code can be replaced while the surrounding menu, parking meter, or payment sign still looks genuine. Check the physical surface and the decoded web address as two separate signals.
            </p>
            <a href="#inspect" className="inline-flex items-center gap-2 text-cyan-400 font-bold text-sm hover:text-cyan-300 transition">
              Inspect a QR code <span aria-hidden="true">→</span>
            </a>
          </div>

          <div className="space-y-4">
            {[
              { title: 'Sticker placed over the original', text: 'Look for lifted corners, uneven edges, bubbles, different paper or print quality, and a second label around the code.' },
              { title: 'Destination does not match the location', text: 'A parking sign should lead to the operator you expect. A misspelled brand, unrelated domain, or unexpected URL shortener deserves extra scrutiny.' },
              { title: 'Unexpected payment or sign-in request', text: 'Treat requests for card details, passwords, one-time codes, or urgent payment as high risk—especially when they appear after scanning a public sign.' },
              { title: 'Old or altered placement information', text: 'Check that the code belongs on that specific meter, table, or sign. When anything looks changed, use the provider’s official app or type its known address yourself.' }
            ].map((item, index) => (
              <article key={item.title} className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 sm:p-7 flex gap-4">
                <span className="shrink-0 w-9 h-9 rounded-xl bg-cyan-950 border border-cyan-800 text-cyan-400 grid place-items-center font-bold">{String(index + 1).padStart(2, '0')}</span>
                <div>
                  <h3 className="font-bold text-slate-100">{item.title}</h3>
                  <p className="text-sm text-slate-400 leading-relaxed mt-2">{item.text}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ================= QR CHECK WORKFLOW ================= */}
      <section className="py-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto border-t border-slate-800/60">
        <div className="text-center max-w-3xl mx-auto space-y-4 mb-14">
          <span className="text-cyan-400 text-xs font-bold uppercase tracking-wider bg-cyan-950 px-3 py-1 rounded border border-cyan-800">
            Before you tap
          </span>
          <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight">A safer way to scan public QR codes</h2>
          <p className="text-slate-400 text-sm sm:text-base">Use this quick routine for menus, parking, transit, event tickets, and payment links.</p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">
          {[
            { title: 'Inspect the surface', text: 'Check the sign or label for overlays, damage, or a placement that feels out of place.' },
            { title: 'Preview the destination', text: 'Read the whole domain carefully before opening it. HTTPS alone does not mean a website is legitimate.' },
            { title: 'Compare the organization', text: 'Make sure the hostname belongs to the merchant, city, or service you intended to use.' },
            { title: 'Pause on sensitive actions', text: 'Do not enter passwords, card details, or verification codes if the page or request feels unexpected.' }
          ].map((item, index) => (
            <article key={item.title} className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6">
              <div className="text-cyan-400 text-sm font-black mb-5">STEP 0{index + 1}</div>
              <h3 className="font-bold text-lg mb-2">{item.title}</h3>
              <p className="text-sm leading-relaxed text-slate-400">{item.text}</p>
            </article>
          ))}
        </div>
        <div className="mt-8 p-6 sm:p-8 rounded-2xl border border-cyan-900/70 bg-cyan-950/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
          <div>
            <h3 className="font-bold text-lg">Not sure about a code?</h3>
            <p className="text-sm text-slate-400 mt-1">Decode it and compare its destination before deciding whether to continue.</p>
          </div>
          <a href="#inspect" className="shrink-0 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold px-5 py-3 rounded-xl transition">Check a QR image</a>
        </div>
      </section>


      {/* ================= LANDING SECTION 3: LIVE THREAT MAP ================= */}
      <section id="threats" className="py-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto border-t border-slate-800/60">
        <div className="text-center max-w-3xl mx-auto space-y-4 mb-12">
          <span className="text-cyan-400 text-xs font-bold uppercase tracking-wider bg-cyan-950 px-3 py-1 rounded border border-cyan-800">
            Local Scan Telemetry
          </span>
          <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight">
            Review QR Inspection Activity
          </h2>
          <p className="text-slate-400 text-sm sm:text-base">
            Follow scan and risk totals recorded by this QR Shield installation. Activity refreshes automatically while the page is open.
          </p>
        </div>

        <div className="w-full h-112.5 bg-slate-900 border border-slate-800 rounded-3xl relative overflow-hidden flex items-center justify-center shadow-2xl">
          <div className="absolute inset-0 opacity-20 bg-[radial-gradient(#06b6d4_1px,transparent_1px)] bg-size-[24px_24px]"></div>
          
          <div className="absolute top-6 left-6 flex items-center gap-2 bg-slate-950/80 border border-slate-800 px-4 py-2 rounded-xl text-xs backdrop-blur">
            <span className={`w-2.5 h-2.5 rounded-full ${statsError ? 'bg-rose-500' : 'bg-emerald-500'}`}></span>
            <span className="text-slate-300 font-semibold">
              {statsError ? 'Scan activity unavailable' : `${scanStats?.total_scans ?? '—'} scans recorded`}
            </span>
          </div>

          <div className="text-center space-y-3 z-10">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-2xl font-bold">
              📊
            </div>
            <h3 className="text-xl font-bold">QR Shield Scan Activity</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              {statsError
                ? statsError
                : `${scanStats?.flagged_scans ?? '—'} flagged scans · ${scanStats?.malicious_scans ?? '—'} high-risk results recorded.`}
            </p>
            <p className="text-[11px] text-slate-500 max-w-sm mx-auto">Counts come from this installation’s scan history, not a global threat feed.</p>
          </div>
        </div>

        <section className="mt-8 rounded-3xl border border-slate-800 bg-slate-900 p-5 sm:p-8" aria-labelledby="recent-scans-title">
          <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h3 id="recent-scans-title" className="text-xl font-bold">Recent scans</h3>
              <p className="mt-1 text-xs text-slate-400">Latest five records from this installation’s local SQLite history.</p>
            </div>
            <button type="button" onClick={loadScanStats} className="self-start rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:border-cyan-600 hover:text-cyan-300">
              Refresh activity
            </button>
          </div>
          {statsError ? (
            <p className="rounded-xl border border-rose-900/70 bg-rose-950/30 p-4 text-sm text-rose-200">{statsError}</p>
          ) : !scanStats ? (
            <p className="rounded-xl border border-slate-800 bg-slate-950/50 p-4 text-sm text-slate-400">Loading local scan history…</p>
          ) : scanStats.recent?.length ? (
            <ul className="space-y-3">
              {scanStats.recent.map(scan => (
                <li key={scan.id} className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
                  <details>
                    <summary className="cursor-pointer list-none">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-100">{scan.filename || 'QR scan'}</p>
                          <p className="mt-1 text-[11px] text-slate-500">{formatTimestamp(scan.created_at)}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold ${riskTone(scan.risk_score)}`}>
                            {scan.verdict || 'Unknown'}
                          </span>
                          <span className="text-xs tabular-nums text-slate-300">Risk {Number.isFinite(scan.risk_score) ? scan.risk_score : '—'}/100</span>
                        </div>
                      </div>
                    </summary>
                    <div className="mt-4 space-y-3 border-t border-slate-800 pt-4">
                      <p className="break-all text-xs leading-relaxed text-slate-300">{scan.payload || 'No destination was decoded.'}</p>
                      <ul className="space-y-1 text-xs text-slate-400">
                        {(Array.isArray(scan.reasons) ? scan.reasons : []).map((reason, index) => <li key={index}>• {reason}</li>)}
                        {!scan.reasons?.length && <li>No risk indicators were recorded.</li>}
                      </ul>
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-xl border border-slate-800 bg-slate-950/50 p-4 text-sm text-slate-400">No scans have been recorded yet. Scan a QR image or analyze a URL to populate local history.</p>
          )}
        </section>
      </section>


      {/* ================= LANDING SECTION 4: FEATURES GRID ================= */}
      <section id="features" className="py-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto border-t border-slate-800/60">
        <div className="text-center max-w-3xl mx-auto space-y-4 mb-16">
          <span className="text-cyan-400 text-xs font-bold uppercase tracking-wider bg-cyan-950 px-3 py-1 rounded border border-cyan-800">
            Advanced Architecture
          </span>
          <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight">
            Practical QR Safety Tools
          </h2>
          <p className="text-slate-400 text-sm sm:text-base">
            Review decoded QR destinations, understand the URL risk signals, and use a physical inspection checklist before taking action.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {[
            { title: "Explainable URL Analysis", desc: "Baseline URL heuristics surface risk indicators and explain why a destination deserves a closer look.", icon: "🛡️" },
            { title: "Clear Risk Signals", desc: "Review the decoded hostname, score, and analysis notes before deciding whether to continue.", icon: "⚡" },
            { title: "Sticker Inspection Guide", desc: "Check for overlays and compare the decoded destination with the organization you expected.", icon: "🏷️" },
            { title: "QR Image Decoding", desc: "Upload, paste, or take a photo of a QR code to inspect the destination without opening it.", icon: "🔄" },
            { title: "Physical QR Review", desc: "Use a practical safety routine for public menus, parking meters, signs, and payment codes.", icon: "📱" },
            { title: "No Automatic Link Opening", desc: "The checker analyzes the decoded address without visiting the site or following redirects.", icon: "🔒" },
            { title: "Saathi Safety Guide", desc: "Ask the configured AI guide for practical explanations. Chat messages are sent only when you choose to send them.", icon: "💬" },
            { title: "Offline PDF Reports", desc: "Generate a shareable inspection summary in your browser after a QR scan completes.", icon: "📄" }
          ].map((feat, idx) => (
            <div key={idx} className="bg-slate-900/50 border border-slate-800/80 rounded-2xl p-8 hover:border-cyan-500/50 transition group">
              <div className="w-12 h-12 rounded-xl bg-cyan-950 border border-cyan-800 flex items-center justify-center text-xl mb-6 group-hover:scale-110 transition">
                {feat.icon}
              </div>
              <h3 className="text-xl font-bold mb-3">{feat.title}</h3>
              <p className="text-slate-400 text-sm leading-relaxed">{feat.desc}</p>
            </div>
          ))}
        </div>
      </section>


      {/* ================= RESEARCH & OFFICIAL SOURCES ================= */}
      <section id="research" className="border-t border-slate-800/60 px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-12 max-w-3xl">
            <span className="rounded border border-cyan-800 bg-cyan-950 px-3 py-1 text-xs font-bold uppercase tracking-wider text-cyan-400">Evidence & references</span>
            <h2 className="mt-5 text-3xl font-extrabold tracking-tight sm:text-5xl">Built around real public safety guidance</h2>
            <p className="mt-4 text-sm leading-relaxed text-slate-400 sm:text-base">These are published advisories, not invented thesis reports or QR-Shield research results. Follow the source links to read the original guidance.</p>
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            <article className="rounded-3xl border border-slate-800 bg-slate-900 p-6 sm:p-8">
              <div className="text-3xl" aria-hidden="true">🏛️</div>
              <p className="mt-5 text-xs font-bold uppercase tracking-wider text-cyan-400">FBI · Internet Crime Complaint Center · Public Service Announcement · 2022</p>
              <h3 className="mt-3 text-xl font-bold">Cybercriminals Tampering with QR Codes to Steal Victim Funds</h3>
              <p className="mt-3 text-sm leading-relaxed text-slate-400">The advisory describes QR-code replacement and redirection risks, including theft of login or financial information, and recommends checking physical codes and their destinations.</p>
              <a href="https://www.ic3.gov/PSA/2022/PSA220118" target="_blank" rel="noreferrer" className="mt-5 inline-flex font-bold text-cyan-400 underline decoration-cyan-800 underline-offset-4 hover:text-cyan-300">Read the original FBI/IC3 advisory ↗</a>
            </article>
            <article className="rounded-3xl border border-slate-800 bg-slate-900 p-6 sm:p-8">
              <div className="text-3xl" aria-hidden="true">🛡️</div>
              <p className="mt-5 text-xs font-bold uppercase tracking-wider text-cyan-400">CISA · Phishing and social engineering guidance</p>
              <h3 className="mt-3 text-xl font-bold">Avoiding Social Engineering and Phishing Attacks</h3>
              <p className="mt-3 text-sm leading-relaxed text-slate-400">CISA explains how attackers impersonate trusted organizations to solicit personal information. The same verification habits are useful when a QR code opens an unexpected sign-in or payment page.</p>
              <a href="https://www.cisa.gov/news-events/news/avoiding-social-engineering-and-phishing-attacks" target="_blank" rel="noreferrer" className="mt-5 inline-flex font-bold text-cyan-400 underline decoration-cyan-800 underline-offset-4 hover:text-cyan-300">Read the original CISA guidance ↗</a>
            </article>
          </div>
          <p className="mt-5 text-xs leading-relaxed text-slate-500">QR-Shield is an educational prototype. These external sources do not validate or certify this website, its model, or any scan result.</p>
        </div>
      </section>


      {/* ================= RELATED QR SAFETY ARTICLES ================= */}
      <section id="related-articles" className="border-t border-slate-800/60 px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-12 max-w-3xl">
            <span className="rounded border border-cyan-800 bg-cyan-950 px-3 py-1 text-xs font-bold uppercase tracking-wider text-cyan-400">QR-Shield guides</span>
            <h2 className="mt-5 text-3xl font-extrabold tracking-tight sm:text-5xl">Related Articles</h2>
            <p className="mt-4 text-sm leading-relaxed text-slate-400 sm:text-base">Original, practical reading on QR-code safety, sticker tampering, and phishing. Each guide opens with clear steps and links to public guidance where relevant.</p>
          </div>
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {RELATED_ARTICLES.map(article => (
              <article key={article.page} className="flex flex-col rounded-3xl border border-slate-800 bg-slate-900 p-6 transition hover:border-cyan-700/80">
                <div className="flex items-center justify-between gap-3">
                  <span className="grid h-12 w-12 place-items-center rounded-xl border border-cyan-900 bg-cyan-950/70 text-2xl" aria-hidden="true">{article.icon}</span>
                  <span className="text-xs font-semibold text-slate-500">{article.readTime}</span>
                </div>
                <p className="mt-5 text-xs font-bold uppercase tracking-wider text-cyan-400">{article.category}</p>
                <h3 className="mt-2 text-xl font-bold text-slate-100">{INFO_PAGES[article.page].title}</h3>
                <p className="mt-3 flex-1 text-sm leading-relaxed text-slate-400">{article.description}</p>
                <button type="button" onClick={() => navigateToPage(article.page)} className="mt-6 self-start text-sm font-bold text-cyan-400 underline decoration-cyan-800 underline-offset-4 transition hover:text-cyan-300">
                  Read guide <span aria-hidden="true">→</span>
                </button>
              </article>
            ))}
          </div>
        </div>
      </section>


      {/* ================= LANDING SECTION 5: AVAILABLE FEATURES ================= */}
      <section id="pricing" className="py-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto border-t border-slate-800/60">
        <div className="text-center max-w-3xl mx-auto space-y-4 mb-12">
          <span className="text-cyan-400 text-xs font-bold uppercase tracking-wider bg-cyan-950 px-3 py-1 rounded border border-cyan-800">
            Available in this prototype
          </span>
          <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight">
            Useful tools, without pretend subscriptions
          </h2>
          <p className="text-slate-400 text-sm sm:text-base">
            No checkout or paid plans are configured. Here is what you can use now and what needs setup.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {[
            { name: 'QR image inspection', status: 'Available', desc: 'Decode and review a QR image with baseline URL checks.', features: ['Upload, paste, or capture an image', 'Review hostname and risk indicators', 'Download an inspection PDF'], action: openScanner, cta: 'Open scanner' },
            { name: 'Saathi AI assistant', status: 'Requires AI provider setup', desc: 'Ask a general-purpose AI assistant questions across topics through your configured provider.', features: ['Private backend API-key configuration', 'General questions and QR-safety guidance', 'No automatic scan or URL sharing'], action: () => setChatOpen(true), cta: 'Chat with Saathi' },
            { name: 'Research & scenarios', status: 'Available', desc: 'Learn from official advisories, transparent scenarios, and an honest feature-alignment guide.', features: ['FBI/IC3 QR tampering advisory', 'CISA phishing guidance', 'Thesis-to-implementation status'], action: () => navigateToPage('thesis'), cta: 'Read research status' }
          ].map((tier) => (
            <div key={tier.name} className="bg-slate-900/60 border border-slate-800 rounded-3xl p-8 flex flex-col justify-between">
              <div className="space-y-4">
                <h3 className="text-xl font-bold text-cyan-400">{tier.name}</h3>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-300">{tier.status}</p>
                <p className="text-slate-400 text-xs">{tier.desc}</p>
                <div className="pt-4 border-t border-slate-800 space-y-2.5">
                  {tier.features.map((f, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-slate-300">
                      <span className="text-cyan-400 font-bold">✓</span> {f}
                    </div>
                  ))}
                </div>
              </div>
              <button type="button" onClick={tier.action} className="mt-8 w-full rounded-xl bg-cyan-500 py-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-400">
                {tier.cta}
              </button>
            </div>
          ))}
        </div>
      </section>


      {/* ================= LANDING SECTION 6: DOWNLOAD & APP STORES ================= */}
      <section id="download" className="py-24 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto border-t border-slate-800/60 text-center">
        <div className="bg-linear-to-b from-slate-900 to-slate-950 border border-slate-800 p-10 sm:p-16 rounded-3xl relative overflow-hidden space-y-6 shadow-2xl">
          <div className="absolute -right-20 -bottom-20 w-80 h-80 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none"></div>
          
          <h2 className="text-3xl sm:text-5xl font-black tracking-tight">
            Get QR-Shield On Your Mobile Device
          </h2>
          <p className="text-slate-400 text-base max-w-xl mx-auto">
            Use the QR checker in your browser, then save an inspection report as a PDF when you need a copy.
          </p>

          <div className="flex flex-wrap justify-center gap-4 pt-4">
            <button type="button" onClick={openScanner} className="rounded-2xl bg-cyan-500 px-8 py-4 font-bold text-slate-950 shadow-lg transition hover:bg-cyan-400">Open the QR scanner</button>
            <button type="button" onClick={() => navigateToPage('download')} className="rounded-2xl border border-slate-700 bg-slate-950 px-8 py-4 font-bold text-slate-100 shadow-lg transition hover:border-cyan-500">About downloads</button>
          </div>
          <p className="text-xs text-slate-500">No app-store release is configured. This browser app can generate inspection PDFs on this device.</p>
        </div>
      </section>


      {/* ================= LANDING SECTION 7: FAQ & COMMON QUESTIONS ================= */}
      <section id="faq" className="py-24 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto border-t border-slate-800/60">
        <div className="text-center space-y-4 mb-16">
          <span className="text-cyan-400 text-xs font-bold uppercase tracking-wider bg-cyan-950 px-3 py-1 rounded border border-cyan-800">
            Help Center
          </span>
          <h2 className="text-3xl sm:text-4xl font-extrabold">Frequently Asked Questions</h2>
        </div>

        <div className="space-y-4">
          {[
            { q: "What is QR code quishing and sticker fraud?", a: "Quishing is phishing via QR codes. Fraudsters place printed adhesive sticker overlays on public signs, menus, or parking payment meters so that scanning them directs you to a malicious credential-harvesting website." },
            { q: "Can I check a QR code from a photo?", a: "Yes. Upload a PNG, JPG, WEBP, or BMP image, paste a QR image, or use your phone camera to capture one. The checker decodes the payload and reports baseline URL risk signals." },
            { q: "Does the checker detect a physical sticker overlay?", a: "No automated physical sticker or image-tampering classifier is configured. Inspect the label itself for lifted edges, mismatched print, or signs that another sticker covers the original." },
            { q: "Does a low risk score prove that a link is safe?", a: "No. The current checker uses baseline URL heuristics and does not query live reputation services. Always verify the destination and the physical QR placement before continuing." },
            { q: "Can I compare a QR destination with the expected business?", a: "Yes. After decoding an image, enter the organization’s expected domain. The report compares hostnames to help you spot an unexpected destination." },
            { q: "Does QR Shield follow redirects?", a: "No. The current checker analyzes the URL it decodes but does not visit the link or resolve its redirect chain. Do not open a suspicious destination to test it." },
            { q: "Does this prototype use Google Web Risk or live threat feeds?", a: "No. It uses baseline URL heuristics and does not query Google Web Risk, other live threat feeds, or reputation databases." },
            { q: "Can I buy a subscription or download a mobile app?", a: "No. Paid plans and app-store releases are not configured. The website and browser-generated PDF reports are available in this prototype." },
            { q: "What can Saathi answer?", a: "When an AI provider is configured, Saathi can answer general questions as well as QR-safety questions. It does not have live web browsing, and messages are sent to the configured provider when submitted; do not enter private or sensitive information." }
          ].map((item, idx) => (
            <div key={idx} className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 space-y-2">
              <h3 className="font-bold text-slate-200 text-base">{item.q}</h3>
              <p className="text-slate-400 text-sm leading-relaxed">{item.a}</p>
            </div>
          ))}
        </div>
      </section>


      {/* ================= MULTI-COLUMN FOOTER SECTION ================= */}
      <footer className="border-t border-slate-800 bg-slate-950 text-slate-400 text-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 grid grid-cols-2 md:grid-cols-4 gap-8">
          <div className="space-y-4 col-span-2 md:col-span-1">
            <div className="flex items-center gap-2">
              <BrandMark className="h-10 w-10 shrink-0" />
              <span className="text-lg font-black tracking-tight text-slate-100">QR-<span className="text-cyan-400">Shield</span></span>
            </div>
            <p className="text-slate-400 text-xs">
              QR decoding, baseline URL risk checks, and practical guidance for safer scanning.
            </p>
            <div className="text-slate-400 text-[11px]">
              © {new Date().getFullYear()} QR-Shield. All rights reserved.
            </div>
          </div>

          <div className="space-y-3">
            <h4 className="font-bold text-slate-200 uppercase tracking-wider text-[11px]">Product</h4>
            <ul className="space-y-2">
              <li><a href="#inspect" className="hover:text-cyan-400 transition">QR Scanner</a></li>
              <li><a href="#tampering-guide" className="hover:text-cyan-400 transition">Tampering Guide</a></li>
              <li><a href="#features" className="hover:text-cyan-400 transition">Features</a></li>
              <li><button type="button" onClick={() => navigateToPage('pricing')} className="hover:text-cyan-400 transition">Available Features</button></li>
              <li><button type="button" onClick={() => navigateToPage('threats')} className="hover:text-cyan-400 transition">Threat Checks</button></li>
              <li><button type="button" onClick={() => navigateToPage('research')} className="hover:text-cyan-400 transition">Research &amp; Sources</button></li>
              <li><button type="button" onClick={() => navigateToPage('thesis')} className="hover:text-cyan-400 transition">Thesis Alignment</button></li>
              <li><button type="button" onClick={() => navigateToPage('download')} className="hover:text-cyan-400 transition">Download</button></li>
            </ul>
          </div>

          <div className="space-y-3">
            <h4 className="font-bold text-slate-200 uppercase tracking-wider text-[11px]">Support</h4>
            <ul className="space-y-2">
              <li><button type="button" onClick={() => navigateToPage('faq')} className="hover:text-cyan-400 transition">Help Center</button></li>
              <li><button type="button" onClick={() => navigateToPage('parking-case')} className="hover:text-cyan-400 transition">Parking QR Scenario</button></li>
              <li><a href={`${API || 'http://127.0.0.1:8000'}/docs`} target="_blank" rel="noreferrer" className="hover:text-cyan-400 transition">API Documentation</a></li>
            </ul>
          </div>

          <div className="space-y-3">
            <h4 className="font-bold text-slate-200 uppercase tracking-wider text-[11px]">Legal</h4>
            <ul className="space-y-2">
              <li><span>Privacy and account policies are not configured for this prototype.</span></li>
              <li><button type="button" onClick={openCookiePreferences} className="font-semibold text-cyan-400 transition hover:text-cyan-300">Cookie settings</button></li>
            </ul>
          </div>
        </div>
      </footer>
        </>
      )}
      <CookieNotice consent={cookieConsent} preferencesOpen={cookiePreferencesOpen} error={cookieError} onOpenPreferences={openCookiePreferences} onClosePreferences={() => setCookiePreferencesOpen(false)} onSave={saveCookiePreferences} />
      <div className="fixed bottom-5 right-5 z-70 flex flex-col items-end gap-3">
        {chatOpen && (
          <section className="flex max-h-[min(34rem,75vh)] w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 shadow-2xl shadow-black/50" aria-label="Saathi chat">
            <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900 px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-cyan-950 text-cyan-300"><MessageCircle size={18} aria-hidden="true" /></span>
                <div><h2 className="text-sm font-bold text-slate-100">Saathi</h2><p className="text-[10px] text-slate-400">General AI assistant · QR safety help</p></div>
              </div>
              <button type="button" onClick={() => setChatOpen(false)} aria-label="Close Saathi chat" className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white"><X size={17} /></button>
            </div>
            <p className="border-b border-slate-800 px-4 py-2 text-[10px] leading-relaxed text-slate-500">Ask about any topic. Messages are sent to the AI provider configured by this site’s operator. Do not share passwords, payment details, or private information. Saathi does not receive scan results unless you type them into chat.</p>
            <p className={`border-b border-slate-800 px-4 py-2 text-[10px] leading-relaxed ${apiHealth?.chat_status?.available ? 'text-emerald-300' : apiHealth ? 'text-amber-200' : 'text-slate-500'}`} role="status">
              {apiHealth?.chat_status?.available
                ? 'AI provider is configured.'
                : apiHealth
                  ? apiHealth.chat_status?.reason?.includes('setup-saathi.ps1')
                    ? <>To enable chat: <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="font-semibold text-cyan-300 underline underline-offset-2">create a Gemini API key</a>, then run <code>npm run setup:saathi</code> and <code>npm run dev:full</code> from the project folder. Your key stays on this computer.</>
                    : apiHealth.chat_status?.reason || 'AI provider setup is incomplete.'
                  : 'Checking AI provider configuration…'}
            </p>
            <div className="flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite" aria-relevant="additions">
              {chatMessages.map((message, index) => (
                <div key={`${message.role}-${index}`} className={`max-w-[90%] whitespace-pre-wrap wrap-break-word rounded-2xl px-3 py-2 text-xs leading-relaxed ${message.role === 'user' ? 'ml-auto bg-cyan-950 text-cyan-100' : 'bg-slate-900 text-slate-200'}`}>
                  <span className="mb-1 block text-[9px] font-bold uppercase tracking-wider opacity-60">{message.role === 'user' ? 'You' : 'Saathi'}</span>
                  {message.content}
                </div>
              ))}
              {chatBusy && <p className="text-xs text-slate-400" role="status">Saathi is thinking…</p>}
              {chatError && <p className="rounded-xl border border-rose-900 bg-rose-950/40 p-3 text-xs leading-relaxed text-rose-200" role="alert">{chatError}</p>}
            </div>
            <form onSubmit={sendSaathiMessage} className="flex gap-2 border-t border-slate-800 p-3">
              <label className="sr-only" htmlFor="saathi-message">Message Saathi</label>
              <input id="saathi-message" value={chatInput} onChange={event => setChatInput(event.target.value)} maxLength={2000} placeholder="Ask any question…" className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-xs text-slate-100 placeholder:text-slate-500" disabled={chatBusy} />
              <button type="submit" aria-label="Send message to Saathi" disabled={chatBusy || !chatInput.trim()} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-cyan-500 text-slate-950 transition hover:bg-cyan-400 disabled:opacity-50"><Send size={16} /></button>
            </form>
          </section>
        )}
        <button type="button" onClick={() => setChatOpen(open => { setChatError(''); return !open; })} aria-expanded={chatOpen} aria-label={chatOpen ? 'Close Saathi chat' : 'Chat with Saathi'} className="inline-flex items-center gap-2 rounded-full bg-cyan-500 px-5 py-3 text-sm font-bold text-slate-950 shadow-xl shadow-cyan-950/40 transition hover:bg-cyan-400">
          {chatOpen ? <X size={17} aria-hidden="true" /> : <MessageCircle size={17} aria-hidden="true" />}
          {chatOpen ? 'Close Saathi' : 'Chat with Saathi'}
        </button>
      </div>
    </div>
  );
}