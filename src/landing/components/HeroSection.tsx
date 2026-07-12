import { DashboardMockup } from "./DashboardMockup";

export function HeroSection() {
  return (
    <section className="relative pt-24 pb-20 lg:pt-32 lg:pb-32 overflow-hidden">
      {/* Dynamic Backgrounds */}
      <div className="absolute inset-0 -z-10 h-full w-full">
        {/* Grid pattern */}
        <div className="absolute h-full w-full bg-grid-pattern [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]"></div>
        {/* Glowing Orbs */}
        <div className="absolute top-0 right-[15%] w-[600px] h-[600px] bg-gradient-to-tr from-[#DBEAFE] to-[#60A5FA]/20 blur-[120px] rounded-full mix-blend-multiply opacity-70 animate-float" />
        <div className="absolute top-[20%] left-[10%] w-[500px] h-[500px] bg-gradient-to-br from-[#EFF6FF] to-[#DBEAFE]/50 blur-[100px] rounded-full mix-blend-multiply opacity-60 animate-float" style={{ animationDelay: '2s' }} />
      </div>
      
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="lg:grid lg:grid-cols-12 lg:gap-16 items-center">
          
          <div className="lg:col-span-5 text-center lg:text-left mb-16 lg:mb-0">
            <h1 className="text-[40px] leading-[1.15] sm:text-[56px] font-[700] tracking-tight text-[var(--ink)] mb-6 animate-fade-up">
              Run your transport business without messy spreadsheets.
            </h1>
            
            <p className="text-[17px] leading-relaxed text-[var(--ink-2)] mb-10 max-w-2xl mx-auto lg:mx-0 animate-fade-up delay-100">
              TransportFlow helps transport companies manage shipments, drivers, expenses, invoices, payments, and profit reports from one organized workspace.
            </p>
            
            <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-3.5 animate-fade-up delay-200">
              <a href="https://wa.me/923144630279?text=I%20want%20to%20inquire%20about%20TransportFlow" target="_blank" rel="noopener noreferrer" className="btn-primary w-full sm:w-auto text-[14.5px] h-[46px] px-8 shadow-sm">
                Request Demo
              </a>
              <a href="#features" className="btn-ghost w-full sm:w-auto text-[14.5px] h-[46px] px-8">
                View Features
              </a>
            </div>
          </div>

          <div className="lg:col-span-7 relative animate-slide-in-right delay-300">
            <div className="absolute inset-0 bg-gradient-to-tr from-[var(--accent)]/10 to-transparent blur-[80px] rounded-full opacity-60 transform translate-x-1/4 translate-y-1/4" />
            <div className="relative pl-4 sm:pl-10 lg:pl-0">
              <DashboardMockup />
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
