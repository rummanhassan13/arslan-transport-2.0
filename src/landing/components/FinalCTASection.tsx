export function FinalCTASection() {
  return (
    <section className="py-24 bg-white pb-32">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="relative rounded-3xl bg-gradient-to-b from-[#1a2330] to-[#0e1116] px-6 py-20 sm:px-16 text-center shadow-2xl overflow-hidden reveal">
          {/* Background Decorative Blob & Grid */}
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff0a_1px,transparent_1px),linear-gradient(to_bottom,#ffffff0a_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_0%,#000_70%,transparent_100%)] pointer-events-none" />
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-[#6886a8] rounded-full blur-[120px] opacity-25 pointer-events-none" />
          
          <div className="relative z-10 mx-auto max-w-2xl">
            <h2 className="text-[36px] sm:text-[44px] leading-[1.15] font-[700] tracking-tight text-white mb-6">
              Move your transport operations out of spreadsheets.
            </h2>
            <p className="text-[17px] leading-relaxed text-[#a3c0dd] mb-10 max-w-xl mx-auto">
              Start with shipment tracking, payments, expenses, and profit visibility in one structured workspace.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <a href="https://wa.me/923144630279?text=I%20want%20to%20inquire%20about%20TransportFlow" target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-2 rounded-lg bg-white px-8 py-3.5 text-[15px] font-[600] text-[#0e1116] hover:bg-[#f5f7fa] transition-colors w-full sm:w-auto shadow-sm">
                Request Demo
              </a>
              <a href="/app/" className="inline-flex items-center justify-center gap-2 rounded-lg bg-transparent border border-white/30 px-8 py-3.5 text-[15px] font-[600] text-white hover:bg-white/10 transition-colors w-full sm:w-auto">
                Login
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
