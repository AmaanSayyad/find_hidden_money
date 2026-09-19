"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import Image from "next/image";
import { useEffect, useState, type MouseEvent } from "react";
import { useMultichainWallet } from "@/context/MultichainWallet";
import { easeOut, fadeUp, floatSlow, floatY, staggerContainer } from "@/lib/motion";
import { BrandMark } from "./BrandMark";
import { ConnectButton } from "./ConnectButton";
import { HeroCta } from "./HeroCta";
import { LogoCloud } from "./LogoCloud";
import { MonadMark } from "./MonadMark";
import { PortfolioScanner } from "./PortfolioScanner";
import { MONAD_DEMO_VIDEO_URL, MONAD_PITCH_DECK_URL } from "@/lib/monad/config";
import { COVERAGE_LOGOS, EVM_CLUSTER_LOGOS } from "@/lib/token-logo";

const coverage = [
  {
    name: "EVM",
    detail: "2,000+ networks",
    accent: "lime",
    icon: COVERAGE_LOGOS.eth,
    icons: EVM_CLUSTER_LOGOS,
  },
  {
    name: "Monad",
    detail: "Native MON tips",
    accent: "purple",
    icon: COVERAGE_LOGOS.monad,
  },
  {
    name: "Solana",
    detail: "SPL tokens",
    accent: "cyan",
    icon: COVERAGE_LOGOS.sol,
  },
  {
    name: "Bitcoin",
    detail: "Native BTC",
    accent: "vermilion",
    icon: COVERAGE_LOGOS.btc,
  },
  {
    name: "Sui",
    detail: "Object balances",
    accent: "mint",
    icon: COVERAGE_LOGOS.sui,
  },
] as const;

const steps = [
  {
    num: "01",
    title: "Connect a wallet",
    body: "Connect any wallet. Read-only scan — tip separately in MON to reveal.",
    icon: "/rain/onee.svg",
  },
  {
    num: "02",
    title: "Tip 1 MON",
    body: "See your total value free — tip native MON on Monad to unlock tokens and chains.",
    icon: "/monad/mark.png",
  },
  {
    num: "03",
    title: "Review by network",
    body: "See tokens across EVM, Solana, Bitcoin, Sui, and Monad with USD when priced.",
    icon: "/rain/threee.svg",
  },
  {
    num: "04",
    title: "Keep the dust or hide it",
    body: "Filter sub-cent balances, search contracts, and group every leftover asset.",
    icon: "/rain/fourr.svg",
  },
] as const;

const stack = [
  {
    title: "Permissionless scan",
    body: "No custodial login. We only read public addresses your wallet already exposes.",
    accent: "lime",
    icon: "/rain/homepage/banner/launch.svg",
  },
  {
    title: "Multichain roster",
    body: "Collect accounts from 500+ wallets, then scan them together or wallet-by-wallet.",
    accent: "purple",
    icon: "/rain/homepage/banner/ai.svg",
  },
  {
    title: "MON reveal layer",
    body: "Totals stay visible. Token names and networks unlock after a native MON tip.",
    accent: "vermilion",
    icon: "/monad/mark.png",
  },
  {
    title: "Deep network pass",
    body: "Indexed tokens first, then a deeper native pass on the wallets that still look incomplete.",
    accent: "mint",
    icon: "/rain/homepage/banner/modules.svg",
  },
  {
    title: "Dust controls",
    body: "Hide sub-cent balances, search contracts, and group every asset by chain.",
    accent: "cyan",
    icon: "/rain/homepage/banner/integration.svg",
  },
] as const;

const skills = [
  {
    num: "01",
    title: "Connect",
    body: "Approve a wallet once. We never ask to spend until you tip.",
    icon: "/rain/one.svg",
  },
  {
    num: "02",
    title: "Scan",
    body: "Pull native and token balances across EVM, Solana, Bitcoin, and Sui.",
    icon: "/rain/twoo.svg",
  },
  {
    num: "03",
    title: "Reveal",
    body: "Totals stay free. Tip 1 MON on Monad to unlock names and networks.",
    icon: "/monad/mark.png",
  },
  {
    num: "04",
    title: "Filter",
    body: "Hide dust, search a contract, and keep only the balances you still care about.",
    icon: "/rain/four.svg",
  },
] as const;

