import { forwardRef, useState } from "react";
import { Menu, X } from "lucide-react";

export const LandingHeader = forwardRef<HTMLElement, {}>((props, ref) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header
      ref={ref}
      className="fixed top-0 left-0 right-0 z-50 transition-all duration-300 border-b border-transparent"
    >
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="flex h-[72px] items-center justify-between">
          {/* Logo */}
          <a href="#" className="flex items-center gap-2.5 outline-none focus-visible:ring-2 focus-visible:ring-[#6886a8] rounded-lg">
            <span className="flex h-7 w-7 items-center justify-center rounded-[8px] bg-[#6886a8] text-xs font-bold text-white shadow-sm">
              T
            </span>
            <span className="text-[15px] font-[700] tracking-tight text-[#0e1116]">
              TransportFlow
            </span>
          </a>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-1">
            <a href="#problems" className="px-3.5 py-2 text-[13.5px] font-medium text-[#4d5663] hover:text-[#0e1116] hover:bg-black/5 transition-colors rounded-md">
              Problems
            </a>
            <a href="#features" className="px-3.5 py-2 text-[13.5px] font-medium text-[#4d5663] hover:text-[#0e1116] hover:bg-black/5 transition-colors rounded-md">
              Features
            </a>
            <a href="#workflow" className="px-3.5 py-2 text-[13.5px] font-medium text-[#4d5663] hover:text-[#0e1116] hover:bg-black/5 transition-colors rounded-md">
              Workflow
            </a>
            <a href="#security" className="px-3.5 py-2 text-[13.5px] font-medium text-[#4d5663] hover:text-[#0e1116] hover:bg-black/5 transition-colors rounded-md">
              Security
            </a>
            <a href="#faq" className="px-3.5 py-2 text-[13.5px] font-medium text-[#4d5663] hover:text-[#0e1116] hover:bg-black/5 transition-colors rounded-md">
              FAQ
            </a>
          </nav>

          {/* Actions */}
          <div className="hidden md:flex items-center gap-3">
            <a href="/app/" className="text-[13px] font-[600] text-[#4d5663] hover:text-[#0e1116] px-2 py-2 transition-colors">
              Login
            </a>
            <a href="https://wa.me/923144630279?text=I%20want%20to%20inquire%20about%20TransportFlow" target="_blank" rel="noopener noreferrer" className="btn-primary shadow-sm hover:shadow">
              Request Demo
            </a>
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 -mr-2 text-[#4d5663] hover:text-[#0e1116] rounded-md hover:bg-black/5"
            >
              <span className="sr-only">Open main menu</span>
              {mobileMenuOpen ? (
                <X className="h-6 w-6" aria-hidden="true" />
              ) : (
                <Menu className="h-6 w-6" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-white/95 backdrop-blur-xl border-b border-[#e3e8ef] absolute w-full top-[72px] shadow-lg shadow-[#0e1116]/5 origin-top animate-fade-up" style={{ animationDuration: '200ms' }}>
          <div className="space-y-1 px-6 pb-6 pt-2">
            <a href="#problems" onClick={() => setMobileMenuOpen(false)} className="block px-4 py-3 text-[15px] font-medium text-[#4d5663] hover:bg-[#eef1f5] hover:text-[#0e1116] rounded-md transition-colors">
              Problems
            </a>
            <a href="#features" onClick={() => setMobileMenuOpen(false)} className="block px-4 py-3 text-[15px] font-medium text-[#4d5663] hover:bg-[#eef1f5] hover:text-[#0e1116] rounded-md transition-colors">
              Features
            </a>
            <a href="#workflow" onClick={() => setMobileMenuOpen(false)} className="block px-4 py-3 text-[15px] font-medium text-[#4d5663] hover:bg-[#eef1f5] hover:text-[#0e1116] rounded-md transition-colors">
              Workflow
            </a>
            <a href="#security" onClick={() => setMobileMenuOpen(false)} className="block px-4 py-3 text-[15px] font-medium text-[#4d5663] hover:bg-[#eef1f5] hover:text-[#0e1116] rounded-md transition-colors">
              Security
            </a>
            <a href="#faq" onClick={() => setMobileMenuOpen(false)} className="block px-4 py-3 text-[15px] font-medium text-[#4d5663] hover:bg-[#eef1f5] hover:text-[#0e1116] rounded-md transition-colors">
              FAQ
            </a>
            <div className="mt-4 pt-5 border-t border-[#e3e8ef] grid gap-3 px-1">
              <a href="/app/" className="btn-ghost justify-center w-full py-2.5">
                Login
              </a>
              <a href="https://wa.me/923144630279?text=I%20want%20to%20inquire%20about%20TransportFlow" target="_blank" rel="noopener noreferrer" className="btn-primary justify-center w-full py-2.5 shadow-sm">
                Request Demo
              </a>
            </div>
          </div>
        </div>
      )}
    </header>
  );
});
LandingHeader.displayName = "LandingHeader";
