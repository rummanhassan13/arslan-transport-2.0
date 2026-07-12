import { useEffect, useRef } from "react";
import { LandingHeader } from "./components/LandingHeader";
import { HeroSection } from "./components/HeroSection";
import { ProblemSection } from "./components/ProblemSection";
import { SolutionSection } from "./components/SolutionSection";
import { ProductModulesSection } from "./components/ProductModulesSection";
import { WorkflowSection } from "./components/WorkflowSection";
import { FinanceClaritySection } from "./components/FinanceClaritySection";
import { SecuritySection } from "./components/SecuritySection";
import { UseCasesSection } from "./components/UseCasesSection";
import { FAQSection } from "./components/FAQSection";
import { FinalCTASection } from "./components/FinalCTASection";
import { LandingFooter } from "./components/LandingFooter";

export function LandingPage() {
  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    // Scroll handling for header blur
    const handleScroll = () => {
      if (headerRef.current) {
        if (window.scrollY > 20) {
          headerRef.current.classList.add("header-scrolled");
        } else {
          headerRef.current.classList.remove("header-scrolled");
        }
      }
    };
    // Initial check
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    // Intersection Observer for scroll reveal animations
    const observerCallback: IntersectionObserverCallback = (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("active");
        }
      });
    };

    const observer = new IntersectionObserver(observerCallback, {
      threshold: 0.1,
      rootMargin: "0px 0px -50px 0px",
    });

    document.querySelectorAll(".reveal").forEach((element) => {
      observer.observe(element);
    });

    return () => observer.disconnect();
  }, []);

  return (
    <div className="relative min-h-screen text-[var(--ink)] bg-[var(--bg)] bg-grid-pattern">
      <LandingHeader ref={headerRef} />
      
      <main>
        <HeroSection />
        <ProblemSection />
        <SolutionSection />
        <ProductModulesSection />
        <WorkflowSection />
        <FinanceClaritySection />
        <SecuritySection />
        <UseCasesSection />
        <FAQSection />
        <FinalCTASection />
      </main>

      <LandingFooter />
    </div>
  );
}