const promises = [
  {
    icon: "/rain/banner/tick.svg",
    title: "Read-only",
    body: "We never ask to sign or spend until you choose a MON tip.",
  },
  {
    icon: "/rain/true.svg",
    title: "Public addresses",
    body: "The scan uses what your wallet already exposes. Nothing is custodied.",
  },
  {
    icon: "/rain/banner/cross.svg",
    title: "No custody",
    body: "Keys stay in your wallet. We never hold funds.",
  },
  {
    icon: "/rain/banner/warning.svg",
    title: "Dust stays optional",
    body: "Sub-cent leftovers can stay hidden so the map stays readable.",
  },
] as const;

const navLinks = [
  { href: "#how", label: "How" },
  { href: "#coverage", label: "Coverage" },
  { href: "#portfolio", label: "Scan" },
] as const;

const connectedNav = [
  { href: "#home", label: "Home" },
  { href: "#portfolio", label: "Scan" },
  { href: "#wallets", label: "Wallets" },
] as const;

export function HomeView() {
  const { isConnected, isPending, connect } = useMultichainWallet();
  const reduceMotion = useReducedMotion();
  const [menuOpen, setMenuOpen] = useState(false);
  const [view, setView] = useState<"home" | "scan">("home");
  const showScan = isConnected && view === "scan";
  const links = showScan ? connectedNav : navLinks;

  useEffect(() => {
    setView(isConnected ? "scan" : "home");
  }, [isConnected]);

  const openHome = () => {
    setView("home");
    setMenuOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const openScan = (hash = "#portfolio") => {
    setView("scan");
    setMenuOpen(false);
    window.setTimeout(() => {
      document.querySelector(hash)?.scrollIntoView({ behavior: "smooth" });
    }, 40);
  };

  const onNavClick = (
    event: MouseEvent<HTMLAnchorElement>,
    href: string,
  ) => {
    if (href === "#home") {
      event.preventDefault();
      openHome();
      return;
    }
    if (href === "#portfolio" || href === "#wallets") {
      event.preventDefault();
      openScan(href);
      return;
    }
    setMenuOpen(false);
  };

  return (
    <div className={`page ${showScan ? "page-connected" : ""}`}>
      <div className="atmosphere" aria-hidden />

      <div className="shell">
        <div className="topbar-sticky">
        <motion.header
          className="topbar"
          initial={false}
          animate={{ opacity: 1, y: 0 }}
          transition={easeOut}
        >
          <a
            className="brand-mark"
            href="/"
            onClick={(event) => {
              event.preventDefault();
              openHome();
            }}
          >
            <BrandMark />
          </a>
          <nav className="top-nav" aria-label="Primary">
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={(event) => onNavClick(event, link.href)}
              >
                {link.label}
              </a>
            ))}
          </nav>
          <div className="topbar-end">
            <button
              type="button"
              className="menu-btn"
              aria-expanded={menuOpen}
              aria-controls="mobile-nav"
              onClick={() => setMenuOpen((open) => !open)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/rain/hamburger.svg" alt="" width={40} height={40} />
              <span className="sr-only">Menu</span>
            </button>
            <ConnectButton compact />
          </div>
        </motion.header>
        {isConnected ? (
          <div id="scan-tape-slot" className="scan-tape-slot" hidden={!showScan} />
        ) : null}
        </div>

        <AnimatePresence>
          {menuOpen ? (
            <motion.nav
              id="mobile-nav"
              className="mobile-nav"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              aria-label="Mobile"
            >
              {links.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={(event) => onNavClick(event, link.href)}
                >
                  {link.label}
                </a>
              ))}
              {!isConnected ? (
                <button
                  type="button"
                  className="mobile-nav-wallet"
                  disabled={isPending}
                  onClick={() => {
                    setMenuOpen(false);
                    void connect().catch(() => undefined);
                  }}
                >
                  Connect wallet
                </button>
              ) : null}
            </motion.nav>
          ) : null}
        </AnimatePresence>

        <main>
          <AnimatePresence mode="wait">
            {!showScan ? (
              <motion.div
                key="landing"
                initial={false}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.28 }}
              >
                <section className="hero-panel">
                  <div className="hero-waves" aria-hidden />
                  <div className="hero-copy">
                    <p className="brand-hero">Forgotten money, found.</p>
                    <p className="monad-chip">
                      <MonadMark size={22} />
                      Built on Monad
                    </p>
                    <h1 className="headline">
                      A portfolio radar for every chain your wallet still
                      touches.
                    </h1>
                    <p className="lede">
                      Connect a wallet once. We only read public
                      addresses, then list every balance that still shows up.
                    </p>
                    <div id="connect">
                      <HeroCta onViewScan={() => openScan("#portfolio")} />
                    </div>
                  </div>
                  <div className="hero-mascot-wrap">
                    <motion.div animate={reduceMotion ? undefined : floatY}>
                      <Image
                        src="/rain/homepage/banner/bannerright.png"
                        alt=""
                        width={1177}
                        height={1031}
                        className="hero-mascot"
                        priority
                      />
                    </motion.div>
                  </div>
                </section>

                <div className="coverage-band">
                  <section className="stat-grid" aria-label="Coverage">
                    {coverage.map((item) => (
                      <motion.article
                        key={item.name}
                        className={`stat-card accent-${item.accent}`}
                        initial={reduceMotion ? false : { opacity: 0.4, y: 12 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, margin: "-40px" }}
                        transition={easeOut}
                      >
                        {"icons" in item && item.icons ? (
                          <span className="stat-icon-cluster">
                            {item.icons.map((src) => (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                key={src}
                                className="stat-icon-mini"
                                src={src}
                                alt=""
                                width={22}
                                height={22}
                                referrerPolicy="no-referrer"
                                onError={(e) => {
                                  (e.currentTarget as HTMLImageElement).style.display =
                                    "none";
                                }}
                              />
                            ))}
                          </span>
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            className="stat-icon"
                            src={item.icon}
                            alt=""
                            width={28}
                            height={28}
                            referrerPolicy="no-referrer"
                          />
                        )}
                        <h2>{item.name}</h2>
                        <p>{item.detail}</p>
                      </motion.article>
                    ))}
                  </section>
                  <p className="stat-credit">
                    Read-only scan. Public addresses only.
                  </p>
                  <LogoCloud />

                  <section className="promise-row">
                    {promises.map((item) => (
                      <article key={item.title} className="promise-card">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={item.icon} alt="" width={28} height={28} />
                        <strong>{item.title}</strong>
                        <span>{item.body}</span>
                      </article>
                    ))}
                  </section>
                </div>

                <section className="split-section stack-section" id="coverage">
                  <div className="split-copy stack-intro">
                    <p className="section-kicker">Coverage</p>
                    <h2 className="section-title">The scan stack</h2>
                    <p className="section-copy">
                      Built to surface leftover native balances and tokens
                      without asking you to sign or spend — until you choose to
                      reveal.
                    </p>
                    <motion.div
                      className="art-well stack-mascot"
                      animate={reduceMotion ? undefined : floatSlow}
                    >
                      <Image
                        src="/rain/homepage/banner/stackimg.png"
                        alt=""
                        width={264}
                        height={527}
                        className="stack-photo"
                      />
                    </motion.div>
                  </div>
                  <ul className="stack-list">
                    {stack.map((item) => (
                      <motion.li
                        key={item.title}
                        className={`stack-card accent-${item.accent}`}
                        initial={reduceMotion ? false : { opacity: 0.4, x: 16 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true, margin: "-30px" }}
                        whileHover={reduceMotion ? undefined : { y: -3 }}
                        transition={easeOut}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          className="stack-icon"
                          src={item.icon}
                          alt=""
                          width={46}
                          height={46}
                        />
                        <div>
                          <strong>
                            {item.title}
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              className="inline-tick"
                              src="/rain/banner/tick.svg"
                              alt=""
                            />
                          </strong>
                          <span>{item.body}</span>
                        </div>
                      </motion.li>
                    ))}
                  </ul>
                </section>

                <section className="split-section agent-section">
                  <div className="split-copy agent-copy">
                    <p className="section-kicker">From prompt to portfolio</p>
                    <h2 className="section-title">
                      The language of autonomous finders
                    </h2>
                    <p className="section-copy">
                      Connect once. The scan interprets every network your
                      wallet already exposes and turns leftover balances into a
                      readable map.
                    </p>
                    <ul className="skill-list">
                      {skills.map((skill) => (
                        <li key={skill.num}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            className="skill-glyph"
                            src={skill.icon}
                            alt=""
                            width={36}
                            height={36}
                          />
                          <div>
                            <strong>{skill.title}</strong>
                            <span>{skill.body}</span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <motion.div
                    className="art-well agent-art"
                    animate={reduceMotion ? undefined : floatY}
                  >
                    <Image
                      src="/rain/rainor.png"
                      alt=""
                      width={625}
                      height={448}
                      className="agent-photo"
                    />
                  </motion.div>
                </section>

                <section className="split-section vision-section">
                  <motion.div
                    className="art-well vision-art"
                    initial={false}
                    whileInView={{ opacity: 1, scale: 1 }}
                    viewport={{ once: true }}
                    transition={easeOut}
                  >
                    <Image
                      src="/rain/about/sphere.png"
                      alt=""
                      width={959}
                      height={923}
                      className="vision-photo"
                    />
                  </motion.div>
                  <div className="split-copy vision-copy">
                    <p className="section-kicker">Why it exists</p>
                    <h2 className="section-title">Look where wallets forget</h2>
                    <p className="section-copy wide">
                      Dust on old L2s, native gas on a chain you used once, SPL
                      tokens a wallet still holds. The scan is read-only. The
                      reveal is a MON tip — nothing else.
                    </p>
                  </div>
                </section>

                <section className="how" id="how">
                  <div className="how-head">
                    <p className="section-kicker">How it works</p>
                    <h2 className="section-title">The finder journey</h2>
                  </div>
                  <motion.ol
                    className="journey journey-four"
                    variants={reduceMotion ? undefined : staggerContainer}
                    initial="hidden"
                    whileInView="show"
                    viewport={{ once: true, margin: "-40px" }}
                  >
                    {steps.map((step) => (
                      <motion.li
                        key={step.num}
                        className="journey-card"
                        variants={fadeUp}
                        whileHover={reduceMotion ? undefined : { y: -4 }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          className="journey-icon-img"
                          src={step.icon}
                          alt=""
                          width={36}
                          height={36}
                        />
                        <span className="step-num">{step.num}</span>
                        <strong>{step.title}</strong>
                        <span>{step.body}</span>
                      </motion.li>
                    ))}
                  </motion.ol>
                </section>

                <section className="storm-banner">
                  <div className="storm-copy">
                    <h2>Stay ahead of forgotten balances.</h2>
                    <p>
                      Connect a wallet and scan every network we can see. Totals
                      are free. Token names unlock with a MON tip.
                    </p>
                    <div className="hero-cta">
                      {isConnected ? (
                        <a
                          className="btn-on-lime"
                          href="#portfolio"
                          onClick={(event) => {
                            event.preventDefault();
                            openScan("#portfolio");
                          }}
                        >
                          View scan
                        </a>
                      ) : (
                        <a className="btn-on-lime" href="#connect">
                          Connect wallet
                        </a>
                      )}
                      <a className="btn-on-lime-ghost" href="#how">
                        How it works
                      </a>
                    </div>
                  </div>
                  <motion.div
                    className="storm-mascot"
                    animate={reduceMotion ? undefined : floatSlow}
                  >
                    <Image
                      src="/rain/stormimg.png"
                      alt=""
                      width={849}
                      height={476}
                      className="storm-photo"
                    />
                  </motion.div>
                </section>
              </motion.div>
            ) : null}
          </AnimatePresence>

          <div hidden={!showScan}>
            <PortfolioScanner />
          </div>
        </main>

        <footer className="site-footer">
          <div className="footer-brand">
            <a
              className="brand-mark"
              href="/"
              onClick={(event) => {
                event.preventDefault();
                openHome();
              }}
            >
              <BrandMark />
            </a>
            <p>Read-only portfolio scan. Never asks to sign or spend.</p>
          </div>
          <div className="footer-cols">
            <div>
              <h3>Product</h3>
              <a href="#connect">Connect</a>
              <a
                href="#portfolio"
                onClick={(event) => {
                  event.preventDefault();
                  openScan("#portfolio");
                }}
              >
                Scan
              </a>
              <a href="#how">How it works</a>
              <a
                href={MONAD_PITCH_DECK_URL}
                target="_blank"
                rel="noreferrer"
              >
                Pitch deck
              </a>
              <a
                href={MONAD_DEMO_VIDEO_URL}
                target="_blank"
                rel="noreferrer"
              >
                Demo video
              </a>
            </div>
            <div>
              <h3>Coverage</h3>
              <span>EVM · 2,000+ nets</span>
              <span>Solana · Bitcoin · Sui</span>
              <span className="footer-monad">
                <MonadMark size={16} />
                Monad tips
              </span>
            </div>
            <div>
              <h3>Wallets</h3>
              <span>Reown · 500+</span>
              <span>EVM · Solana · Bitcoin · Tron</span>
              <span>Public addresses only</span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
